import type {
  BookMeta,
  Character,
  MapPin,
  Note,
  SyncImageMeta,
  SyncMapMeta,
  SyncConflict,
  SyncSnapshot,
  SyncTombstone,
} from './types'

export function detectBookConflicts(local: SyncSnapshot, remotes: SyncSnapshot[]): SyncConflict[] {
  const remoteBooks = new Map<string, BookMeta>()
  for (const snap of remotes) {
    for (const book of snap.books) {
      const prev = remoteBooks.get(book.id)
      if (!prev || book.lastReadAt > prev.lastReadAt) remoteBooks.set(book.id, book)
    }
  }
  const conflicts: SyncConflict[] = []
  for (const mine of local.books) {
    if (mine.deletedAt) continue
    const theirs = remoteBooks.get(mine.id)
    if (!theirs || theirs.deletedAt) continue
    if (!mine.lastReadAt || !theirs.lastReadAt) continue
    const moved = mine.chapterIndex !== theirs.chapterIndex ||
      Math.abs((mine.scrollRatio || 0) - (theirs.scrollRatio || 0)) > 0.02 ||
      (!!mine.epubCfi && !!theirs.epubCfi && mine.epubCfi !== theirs.epubCfi)
    if (!moved) continue
    conflicts.push({
      bookId: mine.id,
      title: mine.title,
      local: { chapterIndex: mine.chapterIndex, scrollRatio: mine.scrollRatio || 0, epubCfi: mine.epubCfi, lastReadAt: mine.lastReadAt },
      remote: { chapterIndex: theirs.chapterIndex, scrollRatio: theirs.scrollRatio || 0, epubCfi: theirs.epubCfi, lastReadAt: theirs.lastReadAt },
      chosen: mine.lastReadAt >= theirs.lastReadAt ? 'local' : 'remote',
    })
    if (conflicts.length >= 50) break
  }
  return conflicts
}

export function mergeSnapshots(local: SyncSnapshot, remotes: SyncSnapshot[]): SyncSnapshot {
  const all = [local, ...remotes]
  const tombstones = new Map<string, SyncTombstone>()
  for (const snap of all) {
    for (const tomb of snap.tombstones || []) {
      const prev = tombstones.get(tomb.key)
      if (!prev || tomb.deletedAt > prev.deletedAt) tombstones.set(tomb.key, tomb)
    }
  }

  const books = new Map<string, BookMeta>()
  for (const snap of all) {
    for (const book of snap.books) {
      const prev = books.get(book.id)
      if (!prev || book.lastReadAt > prev.lastReadAt) books.set(book.id, book)
    }
  }

  const notes = new Map<string, Note>()
  for (const snap of all) {
    for (const note of snap.notes) {
      const prev = notes.get(note.id)
      if (!prev || note.updatedAt > prev.updatedAt) notes.set(note.id, note)
    }
  }

  const characters = new Map<string, Character>()
  for (const snap of all) {
    for (const character of snap.characters) {
      const prev = characters.get(character.id)
      if (!prev || character.updatedAt > prev.updatedAt) characters.set(character.id, character)
    }
  }

  const images = new Map<string, SyncImageMeta>()
  for (const snap of all) {
    for (const image of snap.images) {
      const prev = images.get(image.id)
      if (!prev || image.createdAt > prev.createdAt) images.set(image.id, image)
    }
  }

  const maps = new Map<string, SyncMapMeta>()
  for (const snap of all) {
    for (const map of snap.maps || []) {
      const prev = maps.get(map.id)
      if (!prev || map.updatedAt > prev.updatedAt) maps.set(map.id, map)
    }
  }

  const pins = new Map<string, MapPin>()
  for (const snap of all) {
    for (const pin of snap.pins || []) {
      const prev = pins.get(pin.id)
      if (!prev || (pin.updatedAt || 0) >= (prev.updatedAt || 0)) pins.set(pin.id, pin)
    }
  }

  const isBookDead = (id: string) => tombstones.has('book:' + id)
  const isNoteDead = (id: string) => tombstones.has('note:' + id)
  const isCharDead = (id: string) => tombstones.has('character:' + id)
  const isImageDead = (id: string) => tombstones.has('image:' + id)
  const isMapDead = (id: string) => tombstones.has('map:' + id)
  const isPinDead = (id: string) => tombstones.has('pin:' + id)

  return {
    version: 1,
    deviceId: local.deviceId,
    exportedAt: Date.now(),
    books: [...books.values()].filter((book) => !isBookDead(book.id)),
    notes: [...notes.values()].filter((note) => !isNoteDead(note.id) && !isBookDead(note.bookId)),
    characters: [...characters.values()].filter((character) => !isCharDead(character.id) && !isBookDead(character.bookId)),
    images: [...images.values()].filter((image) => !isImageDead(image.id) && !isCharDead(image.characterId)),
    maps: [...maps.values()].filter((map) => !isMapDead(map.id) && !isBookDead(map.bookId)),
    pins: [...pins.values()].filter((pin) => !isPinDead(pin.id) && !isMapDead(pin.mapId) && !isCharDead(pin.placeId)),
    tombstones: [...tombstones.values()],
  }
}
