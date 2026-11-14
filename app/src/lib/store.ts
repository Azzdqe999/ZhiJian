import type { Chapter } from './txt'
import type {
  AppearanceCache,
  BookMeta,
  ChapterRow,
  BookMap,
  Character,
  Collection,
  MapPin,
  CharacterImage,
  Note,
  Settings,
  AiConfig,
  SyncConfig,
  SyncTombstone,
} from './types'

const DB_NAME = 'paper-between'
const DB_VERSION = 7

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('chapters')) db.createObjectStore('chapters', { keyPath: ['bookId', 'index'] })
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('notes')) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' })
        notes.createIndex('bookId', 'bookId', { unique: false })
        notes.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains('characters')) {
        const characters = db.createObjectStore('characters', { keyPath: 'id' })
        characters.createIndex('bookId', 'bookId', { unique: false })
      }
      if (!db.objectStoreNames.contains('characterImages')) {
        const images = db.createObjectStore('characterImages', { keyPath: 'id' })
        images.createIndex('characterId', 'characterId', { unique: false })
      }
      if (!db.objectStoreNames.contains('characterAppearances')) {
        db.createObjectStore('characterAppearances', { keyPath: 'characterId' })
      }
      if (!db.objectStoreNames.contains('collections')) {
        db.createObjectStore('collections', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('mapPins')) {
        const pins = db.createObjectStore('mapPins', { keyPath: 'id' })
        pins.createIndex('mapId', 'mapId', { unique: false })
      }
      if (!db.objectStoreNames.contains('bookMaps')) {
        const maps = db.createObjectStore('bookMaps', { keyPath: 'id' })
        maps.createIndex('bookId', 'bookId', { unique: false })
      }
      if (!db.objectStoreNames.contains('tombstones')) {
        const tombstones = db.createObjectStore('tombstones', { keyPath: 'key' })
        tombstones.createIndex('deletedAt', 'deletedAt', { unique: false })
      }
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('无法打开本地数据库'))
    }
  })
  return dbPromise
}

function requestDone<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('本地数据库请求失败'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('本地数据库写入失败'))
    tx.onabort = () => reject(tx.error ?? new Error('本地数据库事务中止'))
  })
}

const chapterRange = (bookId: string) => IDBKeyRange.bound([bookId, 0], [bookId, 2147483647])

export async function listBooks(): Promise<BookMeta[]> {
  const db = await openDb()
  const tx = db.transaction('books', 'readonly')
  const rows = await requestDone(tx.objectStore('books').getAll() as IDBRequest<BookMeta[]>)
  return rows.sort((a, b) => b.lastReadAt - a.lastReadAt)
}

export async function getBook(id: string): Promise<BookMeta | null> {
  const db = await openDb()
  const tx = db.transaction('books', 'readonly')
  const row = await requestDone(tx.objectStore('books').get(id) as IDBRequest<BookMeta | undefined>)
  return row ?? null
}

export async function putBook(book: BookMeta): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('books', 'readwrite')
  tx.objectStore('books').put(book)
  await txDone(tx)
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(['books', 'files', 'chapters', 'notes', 'characters', 'characterImages', 'characterAppearances'], 'readwrite')
  tx.objectStore('books').delete(id)
  tx.objectStore('files').delete(id)
  tx.objectStore('chapters').delete(chapterRange(id))
  const notes = tx.objectStore('notes')
  const cursorReq = notes.index('bookId').openKeyCursor(IDBKeyRange.only(id))
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result
    if (!cursor) return
    notes.delete(cursor.primaryKey)
    cursor.continue()
  }
  // 人物与插画随书一起清掉
  const characters = tx.objectStore('characters')
  const images = tx.objectStore('characterImages')
  const appearances = tx.objectStore('characterAppearances')
  const characterReq = characters.index('bookId').openKeyCursor(IDBKeyRange.only(id))
  characterReq.onsuccess = () => {
    const cursor = characterReq.result
    if (!cursor) return
    const characterId = String(cursor.primaryKey)
    characters.delete(characterId)
    appearances.delete(characterId)
    const imageReq = images.index('characterId').openKeyCursor(IDBKeyRange.only(characterId))
    imageReq.onsuccess = () => {
      const imageCursor = imageReq.result
      if (!imageCursor) return
      images.delete(imageCursor.primaryKey)
      imageCursor.continue()
    }
    cursor.continue()
  }
  await txDone(tx)
  await recordTombstone('book', id)
}

export async function putFile(id: string, bytes: ArrayBuffer): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('files', 'readwrite')
  tx.objectStore('files').put({ id, bytes })
  await txDone(tx)
}

export async function getFile(id: string): Promise<ArrayBuffer | null> {
  const db = await openDb()
  const tx = db.transaction('files', 'readonly')
  const row = await requestDone(tx.objectStore('files').get(id) as IDBRequest<{ id: string; bytes: ArrayBuffer } | undefined>)
  return row ? row.bytes : null
}

export async function putChapters(bookId: string, chapters: Chapter[]): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('chapters', 'readwrite')
  const store = tx.objectStore('chapters')
  store.delete(chapterRange(bookId))
  for (let i = 0; i < chapters.length; i++) {
    store.put({ bookId, index: i, title: chapters[i].title, text: chapters[i].text })
  }
  await txDone(tx)
}

export async function getChapters(bookId: string): Promise<ChapterRow[]> {
  const db = await openDb()
  const tx = db.transaction('chapters', 'readonly')
  const rows = await requestDone(tx.objectStore('chapters').getAll(chapterRange(bookId)) as IDBRequest<ChapterRow[]>)
  return rows.sort((a, b) => a.index - b.index)
}

export async function getChapter(bookId: string, index: number): Promise<ChapterRow | null> {
  const db = await openDb()
  const tx = db.transaction('chapters', 'readonly')
  const row = await requestDone(tx.objectStore('chapters').get([bookId, index]) as IDBRequest<ChapterRow | undefined>)
  return row ?? null
}

const SETTINGS_KEY = 'ui'

export async function getSettings(): Promise<Settings | null> {
  const db = await openDb()
  const tx = db.transaction('settings', 'readonly')
  const row = await requestDone(tx.objectStore('settings').get(SETTINGS_KEY) as IDBRequest<{ key: string; value: Settings } | undefined>)
  return row ? row.value : null
}

export async function saveSettings(value: Settings): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('settings', 'readwrite')
  tx.objectStore('settings').put({ key: SETTINGS_KEY, value })
  await txDone(tx)
}

/* ---------- 笔记 ---------- */

export async function listNotes(bookId?: string): Promise<Note[]> {
  const db = await openDb()
  const tx = db.transaction('notes', 'readonly')
  const store = tx.objectStore('notes')
  const req = bookId ? store.index('bookId').getAll(IDBKeyRange.only(bookId)) : store.getAll()
  const rows = await requestDone(req as IDBRequest<Note[]>)
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

export async function putNote(note: Note): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('notes', 'readwrite')
  tx.objectStore('notes').put(note)
  await txDone(tx)
}

export async function deleteNote(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('notes', 'readwrite')
  tx.objectStore('notes').delete(id)
  await txDone(tx)
  await recordTombstone('note', id)
}
/* ---------- 人物 / 插画 / 出场章节（M3） ---------- */

export async function listCharacters(bookId?: string): Promise<Character[]> {
  const db = await openDb()
  const tx = db.transaction('characters', 'readonly')
  const store = tx.objectStore('characters')
  const req = bookId ? store.index('bookId').getAll(IDBKeyRange.only(bookId)) : store.getAll()
  const rows = await requestDone(req as IDBRequest<Character[]>)
  return rows.sort((a, b) => a.createdAt - b.createdAt)
}

export async function getCharacter(id: string): Promise<Character | null> {
  const db = await openDb()
  const tx = db.transaction('characters', 'readonly')
  const row = await requestDone(tx.objectStore('characters').get(id) as IDBRequest<Character | undefined>)
  return row ?? null
}

export async function putCharacter(character: Character): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('characters', 'readwrite')
  tx.objectStore('characters').put(character)
  await txDone(tx)
}

/** 删人物：连带插画与出场章节缓存；笔记由调用方解除关联（不删笔记） */
export async function deleteCharacter(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(['characters', 'characterImages', 'characterAppearances'], 'readwrite')
  tx.objectStore('characters').delete(id)
  tx.objectStore('characterAppearances').delete(id)
  const images = tx.objectStore('characterImages')
  const cursorReq = images.index('characterId').openKeyCursor(IDBKeyRange.only(id))
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result
    if (!cursor) return
    images.delete(cursor.primaryKey)
    cursor.continue()
  }
  await txDone(tx)
  await recordTombstone('character', id)
}

export async function listCharacterImages(characterId?: string): Promise<CharacterImage[]> {
  const db = await openDb()
  const tx = db.transaction('characterImages', 'readonly')
  const store = tx.objectStore('characterImages')
  const req = characterId ? store.index('characterId').getAll(IDBKeyRange.only(characterId)) : store.getAll()
  const rows = await requestDone(req as IDBRequest<CharacterImage[]>)
  return rows.sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt)
}

export async function putCharacterImage(image: CharacterImage): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('characterImages', 'readwrite')
  tx.objectStore('characterImages').put(image)
  await txDone(tx)
}

export async function deleteCharacterImage(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('characterImages', 'readwrite')
  tx.objectStore('characterImages').delete(id)
  await txDone(tx)
  await recordTombstone('image', id)
}

export async function saveCharacterImageOrder(images: CharacterImage[]): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('characterImages', 'readwrite')
  const store = tx.objectStore('characterImages')
  images.forEach((image, index) => store.put({ ...image, sort: index }))
  await txDone(tx)
}

export async function listChapters(bookId: string): Promise<ChapterRow[]> {
  const db = await openDb()
  const tx = db.transaction('chapters', 'readonly')
  const rows = await requestDone(tx.objectStore('chapters').getAll(chapterRange(bookId)) as IDBRequest<ChapterRow[]>)
  return rows.sort((a, b) => a.index - b.index)
}

export async function getAppearances(characterId: string): Promise<AppearanceCache | null> {
  const db = await openDb()
  const tx = db.transaction('characterAppearances', 'readonly')
  const row = await requestDone(tx.objectStore('characterAppearances').get(characterId) as IDBRequest<AppearanceCache | undefined>)
  return row ?? null
}

export async function putAppearances(cache: AppearanceCache): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('characterAppearances', 'readwrite')
  tx.objectStore('characterAppearances').put(cache)
  await txDone(tx)
}

/* ---------- 同步（M5） ---------- */

export async function recordTombstone(kind: SyncTombstone['kind'], id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('tombstones', 'readwrite')
  tx.objectStore('tombstones').put({ key: kind + ':' + id, kind, id, deletedAt: Date.now() })
  await txDone(tx)
}

export async function listTombstones(): Promise<SyncTombstone[]> {
  const db = await openDb()
  const tx = db.transaction('tombstones', 'readonly')
  const rows = await requestDone(tx.objectStore('tombstones').getAll() as IDBRequest<SyncTombstone[]>)
  return rows
}

export async function putTombstone(row: SyncTombstone): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('tombstones', 'readwrite')
  tx.objectStore('tombstones').put({ ...row, key: row.kind + ':' + row.id })
  await txDone(tx)
}

export async function clearTombstones(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('tombstones', 'readwrite')
  tx.objectStore('tombstones').clear()
  await txDone(tx)
}

export async function getSyncConfig(): Promise<SyncConfig | null> {
  const db = await openDb()
  const tx = db.transaction('settings', 'readonly')
  const row = await requestDone(tx.objectStore('settings').get('sync') as IDBRequest<{ key: string; value: SyncConfig } | undefined>)
  return row ? row.value : null
}

export async function saveSyncConfig(value: SyncConfig): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('settings', 'readwrite')
  tx.objectStore('settings').put({ key: 'sync', value })
  await txDone(tx)
}

export async function getAiConfig(): Promise<AiConfig | null> {
  const db = await openDb()
  const tx = db.transaction('settings', 'readonly')
  const row = await requestDone(tx.objectStore('settings').get('ai') as IDBRequest<{ key: string; value: AiConfig } | undefined>)
  return row ? row.value : null
}

export async function saveAiConfig(value: AiConfig): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('settings', 'readwrite')
  tx.objectStore('settings').put({ key: 'ai', value })
  await txDone(tx)
}

/* ---------- 世界观地图（M7） ---------- */

export async function listBookMaps(bookId: string): Promise<BookMap[]> {
  const db = await openDb()
  const tx = db.transaction('bookMaps', 'readonly')
  const rows = await requestDone(tx.objectStore('bookMaps').index('bookId').getAll(IDBKeyRange.only(bookId)) as IDBRequest<BookMap[]>)
  return rows.sort((a, b) => a.createdAt - b.createdAt)
}

export async function putBookMap(map: BookMap): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('bookMaps', 'readwrite')
  tx.objectStore('bookMaps').put(map)
  await txDone(tx)
}

export async function deleteBookMap(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(['bookMaps', 'mapPins'], 'readwrite')
  tx.objectStore('bookMaps').delete(id)
  const pins = tx.objectStore('mapPins')
  const cursorReq = pins.index('mapId').openKeyCursor(IDBKeyRange.only(id))
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result
    if (!cursor) return
    pins.delete(cursor.primaryKey)
    cursor.continue()
  }
  await txDone(tx)
  await recordTombstone('map', id)
}

/* ---------- 地图标记（M8） ---------- */

export async function listMapPins(mapId: string): Promise<MapPin[]> {
  const db = await openDb()
  const tx = db.transaction('mapPins', 'readonly')
  return requestDone(tx.objectStore('mapPins').index('mapId').getAll(IDBKeyRange.only(mapId)) as IDBRequest<MapPin[]>)
}

export async function putMapPin(pin: MapPin): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('mapPins', 'readwrite')
  tx.objectStore('mapPins').put({ ...pin, updatedAt: pin.updatedAt || Date.now() })
  await txDone(tx)
}

export async function deleteMapPin(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('mapPins', 'readwrite')
  tx.objectStore('mapPins').delete(id)
  await txDone(tx)
  await recordTombstone('pin', id)
}

/* ---------- 收藏夹（M9） ---------- */

export async function listCollections(): Promise<Collection[]> {
  const db = await openDb()
  const tx = db.transaction('collections', 'readonly')
  const rows = await requestDone(tx.objectStore('collections').getAll() as IDBRequest<Collection[]>)
  return rows.sort((a, b) => a.createdAt - b.createdAt)
}

export async function putCollection(value: Collection): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('collections', 'readwrite')
  tx.objectStore('collections').put(value)
  await txDone(tx)
}

export async function deleteCollection(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('collections', 'readwrite')
  tx.objectStore('collections').delete(id)
  await txDone(tx)
}

export async function listAllBookMaps(): Promise<BookMap[]> {
  const db = await openDb()
  const tx = db.transaction('bookMaps', 'readonly')
  return requestDone(tx.objectStore('bookMaps').getAll() as IDBRequest<BookMap[]>)
}

export async function listAllMapPins(): Promise<MapPin[]> {
  const db = await openDb()
  const tx = db.transaction('mapPins', 'readonly')
  return requestDone(tx.objectStore('mapPins').getAll() as IDBRequest<MapPin[]>)
}
