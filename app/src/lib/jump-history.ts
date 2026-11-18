export type JumpEntry = {
  bookId: string
  bookTitle: string
  index: number
  chapterTitle: string
  cfi?: string
  at: number
}

const KEY = 'paper-jump-history'
const LIMIT = 80

function read(): JumpEntry[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function recordJump(entry: JumpEntry): void {
  const rows = read().filter((item) => !(item.bookId === entry.bookId && item.index === entry.index && item.cfi === entry.cfi))
  rows.unshift(entry)
  localStorage.setItem(KEY, JSON.stringify(rows.slice(0, LIMIT)))
}

export function listJumps(bookId: string, limit = 6): JumpEntry[] {
  return read().filter((item) => item.bookId === bookId).slice(0, limit)
}
