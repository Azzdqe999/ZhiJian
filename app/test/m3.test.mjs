import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom'
import { parseEpub } from '../js/lib/epub.js'
import {
  buildMatcher,
  countMatches,
  findNameOwner,
  matchText,
  parseAliases,
  sanitizeName,
} from '../js/lib/characters.js'
import { findDuplicateNote } from '../js/lib/notes.js'

// epub.ts 用浏览器 DOMParser / FileReader，Node 里打最小垫片
globalThis.DOMParser = XmlDOMParser
globalThis.FileReader = class NodeFileReader {
  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(buffer).toString('base64')
        if (this.onload) this.onload()
      })
      .catch((error) => {
        this.error = error
        if (this.onerror) this.onerror(error)
      })
  }
}

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

function character(id, name, aliases, extra = {}) {
  return { id, bookId: 'b1', name, aliases, role: '', bio: '', tags: [], color: '#A4552F', createdAt: 1, updatedAt: 1, ...extra }
}

console.log('== 一、最长优先 / 别名 / 单字 ==')
{
  const list = [
    character('c1', '李寒衣', ['李三娘', '寒衣']),
    character('c2', '张三', []),
    character('c3', '张三丰', []),
    character('c4', '阿沅', ['沅']),
  ]
  const matcher = buildMatcher(list)
  ok('匹配器非空', Boolean(matcher))
  ok('长名字排在短名字前', matcher.names.indexOf('李寒衣') < matcher.names.indexOf('寒衣'))
  ok('张三丰排在张三前', matcher.names.indexOf('张三丰') < matcher.names.indexOf('张三'))
  eq('名字总数（去重别名）', matcher.names.length, 6)
  const hits = matchText('李寒衣与李三娘同行，张三丰不是张三，阿沅在渡口。', matcher)
  deepEq(
    '命中顺序与最长优先',
    hits.map((item) => item.text + ':' + item.character.id),
    ['李寒衣:c1', '李三娘:c1', '张三丰:c3', '张三:c2', '阿沅:c4'],
  )
  eq('计数与命中一致', countMatches('李寒衣与李三娘同行，张三丰不是张三，阿沅在渡口。', matcher), 5)
  ok('单字别名默认忽略', buildMatcher([character('c4', '阿沅', ['沅'])]).names.join() === '阿沅')
  ok('单字名默认忽略', buildMatcher([character('c5', '李', [])]) === null)
  ok('允许单字时可匹配', Boolean(buildMatcher([character('c5', '李', [])], { allowSingle: true })))
  eq('单字开启后正常命中', countMatches('李寒衣', buildMatcher([character('c5', '李', [])], { allowSingle: true })), 1)
  eq('空文本不命中', matchText('', matcher).length, 0)
  eq('没有人物时返回 null', buildMatcher([]), null)
}

console.log('== 二、最长优先不吃掉更长名字 ==')
{
  const matcher = buildMatcher([character('d1', '张三', []), character('d2', '张三丰', ['三丰'])])
  const hits = matchText('张三丰看着张三，三丰笑了。', matcher)
  deepEq(
    '张三丰 / 三丰 / 张三 各自命中',
    hits.map((item) => item.text),
    ['张三丰', '张三', '三丰'],
  )
  eq('张三丰不会被拆成张三', hits.filter((item) => item.text === '张三').length, 1)
}

console.log('== 三、建卡查重 / 名字清洗 ==')
{
  const list = [character('e1', '李寒衣', ['李三娘'])]
  const byName = findNameOwner(list, '李寒衣')
  const byAlias = findNameOwner(list, '李三娘')
  eq('同名命中主名', byName && byName.field, 'name')
  eq('别名命中标记 alias', byAlias && byAlias.field, 'alias')
  eq('不存在的名字不命中', findNameOwner(list, '谢无咎'), null)
  eq('清洗首尾标点与空白', sanitizeName('  《李寒衣》， '), '李寒衣')
  eq('清洗多余空白', sanitizeName('李  寒衣'), '李 寒衣')
  eq('清洗后为空', sanitizeName('。，！'), '')
  eq('超长选中截到 20 字', Array.from(sanitizeName('一'.repeat(40))).length, 20)
  deepEq('别名去重且排除主名', parseAliases('李三娘、寒衣 李寒衣', '李寒衣'), ['李三娘', '寒衣'])
}

console.log('== 四、标记性能：50 人物 × 5000 字 ==')
{
  const list = Array.from({ length: 50 }, (_, i) => character('p' + i, '人物' + String(i).padStart(2, '0'), ['别名' + i]))
  const matcher = buildMatcher(list)
  const sentences = []
  for (let i = 0; i < 320; i++) sentences.push('人物' + String(i % 50).padStart(2, '0') + '走过渡口，别名' + (i % 50) + '没有回头。')
  const chapter = sentences.join('').slice(0, 5000)
  const started = performance.now()
  let total = 0
  for (const paragraph of chapter.split('。')) total += matchText(paragraph, matcher).length
  const elapsed = performance.now() - started
  ok('章节长度约 5000 字（' + chapter.length + '）', chapter.length >= 4950 && chapter.length <= 5000)
  ok('命中数 > 300（' + total + '）', total > 300)
  ok('扫描耗时 < 50ms（实测 ' + elapsed.toFixed(1) + 'ms）', elapsed < 50)
  console.log('  50 人物 × ' + chapter.length + ' 字：' + elapsed.toFixed(1) + 'ms / ' + total + ' 处命中')
}

console.log('== 五、EPUB：注释页不计章节数（M2 修复 10）==')
let small = null
{
  const bytes = fs.readFileSync(path.join(samplesDir, 'epub-3章.epub'))
  small = await parseEpub(bytes)
  deepEq('目录仍保留注释入口', small.toc.map((entry) => entry.label), ['第一章 风起', '第二章 夜行', '第三章 旧渡', '注释'])
  eq('spine 总数不变', small.spineCount, 4)
  eq('正文章节数 = 3', small.linearCount, 3)
  ok('linear 项统计小于 spine', small.linearCount < small.spineCount)

  const noCover = await parseEpub(fs.readFileSync(path.join(samplesDir, 'epub-无封面.epub')), { collectText: true })
  eq('无封面 EPUB 目录数', noCover.toc.length, 4)
  eq('无封面 EPUB 正文章节数', noCover.linearCount, 3)
  eq('无封面时 coverDataUrl 为空', noCover.coverDataUrl, null)
  ok('collectText 返回分段', Boolean(noCover.sections && noCover.sections.length === 4))
  ok('注释节 linear=false', noCover.sections.find((section) => section.href.includes('footnote')).linear === false)

  const characterBook = await parseEpub(fs.readFileSync(path.join(samplesDir, 'epub-人物.epub')), { collectText: true })
  eq('人物样本正文章节数', characterBook.linearCount, 2)
  ok('人物样本正文含李寒衣', characterBook.sections.some((section) => section.linear && section.text.includes('李寒衣')))
  ok('人物样本注释不计入正文字数', characterBook.sections.find((section) => !section.linear).text.includes('旧渡口'))
}

console.log('== 六、重复高亮合并（M2 修复 11）==')
{
  const notes = [
    { id: 'n1', bookId: 'b1', cfi: 'epubcfi(/6/4!/4/2)', text: '山雨落在旧渡口', color: 'yellow', note: '', tags: [], chapterTitle: '第一章', createdAt: 1, updatedAt: 1 },
    { id: 'n2', bookId: 'b2', cfi: 'epubcfi(/6/4!/4/2)', text: '另一本书', color: 'pink', note: '', tags: [], chapterTitle: '第一章', createdAt: 2, updatedAt: 2 },
  ]
  eq('同 CFI 判定重复', findDuplicateNote(notes, 'b1', 'epubcfi(/6/4!/4/2)', '随便', '任意')?.id, 'n1')
  eq('同章节同文字判定重复', findDuplicateNote(notes, 'b1', 'epubcfi(/6/4!/4/9)', '山雨落在旧渡口', '第一章')?.id, 'n1')
  eq('不同书不合并', findDuplicateNote(notes, 'b2', 'epubcfi(/6/4!/4/2)', 'x', 'y')?.id, 'n2')
  eq('不同文字 / 不同章不重复', findDuplicateNote(notes, 'b1', 'epubcfi(/6/4!/4/9)', '别的话', '第二章'), null)
}

console.log('')
if (failed) {
  console.log('结果：' + passed + ' 通过，' + failed + ' 失败')
  process.exitCode = 1
} else {
  console.log('结果：' + passed + ' 项全部通过')
}
