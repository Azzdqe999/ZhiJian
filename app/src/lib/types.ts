import type { TextEncoding } from './txt'

export type BookFormat = 'txt' | 'epub'

export type BookMeta = {
  id: string
  title: string
  author: string
  cover: string
  encoding: TextEncoding
  charCount: number
  chapterCount: number
  toc: string[]
  byteSize: number
  createdAt: number
  lastReadAt: number
  chapterIndex: number
  scrollRatio: number
  /** M1 的书没有这个字段，读取时按 txt 处理 */
  format?: BookFormat
  /** EPUB 阅读位置（epub.js CFI），用于重启后回到原处 */
  epubCfi?: string
  /** 与 toc 一一对应的 EPUB 目录 href，用于把当前位置映射到章节名 */
  tocHrefs?: string[]
  /** EPUB 封面（已缩放的 data URL），书架直接显示 */
  coverImage?: string
  language?: string
  /** 文件内容 SHA-256，用于跨设备去重 */
  contentHash?: string
  /** 同系列的书共享人物、地名、地图 */
  series?: string
  /** 收藏夹/合集 id */
  collectionId?: string
}

export type Theme = 'paper' | 'night'

export type FontFamily = 'serif' | 'sans' | 'kai'

export type Settings = {
  fontSize: number
  theme: Theme
  fontFamily?: FontFamily
  /** M3：正文人物标记的总开关，默认开 */
  characterMark?: boolean
  readingMode?: 'scroll' | 'paged'
  /** M5：WebDAV 同步配置 */
  sync?: SyncConfig
}

export type SyncConfig = {
  url: string
  user: string
  pass: string
  enabled: boolean
  lastSyncAt?: number
  deviceId?: string
}

export type SyncTombstone = {
  key: string
  kind: 'book' | 'note' | 'character' | 'image' | 'map' | 'pin'
  id: string
  deletedAt: number
}

export type SyncImageMeta = {
  id: string
  characterId: string
  caption: string
  sort: number
  createdAt: number
}

export type AiConfig = {
  provider: 'gemini' | 'ollama' | 'custom'
  baseUrl: string
  model: string
  apiKey: string
}

export type SyncMapMeta = {
  id: string
  bookId: string
  title: string
  createdAt: number
  updatedAt: number
}

export type SyncSnapshot = {
  version: 1
  deviceId: string
  exportedAt: number
  books: BookMeta[]
  notes: Note[]
  characters: Character[]
  images: SyncImageMeta[]
  maps: SyncMapMeta[]
  pins: MapPin[]
  tombstones: SyncTombstone[]
}

export type ChapterRow = {
  bookId: string
  index: number
  title: string
  text: string
}

export type NoteColor = 'yellow' | 'pink' | 'green' | 'blue'

export type Note = {
  id: string
  bookId: string
  cfi: string
  text: string
  color: NoteColor
  note: string
  tags: string[]
  chapterTitle: string
  createdAt: number
  updatedAt: number
  /** M3：关联的人物（P1） */
  characterIds?: string[]
}

export type CharacterKind = 'character' | 'place'

export type Character = {
  id: string
  bookId: string
  /** 默认人物；place 表示地名 */
  kind?: CharacterKind
  /** 远程头像 URL（维基/Bangumi），本地插画优先 */
  avatarUrl?: string
  name: string
  aliases: string[]
  role: string
  bio: string
  tags: string[]
  color: string
  avatarImageId?: string
  createdAt: number
  updatedAt: number
}

export type CharacterImage = {
  id: string
  characterId: string
  /** 原图，存 IndexedDB Blob，不塞进 BookMeta */
  blob: Blob
  /** 缩略图（列表/悬停卡用），失败时退回原图 */
  thumb?: Blob
  caption: string
  sort: number
  createdAt: number
}

export type BookMap = {
  id: string
  bookId: string
  title: string
  blob: Blob
  createdAt: number
  updatedAt: number
}

export type MapPin = {
  id: string
  mapId: string
  placeId: string
  x: number
  y: number
  label: string
  updatedAt?: number
}

export type Collection = {
  id: string
  name: string
  isSeries: boolean
  createdAt: number
}

export type CharacterAppearance = {
  chapterIndex: number
  title: string
  href?: string
  count: number
}

export type AppearanceCache = {
  characterId: string
  bookId: string
  stamp: string
  items: CharacterAppearance[]
}
