import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom'
import { parseEpub, normalizeHref, titleForHref } from '../js/lib/epub.js'
import { filterNotes, groupNotesByBook, parseTags, sortNotesByChapter, excerpt, DEFAULT_NOTE_FILTER } from '../js/lib/notes.js'
import { notesToMarkdown, notesFileName } from '../js/lib/markdown.js'

// epub.ts 用浏览器的 DOMParser / Blob / FileReader，这里给 Node 打最小的垫片
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

const manifest = JSON.parse(fs.readFileSync(path.join(samplesDir, 'manifest.json'), 'utf8'))
const epubEntries = manifest.filter((entry) => entry.format === 'epub')
const epubManifest = JSON.parse(fs.readFileSync(path.join(samplesDir, 'manifest-epub.json'), 'utf8'))

console.log('== 一、EPUB 样本结构（mimetype 必须首个且不压缩）==')
{
  eq('manifest.json 收录 EPUB 样本', epubEntries.length, 2)
  deepEq('manifest-epub.json 与 manifest 一致', epubManifest.map((entry) => entry.file), ['epub-3章.epub', 'epub-5mb.epub'])
  const buffer = fs.readFileSync(path.join(samplesDir, 'epub-3章.epub'))
  eq('第一个条目是 mimetype', buffer.subarray(30, 38).toString('latin1'), 'mimetype')
  eq('mimetype 使用 STORE（不压缩）', buffer.readUInt16LE(8), 0)
  eq('mimetype 内容正确', buffer.subarray(38, 58).toString('latin1'), 'application/epub+zip')
  const text = buffer.toString('latin1')
  for (const entry of ['META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/text/chapter-1.xhtml', 'OEBPS/text/chapter-2.xhtml', 'OEBPS/text/chapter-3.xhtml', 'OEBPS/text/footnotes.xhtml', 'OEBPS/images/cover.png', 'OEBPS/images/scene.png']) {
    ok('含条目 ' + entry, text.includes(entry))
  }
}

console.log('== 二、parseEpub：OPF 元数据 / 目录 / 封面 / 字数 ==')
let small = null
{
  const bytes = fs.readFileSync(path.join(samplesDir, 'epub-3章.epub'))
  const started = performance.now()
  small = await parseEpub(bytes)
  const elapsed = performance.now() - started
  eq('书名', small.title, '旧渡口')
  eq('作者', small.author, '纸间测试组')
  eq('语言', small.language, 'zh-CN')
  eq('OPF 路径', small.opfPath, 'OEBPS/content.opf')
  deepEq('目录（含注释节）', small.toc.map((entry) => entry.label), ['第一章 风起', '第二章 夜行', '第三章 旧渡', '注释'])
  deepEq('目录 href 相对 OPF', small.toc.map((entry) => entry.href), [
    'text/chapter-1.xhtml',
    'text/chapter-2.xhtml',
    'text/chapter-3.xhtml',
    'text/footnotes.xhtml',
  ])
  eq('spine 数', small.spineCount, 4)
  ok('封面解析为 data URL', Boolean(small.coverDataUrl && small.coverDataUrl.startsWith('data:image/')), String(small.coverDataUrl).slice(0, 40))
  ok('正文有字数（' + small.charCount + '）', small.charCount > 100)
  ok('解析耗时 < 1500ms（实测 ' + elapsed.toFixed(0) + 'ms）', elapsed < 1500)
}

console.log('== 三、5MB 多章样本解析（性能参考）==')
{
  const filePath = path.join(samplesDir, 'epub-5mb.epub')
  const bytes = fs.readFileSync(filePath)
  const sizeMb = bytes.length / 1024 / 1024
  ok('文件约 5MB（' + sizeMb.toFixed(2) + 'MB）', sizeMb > 4 && sizeMb < 6)
  const started = performance.now()
  const big = await parseEpub(bytes)
  const elapsed = performance.now() - started
  eq('多章目录数（230 章 + 注释）', big.toc.length, 231)
  eq('多章 spine 数', big.spineCount, 231)
  ok('多章字数 > 100 万（' + big.charCount + '）', big.charCount > 1000000)
  ok('解析含字数统计 < 5000ms（实测 ' + elapsed.toFixed(0) + 'ms）', elapsed < 5000)
  console.log('  导入解析（解压 + OPF + 目录 + 全文统计）：' + elapsed.toFixed(0) + 'ms')
}

console.log('== 四、href 归一化与章节名映射 ==')
{
  eq('去掉锚点', normalizeHref('text/chapter-1.xhtml#fn1'), 'text/chapter-1.xhtml')
  eq('去掉 ./ 与重复斜杠', normalizeHref('./text//chapter-2.xhtml'), 'text/chapter-2.xhtml')
  eq('精确匹配', titleForHref('text/chapter-2.xhtml', small.toc), '第二章 夜行')
  eq('忽略 OPF 前缀按文件名匹配', titleForHref('OEBPS/text/chapter-3.xhtml', small.toc), '第三章 旧渡')
  eq('匹配不到返回空串', titleForHref('text/unknown.xhtml', small.toc), '')
}

console.log('== 五、笔记筛选 / 标签 / 排序 ==')
const now = new Date('2026-11-13T14:05:00').getTime()
const books = [
  { id: 'b1', title: '旧渡口', author: '纸间测试组', cover: 'c1', encoding: 'utf-8', charCount: 1000, chapterCount: 3, toc: ['第一章 风起', '第二章 夜行', '第三章 旧渡'], byteSize: 1, createdAt: now, lastReadAt: now, chapterIndex: 0, scrollRatio: 0, format: 'epub' },
  { id: 'b2', title: '长夜灯影', author: '纸间测试组', cover: 'c2', encoding: 'utf-8', charCount: 2000, chapterCount: 2, toc: ['第一章 灯', '第二章 影'], byteSize: 1, createdAt: now, lastReadAt: now - 1000, chapterIndex: 1, scrollRatio: 0.5, format: 'txt' },
]
function note(id, bookId, chapterTitle, color, createdAt, extra = {}) {
  return { id, bookId, cfi: 'epubcfi(/6/2!/4/2/1:0)', text: '原文 ' + id, color, note: '', tags: [], chapterTitle, createdAt, updatedAt: createdAt, ...extra }
}
const notes = [
  note('n1', 'b1', '第二章 夜行', 'yellow', now - 1000),
  note('n2', 'b1', '第一章 风起', 'pink', now - 2000, { tags: ['山雨'] }),
  note('n3', 'b2', '第一章 灯', 'yellow', now - 40 * 86400000),
  note('n4', 'b1', '第三章 旧渡', 'green', now - 3 * 86400000, { note: '这句好' }),
]
{
  deepEq('颜色筛选', filterNotes(notes, { ...DEFAULT_NOTE_FILTER, color: 'yellow' }).map((item) => item.id), ['n1', 'n3'])
  deepEq('时间筛选近 7 天', filterNotes(notes, { ...DEFAULT_NOTE_FILTER, range: '7d' }).map((item) => item.id), ['n1', 'n2', 'n4'])
  deepEq('按书筛选', filterNotes(notes, { ...DEFAULT_NOTE_FILTER, bookId: 'b1' }).map((item) => item.id), ['n1', 'n2', 'n4'])
  deepEq('最早在前', filterNotes(notes, { ...DEFAULT_NOTE_FILTER, order: 'old' }).map((item) => item.id), ['n3', 'n4', 'n2', 'n1'])
  deepEq('解析标签去重去 #', parseTags('#山雨, 开篇 山雨、旧渡;'), ['山雨', '开篇', '旧渡'])
  deepEq('书内按目录顺序', sortNotesByChapter(books[0], [notes[0], notes[3], notes[1]]).map((item) => item.id), ['n2', 'n1', 'n4'])
  deepEq('按书聚合排序', groupNotesByBook(notes, books).map((group) => group.book.id), ['b1', 'b2'])
  eq('摘录截断', excerpt('一二三四五六七八九十', 5), '一二三四五…')
}

console.log('== 六、Markdown 导出（按章节分组）==')
{
  const markdown = notesToMarkdown(books, notes, new Date('2026-11-13T14:05:00').getTime())
  ok('标题包含书名', markdown.includes('# 纸间 · 读书笔记'))
  ok('书级分组', markdown.includes('## 《旧渡口》') && markdown.includes('## 《长夜灯影》'))
  ok('章节分组', markdown.includes('### 第一章 风起') && markdown.includes('### 第二章 夜行') && markdown.includes('### 第三章 旧渡'))
  ok('原文以引用呈现', markdown.includes('> 原文 n2'))
  ok('批注', markdown.includes('**批注**：这句好'))
  ok('标签', markdown.includes('**标签**：`#山雨`'))
  ok('颜色与时间', markdown.includes('颜色：赭黄') && markdown.includes('时间：2026-11-13'))
  ok('章节内按目录顺序（先第一章后第二章）', markdown.indexOf('### 第一章 风起') < markdown.indexOf('### 第二章 夜行'))
  ok('书目按最近阅读排序', markdown.indexOf('## 《旧渡口》') < markdown.indexOf('## 《长夜灯影》'))
  ok('导出文件名带书名', notesFileName([books[0]], new Date('2026-11-13T14:05:00').getTime()).startsWith('纸间笔记-旧渡口-'))
  ok('多书导出文件名', notesFileName(books).includes('全部书'))
}

console.log('')
if (failed) {
  console.log('结果：' + passed + ' 通过，' + failed + ' 失败')
  process.exitCode = 1
} else {
  console.log('结果：' + passed + ' 项全部通过')
}
