import type { BookMeta, Character, CharacterAppearance } from './types'
import { countMatches } from './characters'
import type { CharacterMatcher } from './characters'
import { parseEpub } from './epub'
import { getAppearances, getFile, listChapters, putAppearances } from './store'

function stampOf(character: Character, book: BookMeta): string {
  return [character.updatedAt, book.id, book.chapterCount, book.byteSize, book.format || 'txt'].join('|')
}

/**
 * 出场章节（P1）：只扫名字/别名，结果按章缓存。
 * TXT 直接读 chapters store；EPUB 按需解包、只保留命中章。
 */
export async function loadCharacterAppearances(
  character: Character,
  book: BookMeta,
  matcher: CharacterMatcher,
): Promise<CharacterAppearance[]> {
  const stamp = stampOf(character, book)
  try {
    const cached = await getAppearances(character.id)
    if (cached && cached.bookId === book.id && cached.stamp === stamp) return cached.items
  } catch {
    /* 缓存读失败就直接重扫 */
  }

  const items: CharacterAppearance[] = []

  if ((book.format ?? 'txt') === 'epub') {
    const bytes = await getFile(book.id)
    if (bytes) {
      const parsed = await parseEpub(bytes, { collectText: true })
      let ordinal = 0
      for (const section of parsed.sections || []) {
        if (section.linear) ordinal++
        if (!section.linear) continue
        const count = countMatches(section.text, matcher)
        if (count > 0) {
          items.push({
            chapterIndex: ordinal - 1,
            title: section.label,
            href: section.href,
            count,
          })
        }
      }
    }
  } else {
    const rows = await listChapters(book.id)
    for (const row of rows) {
      const count = countMatches(row.text, matcher)
      if (count > 0) items.push({ chapterIndex: row.index, title: row.title || '第 ' + (row.index + 1) + ' 章', count })
    }
  }

  items.sort((a, b) => a.chapterIndex - b.chapterIndex)
  try {
    await putAppearances({ characterId: character.id, bookId: book.id, stamp, items })
  } catch {
    /* 缓存写失败不影响展示 */
  }
  return items
}
