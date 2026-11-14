import type { BookMeta, Note } from './types'
import { formatTime, groupNotesByChapter, NOTE_COLOR_MAP } from './notes.ts'

function quote(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((line) => '> ' + line)
    .join('\n')
}

function sortedBooks(books: BookMeta[]): BookMeta[] {
  return [...books].sort((a, b) => b.lastReadAt - a.lastReadAt)
}

/** 导出 Markdown：按书 → 章节分组，含原文、批注、标签、颜色与时间 */
export function notesToMarkdown(books: BookMeta[], notes: Note[], exportedAt = Date.now()): string {
  const lines: string[] = []
  const bookOrder = sortedBooks(books)
  const used = bookOrder
    .map((book) => ({ book, notes: notes.filter((note) => note.bookId === book.id) }))
    .filter((item) => item.notes.length > 0)

  lines.push('# 纸间 · 读书笔记')
  lines.push('')
  lines.push('> 导出于 ' + formatTime(exportedAt) + ' · ' + used.length + ' 本书 · ' + notes.length + ' 条笔记')
  lines.push('')

  for (const { book, notes: bookNotes } of used) {
    lines.push('## 《' + book.title + '》')
    lines.push('')
    lines.push('作者：' + (book.author || '未知') + ' · ' + book.chapterCount + ' 章 · ' + bookNotes.length + ' 条笔记')
    lines.push('')
    for (const group of groupNotesByChapter(book, bookNotes)) {
      lines.push('### ' + group.title)
      lines.push('')
      for (const note of group.notes) {
        lines.push(quote(note.text))
        lines.push('')
        if (note.note.trim()) {
          lines.push('**批注**：' + note.note.replace(/\s+/g, ' ').trim())
          lines.push('')
        }
        if (note.tags.length) {
          lines.push('**标签**：' + note.tags.map((tag) => '`#' + tag + '`').join(' '))
          lines.push('')
        }
        lines.push('颜色：' + NOTE_COLOR_MAP[note.color].label + ' · 时间：' + formatTime(note.createdAt))
        lines.push('')
        lines.push('---')
        lines.push('')
      }
    }
  }

  if (!used.length) {
    lines.push('_还没有笔记。_')
    lines.push('')
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

export function notesFileName(books: BookMeta[], exportedAt = Date.now()): string {
  const date = new Date(exportedAt)
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + '-' + pad(date.getHours()) + pad(date.getMinutes())
  const scope = books.length === 1 ? books[0].title : '全部书'
  return '纸间笔记-' + scope + '-' + stamp + '.md'
}

/** 渲染层直接触发下载（Electron / 浏览器都可用），不碰 Node API */
export function downloadMarkdown(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 下载可能稍后才真正读走 blob，留足时间再回收
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}
