import type { BookMeta, Note, NoteColor } from './types'

export const NOTE_COLORS: Array<{ key: NoteColor; label: string; hex: string; soft: string }> = [
  { key: 'yellow', label: '赭黄', hex: '#e8c56a', soft: 'rgba(232, 197, 106, 0.42)' },
  { key: 'pink', label: '胭脂', hex: '#e28f96', soft: 'rgba(226, 143, 150, 0.38)' },
  { key: 'green', label: '竹青', hex: '#8fae8a', soft: 'rgba(143, 174, 138, 0.42)' },
  { key: 'blue', label: '黛蓝', hex: '#7d9bb5', soft: 'rgba(125, 155, 181, 0.4)' },
]

export const NOTE_COLOR_MAP: Record<NoteColor, { label: string; hex: string; soft: string }> = NOTE_COLORS.reduce(
  (map, item) => {
    map[item.key] = item
    return map
  },
  {} as Record<NoteColor, { label: string; hex: string; soft: string }>,
)

export function normalizeColor(value: string): NoteColor {
  return NOTE_COLORS.some((item) => item.key === value) ? (value as NoteColor) : 'yellow'
}

export function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,，、;；\s]+/)
        .map((tag) => tag.replace(/^#+/, '').trim())
        .filter(Boolean),
    ),
  )
}

export type NoteFilter = {
  bookId: string
  color: NoteColor | 'all'
  order: 'new' | 'old'
  range: 'all' | '7d' | '30d'
}

export const DEFAULT_NOTE_FILTER: NoteFilter = { bookId: 'all', color: 'all', order: 'new', range: 'all' }

export function filterNotes(notes: Note[], filter: NoteFilter, now = Date.now()): Note[] {
  const from = filter.range === '7d' ? now - 7 * 86400000 : filter.range === '30d' ? now - 30 * 86400000 : 0
  const filtered = notes.filter((note) => {
    if (filter.bookId !== 'all' && note.bookId !== filter.bookId) return false
    if (filter.color !== 'all' && note.color !== filter.color) return false
    if (from && note.createdAt < from) return false
    return true
  })
  return filtered.sort((a, b) => (filter.order === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
}

export type BookNoteGroup = {
  book: BookMeta
  notes: Note[]
}

/** 按书聚合；书按最近阅读排序，书内按目录顺序 + 创建时间排序 */
export function groupNotesByBook(notes: Note[], books: BookMeta[]): BookNoteGroup[] {
  const bookMap = new Map(books.map((book) => [book.id, book]))
  const groups = new Map<string, Note[]>()
  for (const note of notes) {
    const list = groups.get(note.bookId)
    if (list) list.push(note)
    else groups.set(note.bookId, [note])
  }
  const out: BookNoteGroup[] = []
  for (const [bookId, list] of groups) {
    const book = bookMap.get(bookId)
    if (!book) continue
    out.push({ book, notes: sortNotesByChapter(book, list) })
  }
  return out.sort((a, b) => b.book.lastReadAt - a.book.lastReadAt)
}

export function chapterOrderOf(book: BookMeta, chapterTitle: string): number {
  const index = book.toc.indexOf(chapterTitle)
  return index < 0 ? Number.MAX_SAFE_INTEGER : index
}

export function sortNotesByChapter(book: BookMeta, notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const orderA = chapterOrderOf(book, a.chapterTitle)
    const orderB = chapterOrderOf(book, b.chapterTitle)
    if (orderA !== orderB) return orderA - orderB
    return a.createdAt - b.createdAt
  })
}

export function groupNotesByChapter(book: BookMeta, notes: Note[]): Array<{ title: string; notes: Note[] }> {
  const sorted = sortNotesByChapter(book, notes)
  const result: Array<{ title: string; notes: Note[] }> = []
  for (const note of sorted) {
    const title = note.chapterTitle || '未标注章节'
    const last = result[result.length - 1]
    if (last && last.title === title) last.notes.push(note)
    else result.push({ title, notes: [note] })
  }
  return result
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

export function excerpt(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max) + '…' : clean
}
/** M2 修复：同一 CFI 或同段文字（同章节）视为重复，返回已有笔记用于合并 */
export function findDuplicateNote(
  notes: Note[],
  bookId: string,
  cfi: string,
  text: string,
  chapterTitle: string,
): Note | null {
  return (
    notes.find(
      (note) =>
        note.bookId === bookId &&
        (note.cfi === cfi || (note.text === text && note.chapterTitle === chapterTitle)),
    ) || null
  )
}
