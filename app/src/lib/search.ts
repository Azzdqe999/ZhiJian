import { getChapters, listBooks } from './store'

export type SearchHit = {
  bookId: string
  bookTitle: string
  chapterIndex: number
  chapterTitle: string
  snippet: string
  offset: number
}

export async function searchLibrary(query: string, limit = 80): Promise<SearchHit[]> {
  const needle = query.trim()
  if (needle.length < 2) return []
  const lower = needle.toLowerCase()
  const books = await listBooks()
  const hits: SearchHit[] = []
  for (const book of books) {
    if (hits.length >= limit) break
    if (book.format === 'epub') continue
    const chapters = await getChapters(book.id)
    for (const chapter of chapters) {
      if (hits.length >= limit) break
      const text = chapter.text || ''
      const index = text.toLowerCase().indexOf(lower)
      if (index < 0) continue
      const start = Math.max(0, index - 34)
      const end = Math.min(text.length, index + needle.length + 54)
      hits.push({
        bookId: book.id,
        bookTitle: book.title,
        chapterIndex: chapter.index,
        chapterTitle: chapter.title,
        snippet: (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ') + (end < text.length ? '…' : ''),
        offset: index,
      })
    }
  }
  return hits
}
