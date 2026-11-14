import type { Character } from './types'

/** 纸感色板：人物虚线与头像底色 */
export const CHARACTER_COLORS: Array<{ hex: string; label: string }> = [
  { hex: '#A4552F', label: '赭石' },
  { hex: '#4C6B62', label: '松绿' },
  { hex: '#6D597A', label: '暮紫' },
  { hex: '#3F5A6B', label: '黛蓝' },
  { hex: '#7D6B3F', label: '旧金' },
  { hex: '#8A5A44', label: '栗褐' },
  { hex: '#5D6B4C', label: '苔青' },
  { hex: '#8C5A6E', label: '胭脂' },
]

export const DEFAULT_CHARACTER_COLOR = CHARACTER_COLORS[0].hex

export type CardRect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export type CharacterMatch = {
  start: number
  end: number
  text: string
  character: Character
}

export type CharacterMatcher = {
  names: string[]
  regex: RegExp
  map: Map<string, Character>
  byId: Map<string, Character>
}

export type NameOwner = {
  character: Character
  field: 'name' | 'alias'
  value: string
}

const EDGE_PUNCT = /^[\s《〈「『"'“”‘’(\[【]+|[\s》〉」』"'“”‘’)\]】.,，。;；:：!?！？、·~～—\-]+$/g

/** 把选中文字清理成可当人名的短串（去掉首尾标点与多余空白） */
export function sanitizeName(raw: string): string {
  const text = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EDGE_PUNCT, '')
    .trim()
  if (!text) return ''
  return Array.from(text).slice(0, 20).join('')
}

export function characterNames(character: Character): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [character.name, ...(character.aliases || [])]) {
    const name = String(raw || '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

export function charLength(value: string): number {
  return Array.from(value).length
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 建一个「最长优先」的名字匹配器。
 * - 别名参与
 * - 默认跳过单字名（误伤太多）
 * - 不做分词，纯字符串匹配
 */
const NAME_SEPARATORS = /[\s·・]/g
const OPTIONAL_SEPARATOR = '[\\s·・]?'

function normalizeName(value: string): string {
  return value.replace(NAME_SEPARATORS, '')
}

export function buildMatcher(characters: Character[], options: { allowSingle?: boolean } = {}): CharacterMatcher | null {
  const allowSingle = Boolean(options.allowSingle)
  const map = new Map<string, Character>()
  for (const character of characters) {
    for (const raw of characterNames(character)) {
      const name = normalizeName(raw)
      if (!allowSingle && charLength(name) < 2) continue
      if (!map.has(name)) map.set(name, character)
    }
  }
  if (!map.size) return null
  const names = Array.from(map.keys()).sort((a, b) => charLength(b) - charLength(a) || (a < b ? -1 : a > b ? 1 : 0))
  const pattern = names.map((name) => Array.from(name).map(escapeRegExp).join(OPTIONAL_SEPARATOR)).join('|')
  return {
    names,
    regex: new RegExp(pattern, 'g'),
    map,
    byId: new Map(characters.map((character) => [character.id, character])),
  }
}

/** 在一个文本节点里找出全部命中（最长优先由 buildMatcher 的交替顺序保证） */
export function matchText(text: string, matcher: CharacterMatcher | null): CharacterMatch[] {
  if (!matcher || !text) return []
  const out: CharacterMatch[] = []
  matcher.regex.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = matcher.regex.exec(text))) {
    const character = matcher.map.get(normalizeName(match[0]))
    if (character) {
      out.push({ start: match.index, end: match.index + match[0].length, text: match[0], character })
    }
    if (match[0].length === 0) matcher.regex.lastIndex++
  }
  matcher.regex.lastIndex = 0
  return out
}

export function countMatches(text: string, matcher: CharacterMatcher | null): number {
  if (!matcher || !text) return 0
  matcher.regex.lastIndex = 0
  let count = 0
  let match: RegExpExecArray | null
  while ((match = matcher.regex.exec(text))) {
    count++
    if (match[0].length === 0) matcher.regex.lastIndex++
  }
  matcher.regex.lastIndex = 0
  return count
}

/** 同名 / 别名查重：建卡前问「加入别名」还是「另一个人」 */
export function findNameOwner(characters: Character[], rawName: string): NameOwner | null {
  const name = String(rawName || '').trim()
  if (!name) return null
  for (const character of characters) {
    if (character.name === name) return { character, field: 'name', value: name }
    if ((character.aliases || []).includes(name)) return { character, field: 'alias', value: name }
  }
  return null
}

/** 别名输入：支持逗号、顿号、分号、空白分隔 */
export function parseAliases(input: string, name = ''): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const piece of String(input || '').split(/[,，、;；\s]+/)) {
    const alias = piece.trim()
    if (!alias || alias === name || seen.has(alias)) continue
    seen.add(alias)
    out.push(alias)
  }
  return out
}

export function parseCharacterTags(input: string): string[] {
  return Array.from(
    new Set(
      String(input || '')
        .split(/[,，、;；\s]+/)
        .map((tag) => tag.replace(/^#+/, '').trim())
        .filter(Boolean),
    ),
  )
}

export function initialsOf(name: string): string {
  const chars = Array.from(String(name || '').trim())
  return chars.slice(0, 2).join('') || '人'
}

export function sortCharacters(characters: Character[]): Character[] {
  return [...characters].sort((a, b) => a.createdAt - b.createdAt || (a.name < b.name ? -1 : 1))
}

export function colorFor(seed: string): string {
  let hash = 2166136261
  for (const ch of seed) hash = ((hash ^ (ch.codePointAt(0) as number)) * 16777619) >>> 0
  return CHARACTER_COLORS[hash % CHARACTER_COLORS.length].hex
}
