import JSZip from 'jszip'
import type { BookMap, BookMeta, ChapterRow, Character, CharacterImage, Collection, MapPin, Note, Settings } from './types'
import {
  getChapters,
  getFile,
  getSettings,
  listBookMaps,
  listBooks,
  listCharacterImages,
  listCharacters,
  listCollections,
  listMapPins,
  listNotes,
  putBook,
  putBookMap,
  putChapters,
  putCharacter,
  putCharacterImage,
  putCollection,
  putFile,
  putMapPin,
  putNote,
  saveSettings,
} from './store'

export type BackupMeta = {
  version: 1
  createdAt: number
  app: string
  books: BookMeta[]
  chapters: Record<string, ChapterRow[]>
  notes: Note[]
  characters: Character[]
  images: Array<Omit<CharacterImage, 'blob'>>
  collections: Collection[]
  maps: Array<Omit<BookMap, 'blob'>>
  pins: MapPin[]
  settings?: Settings
}

export type BackupProgress = (text: string) => void

export async function exportBackup(onProgress?: BackupProgress): Promise<Blob> {
  const zip = new JSZip()
  const books = await listBooks()
  const meta: BackupMeta = {
    version: 1,
    createdAt: Date.now(),
    app: '纸间',
    books,
    chapters: {},
    notes: await listNotes(),
    characters: await listCharacters(),
    images: [],
    collections: await listCollections(),
    maps: [],
    pins: [],
  }
  const files = zip.folder('files')
  const imageFolder = zip.folder('images')
  const mapFolder = zip.folder('maps')

  for (const book of books) {
    onProgress?.('打包《' + book.title + '》…')
    const bytes = await getFile(book.id)
    if (bytes) files?.file(book.id + '.bin', bytes)
    if (book.format !== 'epub') {
      const rows = await getChapters(book.id)
      if (rows.length) meta.chapters[book.id] = rows
    }
  }

  for (const image of await listCharacterImages()) {
    const { blob, ...rest } = image
    meta.images.push(rest)
    if (blob) imageFolder?.file(image.id + '.bin', await blob.arrayBuffer())
  }
  for (const map of meta.books) {
    for (const row of await listBookMaps(map.id)) {
      const { blob, ...rest } = row
      meta.maps.push(rest)
      if (blob) mapFolder?.file(row.id + '.bin', await blob.arrayBuffer())
      for (const pin of await listMapPins(row.id)) meta.pins.push(pin)
    }
  }
  const settings = await getSettings()
  if (settings) meta.settings = settings

  onProgress?.('写入备份说明…')
  zip.file('paper-backup.json', JSON.stringify(meta))
  onProgress?.('压缩文件…')
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } })
}

export async function importBackup(file: File, onProgress?: BackupProgress): Promise<{ books: number; notes: number; characters: number; images: number; maps: number }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const metaFile = zip.file('paper-backup.json')
  if (!metaFile) throw new Error('不是纸间备份文件')
  const meta = JSON.parse(await metaFile.async('string')) as BackupMeta
  if (!meta || meta.version !== 1) throw new Error('备份版本不支持')

  for (const book of meta.books || []) {
    onProgress?.('恢复《' + book.title + '》…')
    const bin = zip.file('files/' + book.id + '.bin')
    if (bin) await putFile(book.id, await bin.async('arraybuffer'))
    await putBook(book)
    const chapters = meta.chapters?.[book.id]
    if (chapters?.length) await putChapters(book.id, chapters.map((row) => ({ title: row.title, text: row.text })))
  }
  for (const note of meta.notes || []) await putNote(note)
  for (const character of meta.characters || []) await putCharacter(character)
  for (const collection of meta.collections || []) await putCollection(collection)
  for (const image of meta.images || []) {
    const bin = zip.file('images/' + image.id + '.bin')
    if (!bin) continue
    await putCharacterImage({ ...image, blob: new Blob([await bin.async('arraybuffer')]) })
  }
  for (const map of meta.maps || []) {
    const bin = zip.file('maps/' + map.id + '.bin')
    if (!bin) continue
    await putBookMap({ ...map, blob: new Blob([await bin.async('arraybuffer')]) })
  }
  for (const pin of meta.pins || []) await putMapPin(pin)
  if (meta.settings) await saveSettings(meta.settings)

  return {
    books: meta.books?.length || 0,
    notes: meta.notes?.length || 0,
    characters: meta.characters?.length || 0,
    images: meta.images?.length || 0,
    maps: meta.maps?.length || 0,
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
