import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { checkForUpdate, installUpdate } from './lib/updater'
import type { UpdateInfo } from './lib/updater'
import { ENCODINGS, ENCODING_LABELS, countWords, decodeBytes, splitChapters, toParagraphs } from './lib/txt'
import type { Chapter, TextEncoding } from './lib/txt'
import {
  deleteBook as removeBookFromDb,
  deleteCharacter as removeCharacterFromDb,
  deleteCharacterImage,
  getChapter,
  getFile,
  getSettings,
  getSyncConfig,
  listBooks,
  listBookMaps,
  listCollections,
  putBookMap,
  putCollection,
  deleteCollection as removeCollectionFromDb,
  listCharacterImages,
  listCharacters,
  listNotes,
  putBook,
  getChapters,
  putChapters,
  putCharacter,
  putCharacterImage,
  putFile,
  putNote,
  saveCharacterImageOrder,
  saveSettings,
} from './lib/store'
import type {
  BookMeta,
  Character,
  CharacterAppearance,
  CharacterImage,
  Collection,
  FontFamily,
  Note,
  Theme,
} from './lib/types'
import { buildEpub } from './lib/epub-build'
import { splitEpubWithImages } from './lib/epub-split-images'
import { parseEpub, titleForHref } from './lib/epub'
import { fontLabel, fontStack } from './lib/fonts'
import { downloadMarkdown, notesFileName, notesToMarkdown } from './lib/markdown'
import { sha256 } from './lib/hash'
import { syncNow } from './lib/sync'
import { extractCharacters, extractPlaces, loadAiConfig } from './lib/ai'
import type { AiCharacter } from './lib/ai'
import {
  buildMatcher,
  colorFor,
  DEFAULT_CHARACTER_COLOR,
  findNameOwner,
  sanitizeName,
} from './lib/characters'
import type { CardRect } from './lib/characters'
import { imageFilesFromDataTransfer, isImageFile, makeThumbnail } from './lib/images'
import { loadCharacterAppearances } from './lib/appearances'
import EpubReader from './components/EpubReader'
import NotesPanel from './components/NotesPanel'
import CharactersPanel from './components/CharactersPanel'
import MapViewer from './components/MapViewer'
import ReaderSheet from './components/ReaderSheet'
import CharacterDrawer from './components/CharacterDrawer'
import CharacterCard from './components/CharacterCard'
import CharacterEditor from './components/CharacterEditor'
import type { CharacterDraft } from './components/CharacterEditor'
import ImageLightbox from './components/ImageLightbox'
import SettingsPanel from './components/SettingsPanel'
import CharacterText from './components/CharacterText'

type NavKey = 'shelf' | 'notes' | 'people' | 'settings'

type EditorTarget = {
  mode: 'create' | 'edit'
  character?: Character
  prefillName?: string
  bookId: string
  kind?: 'character' | 'place'
}

type MergePrompt = {
  name: string
  owner: Character
  bookId: string
}

const NAV: Array<{ key: NavKey; label: string; hint: string }> = [
  { key: 'shelf', label: '书架', hint: '全部藏书' },
  { key: 'notes', label: '笔记', hint: '划线 · 批注' },
  { key: 'people', label: '人物', hint: '档案 · 插画' },
  { key: 'settings', label: '设置', hint: '排版 · 同步' },
]

const PATHS: Record<NavKey, string> = {
  shelf: 'M4 19.5V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2.5Zm4-16.5v18',
  notes: 'M5 3h9l5 5v13H5V3Zm9 0v5h5M8.5 13h7M8.5 17h4.5',
  people: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 10a8 8 0 0 1 16 0',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 12h2M3 12h2M12 3v2M12 19v2',
}

const COVERS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']
const FONT_ORDER: FontFamily[] = ['serif', 'sans', 'kai']

function Icon({ name }: { name: NavKey }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

function pickCover(seed: string): string {
  let hash = 2166136261
  for (const ch of seed) hash = ((hash ^ (ch.codePointAt(0) as number)) * 16777619) >>> 0
  return COVERS[hash % COVERS.length]
}

function newId(prefix: string): string {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

function cleanTitle(name: string): string {
  const base = name.replace(/\.(txt|epub)$/i, '').replace(/^[《【\[]+|[》】\]]+$/g, '').trim()
  return base || '未命名'
}

function isEpubBook(book: BookMeta): boolean {
  return (book.format ?? 'txt') === 'epub'
}

function guessAuthor(text: string): string {
  const head = text.slice(0, 2500)
  const match = head.match(/(?:作\s*者|著\s*者)\s*[:：]\s*([^\n\r]{1,24})/)
  return match ? match[1].trim() : ''
}

function formatWords(count: number): string {
  if (count >= 10000) {
    const wan = count / 10000
    return (wan >= 100 ? wan.toFixed(0) : wan.toFixed(1)).replace(/\.0$/, '') + ' 万字'
  }
  return count + ' 字'
}

function progressOf(book: BookMeta): number {
  if (!book.chapterCount) return 0
  const percent = ((book.chapterIndex + book.scrollRatio) / book.chapterCount) * 100
  return Math.max(0, Math.min(100, Math.round(percent)))
}

function statusOf(book: BookMeta): '未开始' | '在读' | '读完' {
  const percent = progressOf(book)
  if (percent >= 99) return '读完'
  if (percent > 0 || book.chapterIndex > 0 || Boolean(book.epubCfi)) return '在读'
  return '未开始'
}

const CHAPTER_PREFIX = /^第\s*[0-9０-９零〇○一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟]+\s*[章节節回卷部篇集]\s*[·:：、.．\-—]?\s*/

function chapterLabel(book: BookMeta): string {
  const index = Math.min(Math.max(0, book.chapterIndex), Math.max(0, book.chapterCount - 1))
  const title = book.toc[index] ?? '正文'
  const clean = title.replace(CHAPTER_PREFIX, '').trim()
  return '第 ' + (index + 1) + ' 章 · ' + (clean || title)
}

function App() {
  const [nav, setNav] = useState<NavKey>('shelf')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateHidden, setUpdateHidden] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [booted, setBooted] = useState(false)
  const [library, setLibrary] = useState<BookMeta[]>([])
  const [readingId, setReadingId] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState(19)
  const [readingMode, setReadingMode] = useState<'scroll' | 'paged'>('scroll')
  const [readerSheetOpen, setReaderSheetOpen] = useState(false)
  const [fontFamily, setFontFamily] = useState<FontFamily>('serif')
  const [theme, setTheme] = useState<Theme>('paper')
  const [notes, setNotes] = useState<Note[]>([])
  const [jump, setJump] = useState<{ bookId: string; cfi?: string; href?: string; token: number } | null>(null)
  const [importing, setImporting] = useState<{ name: string; index: number; total: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [characters, setCharacters] = useState<Character[]>([])
  const [characterImages, setCharacterImages] = useState<CharacterImage[]>([])
  const [markEnabled, setMarkEnabled] = useState(true)
  const [peopleBookId, setPeopleBookId] = useState('all')
  const [profileId, setProfileId] = useState<string | null>(null)
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null)
  const [mapBookId, setMapBookId] = useState<string | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [shelfCollection, setShelfCollection] = useState('all')
  const [collectionDialog, setCollectionDialog] = useState<{ mode: 'create' | 'rename'; value: string } | null>(null)
  const [mergePrompt, setMergePrompt] = useState<MergePrompt | null>(null)
  const [card, setCard] = useState<{ id: string; x: number; y: number } | null>(null)
  const [lightbox, setLightbox] = useState<{ characterId: string; index: number } | null>(null)
  const [appearances, setAppearances] = useState<{ characterId: string; loading: boolean; items: CharacterAppearance[] } | null>(null)
  const [jumpChapter, setJumpChapter] = useState<{ bookId: string; index: number; token: number } | null>(null)

  const libraryRef = useRef<BookMeta[]>([])
  const charactersRef = useRef<Character[]>([])
  const imagesRef = useRef<CharacterImage[]>([])
  const cardTimer = useRef<number | null>(null)
  const persistTimers = useRef(new Map<string, number>())
  const toastTimer = useRef<number | null>(null)
  const hideTimer = useRef<number | null>(null)
  const dragDepth = useRef(0)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const backLockRef = useRef(0)

  const handleBack = useCallback(() => {
    const now = Date.now()
    if (now - backLockRef.current < 500) return
    backLockRef.current = now
    const event = new CustomEvent('paper:back', { cancelable: true })
    if (!window.dispatchEvent(event)) return
    if (readerSheetOpen) { setReaderSheetOpen(false); return }
    if (collectionDialog) { setCollectionDialog(null); return }
    if (mapBookId) { setMapBookId(null); return }
    if (editorTarget) { setEditorTarget(null); return }
    if (profileId) { setProfileId(null); return }
    if (detailId) { setDetailId(null); return }
    if (mergePrompt) { setMergePrompt(null); return }
    if (readingId) {
      setReadingId(null)
      setJump(null)
      setJumpChapter(null)
      return
    }
    if (nav !== 'shelf') { setNav('shelf'); return }
    if (Capacitor.isNativePlatform()) void CapacitorApp.exitApp()
  }, [readerSheetOpen, collectionDialog, mapBookId, editorTarget, profileId, detailId, mergePrompt, readingId, nav])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let remove: (() => void) | undefined
    void CapacitorApp.addListener('backButton', () => handleBack()).then((listener) => {
      remove = () => void listener.remove()
    })
    return () => remove?.()
  }, [handleBack])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let alive = true
    void checkForUpdate()
      .then((info) => {
        if (alive && info) setUpdateInfo(info)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let startX = 0
    let startY = 0
    let tracking = false
    let lastBack = 0
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      tracking = touch.clientX <= 24
      startX = touch.clientX
      startY = touch.clientY
    }
    const onEnd = (event: TouchEvent) => {
      if (!tracking) return
      tracking = false
      const touch = event.changedTouches[0]
      if (!touch) return
      if (touch.clientX - startX > 70 && Math.abs(touch.clientY - startY) < 60) {
        const now = Date.now()
        if (now - lastBack < 450) return
        lastBack = now
        handleBack()
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [handleBack])

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4500)
  }, [])

  const refreshLocalData = useCallback(async () => {
    const [books, savedNotes, savedCharacters, savedImages, savedCollections] = await Promise.all([
      listBooks(),
      listNotes(),
      listCharacters(),
      listCharacterImages(),
      listCollections(),
    ])
    libraryRef.current = books
    setLibrary(books)
    setNotes(savedNotes)
    charactersRef.current = savedCharacters
    setCharacters(savedCharacters)
    imagesRef.current = savedImages
    setCharacterImages(savedImages)
    setCollections(savedCollections)
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [books, settings, savedNotes, savedCharacters, savedImages, savedCollections] = await Promise.all([
          listBooks(),
          getSettings(),
          listNotes(),
          listCharacters(),
          listCharacterImages(),
          listCollections(),
        ])
        if (!alive) return
        libraryRef.current = books
        setLibrary(books)
        setNotes(savedNotes)
        charactersRef.current = savedCharacters
        imagesRef.current = savedImages
        setCharacters(savedCharacters)
        setCharacterImages(savedImages)
        setCollections(savedCollections)
        if (settings) {
          setFontSize(settings.fontSize)
          setTheme(settings.theme)
          if (settings.fontFamily) setFontFamily(settings.fontFamily)
          if (typeof settings.characterMark === 'boolean') setMarkEnabled(settings.characterMark)
          if (settings.readingMode === 'paged' || settings.readingMode === 'scroll') setReadingMode(settings.readingMode)
        }
      } catch (error) {
        if (alive) showToast('本地书架打开失败：' + (error instanceof Error ? error.message : String(error)))
      } finally {
        if (alive) setBooted(true)
      }
      try {
        if (sessionStorage.getItem('paper-auto-sync')) return
        const sync = await getSyncConfig()
        if (!sync || !sync.enabled || !sync.url || !sync.user || !sync.pass) return
        if (Date.now() - (sync.lastSyncAt || 0) < 5 * 60 * 1000) return
        sessionStorage.setItem('paper-auto-sync', '1')
        await syncNow()
        if (alive) await refreshLocalData()
      } catch {
        // 启动自动同步失败不阻塞阅读
      }
    })()
    return () => {
      alive = false
    }
  }, [showToast, refreshLocalData])

  useEffect(() => {
    if (!booted) return
    const timer = window.setTimeout(() => {
      saveSettings({ fontSize, theme, fontFamily, characterMark: markEnabled, readingMode }).catch(() => {})
    }, 160)
    return () => window.clearTimeout(timer)
  }, [booted, fontSize, theme, fontFamily, markEnabled])

  useEffect(
    () => () => {
      persistTimers.current.forEach((timer) => window.clearTimeout(timer))
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
      if (cardTimer.current) window.clearTimeout(cardTimer.current)
    },
    [],
  )

  const updateBook = useCallback((id: string, patch: Partial<BookMeta>) => {
    const target = libraryRef.current.find((book) => book.id === id)
    if (!target) return
    const next: BookMeta = { ...target, ...patch }
    if (
      next.chapterIndex === target.chapterIndex &&
      next.scrollRatio === target.scrollRatio &&
      next.lastReadAt === target.lastReadAt &&
      next.epubCfi === target.epubCfi
    ) {
      return
    }
    libraryRef.current = libraryRef.current.map((book) => (book.id === id ? next : book))
    setLibrary(libraryRef.current)
    const previous = persistTimers.current.get(id)
    if (previous) window.clearTimeout(previous)
    const timer = window.setTimeout(() => {
      persistTimers.current.delete(id)
      putBook(next).catch(() => {})
    }, 280)
    persistTimers.current.set(id, timer)
  }, [])

  const handleProgress = useCallback(
    (bookId: string, chapterIndex: number, scrollRatio: number) => {
      updateBook(bookId, { chapterIndex, scrollRatio })
    },
    [updateBook],
  )

  const handleEpubProgress = useCallback(
    (bookId: string, cfi: string, chapterIndex: number, ratio: number) => {
      updateBook(bookId, { epubCfi: cfi, chapterIndex, scrollRatio: ratio })
    },
    [updateBook],
  )

  const addAiCharacters = useCallback(
    async (bookId: string, list: AiCharacter[], kind: 'character' | 'place' = 'character') => {
      const existing = charactersRef.current.filter((item) => item.bookId === bookId)
      let added = 0
      for (const item of list) {
        const name = sanitizeName(item.name)
        if (!name) continue
        if (existing.some((character) => character.name === name || character.aliases.includes(name))) continue
        const now = Date.now()
        const character: Character = {
          id: 'ch_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          bookId,
          kind,
          name,
          aliases: (item.aliases || []).filter(Boolean),
          role: item.role || '',
          bio: item.bio || '',
          tags: ['AI'],
          color: DEFAULT_CHARACTER_COLOR,
          createdAt: now,
          updatedAt: now,
        }
        await putCharacter(character)
        charactersRef.current = [...charactersRef.current, character]
        existing.push(character)
        added += 1
      }
      setCharacters(charactersRef.current)
      showToast(added ? '已加入 ' + added + ' 位人物' : '没有新增人物')
    },
    [showToast],
  )

  const moveScope = useCallback(async (from: string, to: string) => {
    if (!from || !to || from === to) return
    const moved = charactersRef.current.filter((character) => character.bookId === from)
    for (const character of moved) {
      await putCharacter({ ...character, bookId: to, updatedAt: Date.now() })
    }
    if (moved.length) {
      charactersRef.current = charactersRef.current.map((character) =>
        character.bookId === from ? { ...character, bookId: to, updatedAt: Date.now() } : character,
      )
      setCharacters([...charactersRef.current])
    }
    const maps = await listBookMaps(from)
    for (const map of maps) {
      await putBookMap({ ...map, bookId: to, updatedAt: Date.now() })
    }
  }, [])

  const createCollection = useCallback(() => {
    setCollectionDialog({ mode: 'create', value: '' })
  }, [])

  const bulkAssignCollection = useCallback(async (ids: string[], collectionId: string) => {
    const collection = collections.find((item) => item.id === collectionId)
    for (const id of ids) {
      const book = libraryRef.current.find((item) => item.id === id)
      if (!book) continue
      if (collection?.isSeries) await moveScope(book.id, 'series:' + collection.name)
      const updated: BookMeta = {
        ...book,
        collectionId: collectionId || undefined,
        series: collection?.isSeries ? collection.name : book.series,
      }
      await putBook(updated)
      libraryRef.current = libraryRef.current.map((item) => (item.id === book.id ? updated : item))
    }
    setLibrary([...libraryRef.current])
    showToast(collection ? '已把 ' + ids.length + ' 本加入「' + collection.name + '」' : '已把 ' + ids.length + ' 本移出收藏夹')
  }, [collections, moveScope, showToast])

  const renameCollection = useCallback(() => {
    const collection = collections.find((item) => item.id === shelfCollection)
    if (collection) setCollectionDialog({ mode: 'rename', value: collection.name })
  }, [collections, shelfCollection])

  const submitCollection = useCallback(async () => {
    if (!collectionDialog) return
    const name = collectionDialog.value.trim()
    if (!name) return
    if (collectionDialog.mode === 'create') {
      const collection: Collection = {
        id: 'col_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        name,
        isSeries: false,
        createdAt: Date.now(),
      }
      await putCollection(collection)
      setCollections((value) => [...value, collection])
      setShelfCollection(collection.id)
      setCollectionDialog(null)
      return
    }
    const collection = collections.find((item) => item.id === shelfCollection)
    if (!collection) {
      setCollectionDialog(null)
      return
    }
    if (name !== collection.name) {
      const next = { ...collection, name }
      await putCollection(next)
      if (collection.isSeries) {
        await moveScope('series:' + collection.name, 'series:' + name)
        for (const book of libraryRef.current.filter((item) => item.collectionId === collection.id)) {
          const updated = { ...book, series: name }
          await putBook(updated)
          libraryRef.current = libraryRef.current.map((item) => (item.id === book.id ? updated : item))
        }
        setLibrary([...libraryRef.current])
      }
      setCollections((value) => value.map((item) => (item.id === collection.id ? next : item)))
    }
    setCollectionDialog(null)
  }, [collectionDialog, collections, shelfCollection, moveScope])

  const toggleSeries = useCallback(async () => {
    const collection = collections.find((item) => item.id === shelfCollection)
    if (!collection) return
    const next = { ...collection, isSeries: !collection.isSeries }
    await putCollection(next)
    const members = libraryRef.current.filter((book) => book.collectionId === collection.id)
    if (next.isSeries) {
      const scope = 'series:' + collection.name
      for (const book of members) await moveScope(book.id, scope)
    }
    for (const book of members) {
      const updated: BookMeta = { ...book, series: next.isSeries ? collection.name : undefined }
      await putBook(updated)
      libraryRef.current = libraryRef.current.map((item) => (item.id === book.id ? updated : item))
    }
    setLibrary([...libraryRef.current])
    setCollections((value) => value.map((item) => (item.id === collection.id ? next : item)))
    showToast(next.isSeries ? '已设为系列「' + collection.name + '」' : '已取消系列')
  }, [collections, shelfCollection, showToast, moveScope])

  const assignCollection = useCallback(async (book: BookMeta, collectionId: string) => {
    const collection = collections.find((item) => item.id === collectionId)
    if (collection?.isSeries) await moveScope(book.id, 'series:' + collection.name)
    const updated: BookMeta = { ...book, collectionId: collectionId || undefined }
    await putBook(updated)
    libraryRef.current = libraryRef.current.map((item) => (item.id === book.id ? updated : item))
    setLibrary([...libraryRef.current])
  }, [collections, moveScope])

  const splitBookByVolume = useCallback(async (bookId: string) => {
    const book = libraryRef.current.find((item) => item.id === bookId)
    if (!book) return
    if (isEpubBook(book)) {
      const buffer = await getFile(bookId)
      if (!buffer) {
        showToast('原始 EPUB 不在本地，无法拆分')
        return
      }
      const existingSplit = libraryRef.current.filter(
        (item) => item.title.startsWith(book.title + ' 第') && /第.+卷$/.test(item.title),
      )
      const volumes = await splitEpubWithImages(
        buffer,
        book,
        new Map(existingSplit.map((item) => [item.title, item.coverImage])),
      )
      if (volumes.length < 2) {
        showToast('没有识别到多卷')
        return
      }
      if (!window.confirm('识别到 ' + volumes.length + ' 卷，拆成 ' + volumes.length + ' 本带插图的 EPUB？')) return
      const existingTitles = new Set(libraryRef.current.map((item) => item.title))
      const created: BookMeta[] = []
      const now = Date.now()
      for (const volume of volumes) {
        if (existingTitles.has(volume.title)) continue
        const id = 'bk_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6)
        const bytes = await volume.blob.arrayBuffer()
        const next: BookMeta = {
          id,
          title: volume.title,
          author: book.author,
          cover: 'c1',
          encoding: 'utf-8',
          charCount: volume.charCount,
          chapterCount: volume.toc.length,
          toc: volume.toc,
          byteSize: bytes.byteLength,
          createdAt: now,
          lastReadAt: now,
          chapterIndex: 0,
          scrollRatio: 0,
          format: 'epub',
          series: book.series || book.title,
          collectionId: book.collectionId,
        }
        await putFile(id, bytes)
        await putBook(next)
        created.push(next)
      }
      if (!created.length) {
        showToast('这些卷已经拆分过了')
        return
      }
      libraryRef.current = [...libraryRef.current, ...created]
      setLibrary([...libraryRef.current])
      showToast('已拆成 ' + created.length + ' 本带插图的 EPUB')
      return
    }
    let rows: Array<{ title: string; text: string }> = (await getChapters(bookId)).map((row) => ({ title: row.title, text: row.text }))
    if (!rows.length && isEpubBook(book)) {
      const buffer = await getFile(bookId)
      if (!buffer) {
        showToast('原始 EPUB 不在本地，无法拆分')
        return
      }
      const parsed = await parseEpub(new Uint8Array(buffer), { collectText: true })
      rows = (parsed.sections || [])
        .filter((section) => section.linear)
        .map((section) => ({ title: titleForHref(section.href, parsed.toc) || section.label || '', text: section.text }))
        .filter((row) => row.text.trim())
    }
    if (!rows.length) {
      showToast('这本书还没有解析出章节')
      return
    }
    const groups: Array<{ label: string; chapters: Array<{ title: string; text: string }> }> = []
    let current: { label: string; chapters: Array<{ title: string; text: string }> } | null = null
    for (const row of rows) {
      const label = volumeLabelOf(row.title)
      if (!label) continue
      if (!current || current.label !== label) {
        current = { label, chapters: [] }
        groups.push(current)
      }
      current.chapters.push({ title: row.title, text: row.text })
    }
    if (groups.length < 2) {
      showToast('目录里没有识别到多卷，无法拆分')
      return
    }
    if (!window.confirm('识别到 ' + groups.length + ' 卷，拆成 ' + groups.length + ' 本书？原书会保留。')) return
    const now = Date.now()
    const baseSeries = book.series || book.title
    const existingTitles = new Set(libraryRef.current.map((item) => item.title))
    const created: BookMeta[] = []
    for (const group of groups) {
      const title = book.title + ' 第' + group.label + '卷'
      if (existingTitles.has(title)) continue
      const id = 'bk_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6)
      const text = group.chapters.map((chapter) => chapter.text).join('\n\n')
      const next: BookMeta = {
        id,
        title,
        author: book.author,
        cover: 'c1',
        encoding: 'utf-8',
        charCount: group.chapters.reduce((sum, chapter) => sum + countWords(chapter.text), 0),
        chapterCount: group.chapters.length,
        toc: group.chapters.map((chapter) => chapter.title),
        byteSize: new TextEncoder().encode(text).length,
        createdAt: now,
        lastReadAt: now,
        chapterIndex: 0,
        scrollRatio: 0,
        format: 'txt',
        series: baseSeries,
        collectionId: book.collectionId,
      }
      if (isEpubBook(book)) {
        const blob = await buildEpub({ title, author: book.author, chapters: group.chapters })
        const bytes = await blob.arrayBuffer()
        await putFile(id, bytes)
        const epubMeta: BookMeta = { ...next, format: 'epub', byteSize: bytes.byteLength, encoding: 'utf-8' }
        await putBook(epubMeta)
        created.push(epubMeta)
      } else {
        await putBook(next)
        await putChapters(id, group.chapters)
        created.push(next)
      }
    }
    if (!created.length) {
      showToast('这些卷已经拆分过了')
      return
    }
    libraryRef.current = [...libraryRef.current, ...created]
    setLibrary([...libraryRef.current])
    showToast('已拆成 ' + created.length + ' 本，原书保留')
  }, [showToast])

  const removeCollection = useCallback(async () => {
    const collection = collections.find((item) => item.id === shelfCollection)
    if (!collection) return
    if (!window.confirm('删除收藏夹「' + collection.name + '」？书本身不会删除。')) return
    for (const book of libraryRef.current.filter((item) => item.collectionId === collection.id)) {
      const updated = { ...book, collectionId: undefined, series: collection.isSeries ? undefined : book.series }
      await putBook(updated)
      libraryRef.current = libraryRef.current.map((item) => (item.id === book.id ? updated : item))
    }
    await removeCollectionFromDb(collection.id)
    setLibrary([...libraryRef.current])
    setCollections((value) => value.filter((item) => item.id !== collection.id))
    setShelfCollection('all')
  }, [collections, shelfCollection])

  const refreshNotes = useCallback(async () => {
    try {
      setNotes(await listNotes())
    } catch (error) {
      showToast('笔记读取失败：' + (error instanceof Error ? error.message : String(error)))
    }
  }, [showToast])

  const exportNotes = useCallback(
    (list: Note[]) => {
      if (!list.length) {
        showToast('没有可导出的笔记')
        return
      }
      const ids = new Set(list.map((note) => note.bookId))
      const books = libraryRef.current.filter((book) => ids.has(book.id))
      const content = notesToMarkdown(books, list)
      downloadMarkdown(notesFileName(books), content)
      showToast('已导出 ' + list.length + ' 条笔记')
    },
    [showToast],
  )

  const jumpToNote = useCallback(
    (note: Note) => {
      setDetailId(null)
      setNav('shelf')
      setJump({ bookId: note.bookId, cfi: note.cfi, token: Date.now() })
      setReadingId(note.bookId)
      updateBook(note.bookId, { lastReadAt: Date.now() })
    },
    [updateBook],
  )

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      const texts = list.filter((file) => /\.txt$/i.test(file.name) || file.type === 'text/plain')
      const epubs = list.filter((file) => /\.epub$/i.test(file.name) || file.type === 'application/epub+zip')
      const all = [...texts, ...epubs]
      if (!all.length) {
        showToast('只支持 .txt 与 .epub 文件')
        return
      }

      for (let i = 0; i < all.length; i++) {
        const file = all[i]
        const epub = epubs.includes(file)
        setImporting({ name: cleanTitle(file.name), index: i + 1, total: all.length })
        try {
          const started = performance.now()
          const buffer = await file.arrayBuffer()
          const bytes = new Uint8Array(buffer)
          if (!bytes.length) throw new Error('文件是空的')
          const now = Date.now()
          const contentHash = await sha256(buffer)
          const existing = libraryRef.current.find((book) => book.contentHash === contentHash)
          if (existing) {
            showToast('《' + existing.title + '》已经在书架里')
            continue
          }
          const id = 'bk_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8)

          if (epub) {
            const parsed = await parseEpub(buffer)
            if (!parsed.toc.length) throw new Error('没有解析到目录')
            const meta: BookMeta = {
              id,
              title: parsed.title || cleanTitle(file.name),
              author: parsed.author || '本地 EPUB',
              cover: pickCover(file.name + parsed.title),
              coverImage: parsed.coverDataUrl ?? undefined,
              format: 'epub',
              encoding: 'utf-8',
              language: parsed.language || undefined,
              charCount: parsed.charCount,
              chapterCount: parsed.linearCount,
              toc: parsed.toc.map((entry) => entry.label),
              tocHrefs: parsed.toc.map((entry) => entry.href),
              byteSize: buffer.byteLength,
              createdAt: now,
              lastReadAt: now,
              chapterIndex: 0,
              scrollRatio: 0,
              contentHash,
            }
            await putFile(meta.id, buffer)
            await putBook(meta)
            libraryRef.current = [meta, ...libraryRef.current]
            setLibrary(libraryRef.current)
            const elapsed = Math.round(performance.now() - started)
            showToast(
              '《' + meta.title + '》已导入 · EPUB · ' + parsed.linearCount + ' 章 · ' +
                formatWords(meta.charCount) + ' · 用时 ' + elapsed + ' ms',
            )
            continue
          }

          const { text, encoding } = decodeBytes(bytes)
          const chapters = splitChapters(text)
          if (!chapters.length) throw new Error('没有解析到可阅读的正文')
          const meta: BookMeta = {
            id,
            title: cleanTitle(file.name),
            author: guessAuthor(text) || '本地 TXT',
            cover: pickCover(file.name + text.slice(0, 200)),
            format: 'txt',
            encoding,
            charCount: countWords(text),
            chapterCount: chapters.length,
            toc: chapters.map((chapter) => chapter.title),
            byteSize: buffer.byteLength,
            createdAt: now,
            lastReadAt: now,
            chapterIndex: 0,
            scrollRatio: 0,
            contentHash,
          }
          await putFile(meta.id, buffer)
          await putChapters(meta.id, chapters)
          await putBook(meta)
          libraryRef.current = [meta, ...libraryRef.current]
          setLibrary(libraryRef.current)
          const elapsed = Math.round(performance.now() - started)
          showToast('《' + meta.title + '》已导入 · ' + chapters.length + ' 章 · ' + formatWords(meta.charCount) + ' · 用时 ' + elapsed + ' ms')
        } catch (error) {
          showToast('《' + cleanTitle(file.name) + '》导入失败：' + (error instanceof Error ? error.message : String(error)))
        }
      }
      setImporting(null)
    },
    [showToast],
  )

  useEffect(() => {
    const hasFiles = (event: DragEvent) => Boolean(event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files'))
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const files = event.dataTransfer?.files
      if (files && files.length) void importFiles(files)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [importFiles])

  useEffect(() => {
    if (!detailId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailId])

  const commitCharacter = useCallback(async (next: Character) => {
    await putCharacter(next)
    const exists = charactersRef.current.some((item) => item.id === next.id)
    charactersRef.current = exists
      ? charactersRef.current.map((item) => (item.id === next.id ? next : item))
      : [...charactersRef.current, next]
    setCharacters(charactersRef.current)
    return next
  }, [])

  const addCharacterImages = useCallback(
    async (characterId: string, files: File[]) => {
      const accepted = files.filter(isImageFile)
      let sort = imagesRef.current.filter((image) => image.characterId === characterId).length
      const created: CharacterImage[] = []
      for (const file of accepted) {
        try {
          const thumb = await makeThumbnail(file)
          const image: CharacterImage = {
            id: newId('ci'),
            characterId,
            blob: file,
            thumb,
            caption: '',
            sort: sort++,
            createdAt: Date.now(),
          }
          await putCharacterImage(image)
          created.push(image)
        } catch (reason) {
          showToast('插画保存失败：' + (reason instanceof Error ? reason.message : String(reason)))
        }
      }
      if (created.length) {
        imagesRef.current = [...imagesRef.current, ...created]
        setCharacterImages(imagesRef.current)
        showToast('已添加 ' + created.length + ' 张插画')
      }
      return created
    },
    [showToast],
  )

  const setCharacterAvatar = useCallback(
    async (characterId: string, imageId: string) => {
      const character = charactersRef.current.find((item) => item.id === characterId)
      if (!character) return
      await commitCharacter({ ...character, avatarImageId: imageId, updatedAt: Date.now() })
      showToast('已设为头像')
    },
    [commitCharacter, showToast],
  )

  const removeCharacterImage = useCallback(
    async (imageId: string) => {
      const image = imagesRef.current.find((item) => item.id === imageId)
      try {
        await deleteCharacterImage(imageId)
      } catch (reason) {
        showToast('删除插画失败：' + (reason instanceof Error ? reason.message : String(reason)))
        return
      }
      imagesRef.current = imagesRef.current.filter((item) => item.id !== imageId)
      setCharacterImages(imagesRef.current)
      if (image) {
        const character = charactersRef.current.find((item) => item.id === image.characterId)
        if (character && character.avatarImageId === imageId) {
          await commitCharacter({ ...character, avatarImageId: undefined, updatedAt: Date.now() })
        }
      }
      setLightbox((current) => {
        if (!current) return null
        const remaining = imagesRef.current.filter((item) => item.characterId === current.characterId)
        if (!remaining.length) return null
        return { ...current, index: Math.min(current.index, remaining.length - 1) }
      })
    },
    [commitCharacter, showToast],
  )

  const moveCharacterImage = useCallback(async (imageId: string, direction: -1 | 1) => {
    const image = imagesRef.current.find((item) => item.id === imageId)
    if (!image) return
    const list = imagesRef.current
      .filter((item) => item.characterId === image.characterId)
      .sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt)
    const index = list.findIndex((item) => item.id === imageId)
    const target = index + direction
    if (target < 0 || target >= list.length) return
    const next = [...list]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    const reindexed = next.map((item, order) => ({ ...item, sort: order }))
    try {
      await saveCharacterImageOrder(reindexed)
    } catch {
      /* 排序写失败时保持原顺序 */
      return
    }
    const map = new Map(reindexed.map((item) => [item.id, item]))
    imagesRef.current = imagesRef.current.map((item) => map.get(item.id) || item)
    setCharacterImages(imagesRef.current)
  }, [])

  const openCharacterEditor = useCallback((mode: 'create' | 'edit', character?: Character, prefillName?: string, kind: 'character' | 'place' = 'character') => {
    const fallback = readingId || (peopleBookId !== 'all' ? peopleBookId : libraryRef.current[0]?.id) || ''
    const bookId = character?.bookId || fallback
    if (!bookId) {
      showToast('先导入一本书，人物要挂在书上')
      return
    }
    setEditorTarget({ mode, character, prefillName, bookId, kind })
  }, [readingId, peopleBookId, showToast])

  const createCharacterFromName = useCallback(
    (raw: string) => {
      const name = sanitizeName(raw)
      if (!name) {
        showToast('选中的文字不能当人名，换一个词试试')
        return
      }
      const bookId = readingId || (peopleBookId !== 'all' ? peopleBookId : libraryRef.current[0]?.id) || ''
      if (!bookId) {
        showToast('先导入一本书，人物要挂在书上')
        return
      }
      const book = libraryRef.current.find((item) => item.id === bookId)
      const scope = book?.series?.trim() ? 'series:' + book.series.trim() : bookId
      const owner = findNameOwner(charactersRef.current.filter((item) => item.bookId === scope), name)
      if (owner) setMergePrompt({ name, owner: owner.character, bookId })
      else setEditorTarget({ mode: 'create', prefillName: name, bookId, kind: 'character' })
    },
    [readingId, peopleBookId, showToast],
  )

  const saveCharacter = useCallback(
    async (draft: CharacterDraft) => {
      const editing = editorTarget?.mode === 'edit' ? editorTarget.character : undefined
      const now = Date.now()
      const targetBookId = draft.bookId || editorTarget?.bookId || readingId || libraryRef.current[0]?.id || ''
      const targetBook = libraryRef.current.find((item) => item.id === targetBookId)
      const scopeId = targetBook?.series?.trim() ? 'series:' + targetBook.series.trim() : targetBookId
      let character: Character = editing
        ? {
            ...editing,
            kind: draft.kind || editing.kind || 'character',
            name: draft.name,
            aliases: draft.aliases,
            role: draft.role,
            bio: draft.bio,
            tags: draft.tags,
            color: draft.color,
            avatarImageId: draft.avatarImageId ?? editing.avatarImageId,
            updatedAt: now,
          }
        : {
            id: newId('ch'),
            bookId: scopeId,
            kind: draft.kind || editorTarget?.kind || 'character',
            name: draft.name,
            aliases: draft.aliases,
            role: draft.role,
            bio: draft.bio,
            tags: draft.tags,
            color: draft.color,
            avatarImageId: draft.avatarImageId,
            createdAt: now,
            updatedAt: now,
          }
      if (!character.bookId) {
        showToast('请选择人物所属的书')
        return
      }
      try {
        await commitCharacter(character)
        if (draft.avatarFile) {
          const created = await addCharacterImages(character.id, [draft.avatarFile])
          if (created.length) {
            character = { ...character, avatarImageId: created[0].id }
            await commitCharacter(character)
          }
        }
        setEditorTarget(null)
        setMergePrompt(null)
        showToast(editing ? '条目已更新' : '「' + character.name + '」已加入' + (character.kind === 'place' ? '地名' : '人物') + '，正文会标出所有出现处')
      } catch (reason) {
        showToast('保存人物失败：' + (reason instanceof Error ? reason.message : String(reason)))
      }
    },
    [editorTarget, readingId, commitCharacter, addCharacterImages, showToast],
  )

  const addAliasToCharacter = useCallback(
    async (owner: Character, alias: string) => {
      const clean = alias.trim()
      if (!clean) return
      if (owner.name === clean || owner.aliases.includes(clean)) {
        setMergePrompt(null)
        showToast('「' + clean + '」已经是「' + owner.name + '」的称呼')
        return
      }
      try {
        await commitCharacter({ ...owner, aliases: [...owner.aliases, clean], updatedAt: Date.now() })
        setMergePrompt(null)
        showToast('已把「' + clean + '」加入「' + owner.name + '」的别名')
      } catch (reason) {
        showToast('加入别名失败：' + (reason instanceof Error ? reason.message : String(reason)))
      }
    },
    [commitCharacter, showToast],
  )

  const deleteCharacterCard = useCallback(
    async (character: Character) => {
      try {
        await removeCharacterFromDb(character.id)
        charactersRef.current = charactersRef.current.filter((item) => item.id !== character.id)
        setCharacters(charactersRef.current)
        imagesRef.current = imagesRef.current.filter((item) => item.characterId !== character.id)
        setCharacterImages(imagesRef.current)
        const affected = notes.filter((note) => (note.characterIds || []).includes(character.id))
        for (const note of affected) {
          await putNote({
            ...note,
            characterIds: (note.characterIds || []).filter((id) => id !== character.id),
            updatedAt: Date.now(),
          })
        }
        if (affected.length) await refreshNotes()
        setProfileId((current) => (current === character.id ? null : current))
        setEditorTarget(null)
        setLightbox((current) => (current && current.characterId === character.id ? null : current))
        showToast('已删除「' + character.name + '」，正文标记已解除，笔记保留')
      } catch (reason) {
        showToast('删除人物失败：' + (reason instanceof Error ? reason.message : String(reason)))
      }
    },
    [notes, refreshNotes, showToast],
  )

  const onCharacterHover = useCallback((characterId: string, rect: CardRect) => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    if (cardTimer.current) window.clearTimeout(cardTimer.current)
    cardTimer.current = window.setTimeout(() => {
      cardTimer.current = null
      if (!charactersRef.current.some((item) => item.id === characterId)) return
      const width = 312
      const height = 372
      let x = rect.left + rect.width / 2 - width / 2
      x = Math.max(12, Math.min(window.innerWidth - width - 12, x))
      let y = rect.bottom + 10
      if (y + height > window.innerHeight - 12) y = Math.max(12, rect.top - height - 10)
      setCard({ id: characterId, x, y })
    }, 250)
  }, [])

  const onCharacterLeave = useCallback(() => {
    if (cardTimer.current) {
      window.clearTimeout(cardTimer.current)
      cardTimer.current = null
    }
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setCard(null), 200)
  }, [])

  const keepCharacterCard = useCallback(() => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    if (cardTimer.current) {
      window.clearTimeout(cardTimer.current)
      cardTimer.current = null
    }
  }, [])

  const openProfile = useCallback((characterId: string) => {
    setCard(null)
    setProfileId(characterId)
  }, [])

  const jumpToAppearance = useCallback(
    (character: Character, appearance: CharacterAppearance) => {
      const book = libraryRef.current.find((item) => item.id === character.bookId)
      if (!book) return
      setProfileId(null)
      setNav('shelf')
      setDetailId(null)
      setReadingId(book.id)
      updateBook(book.id, { lastReadAt: Date.now() })
      if ((book.format ?? 'txt') === 'epub') {
        setJumpChapter(null)
        setJump({ bookId: book.id, href: appearance.href, token: Date.now() })
      } else {
        setJump(null)
        setJumpChapter({ bookId: book.id, index: appearance.chapterIndex, token: Date.now() })
      }
    },
    [updateBook],
  )

  // 打开档案时按章扫描出场章节（结果缓存在 IndexedDB）
  useEffect(() => {
    if (!profileId) {
      setAppearances(null)
      return
    }
    const character = charactersRef.current.find((item) => item.id === profileId)
    const book = libraryRef.current.find((item) => item.id === character?.bookId)
    if (!character || !book) {
      setAppearances({ characterId: profileId, loading: false, items: [] })
      return
    }
    let alive = true
    setAppearances({ characterId: profileId, loading: true, items: [] })
    const matcher = buildMatcher([character])
    if (!matcher) {
      setAppearances({ characterId: profileId, loading: false, items: [] })
      return
    }
    loadCharacterAppearances(character, book, matcher)
      .then((items) => {
        if (alive) setAppearances({ characterId: profileId, loading: false, items })
      })
      .catch(() => {
        if (alive) setAppearances({ characterId: profileId, loading: false, items: [] })
      })
    return () => {
      alive = false
    }
  }, [profileId, characters, library])

  const openBook = useCallback(
    (book: BookMeta) => {
      setDetailId(null)
      setJump(null)
      setJumpChapter(null)
      setReadingId(book.id)
      updateBook(book.id, { lastReadAt: Date.now() })
    },
    [updateBook],
  )

  const handleReloaded = useCallback((next: BookMeta) => {
    libraryRef.current = libraryRef.current.map((book) => (book.id === next.id ? next : book))
    setLibrary(libraryRef.current)
  }, [])

  const handleDeleted = useCallback(
    (id: string) => {
      libraryRef.current = libraryRef.current.filter((book) => book.id !== id)
      setLibrary(libraryRef.current)
      charactersRef.current = charactersRef.current.filter((character) => character.bookId !== id)
      imagesRef.current = imagesRef.current.filter((image) => !charactersRef.current.some((character) => character.id === image.characterId))
      setCharacters(charactersRef.current)
      setCharacterImages(imagesRef.current)
      setProfileId(null)
      setDetailId(null)
      setReadingId((current) => (current === id ? null : current))
      showToast('已从书架删除')
    },
    [showToast],
  )

  const reading = readingId ? library.find((book) => book.id === readingId) ?? null : null
  const detail = detailId ? library.find((book) => book.id === detailId) ?? null : null
  const scopeOfBook = (book: BookMeta | null) => (book ? (book.series?.trim() ? 'series:' + book.series.trim() : book.id) : '')
  const readingScope = scopeOfBook(reading)
  // 稳定引用：阅读中书架进度刷新不会触发 EPUB 重新扫描人名标记
  const readingCharacters = useMemo(
    () => (reading ? characters.filter((character) => character.bookId === reading.id || character.bookId === readingScope) : []),
    [characters, reading?.id, readingScope],
  )
  const readingImages = useMemo(
    () => characterImages.filter((image) => readingCharacters.some((character) => character.id === image.characterId)),
    [characterImages, readingCharacters],
  )
  const profile = profileId ? characters.find((character) => character.id === profileId) ?? null : null
  const profileBook = profile ? library.find((book) => book.id === profile.bookId) ?? null : null
  const profileImages = profile
    ? characterImages
        .filter((image) => image.characterId === profile.id)
        .sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt)
    : []
  const profileNotes = profile ? notes.filter((note) => (note.characterIds || []).includes(profile.id)) : []
  const lightboxImages = lightbox
    ? characterImages
        .filter((image) => image.characterId === lightbox.characterId)
        .sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt)
    : []
  const hoveredCharacter = card ? characters.find((character) => character.id === card.id) ?? null : null
  const hoveredImages = hoveredCharacter ? characterImages.filter((image) => image.characterId === hoveredCharacter.id) : []

  if (!booted) {
    return (
      <div className={'boot theme-' + theme}>
        <span className="brand-cn">纸间</span>
        <span className="boot-text">正在打开书架…</span>
      </div>
    )
  }

  return (
    <div className={'app theme-' + theme + (reading ? ' is-reading' : '') + (updateInfo && !updateHidden ? ' has-update' : '')}>
      {updateInfo && !updateHidden ? (
        <div className="update-banner">
          <div className="update-copy">
            <strong>发现新版本 v{updateInfo.versionName}</strong>
            <span>当前 v{updateInfo.currentVersionName}</span>
          </div>
          <div className="update-actions">
            <button
              className="btn small solid"
              disabled={updating}
              onClick={() => {
                setUpdating(true)
                void installUpdate(updateInfo.url)
                  .then(() => showToast('已开始下载；首次更新需允许“安装未知应用”，授权后若没弹安装请再点一次更新'))
                  .catch((error) => showToast('更新失败：' + (error instanceof Error ? error.message : String(error))))
                  .finally(() => setUpdating(false))
              }}
            >
              {updating ? '准备中…' : '更新'}
            </button>
            <button className="btn small" onClick={() => setUpdateHidden(true)}>稍后</button>
          </div>
        </div>
      ) : null}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-cn">纸间</span>
          <span className="brand-en">PAPER BETWEEN</span>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.key}
              className={'nav-item' + (nav === item.key && !reading ? ' is-active' : '')}
              onClick={() => {
                setNav(item.key)
                setReadingId(null)
                setJump(null)
                setJumpChapter(null)
              }}
            >
              <span className="nav-icon"><Icon name={item.key} /></span>
              <span className="nav-text">
                <span className="nav-label">{item.label}</span>
                <span className="nav-hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <span className="dot" />
          <span>本地书架 · IndexedDB</span>
        </div>
      </aside>

      {reading ? (
        isEpubBook(reading) ? (
          <EpubReader
            key={reading.id}
            book={reading}
            notes={notes}
            fontSize={fontSize}
            setFontSize={setFontSize}
            fontFamily={fontFamily}
            setFontFamily={setFontFamily}
            theme={theme}
            setTheme={setTheme}
            jumpCfi={jump && jump.bookId === reading.id ? jump.cfi : undefined}
            jumpHref={jump && jump.bookId === reading.id ? jump.href : undefined}
            jumpToken={jump ? jump.token : 0}
            characters={readingCharacters}
            markEnabled={markEnabled}
            onBack={() => {
              setReadingId(null)
              setJump(null)
              setJumpChapter(null)
            }}
            onProgress={handleEpubProgress}
            onNotesChanged={refreshNotes}
            onToast={showToast}
            onCharacterHover={onCharacterHover}
            onCharacterLeave={onCharacterLeave}
            onCharacterClick={openProfile}
            onMakeCharacter={createCharacterFromName}
            onAiCharacters={(list, kind) => void addAiCharacters(readingScope, list, kind)}
            onOpenMap={() => setMapBookId(readingScope)}
            readingMode={readingMode}
            onOpenSheet={() => setReaderSheetOpen(true)}
          />
        ) : (
          <Reader
            key={reading.id}
            book={reading}
            fontSize={fontSize}
            setFontSize={setFontSize}
            fontFamily={fontFamily}
            setFontFamily={setFontFamily}
            theme={theme}
            setTheme={setTheme}
            onBack={() => {
              setReadingId(null)
              setJump(null)
              setJumpChapter(null)
            }}
            onProgress={handleProgress}
            characters={readingCharacters}
            markEnabled={markEnabled}
            jumpChapter={jumpChapter && jumpChapter.bookId === reading.id ? jumpChapter : null}
            onCharacterHover={onCharacterHover}
            onCharacterLeave={onCharacterLeave}
            onCharacterClick={openProfile}
            onMakeCharacter={createCharacterFromName}
            onAiCharacters={(list, kind) => void addAiCharacters(readingScope, list, kind)}
            onToast={showToast}
            onOpenMap={() => setMapBookId(readingScope)}
            readingMode={readingMode}
            onOpenSheet={() => setReaderSheetOpen(true)}
          />
        )
      ) : nav === 'shelf' ? (
        <Shelf
          books={shelfCollection === 'all' ? library : library.filter((book) => book.collectionId === shelfCollection)}
          collections={collections}
          collectionFilter={shelfCollection}
          isSeries={Boolean(collections.find((collection) => collection.id === shelfCollection)?.isSeries)}
          onCollectionFilter={setShelfCollection}
          onCreateCollection={() => void createCollection()}
          onToggleSeries={() => void toggleSeries()}
          onRenameCollection={() => void renameCollection()}
          onDeleteCollection={() => void removeCollection()}
          onBulkAssign={(ids, collectionId) => void bulkAssignCollection(ids, collectionId)}
          onOpen={openBook}
          onImport={() => fileRef.current?.click()}
          onDetail={(book) => setDetailId(book.id)}
        />
      ) : nav === 'notes' ? (
        <NotesPanel notes={notes} books={library} onJump={jumpToNote} onExport={exportNotes} onToast={showToast} />
      ) : nav === 'people' ? (
        <CharactersPanel
          books={library}
          collections={collections}
          characters={characters}
          images={characterImages}
          bookId={peopleBookId}
          onBookChange={setPeopleBookId}
          markEnabled={markEnabled}
          onToggleMark={() => setMarkEnabled((value) => !value)}
          onCreate={(kind) => openCharacterEditor('create', undefined, undefined, kind)}
          onEdit={(character) => openCharacterEditor('edit', character)}
          onOpen={(character) => setProfileId(character.id)}
          onDelete={(character) => void deleteCharacterCard(character)}
        />
      ) : (
        <SettingsPanel
          onSynced={refreshLocalData}
          fontSize={fontSize}
          onFontSize={setFontSize}
          theme={theme}
          onTheme={setTheme}
          fontFamily={fontFamily}
          onFontFamily={setFontFamily}
          markEnabled={markEnabled}
          onToggleMark={() => setMarkEnabled((value) => !value)}
          characterCount={characters.length}
          noteCount={notes.length}
          imageCount={characterImages.length}
          bookCount={library.length}
          onToast={showToast}
        />
      )}

      <input
        ref={fileRef}
        className="file-input"
        type="file"
        accept=".txt,.epub,text/plain,application/epub+zip"
        multiple
        onChange={(event) => {
          const files = event.target.files
          if (files && files.length) void importFiles(files)
          event.target.value = ''
        }}
      />

      {detail && (
        <BookDetail
          book={detail}
          collections={collections}
          onAssign={(collectionId) => void assignCollection(detail, collectionId)}
          onSplit={() => void splitBookByVolume(detail.id)}
          onClose={() => setDetailId(null)}
          onReloaded={handleReloaded}
          onDeleted={handleDeleted}
        />
      )}

      {dragging && (
        <div className="drop-overlay">
          <div className="drop-inner">
            <div className="drop-mark">TXT · EPUB</div>
            <h2>松手就放下</h2>
            <p>TXT 支持 UTF-8 / GBK / GB18030 / UTF-16 / Big5 自动识别编码；EPUB 读取 OPF 元数据与封面。</p>
          </div>
        </div>
      )}

      {importing && (
        <div className="importing">
          <span className="spinner" />
          <span>
            {importing.total > 1
              ? '正在导入 ' + importing.index + '/' + importing.total + ' · 《' + importing.name + '》'
              : '正在导入《' + importing.name + '》…'}
          </span>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      {card && hoveredCharacter && (
        <CharacterCard
          character={hoveredCharacter}
          images={hoveredImages}
          left={card.x}
          top={card.y}
          onOpen={() => openProfile(hoveredCharacter.id)}
          onEnter={keepCharacterCard}
          onLeave={onCharacterLeave}
        />
      )}

      {profile && (
        <CharacterDrawer
          character={profile}
          book={profileBook}
          images={profileImages}
          notes={profileNotes}
          appearances={appearances && appearances.characterId === profile.id ? appearances.items : []}
          appearancesLoading={Boolean(appearances && appearances.characterId === profile.id && appearances.loading)}
          onClose={() => setProfileId(null)}
          onEdit={() => openCharacterEditor('edit', profile)}
          onDelete={() => void deleteCharacterCard(profile)}
          onAddImages={(files) => void addCharacterImages(profile.id, files)}
          onDeleteImage={(imageId) => void removeCharacterImage(imageId)}
          onSetAvatar={(imageId) => void setCharacterAvatar(profile.id, imageId)}
          onMoveImage={(imageId, direction) => void moveCharacterImage(imageId, direction)}
          onOpenImage={(index) => setLightbox({ characterId: profile.id, index })}
          onJumpNote={(note) => {
            setProfileId(null)
            jumpToNote(note)
          }}
          onJumpChapter={(appearance) => jumpToAppearance(profile, appearance)}
        />
      )}

      {editorTarget && (
        <CharacterEditor
          key={editorTarget.mode + (editorTarget.character?.id || editorTarget.prefillName || 'new')}
          mode={editorTarget.mode}
          initial={editorTarget.character}
          prefillName={editorTarget.prefillName}
          bookId={editorTarget.bookId}
          kind={editorTarget.kind}
          books={library}
          images={editorTarget.character ? characterImages.filter((image) => image.characterId === editorTarget.character?.id) : []}
          onSave={(draft) => void saveCharacter(draft)}
          onDelete={
            editorTarget.mode === 'edit' && editorTarget.character
              ? () => void deleteCharacterCard(editorTarget.character as Character)
              : undefined
          }
          onClose={() => setEditorTarget(null)}
        />
      )}

      {lightbox && lightboxImages.length > 0 && (
        <ImageLightbox
          title={(characters.find((character) => character.id === lightbox.characterId) || { name: '插画' }).name}
          images={lightboxImages}
          index={Math.min(lightbox.index, lightboxImages.length - 1)}
          onClose={() => setLightbox(null)}
          onChange={(index) => setLightbox((current) => (current ? { ...current, index } : null))}
          onDelete={(imageId) => void removeCharacterImage(imageId)}
        />
      )}

      {mergePrompt && (
        <div className="modal-backdrop" onClick={() => setMergePrompt(null)}>
          <div className="modal merge-prompt" onClick={(event) => event.stopPropagation()}>
            <div className="eyebrow">已有同名 / 别名</div>
            <h2>「{mergePrompt.name}」</h2>
            <p className="notice">
              这本书里已经有「{mergePrompt.owner.name}」（别名：{mergePrompt.owner.aliases.length ? mergePrompt.owner.aliases.join('、') : '暂无'}）。
              要把它当成同一个人的别名，还是另建一张人物卡？
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setMergePrompt(null)}>取消</button>
              <button
                className="btn"
                onClick={() => {
                  const pending = mergePrompt
                  setMergePrompt(null)
                  setEditorTarget({ mode: 'create', prefillName: pending.name, bookId: pending.bookId })
                }}
              >
                另一个人
              </button>
              <button className="btn solid" onClick={() => void addAliasToCharacter(mergePrompt.owner, mergePrompt.name)}>
                加入「{mergePrompt.owner.name}」的别名
              </button>
            </div>
          </div>
        </div>
      )}

      {readerSheetOpen && reading ? (
        <ReaderSheet
          fontSize={fontSize}
          onFontSize={setFontSize}
          fontFamily={fontFamily}
          onFontFamily={setFontFamily}
          theme={theme}
          onTheme={setTheme}
          readingMode={readingMode}
          onReadingMode={setReadingMode}
          markEnabled={markEnabled}
          onToggleMark={() => setMarkEnabled((value) => !value)}
          onClose={() => setReaderSheetOpen(false)}
        />
      ) : null}

      {collectionDialog && (
        <div className="modal-backdrop" onClick={() => setCollectionDialog(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">{collectionDialog.mode === 'create' ? '新建收藏夹' : '重命名收藏夹'}</div>
                <h2>{collectionDialog.mode === 'create' ? '给收藏夹起个名字' : '修改名称'}</h2>
                <p className="modal-sub">同一收藏夹里的书可以在书架设为系列，共享人物、地名、地图。</p>
              </div>
              <button className="modal-close" onClick={() => setCollectionDialog(null)}>关闭</button>
            </div>
            <div className="field">
              <label htmlFor="collection-name">名称</label>
              <input
                id="collection-name"
                className="text-input"
                autoFocus
                value={collectionDialog.value}
                onChange={(event) => setCollectionDialog({ ...collectionDialog, value: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submitCollection()
                }}
                placeholder="如：Re:从零开始的异世界生活"
              />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setCollectionDialog(null)}>取消</button>
              <button className="btn solid" onClick={() => void submitCollection()}>确定</button>
            </div>
          </div>
        </div>
      )}

      {mapBookId && (
        <MapViewer
          bookId={mapBookId}
          bookTitle={reading?.title || library.find((book) => scopeOfBook(book) === mapBookId)?.title || ''}
          places={readingCharacters.filter((character) => character.kind === 'place')}
          onOpenPlace={(id) => { setMapBookId(null); setProfileId(id) }}
          onClose={() => setMapBookId(null)}
        />
      )}
    </div>
  )
}

function volumeLabelOf(title: string): string {
  const match = title.match(/^第([一二三四五六七八九十百零〇两\d]+)卷/)
  return match ? match[1] : ''
}

function chineseNumber(value: string): number {
  if (/^\d+$/.test(value)) return Number(value)
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  if (value.includes('十')) {
    const [tens, units] = value.split('十')
    return (tens ? digits[tens] || 0 : 1) * 10 + (units ? digits[units] || 0 : 0)
  }
  return digits[value] ?? 0
}

function volumeCountOf(toc: string[]): number {
  return new Set(toc.map(volumeLabelOf).filter(Boolean)).size
}

function BookCover({ book, mini = false }: { book: BookMeta; mini?: boolean }) {
  return (
    <div className={'cover' + (mini ? ' mini' : '') + (book.coverImage ? ' has-image' : ' is-gen') + ' ' + book.cover}>
      {book.coverImage ? (
        <img src={book.coverImage} alt={book.title} />
      ) : (
        <>
          <span className="cover-title">{book.title}</span>
          <span className="cover-author">{book.author}</span>
        </>
      )}
      {isEpubBook(book) && <span className="format-badge">EPUB</span>}
    </div>
  )
}

type ShelfProps = {
  books: BookMeta[]
  collections: Collection[]
  collectionFilter: string
  isSeries: boolean
  onCollectionFilter: (id: string) => void
  onCreateCollection: () => void
  onToggleSeries: () => void
  onRenameCollection: () => void
  onDeleteCollection: () => void
  onBulkAssign: (ids: string[], collectionId: string) => void
  onOpen: (book: BookMeta) => void
  onImport: () => void
  onDetail: (book: BookMeta) => void
}

function Shelf({ books, collections, collectionFilter, isSeries, onCollectionFilter, onCreateCollection, onToggleSeries, onRenameCollection, onDeleteCollection, onBulkAssign, onOpen, onImport, onDetail }: ShelfProps) {
  const [query, setQuery] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [seriesFilter, setSeriesFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'recent' | 'title'>('recent')
  const seriesList = useMemo(
    () => [...new Set(books.map((book) => (book.series || '').trim()).filter(Boolean))].sort(),
    [books],
  )
  const scoped = seriesFilter === 'all' ? books : books.filter((book) => (book.series || '').trim() === seriesFilter)
  const toggleSelect = (id: string) => {
    setSelected((value) => {
      const next = new Set(value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
  }
  const sorted = useMemo(
    () => [...scoped].sort((a, b) => {
      if (sortBy !== 'title') return b.lastReadAt - a.lastReadAt
      const va = a.title.match(/^(.*?)第([一二三四五六七八九十百零〇两\d]+)卷$/)
      const vb = b.title.match(/^(.*?)第([一二三四五六七八九十百零〇两\d]+)卷$/)
      if (va && vb && va[1] === vb[1]) return chineseNumber(va[2]) - chineseNumber(vb[2])
      return a.title.localeCompare(b.title, 'zh-Hans-CN')
    }),
    [scoped, sortBy],
  )
  const recent = useMemo(() => [...scoped].sort((a, b) => b.lastReadAt - a.lastReadAt)[0], [scoped])
  const readingCount = sorted.filter((book) => statusOf(book) !== '未开始').length
  const totalWords = sorted.reduce((sum, book) => sum + book.charCount, 0)
  const keyword = query.trim()
  const shown = keyword
    ? sorted.filter((book) => book.title.includes(keyword) || book.author.includes(keyword))
    : sorted

  return (
    <main className="main shelf">
      <header className="page-head">
        <div>
          <h1>书架</h1>
          <p className="sub">
            {scoped.length} 本藏书 · 在读 {readingCount}
            {scoped.length ? ' · 共 ' + formatWords(totalWords) : ''}
          </p>
        </div>
        <div className="head-actions">
          <label className="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            <input placeholder="搜索书名、作者" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className="btn" onClick={onImport}>导入</button>
          <button
            className={'btn' + (selectMode ? ' solid' : '')}
            onClick={() => { if (selectMode) exitSelect(); else setSelectMode(true) }}
          >
            {selectMode ? '取消多选' : '多选'}
          </button>
        </div>
      </header>

      <div className="filter-bar">
        <span className="filter-label">收藏夹</span>
        <select className="select mini-select" value={collectionFilter} onChange={(event) => onCollectionFilter(event.target.value)}>
          <option value="all">全部书</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
              {collection.isSeries ? ' · 系列' : ''}
            </option>
          ))}
        </select>
        <button className="btn small" onClick={onCreateCollection}>＋ 收藏夹</button>
        <div className="filter-group">
          <span className="filter-label">系列</span>
          <select className="select mini-select" value={seriesFilter} onChange={(event) => setSeriesFilter(event.target.value)}>
            <option value="all">全部系列</option>
            {seriesList.map((series) => (
              <option key={series} value={series}>{series}</option>
            ))}
          </select>
        </div>
        {collectionFilter !== 'all' ? (
          <>
            <button className={'chip' + (isSeries ? ' is-on' : '')} onClick={onToggleSeries}>
              {isSeries ? '系列书：开' : '系列书：关'}
            </button>
            <button className="btn small" onClick={onRenameCollection}>重命名</button>
            <button className="btn small" onClick={onDeleteCollection}>删除</button>
          </>
        ) : null}
      </div>

      {selectMode ? (
        <div className="bulk-bar">
          <span>已选 {selected.size} 本</span>
          <button
            className="btn small"
            onClick={() => {
              if (selected.size === shown.length) setSelected(new Set())
              else setSelected(new Set(shown.map((book) => book.id)))
            }}
          >
            {selected.size === shown.length && shown.length ? '取消全选' : '全选'}
          </button>
          <select
            className="select mini-select"
            value=""
            onChange={(event) => {
              if (!event.target.value || !selected.size) return
              onBulkAssign([...selected], event.target.value === '__none' ? '' : event.target.value)
              exitSelect()
            }}
          >
            <option value="">加入收藏夹…</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>{collection.name}</option>
            ))}
            <option value="__none">移出收藏夹</option>
          </select>
          <button className="btn small" onClick={exitSelect}>完成</button>
        </div>
      ) : null}

      {!books.length ? (
        <EmptyShelf onImport={onImport} />
      ) : (
        <>
          {recent && (
            <section className="continue" onClick={() => onOpen(recent)}>
              <BookCover book={recent} mini />
              <div className="continue-info">
                <div className="eyebrow">继续阅读</div>
                <h2>{recent.title}</h2>
                <p>{recent.author} · {chapterLabel(recent)}</p>
                <div className="bar"><span style={{ width: progressOf(recent) + '%' }} /></div>
                <div className="continue-meta">
                  <span>已读 {progressOf(recent)}% · {formatWords(recent.charCount)}</span>
                  <span className="read-cta">接着读 →</span>
                </div>
              </div>
            </section>
          )}

          <div className="section-row">
            <h3>{keyword ? '搜索结果' : '全部藏书'}</h3>
            <div className="sort-toggle">
              <button className={'chip' + (sortBy === 'recent' ? ' is-on' : '')} onClick={() => setSortBy('recent')}>最近阅读</button>
              <button className={'chip' + (sortBy === 'title' ? ' is-on' : '')} onClick={() => setSortBy('title')}>按书名</button>
            </div>
          </div>

          {shown.length ? (
            <div className="grid">
              {shown.map((book) => {
                const percent = progressOf(book)
                return (
                  <div key={book.id} className={'book' + (selectMode && selected.has(book.id) ? ' is-selected' : '')}>
                    <button className="book-open" onClick={() => (selectMode ? toggleSelect(book.id) : onOpen(book))}>
                      <BookCover book={book} />
                      <div className="book-meta">
                        <div className="book-title">{book.title}</div>
                        <div className="book-author">
                          {book.author} · {isEpubBook(book) ? 'EPUB' : 'TXT'} · {formatWords(book.charCount)}
                        </div>
                        <div className="bar small"><span style={{ width: percent + '%' }} /></div>
                        <div className="book-status">
                          <span>{statusOf(book)}</span>
                          <span>{statusOf(book) === '未开始' ? '未开始' : percent + '%'}</span>
                        </div>
                      </div>
                    </button>
                    {selectMode ? (
                      <span className="book-check">{selected.has(book.id) ? '✓' : ''}</span>
                    ) : (
                      <button className="book-more" title="书籍详情" onClick={() => onDetail(book)}>⋯</button>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="empty-note">没有匹配「{keyword}」的书。</p>
          )}
        </>
      )}
    </main>
  )
}

function EmptyShelf({ onImport }: { onImport: () => void }) {
  return (
    <div className="empty">
      <div className="empty-mark">书</div>
      <h2>书架还空着</h2>
      <p>选择 TXT / EPUB 文件，或把文件拖进窗口。<br />正文、封面、进度与笔记都存在本机 IndexedDB 里，不上传。</p>
      <button className="btn solid" onClick={onImport}>选择 TXT / EPUB 文件</button>
      <span className="empty-hint">TXT：UTF-8 · GBK / GB18030 · UTF-16 LE/BE · Big5　　 EPUB：2 / 3</span>
    </div>
  )
}

type ReaderProps = {
  book: BookMeta
  fontSize: number
  setFontSize: (size: number) => void
  fontFamily: FontFamily
  setFontFamily: (font: FontFamily) => void
  theme: Theme
  setTheme: (theme: Theme) => void
  onBack: () => void
  onProgress: (bookId: string, chapterIndex: number, scrollRatio: number) => void
  characters: Character[]
  markEnabled: boolean
  jumpChapter: { bookId: string; index: number; token: number } | null
  onCharacterHover: (characterId: string, rect: CardRect) => void
  onCharacterLeave: () => void
  onCharacterClick: (characterId: string) => void
  onMakeCharacter: (name: string) => void
  onAiCharacters: (list: AiCharacter[], kind: 'character' | 'place') => void
  onToast: (message: string) => void
  onOpenMap: () => void
  readingMode: 'scroll' | 'paged'
  onOpenSheet: () => void
}

function Reader({
  book,
  fontSize,
  setFontSize,
  fontFamily,
  setFontFamily,
  theme,
  setTheme,
  onBack,
  onProgress,
  characters,
  markEnabled,
  jumpChapter,
  onCharacterHover,
  onCharacterLeave,
  onCharacterClick,
  onMakeCharacter,
  onAiCharacters,
  onToast,
  onOpenMap,
  readingMode,
  onOpenSheet,
}: ReaderProps) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, book.chapterIndex), Math.max(0, book.chapterCount - 1)))
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [ratio, setRatio] = useState(book.scrollRatio || 0)
  const [attempt, setAttempt] = useState(0)
  const [selection, setSelection] = useState<{ text: string; left: number; top: number } | null>(null)

  useEffect(() => {
    const onBack = (event: Event) => {
      if (selection) { setSelection(null); event.preventDefault(); return }
      if (drawer) { setDrawer(false); event.preventDefault() }
    }
    const onSelectionChange = () => {
      const current = window.getSelection()
      if (!current || current.isCollapsed || !current.toString().trim()) setSelection(null)
    }
    window.addEventListener('paper:back', onBack)
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      window.removeEventListener('paper:back', onBack)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [selection, drawer])
  const [aiBusy, setAiBusy] = useState(false)

  const pageRef = useRef<HTMLElement | null>(null)
  const flowRef = useRef<HTMLDivElement | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageWidth, setPageWidth] = useState(720)
  const [pageCount, setPageCount] = useState(1)
  const jumpSeen = useRef<number>(-1)
  const indexRef = useRef(index)
  const ratioRef = useRef(ratio)
  const initialIndex = useRef(index)
  const initialRatio = useRef(book.scrollRatio || 0)
  const restored = useRef(false)
  const lastReport = useRef(0)
  const snapTimer = useRef<number | null>(null)

  const paragraphs = useMemo(() => (chapter ? toParagraphs(chapter.text) : []), [chapter])
  const chapterWords = useMemo(() => (chapter ? countWords(chapter.text) : 0), [chapter])
  const matcher = useMemo(() => buildMatcher(characters), [characters])
  const percent = Math.max(0, Math.min(100, Math.round(((index + ratio) / Math.max(1, book.chapterCount)) * 100)))

  useEffect(() => {
    indexRef.current = index
  }, [index])

  // 从人物档案的「出场章节」跳进来
  useEffect(() => {
    if (!jumpChapter) return
    if (jumpSeen.current === jumpChapter.token) return
    jumpSeen.current = jumpChapter.token
    const target = Math.max(0, Math.min(book.chapterCount - 1, jumpChapter.index))
    restored.current = true
    setSelection(null)
    setIndex(target)
    indexRef.current = target
    ratioRef.current = 0
    setRatio(0)
    onProgress(book.id, target, 0)
  }, [jumpChapter, book.id, book.chapterCount, onProgress])

  const captureSelection = useCallback(() => {
    const element = pageRef.current
    if (!element) return
    const current = window.getSelection()
    if (!current || current.isCollapsed || !current.rangeCount) {
      setSelection(null)
      return
    }
    const range = current.getRangeAt(0)
    if (!element.contains(range.commonAncestorContainer)) {
      setSelection(null)
      return
    }
    const text = current.toString().replace(/\s+/g, ' ').trim()
    if (!text) {
      setSelection(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const width = 196
    const left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left + rect.width / 2 - width / 2))
    let top = rect.bottom + 8
    if (top + 44 > window.innerHeight - 10) top = Math.max(10, rect.top - 46)
    setSelection({ text, left, top })
  }, [])

  useEffect(() => {
    if (!selection) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target && target.closest('.txt-toolbar')) return
      setSelection(null)
    }
    const timer = window.setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousedown', onDown)
    }
  }, [selection])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    setChapter(null)
    getChapter(book.id, index)
      .then((row) => {
        if (!alive) return
        if (!row) {
          setError('这一章的内容读不到了')
          setLoading(false)
          return
        }
        setChapter({ title: row.title, text: row.text })
        setLoading(false)
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const element = pageRef.current
            if (!element || !alive) return
            const paged = readingMode === 'paged'
            const max = Math.max(0, paged ? element.scrollWidth - element.clientWidth : element.scrollHeight - element.clientHeight)
            const target = !restored.current && index === initialIndex.current ? Math.min(max, initialRatio.current * max) : 0
            if (paged) element.scrollLeft = target
            else element.scrollTop = target
            restored.current = true
            ratioRef.current = max > 0 ? target / max : 0
            setRatio(ratioRef.current)
          })
        })
      })
      .catch((reason) => {
        if (!alive) return
        setError(reason instanceof Error ? reason.message : String(reason))
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [book.id, index, attempt])

  useEffect(
    () => () => {
      onProgress(book.id, indexRef.current, ratioRef.current)
    },
    [book.id, onProgress],
  )

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(book.chapterCount - 1, next))
      if (clamped === indexRef.current) {
        setDrawer(false)
        return
      }
      setDrawer(false)
      setSelection(null)
      onCharacterLeave()
      setIndex(clamped)
      indexRef.current = clamped
      ratioRef.current = 0
      setRatio(0)
      onProgress(book.id, clamped, 0)
    },
    [book.id, book.chapterCount, onProgress, onCharacterLeave],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selection) {
          setSelection(null)
          return
        }
        if (drawer) setDrawer(false)
        else onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer, onBack, selection])

  useEffect(() => {
    if (!drawer) return
    const current = document.querySelector('.toc-item.is-current')
    if (current) current.scrollIntoView({ block: 'center' })
  }, [drawer])

  useEffect(() => {
    const element = pageRef.current
    if (!element) return
    if (readingMode !== 'paged') {
      setPageIndex(0)
      const max = Math.max(0, element.scrollHeight - element.clientHeight)
      element.scrollTop = ratioRef.current * max
      return
    }
    window.requestAnimationFrame(() => {
      const flow = flowRef.current
      if (!flow) return
      const width = element.clientWidth
      flow.style.setProperty('--page-width', width + 'px')
      setPageWidth(width)
      const total = Math.max(1, Math.ceil(flow.scrollWidth / Math.max(1, width)))
      setPageCount(total)
      setPageIndex(Math.round(ratioRef.current * Math.max(0, total - 1)))
    })
  }, [readingMode, chapter, fontSize, fontFamily, book.id, index])

  const turnPage = useCallback((direction: number) => {
    const page = pageRef.current
    const flow = flowRef.current
    if (!page || !flow) return
    const width = page.clientWidth
    const total = Math.max(1, Math.ceil(flow.scrollWidth / Math.max(1, width)))
    setPageCount(total)
    setPageWidth(width)
    setPageIndex((value) => Math.max(0, Math.min(total - 1, value + direction)))
  }, [])

  useEffect(() => {
    if (readingMode !== 'paged' || pageCount <= 1) return
    const value = pageIndex / (pageCount - 1)
    ratioRef.current = value
    setRatio(value)
    onProgress(book.id, indexRef.current, value)
  }, [pageIndex, pageCount, readingMode, book.id, onProgress])

  useEffect(() => {
    if (readingMode !== 'paged') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); turnPage(1) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); turnPage(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [readingMode, turnPage])

  const handleScroll = useCallback(() => {
    if (readingMode === 'paged') return
    const element = pageRef.current
    if (!element) return
    const max = Math.max(0, element.scrollHeight - element.clientHeight)
    const value = max > 60 ? Math.min(1, Math.max(0, element.scrollTop / max)) : 0
    ratioRef.current = value
    setSelection(null)
    onCharacterLeave()
    const now = Date.now()
    if (now - lastReport.current > 600) {
      lastReport.current = now
      setRatio(value)
      onProgress(book.id, indexRef.current, value)
    }
  }, [book.id, onProgress, onCharacterLeave, readingMode])

  return (
    <main
      className="main reader"
      onMouseDown={(event) => {
        if (!(event.target as HTMLElement).closest('.txt-toolbar')) setSelection(null)
      }}
    >
      <div className="reader-top">
        <button className="back" onClick={onBack}>← 书架</button>
        <button className="toc-btn" onClick={() => setDrawer(true)}>目录</button>
        <button
          className="toc-btn ai-action"
          disabled={aiBusy}
          onClick={() => {
            if (aiBusy || !chapter) return
            setAiBusy(true)
            void (async () => {
              try {
                const config = await loadAiConfig()
                if (!config.apiKey.trim() && config.provider !== 'ollama') {
                  onToast('先在设置里填写 AI Key')
                  return
                }
                if (chapter.text.trim().length < 20) {
                  onToast('这一章没有足够的文字')
                  return
                }
                const list = await extractCharacters(config, chapter.text, { bookTitle: book.title, chapterTitle: chapter.title })
                if (!list.length) {
                  onToast('AI 没有识别到人物')
                  return
                }
                const names = list.map((item) => item.name).join('、')
                if (window.confirm('识别到 ' + list.length + ' 位人物：' + names + '\n\n加入人物卡？')) {
                  onAiCharacters(list, 'character')
                }
              } catch (error) {
                onToast('AI 失败：' + (error instanceof Error ? error.message : String(error)))
              } finally {
                setAiBusy(false)
              }
            })()
          }}
        >
          {aiBusy ? 'AI…' : 'AI 人物'}
        </button>
        <button
          className="toc-btn ai-action"
          disabled={aiBusy}
          onClick={() => {
            if (aiBusy || !chapter) return
            setAiBusy(true)
            void (async () => {
              try {
                const config = await loadAiConfig()
                if (!config.apiKey.trim() && config.provider !== 'ollama') {
                  onToast('先在设置里填写 AI Key')
                  return
                }
                if (chapter.text.trim().length < 20) {
                  onToast('这一章没有足够的文字')
                  return
                }
                const list = await extractPlaces(config, chapter.text, { bookTitle: book.title, chapterTitle: chapter.title })
                if (!list.length) {
                  onToast('AI 没有识别到地名')
                  return
                }
                const names = list.map((item) => item.name).join('、')
                if (window.confirm('识别到 ' + list.length + ' 个地名：' + names + '\n\n加入地名库？')) {
                  onAiCharacters(list, 'place')
                }
              } catch (error) {
                onToast('AI 失败：' + (error instanceof Error ? error.message : String(error)))
              } finally {
                setAiBusy(false)
              }
            })()
          }}
        >
          {aiBusy ? 'AI…' : 'AI 地名'}
        </button>
        <button className="toc-btn" onClick={onOpenMap}>地图</button>
        <button className="toc-btn sheet-trigger" onClick={onOpenSheet}>Aa</button>
        <div className="reader-progress"><span style={{ width: percent + '%' }} /></div>
        <div className="tools">
          <button onClick={() => setFontSize(Math.max(15, fontSize - 1))}>A−</button>
          <span className="size">{fontSize}</span>
          <button onClick={() => setFontSize(Math.min(30, fontSize + 1))}>A+</button>
          <button
            className="font-btn"
            title="切换字体"
            onClick={() => {
              const index = FONT_ORDER.indexOf(fontFamily)
              setFontFamily(FONT_ORDER[(index + 1) % FONT_ORDER.length])
            }}
          >
            {fontLabel(fontFamily)}
          </button>
          <button className="theme-btn" onClick={() => setTheme(theme === 'paper' ? 'night' : 'paper')}>
            {theme === 'paper' ? '夜' : '日'}
          </button>
        </div>
      </div>

      <article
        className={'page' + (readingMode === 'paged' ? ' is-paged' : '')}
        style={{ fontSize: fontSize + 'px', fontFamily: fontStack(fontFamily) }}
        ref={pageRef}
        onScroll={handleScroll}
        onMouseUp={captureSelection}
      >
        <div
          className="page-flow"
          ref={flowRef}
          style={readingMode === 'paged' ? { transform: 'translateX(-' + pageIndex * pageWidth + 'px)' } : undefined}
        >
        <div className="reader-head">
          <div className="book-name">{book.title}</div>
          <h2>{chapter ? chapter.title : loading ? '……' : '正文'}</h2>
          <div className="chapter-meta">
            第 {index + 1} / {book.chapterCount} 章
            {chapter ? ' · 本章 ' + formatWords(chapterWords) : ''}
          </div>
        </div>

        {loading && <p className="reader-note">正在展开这一章…</p>}
        {error && (
          <p className="reader-note error">
            {error}
            <button className="link" onClick={() => setAttempt((value) => value + 1)}>重试</button>
          </p>
        )}
        {!loading && !error &&
          paragraphs.map((paragraph, i) => (
            <p key={i}>
              <CharacterText
                text={paragraph}
                matcher={matcher}
                enabled={markEnabled}
                onEnter={onCharacterHover}
                onLeave={onCharacterLeave}
                onClick={onCharacterClick}
              />
            </p>
          ))}

        {!loading && !error && (
          <>
            <div className="chapter-end">本章完</div>
            <div className="chapter-nav">
              <button disabled={index <= 0} onClick={() => go(index - 1)}>← 上一章</button>
              <span>第 {index + 1} / {book.chapterCount} 章</span>
              <button disabled={index >= book.chapterCount - 1} onClick={() => go(index + 1)}>下一章 →</button>
            </div>
          </>
        )}
        </div>
      </article>

      {readingMode === 'paged' ? (
        <>
          <button className="page-turn prev" onClick={() => turnPage(-1)} title="上一页">‹</button>
          <button className="page-turn next" onClick={() => turnPage(1)} title="下一页">›</button>
        </>
      ) : null}

      {selection && (
        <div
          className="txt-toolbar"
          style={{ left: selection.left, top: selection.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            className="hl-action"
            onClick={() => {
              const text = selection.text
              setSelection(null)
              window.getSelection()?.removeAllRanges()
              onMakeCharacter(text)
            }}
          >
            标为人物
          </button>
          <button className="hl-close" onClick={() => setSelection(null)} title="关闭">×</button>
        </div>
      )}

      <footer className="reader-foot">
        <span>第 {index + 1} / {book.chapterCount} 章</span>
        <span className="foot-hint">{book.title} · 共 {formatWords(book.charCount)}</span>
        <span>{book.author}</span>
      </footer>

      {drawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
          <aside className="drawer">
            <div className="drawer-head">
              <div>
                <div className="drawer-title">目录</div>
                <div className="drawer-sub">{book.title} · 共 {book.chapterCount} 章</div>
              </div>
              <button className="drawer-close" onClick={() => setDrawer(false)}>关闭</button>
            </div>
            <div className="drawer-list">
              {book.toc.map((title, i) => (
                <button
                  key={i}
                  className={'toc-item' + (i === index ? ' is-current' : '')}
                  onClick={() => {
                    if (i === index) setDrawer(false)
                    else go(i)
                  }}
                >
                  <span className="toc-index">{String(i + 1).padStart(2, '0')}</span>
                  <span className="toc-text">{title}</span>
                </button>
              ))}
            </div>
          </aside>
        </>
      )}
    </main>
  )
}

type BookDetailProps = {
  book: BookMeta
  collections: Collection[]
  onAssign: (collectionId: string) => void
  onSplit: () => void
  onClose: () => void
  onReloaded: (book: BookMeta) => void
  onDeleted: (id: string) => void
}

function BookDetail({ book, collections, onAssign, onSplit, onClose, onReloaded, onDeleted }: BookDetailProps) {
  const [choice, setChoice] = useState<TextEncoding | 'auto'>(book.encoding)
  const [series, setSeries] = useState(book.series || '')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setChoice(book.encoding)
    setSeries(book.series || '')
    setConfirming(false)
    setNote('')
  }, [book.id])

  const saveSeries = async () => {
    const value = series.trim()
    const next: BookMeta = { ...book, series: value || undefined }
    await putBook(next)
    onReloaded(next)
    setNote(value ? '已归入系列「' + value + '」，同系列共享人物/地名/地图。' : '已取消系列，恢复为单书。')
  }

  const reload = async () => {
    if (busy) return
    setBusy(true)
    setNote('')
    try {
      const buffer = await getFile(book.id)
      if (!buffer) throw new Error('原始文件不在本地库里，无法重载')
      const { text } = decodeBytes(new Uint8Array(buffer), choice === 'auto' ? undefined : choice)
      const chapters = splitChapters(text)
      if (!chapters.length) throw new Error('这个编码下没有解析到正文，换一个编码再试')
      await putChapters(book.id, chapters)
      const next: BookMeta = {
        ...book,
        encoding: choice === 'auto' ? decodeBytes(new Uint8Array(buffer)).encoding : choice,
        charCount: countWords(text),
        chapterCount: chapters.length,
        toc: chapters.map((chapter) => chapter.title),
        chapterIndex: 0,
        scrollRatio: 0,
      }
      await putBook(next)
      onReloaded(next)
      setNote('已按 ' + ENCODING_LABELS[next.encoding] + ' 重新载入：' + chapters.length + ' 章 · ' + formatWords(next.charCount) + '。阅读进度已回到开头。')
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (busy) return
    setBusy(true)
    try {
      await removeBookFromDb(book.id)
      onDeleted(book.id)
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">书籍详情</div>
            <h2>{book.title}</h2>
            <p className="modal-sub">
              {book.author} · {isEpubBook(book) ? 'EPUB' : 'TXT'} · {formatWords(book.charCount)} · {book.chapterCount} 章
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>关闭</button>
        </div>

        <div className="detail-list">
          {isEpubBook(book) ? (
            <div className="detail-row"><span>格式</span><span>EPUB{book.language ? ' · ' + book.language : ''}</span></div>
          ) : (
            <div className="detail-row"><span>识别编码</span><span>{ENCODING_LABELS[book.encoding]}</span></div>
          )}
          <div className="detail-row"><span>文件大小</span><span>{Math.max(1, Math.round(book.byteSize / 1024))} KB</span></div>
          <div className="detail-row"><span>导入时间</span><span>{new Date(book.createdAt).toLocaleString('zh-CN', { hour12: false })}</span></div>
          <div className="detail-row"><span>阅读进度</span><span>{chapterLabel(book)} · {progressOf(book)}%</span></div>
          {isEpubBook(book) && (
            <div className="detail-row"><span>笔记</span><span>在「笔记」页按书查看与导出</span></div>
          )}
        </div>

        {volumeCountOf(book.toc) > 1 && (
          <div className="field">
            <button className="btn solid" onClick={onSplit}>按卷拆分（{volumeCountOf(book.toc)} 卷）</button>
            <p className="modal-sub">按目录里的「第X卷」拆成独立书，原书保留；拆分后是 TXT，不复制插图。</p>
          </div>
        )}

        <div className="field">
          <label htmlFor="collection-select">收藏夹</label>
          <select
            id="collection-select"
            className="select"
            value={book.collectionId || ''}
            onChange={(event) => onAssign(event.target.value)}
          >
            <option value="">未分类</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>{collection.name}{collection.isSeries ? ' · 系列' : ''}</option>
            ))}
          </select>
          <p className="modal-sub">归入收藏夹后，可在书架把该收藏夹设为系列，同系列的书共享人物/地名/地图。</p>
        </div>

        <div className="field">
          <label htmlFor="series-input">系列</label>
          <div className="setting-inline">
            <input
              id="series-input"
              className="text-input"
              value={series}
              onChange={(event) => setSeries(event.target.value)}
              placeholder="如：Re:从零开始的异世界生活"
            />
            <button className="btn small" onClick={() => void saveSeries()} disabled={busy}>保存系列</button>
          </div>
          <p className="modal-sub">同一系列名下的书共享人物、地名与世界观地图。</p>
        </div>

        {!isEpubBook(book) && (
          <div className="field">
            <label htmlFor="encoding-select">重新识别编码</label>
            <select
              id="encoding-select"
              className="select"
              value={choice}
              disabled={busy}
              onChange={(event) => setChoice(event.target.value as TextEncoding | 'auto')}
            >
              <option value="auto">自动检测（重新识别）</option>
              {ENCODINGS.map((encoding) => (
                <option key={encoding} value={encoding}>{ENCODING_LABELS[encoding]}</option>
              ))}
            </select>
            <p className="field-hint">正文出现乱码时，换一种编码重新载入。重载会重置阅读进度。</p>
            <button className="btn" disabled={busy || (choice !== 'auto' && choice === book.encoding)} onClick={reload}>
              {busy ? '处理中…' : '按所选编码重新载入'}
            </button>
          </div>
        )}

        {note && <p className="notice">{note}</p>}

        <div className="modal-actions">
          {confirming ? (
            <div className="confirm-row">
              <span>确定删除《{book.title}》？正文和进度都会移除。</span>
              <button className="btn danger" disabled={busy} onClick={remove}>删除</button>
              <button className="btn" onClick={() => setConfirming(false)}>取消</button>
            </div>
          ) : (
            <>
              <button className="btn danger" onClick={() => setConfirming(true)}>删除这本书</button>
              <button className="btn solid" onClick={onClose}>完成</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Placeholder({ nav }: { nav: NavKey }) {
  const title = NAV.find((item) => item.key === nav)?.label || ''
  const desc =
    nav === 'notes'
      ? '所有划线、批注与书签会汇总在这里，支持按书、章节、颜色筛选。'
      : nav === 'people'
        ? '人物档案、别名、关系与插画库。正文里的名字会在这里汇聚成册。'
        : '字体、背景、快捷键、同步与备份。'
  return (
    <main className="main placeholder">
      <div className="ph-inner">
        <div className="ph-mark"><Icon name={nav} /></div>
        <h1>{title}</h1>
        <p>{desc}</p>
        <span className="ph-badge">M2 / M3 接入</span>
      </div>
    </main>
  )
}

export default App
