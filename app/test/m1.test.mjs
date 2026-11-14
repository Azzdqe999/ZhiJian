import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { countWords, decodeBytes, sniffEncoding, splitChapters, toParagraphs } from '../js/lib/txt.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const samplesDir = path.resolve(here, '../../samples')

let passed = 0
let failed = 0

function ok(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log('  ✓ ' + name)
  } else {
    failed++
    console.log('  ✗ ' + name + (detail ? ' — ' + detail : ''))
  }
}

function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected), '期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
}

function deepEq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), '期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

console.log('== 一、样本解码 / 章节 / 字数 ==')
const manifest = JSON.parse(fs.readFileSync(path.join(samplesDir, 'manifest.json'), 'utf8'))
for (const entry of manifest) {
  // manifest.json 同时登记了 M2 的 EPUB 样本，TXT 用例在此跳过
  if (entry.format && entry.format !== 'txt') continue
  const bytes = new Uint8Array(fs.readFileSync(path.join(samplesDir, entry.file)))
  const decoded = decodeBytes(bytes)
  eq(entry.file + ' · 编码识别', decoded.encoding, entry.encoding)
  eq(entry.file + ' · 解码文本哈希', sha256(decoded.text), entry.sha256)
  const chapters = splitChapters(decoded.text)
  eq(entry.file + ' · 章节数', chapters.length, entry.chapters)
  deepEq(entry.file + ' · 章节标题', chapters.map((chapter) => chapter.title), entry.titles)
  eq(entry.file + ' · 字数统计', countWords(decoded.text), entry.chars)
  ok(entry.file + ' · 正文无替换符', !decoded.text.includes('\uFFFD'))
}

console.log('== 二、3MB GBK 解析性能（验收 #6，限 2000ms）==')
{
  const entry = manifest.find((item) => item.file === 'gbk-30章.txt')
  const bytes = new Uint8Array(fs.readFileSync(path.join(samplesDir, entry.file)))
  const started = performance.now()
  const decoded = decodeBytes(bytes)
  const chapters = splitChapters(decoded.text)
  const words = countWords(decoded.text)
  const elapsed = performance.now() - started
  console.log('  文件 ' + (bytes.length / 1024 / 1024).toFixed(2) + ' MB，' + chapters.length + ' 章，' + words + ' 字')
  ok('解码 + 解析 + 统计 < 2000ms（实测 ' + elapsed.toFixed(0) + 'ms）', elapsed < 2000)
  ok('GBK 大文件识别为 GBK/GB18030', decoded.encoding === 'gb18030', decoded.encoding)
  eq('GBK 大文件章节数', chapters.length, 30)
}

console.log('== 三、章节标题覆盖 ==')
{
  const text = [
    '楔子',
    '楔子正文。',
    '',
    '第一章 风起',
    '第一章正文。',
    '',
    '第二节 山雨',
    '第二节正文。',
    '',
    '第三回 旧梦',
    '第三回正文。',
    '',
    '第二卷 北境',
    '第二卷正文。',
    '',
    '第四部 长夜',
    '第四部正文。',
    '',
    '第五篇 灯下',
    '第五篇正文。',
    '',
    '第六集 尾声前',
    '第六集正文。',
    '',
    'Chapter 7',
    'Chapter seven body.',
    '',
    '第8章 归途',
    '第八章正文。',
    '',
    '12',
    '十二正文。',
    '',
    '番外 雪落',
    '番外正文。',
    '',
    '尾声',
    '尾声正文。',
  ].join('\n')
  const chapters = splitChapters(text)
  deepEq('章/节/回/卷/部/篇/集 + 序章/楔子/尾声/番外/纯数字/Chapter', chapters.map((chapter) => chapter.title), [
    '楔子',
    '第一章 风起',
    '第二节 山雨',
    '第三回 旧梦',
    '第二卷 北境',
    '第四部 长夜',
    '第五篇 灯下',
    '第六集 尾声前',
    'Chapter 7',
    '第8章 归途',
    '12',
    '番外 雪落',
    '尾声',
  ])
  eq('识别出的章节正文不串行', chapters[1].text.trim(), '第一章正文。')
}

console.log('== 四、无标题退化与空文件 ==')
{
  const prose = '山雨落在旧渡口，木桩上积着薄薄一层水。\n她没有说话，只把斗笠压低了些。\n船到河心时，风忽然停了。'
  const chapters = splitChapters(prose)
  eq('无标题 → 单章', chapters.length, 1)
  eq('无标题章节名为「全文」', chapters[0].title, '全文')
  ok('无标题时正文完整', chapters[0].text.includes('风忽然停了'))
  eq('空文件 → 0 章', splitChapters('   \n\n  ').length, 0)
}

console.log('== 五、BOM / 无 BOM / 强制编码 ==')
{
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('第一章 测试\n正文。', 'utf8')])
  eq('UTF-8 BOM 识别', sniffEncoding(new Uint8Array(bom)), 'utf-8')
  ok('UTF-8 BOM 被剥离', decodeBytes(new Uint8Array(bom)).text.startsWith('第一章'))

  const gbkBytes = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4])
  eq('手工 GBK「中文」强制解码', decodeBytes(gbkBytes, 'gb18030').text, '中文')
  eq('强制解码返回指定编码', decodeBytes(gbkBytes, 'big5').encoding, 'big5')
  ok('强制 Big5 解码 GBK 字节会乱码（验证手动切换路径）', decodeBytes(gbkBytes, 'big5').text !== '中文')

  const utf16 = Buffer.from('第一章 风起\n山雨落在渡口，木桩上积着一层水。', 'utf16le')
  eq('UTF-16LE 无 BOM 识别', sniffEncoding(new Uint8Array(utf16)), 'utf-16le')

  const utf16be = Buffer.from([0xfe, 0xff, 0x7b, 0x2c, 0x4e, 0x00, 0x7a, 0x0b])
  eq('UTF-16BE BOM 识别', sniffEncoding(new Uint8Array(utf16be)), 'utf-16be')
}

console.log('== 六、段落切分 / 字数口径 ==')
{
  const normal = toParagraphs('第一段。\n第二段。\n第三段。')
  deepEq('一行一段保持原样', normal, ['第一段。', '第二段。', '第三段。'])

  const wrappedLine = '山雨落在旧渡口的木桩上，又顺着船篷滑下去，没有人说话，只有水声漫过石阶'
  const wrapped = toParagraphs([wrappedLine, wrappedLine, wrappedLine, wrappedLine, wrappedLine + '。'].join('\n'))
  eq('硬折行自动合并段落', wrapped.length, 1)
  ok('合并后保留全文', wrapped[0].startsWith('山雨落在旧渡口') && wrapped[0].endsWith('。'))

  eq('字数忽略空白', countWords('你好 世界\n第二行\t。'), 8)
  eq('空文本字数', countWords(''), 0)
}

console.log('')
if (failed) {
  console.log('结果：' + passed + ' 通过，' + failed + ' 失败')
  process.exitCode = 1
} else {
  console.log('结果：' + passed + ' 项全部通过')
}
