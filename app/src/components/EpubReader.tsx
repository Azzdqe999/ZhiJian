import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ePub from 'epubjs'
import type { Book as EpubBook, Contents, NavItem, Rendition } from 'epubjs'
import { getFile, putNote, deleteNote } from '../lib/store'
import { NOTE_COLORS, NOTE_COLOR_MAP, findDuplicateNote } from '../lib/notes'
import { titleForHref } from '../lib/epub'
import { FONT_OPTIONS, fontStack } from '../lib/fonts'
import { buildMatcher, matchText } from '../lib/characters'
import type { CardRect, CharacterMatcher } from '../lib/characters'
import type { BookMeta, Character, FontFamily, Note, NoteColor, Theme } from '../lib/types'
import NoteEditor from './NoteEditor'
import type { NoteEditorValues } from './NoteEditor'
import { extractCharacters, extractPlaces, loadAiConfig } from '../lib/ai'
import type { AiCharacter } from '../lib/ai'

type TocRow = { label: string; href: string; level: number }

type ToolbarState = {
  cfiRange: string
  text: string
  left: number
  top: number
  chapterTitle: string
}

type EditorState = {
  mode: 'create' | 'edit'
  noteId?: string
  cfiRange: string
  quote: string
  chapterTitle: string
  color: NoteColor
  note: string
  tags: string[]
  characterIds: string[]
  focusTag?: boolean
}

type EpubReaderProps = {
  book: BookMeta
  notes: Note[]
  fontSize: number
  setFontSize: (size: number) => void
  fontFamily: FontFamily
  setFontFamily: (font: FontFamily) => void
  theme: Theme
  setTheme: (theme: Theme) => void
  jumpCfi?: string
  jumpHref?: string
  jumpToken: number
  characters: Character[]
  markEnabled: boolean
  onBack: () => void
  onProgress: (bookId: string, cfi: string, chapterIndex: number, ratio: number) => void
  onNotesChanged: () => Promise<void>
  onToast: (message: string) => void
  onCharacterHover: (characterId: string, rect: CardRect) => void
  onCharacterLeave: () => void
  onCharacterClick: (characterId: string) => void
  onMakeCharacter: (name: string) => void
  onAiCharacters: (list: AiCharacter[], kind: 'character' | 'place') => void
  onOpenMap: () => void
}

function flattenToc(items: NavItem[], level = 0): TocRow[] {
  const rows: TocRow[] = []
  for (const item of items) {
    rows.push({ label: item.label || '未命名', href: item.href || '', level })
    if (item.subitems && item.subitems.length) rows.push(...flattenToc(item.subitems, level + 1))
  }
  return rows
}

function firstContents(rendition: Rendition): Contents | null {
  const value = rendition.getContents() as unknown
  if (Array.isArray(value)) return (value[0] as Contents) ?? null
  return (value as Contents) ?? null
}

type Typography = {
  theme: Theme
  fontSize: number
  fontFamily: FontFamily
}

// 用带 !important 的注入样式覆盖出版社 CSS，不改原文件，也不依赖 epub.js 的主题类切换
function typographyCss(state: Typography): string {
  const night = state.theme === 'night'
  const background = night ? '#1b1a18' : '#f6f2e9'
  const color = night ? '#d8d1c4' : '#2a2723'
  const accent = night ? '#c97b54' : '#a4552f'
  return (
    'html, body { background: ' + background + ' !important; color: ' + color + ' !important; overflow-x: hidden !important; }\n' +
    'body { max-width: 720px !important; margin: 0 auto !important; padding: 60px 30px 100px !important; ' +
    'font-size: ' + state.fontSize + 'px !important; font-family: ' + fontStack(state.fontFamily) + ' !important; }\n' +
    'img, svg, video { max-width: 100% !important; height: auto !important; }\n' +
    'figure { margin-left: 0 !important; margin-right: 0 !important; }\n' +
    '::-webkit-scrollbar:horizontal { height: 0 !important; }\n' +
    'a, a:visited { color: ' + accent + ' !important; }\n' +
    '::selection { background: rgba(164, 85, 47, 0.24); }'
  )
}

function applyTypography(rendition: Rendition, state: Typography): void {
  const value = rendition.getContents() as unknown
  const list = Array.isArray(value) ? value : value ? [value] : []
  for (const contents of list as Contents[]) {
    contents.addStylesheetCss(typographyCss(state), 'paper-typography')
  }
}

function newNoteId(): string {
  return 'nt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

export default function EpubReader(props: EpubReaderProps) {
  const {
    book,
    notes,
    fontSize,
    setFontSize,
    fontFamily,
    setFontFamily,
    theme,
    setTheme,
    jumpCfi,
    jumpHref,
    jumpToken,
    characters,
    markEnabled,
    onBack,
  } = props

  const viewerRef = useRef<HTMLDivElement | null>(null)
  const bookRef = useRef<EpubBook | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const appliedRef = useRef<Set<string>>(new Set())
  const cfiRef = useRef(book.epubCfi || '')
  const indexRef = useRef(book.chapterIndex || 0)
  const ratioRef = useRef(book.scrollRatio || 0)
  const spineCountRef = useRef(Math.max(1, book.chapterCount))
  const linearCountRef = useRef(Math.max(1, book.chapterCount))
  const spineLinearRef = useRef<boolean[]>([])
  const charMarksRef = useRef<Set<string>>(new Set())
  const characterMatcherRef = useRef<CharacterMatcher | null>(null)
  const hoverCidRef = useRef<string | null>(null)
  const hoverFrameRef = useRef(0)
  const notesRef = useRef(notes)
  const tocRef = useRef<TocRow[]>([])
  const hrefRef = useRef('')
  const lastReportRef = useRef(0)
  const openEditorRef = useRef<(noteId: string) => void>(() => {})
  const initialJumpTokenRef = useRef(jumpCfi ? jumpToken : -1)
  const initialStartRef = useRef(jumpCfi || book.epubCfi || '')
  const initialIndexRef = useRef(book.chapterIndex || 0)
  const initialRatioRef = useRef(book.scrollRatio || 0)
  const jumpSeenRef = useRef(initialJumpTokenRef.current)
  const propsRef = useRef(props)
  propsRef.current = props
  notesRef.current = notes
  const styleStateRef = useRef<Typography>({ theme, fontSize, fontFamily })

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [aiBusy, setAiBusy] = useState(false)
  const [zoomImage, setZoomImage] = useState<string | null>(null)
  const [zoomScale, setZoomScale] = useState(1)
  const [zoomPan, setZoomPan] = useState({ x: 0, y: 0 })
  const zoomDragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    if (!zoomImage) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setZoomImage(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomImage])
  const [error, setError] = useState<string | null>(null)
  const [toc, setToc] = useState<TocRow[]>([])
  const [drawer, setDrawer] = useState(false)
  const [currentHref, setCurrentHref] = useState('')
  const [currentIndex, setCurrentIndex] = useState(book.chapterIndex || 0)
  const [spineCount, setSpineCount] = useState(Math.max(1, book.chapterCount))
  const [linearCount, setLinearCount] = useState(Math.max(1, book.chapterCount))
  const [percent, setPercent] = useState(0)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [lastColor, setLastColor] = useState<NoteColor>('yellow')
  const [attempt, setAttempt] = useState(0)

  const chapterTitle = useMemo(() => titleForHref(currentHref, toc) || toc[currentIndex]?.label || '正文', [currentHref, toc, currentIndex])
  const fontOption = FONT_OPTIONS.find((item) => item.key === fontFamily) ?? FONT_OPTIONS[0]

  const reportProgress = useCallback(
    (cfi: string, index: number, ratio: number) => {
      propsRef.current.onProgress(book.id, cfi, index, ratio)
    },
    [book.id],
  )

  const linearOrdinal = useCallback((index: number) => {
    const flags = spineLinearRef.current
    if (!flags.length) return Math.min(index + 1, linearCountRef.current)
    let ordinal = 0
    for (let i = 0; i <= index && i < flags.length; i++) {
      if (flags[i]) ordinal++
    }
    return Math.max(1, ordinal)
  }, [])

  /** 清掉上一章的人名标记（epub.js annotations，不改 DOM 所以 CFI 安全） */
  const clearCharacterMarks = useCallback(() => {
    const rendition = renditionRef.current
    if (rendition) {
      charMarksRef.current.forEach((cfi) => {
        try {
          rendition.annotations.remove(cfi, 'underline')
        } catch {
          /* 章节已卸载时忽略 */
        }
      })
    }
    charMarksRef.current.clear()
    hoverCidRef.current = null
  }, [])

  /** 扫描当前渲染的正文文本节点，给每个名字/别名加虚线标记 */
  const scanCharacters = useCallback((contents: Contents) => {
    clearCharacterMarks()
    if (!propsRef.current.markEnabled) return
    const matcher = buildMatcher(propsRef.current.characters)
    characterMatcherRef.current = matcher
    if (!matcher) return
    const rendition = renditionRef.current
    const doc = contents.document
    if (!rendition || !doc || !doc.body) return
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    let node: Node | null = walker.nextNode()
    let added = 0
    while (node && added < 800) {
      const parent = node.parentElement
      const tag = parent ? parent.tagName : ''
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'RT' || tag === 'RP' || tag === 'TEXTAREA') {
        node = walker.nextNode()
        continue
      }
      const text = node.nodeValue || ''
      if (!text.trim()) {
        node = walker.nextNode()
        continue
      }
      const matches = matchText(text, matcher)
      for (const match of matches) {
        if (added >= 800) break
        try {
          const range = doc.createRange()
          range.setStart(node, match.start)
          range.setEnd(node, match.end)
          const cfi = contents.cfiFromRange(range)
          if (!cfi || charMarksRef.current.has(cfi)) continue
          rendition.annotations.underline(
            cfi,
            { cid: match.character.id, name: match.text },
            () => propsRef.current.onCharacterClick(match.character.id),
            'char-mark',
            { style: '--char-mark-color:' + match.character.color },
          )
          charMarksRef.current.add(cfi)
          added++
        } catch {
          /* 跨节点或定位失败的位置跳过，不影响其它标记 */
        }
      }
      node = walker.nextNode()
    }
  }, [clearCharacterMarks])

  /** 悬停命中：marks-pane 只代理 click，这里自己在 iframe 上做 mousemove 命中 */
  const bindCharacterHover = useCallback((contents: Contents) => {
    const win = contents.window
    const doc = contents.document
    if (!win || !doc) return
    const holder = win as Window & { __paperCharHover?: boolean }
    if (holder.__paperCharHover) return
    holder.__paperCharHover = true
    const handler = (event: MouseEvent) => {
      if (hoverFrameRef.current) return
      hoverFrameRef.current = window.requestAnimationFrame(() => {
        hoverFrameRef.current = 0
        const viewer = viewerRef.current
        const frame = win.frameElement as HTMLElement | null
        if (!viewer || !frame) return
        const frameRect = frame.getBoundingClientRect()
        const x = frameRect.left + event.clientX
        const y = frameRect.top + event.clientY
        let hit: Element | null = null
        const marks = viewer.querySelectorAll('g.char-mark')
        for (let i = 0; i < marks.length; i++) {
          const element = marks[i] as Element
          const rect = element.getBoundingClientRect()
          if (rect.width === 0) continue
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            hit = element
            break
          }
        }
        const cid = hit ? hit.getAttribute('data-cid') : null
        if (cid === hoverCidRef.current) return
        hoverCidRef.current = cid
        if (cid && hit) {
          const rect = hit.getBoundingClientRect()
          propsRef.current.onCharacterHover(cid, {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          })
        } else {
          propsRef.current.onCharacterLeave()
        }
      })
    }
    doc.addEventListener('mousemove', handler, { passive: true })
  }, [])

  useEffect(() => {
    const element = viewerRef.current
    if (!element) return
    let disposed = false

    setStatus('loading')
    setError(null)
    setToolbar(null)
    setEditor(null)
    setDrawer(false)
    appliedRef.current = new Set()
    cfiRef.current = initialStartRef.current
    indexRef.current = initialIndexRef.current
    ratioRef.current = initialRatioRef.current

    const run = async () => {
      const bytes = await getFile(book.id)
      if (!bytes) throw new Error('原始 EPUB 不在本地库里，请重新导入')
      const epubBook = ePub(bytes) as EpubBook
      bookRef.current = epubBook
      await epubBook.ready
      if (disposed) {
        epubBook.destroy()
        return
      }
      const navigation = await epubBook.loaded.navigation
      const rows = flattenToc(navigation.toc)
      tocRef.current = rows
      setToc(rows)
      const count = Math.max(1, (epubBook.spine as unknown as { length?: number })?.length || rows.length)
      spineCountRef.current = count
      setSpineCount(count)
      const spineItems = (epubBook.spine as unknown as { spineItems?: Array<{ linear?: boolean }> })?.spineItems || []
      const linearFlags = spineItems.map((item) => item.linear !== false)
      spineLinearRef.current = linearFlags
      const totalLinear = Math.max(1, linearFlags.filter(Boolean).length || count)
      linearCountRef.current = totalLinear
      setLinearCount(totalLinear)

      const rendition = epubBook.renderTo(element, {
        width: '100%',
        height: '100%',
        flow: 'scrolled-doc',
        allowScriptedContent: false,
      })
      renditionRef.current = rendition
      styleStateRef.current = {
        theme: propsRef.current.theme,
        fontSize: propsRef.current.fontSize,
        fontFamily: propsRef.current.fontFamily,
      }
      rendition.hooks.content.register((contents: Contents) => {
        contents.addStylesheetCss(typographyCss(styleStateRef.current), 'paper-typography')
      })
      applyTypography(rendition, styleStateRef.current)

      rendition.on('relocated', (location: { start?: { href?: string; index?: number; cfi?: string }; atStart?: boolean; atEnd?: boolean }) => {
        const start = location?.start
        if (!start) return
        const href = String(start.href || '')
        const index = Number(start.index || 0)
        propsRef.current.onCharacterLeave()
        hrefRef.current = href
        indexRef.current = index
        setCurrentHref(href)
        setCurrentIndex(index)
        setAtStart(Boolean(location.atStart))
        setAtEnd(Boolean(location.atEnd) || index >= spineCountRef.current - 1)
        if (start.cfi) {
          cfiRef.current = start.cfi
          reportProgress(start.cfi, index, ratioRef.current)
          const ordinal = linearOrdinal(index)
          setPercent(Math.max(0, Math.min(100, Math.round((((ordinal - 1) + ratioRef.current) / linearCountRef.current) * 100))))
        }
      })

      rendition.on('rendered', () => {
        const contents = firstContents(rendition)
        if (!contents) return
        bindScroll(contents)
        bindCharacterHover(contents)
        try {
          const doc = contents.document
          for (const image of Array.from(doc.querySelectorAll('img'))) {
            const el = image as HTMLImageElement
            if (el.dataset.paperZoom) continue
            el.dataset.paperZoom = '1'
            el.style.cursor = 'zoom-in'
            el.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              setZoomImage(el.currentSrc || el.src)
              setZoomScale(1)
              setZoomPan({ x: 0, y: 0 })
            })
          }
        } catch {
          /* 图片放大绑定失败不影响阅读 */
        }
        window.requestAnimationFrame(() => {
          try {
            scanCharacters(contents)
          } catch {
            /* 标记失败不影响阅读 */
          }
        })
      })

      rendition.on('selected', (cfiRange: string, contents: Contents) => {
        try {
          const range = contents.range(cfiRange)
          if (!range) return
          const text = range.toString().replace(/\s+/g, ' ').trim()
          if (!text) return
          const frame = contents.document.defaultView?.frameElement as HTMLElement | null
          const frameRect = frame ? frame.getBoundingClientRect() : element.getBoundingClientRect()
          const rect = range.getBoundingClientRect()
          const width = 340
          const left = Math.max(10, Math.min(window.innerWidth - width - 10, frameRect.left + rect.left + rect.width / 2 - width / 2))
          let top = frameRect.top + rect.bottom + 10
          if (top + 54 > window.innerHeight - 10) top = Math.max(10, frameRect.top + rect.top - 56)
          setToolbar({
            cfiRange,
            text,
            left,
            top,
            chapterTitle: titleForHref(hrefRef.current, tocRef.current) || tocRef.current[indexRef.current]?.label || '正文',
          })
        } catch {
          /* 选中内容解析失败时忽略 */
        }
      })

      await rendition.display(initialStartRef.current || undefined)
      if (!disposed) setStatus('ready')
    }

    const bindScroll = (contents: Contents) => {
      const win = contents.window
      const doc = contents.document
      if (!win || !doc) return
      const holder = win as Window & { __paperScroll?: () => void }
      if (holder.__paperScroll) return
      const handler = () => {
        const scrolling = doc.scrollingElement || doc.documentElement
        if (!scrolling) return
        const max = Math.max(0, scrolling.scrollHeight - win.innerHeight)
        const value = max > 60 ? Math.min(1, Math.max(0, (win.scrollY || scrolling.scrollTop) / max)) : 0
        ratioRef.current = value
        propsRef.current.onCharacterLeave()
        const now = Date.now()
        if (now - lastReportRef.current > 700) {
          lastReportRef.current = now
          const ordinal = linearOrdinal(indexRef.current)
          setPercent(Math.max(0, Math.min(100, Math.round((((ordinal - 1) + value) / linearCountRef.current) * 100))))
          reportProgress(cfiRef.current, indexRef.current, value)
        }
      }
      holder.__paperScroll = handler
      win.addEventListener('scroll', handler, { passive: true })
      doc.addEventListener('scroll', handler, { passive: true, capture: true })
      handler()
    }

    run().catch((reason) => {
      if (disposed) return
      setError(reason instanceof Error ? reason.message : String(reason))
      setStatus('error')
    })

    return () => {
      disposed = true
      // 离开阅读器前把最后的位置写回书架
      try {
        reportProgress(cfiRef.current, indexRef.current, ratioRef.current)
      } catch {
        /* ignore */
      }
      try {
        renditionRef.current?.destroy()
      } catch {
        /* ignore */
      }
      try {
        bookRef.current?.destroy()
      } catch {
        /* ignore */
      }
      renditionRef.current = null
      bookRef.current = null
    }
  }, [book.id, attempt, reportProgress, linearOrdinal, scanCharacters, bindCharacterHover])

  useEffect(() => {
    styleStateRef.current = { theme, fontSize, fontFamily }
    const rendition = renditionRef.current
    if (!rendition) return
    applyTypography(rendition, styleStateRef.current)
  }, [theme, fontSize, fontFamily])

  useEffect(() => {
    if (status !== 'ready') return
    if (jumpSeenRef.current === jumpToken) return
    jumpSeenRef.current = jumpToken
    const target = jumpCfi || jumpHref
    if (!target) return
    const rendition = renditionRef.current
    if (!rendition) return
    rendition.display(target).catch(() => propsRef.current.onToast('没找到这条笔记的位置'))
  }, [jumpToken, jumpCfi, jumpHref, status])

  // 人物增删改 / 总开关变化后，当前章重新扫描
  useEffect(() => {
    if (status !== 'ready') return
    if (!markEnabled) propsRef.current.onCharacterLeave()
    const rendition = renditionRef.current
    if (!rendition) return
    const value = rendition.getContents() as unknown
    const list = Array.isArray(value) ? value : value ? [value] : []
    const contents = (list[list.length - 1] as Contents) || null
    if (contents) scanCharacters(contents)
  }, [characters, markEnabled, status, scanCharacters])

  const addHighlight = useCallback((note: Note) => {
    const rendition = renditionRef.current
    if (!rendition) return
    if (appliedRef.current.has(note.cfi)) return
    try {
      rendition.annotations.highlight(
        note.cfi,
        { noteId: note.id },
        () => openEditorRef.current(note.id),
        'paper-hl-' + note.color,
        { fill: NOTE_COLOR_MAP[note.color].hex, 'fill-opacity': '0.42', 'mix-blend-mode': 'multiply' },
      )
      appliedRef.current.add(note.cfi)
    } catch {
      /* 跨节或定位失败的高亮先跳过，下次渲染会重试 */
    }
  }, [])

  const removeHighlight = useCallback((cfi: string) => {
    try {
      renditionRef.current?.annotations.remove(cfi, 'highlight')
    } catch {
      /* ignore */
    }
    appliedRef.current.delete(cfi)
  }, [])

  useEffect(() => {
    const rendition = renditionRef.current
    if (!rendition || status !== 'ready') return
    const bookNotes = notes.filter((note) => note.bookId === book.id)
    for (const cfi of Array.from(appliedRef.current)) {
      if (!bookNotes.some((note) => note.cfi === cfi)) removeHighlight(cfi)
    }
    for (const note of bookNotes) addHighlight(note)
  }, [notes, status, book.id, addHighlight, removeHighlight])

  const openEditor = useCallback((noteId: string) => {
    const note = notesRef.current.find((item) => item.id === noteId)
    if (!note) return
    setToolbar(null)
    setEditor({
      mode: 'edit',
      noteId: note.id,
      cfiRange: note.cfi,
      quote: note.text,
      chapterTitle: note.chapterTitle,
      color: note.color,
      note: note.note,
      tags: note.tags,
      characterIds: note.characterIds || [],
    })
  }, [])
  openEditorRef.current = openEditor

  // M2 修复：同一 CFI / 同段文字重复划线时合并到原笔记，不新增也不报错
  const findDuplicate = useCallback(
    (cfi: string, text: string, chapter: string) =>
      findDuplicateNote(notesRef.current, book.id, cfi, text, chapter),
    [book.id],
  )

  const saveEditor = useCallback(
    async (values: NoteEditorValues) => {
      if (!editor) return
      const now = Date.now()
      try {
        if (editor.mode === 'edit' && editor.noteId) {
          const target = notesRef.current.find((item) => item.id === editor.noteId)
          if (!target) {
            setEditor(null)
            return
          }
          const updated: Note = {
            ...target,
            color: values.color,
            note: values.note,
            tags: values.tags,
            characterIds: values.characterIds,
            updatedAt: now,
          }
          await putNote(updated)
          if (target.color !== updated.color) removeHighlight(target.cfi)
          appliedRef.current.delete(updated.cfi)
          addHighlight(updated)
          await propsRef.current.onNotesChanged()
          propsRef.current.onToast('笔记已更新')
        } else {
          const duplicate = findDuplicate(editor.cfiRange, editor.quote, editor.chapterTitle)
          if (duplicate) {
            const merged: Note = {
              ...duplicate,
              color: values.color,
              note: values.note,
              tags: values.tags,
              characterIds: values.characterIds,
              updatedAt: now,
            }
            await putNote(merged)
            if (duplicate.color !== merged.color) removeHighlight(duplicate.cfi)
            appliedRef.current.delete(merged.cfi)
            addHighlight(merged)
            await propsRef.current.onNotesChanged()
            propsRef.current.onToast('这段已经高亮过，已合并到原笔记')
          } else {
            const note: Note = {
              id: newNoteId(),
              bookId: book.id,
              cfi: editor.cfiRange,
              text: editor.quote,
              color: values.color,
              note: values.note,
              tags: values.tags,
              characterIds: values.characterIds,
              chapterTitle: editor.chapterTitle,
              createdAt: now,
              updatedAt: now,
            }
            await putNote(note)
            addHighlight(note)
            await propsRef.current.onNotesChanged()
            propsRef.current.onToast(values.note.trim() || values.tags.length ? '笔记已保存' : '已添加高亮')
            setLastColor(values.color)
          }
        }
      } catch (reason) {
        propsRef.current.onToast('保存失败：' + (reason instanceof Error ? reason.message : String(reason)))
      }
      setEditor(null)
      setToolbar(null)
    },
    [editor, book.id, addHighlight, removeHighlight, findDuplicate],
  )

  const deleteEditor = useCallback(async () => {
    if (!editor || editor.mode !== 'edit' || !editor.noteId) return
    const target = notesRef.current.find((item) => item.id === editor.noteId)
    try {
      await deleteNote(editor.noteId)
      if (target) removeHighlight(target.cfi)
      await propsRef.current.onNotesChanged()
      propsRef.current.onToast('笔记已删除')
    } catch (reason) {
      propsRef.current.onToast('删除失败：' + (reason instanceof Error ? reason.message : String(reason)))
    }
    setEditor(null)
  }, [editor, removeHighlight])

  const quickHighlight = useCallback(
    async (color: NoteColor) => {
      if (!toolbar) return
      const existing = findDuplicate(toolbar.cfiRange, toolbar.text, toolbar.chapterTitle)
      if (existing) {
        setToolbar(null)
        propsRef.current.onToast('这段已经高亮过，已打开原笔记')
        openEditorRef.current(existing.id)
        return
      }
      const now = Date.now()
      const note: Note = {
        id: newNoteId(),
        bookId: book.id,
        cfi: toolbar.cfiRange,
        text: toolbar.text,
        color,
        note: '',
        tags: [],
        characterIds: [],
        chapterTitle: toolbar.chapterTitle,
        createdAt: now,
        updatedAt: now,
      }
      try {
        await putNote(note)
        addHighlight(note)
        setLastColor(color)
        await propsRef.current.onNotesChanged()
        propsRef.current.onToast('已添加' + NOTE_COLOR_MAP[color].label + '高亮')
      } catch (reason) {
        propsRef.current.onToast('保存失败：' + (reason instanceof Error ? reason.message : String(reason)))
      }
      setToolbar(null)
    },
    [toolbar, book.id, addHighlight, findDuplicate],
  )

  const openCreate = useCallback(
    (focusTag: boolean) => {
      if (!toolbar) return
      setEditor({
        mode: 'create',
        cfiRange: toolbar.cfiRange,
        quote: toolbar.text,
        chapterTitle: toolbar.chapterTitle,
        color: lastColor,
        note: '',
        tags: [],
        characterIds: [],
        focusTag,
      })
    },
    [toolbar, lastColor],
  )

  const goPrev = useCallback(() => {
    renditionRef.current?.prev().catch(() => {})
  }, [])

  const goNext = useCallback(() => {
    renditionRef.current?.next().catch(() => {})
  }, [])

  const cycleFont = useCallback(() => {
    const index = FONT_OPTIONS.findIndex((item) => item.key === fontFamily)
    const next = FONT_OPTIONS[(index + 1) % FONT_OPTIONS.length]
    setFontFamily(next.key)
  }, [fontFamily, setFontFamily])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (editor) {
        setEditor(null)
        return
      }
      if (toolbar) {
        setToolbar(null)
        return
      }
      if (drawer) {
        setDrawer(false)
        return
      }
      onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, toolbar, drawer, onBack])

  useEffect(() => {
    if (!toolbar) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target && target.closest('.hl-toolbar')) return
      setToolbar(null)
    }
    const timer = window.setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousedown', onDown)
    }
  }, [toolbar])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' && !editor) goNext()
      if (event.key === 'ArrowLeft' && !editor) goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, editor])

  useEffect(() => {
    if (!drawer) return
    const current = document.querySelector('.toc-item.is-current')
    if (current) current.scrollIntoView({ block: 'center' })
  }, [drawer])

  const drawerRows = toc.length ? toc : book.toc.map((label, index) => ({ label, href: book.tocHrefs?.[index] || '', level: 0 }))

  return (
    <main className="main reader epub-reader">
      <div className="reader-top">
        <button className="back" onClick={onBack}>← 书架</button>
        <button className="toc-btn" onClick={() => setDrawer(true)}>目录</button>
        <button
          className="toc-btn"
          disabled={aiBusy}
          onClick={() => {
            if (aiBusy) return
            setAiBusy(true)
            void (async () => {
              try {
                const config = await loadAiConfig()
                if (!config.apiKey.trim() && config.provider !== 'ollama') {
                  props.onToast('先在设置里填写 AI Key')
                  return
                }
                const contents = renditionRef.current ? firstContents(renditionRef.current) : null
                const text = contents?.document?.body?.innerText ?? ''
                if (text.trim().length < 20) {
                  props.onToast('这一章没有足够的文字')
                  return
                }
                const list = await extractCharacters(config, text, { bookTitle: book.title })
                if (!list.length) {
                  props.onToast('AI 没有识别到人物')
                  return
                }
                const names = list.map((item) => item.name).join('、')
                if (window.confirm('识别到 ' + list.length + ' 位人物：' + names + '\n\n加入人物卡？')) {
                  props.onAiCharacters(list, 'character')
                }
              } catch (error) {
                props.onToast('AI 失败：' + (error instanceof Error ? error.message : String(error)))
              } finally {
                setAiBusy(false)
              }
            })()
          }}
        >
          {aiBusy ? 'AI…' : 'AI 人物'}
        </button>
        <button
          className="toc-btn"
          disabled={aiBusy}
          onClick={() => {
            if (aiBusy) return
            setAiBusy(true)
            void (async () => {
              try {
                const config = await loadAiConfig()
                if (!config.apiKey.trim() && config.provider !== 'ollama') {
                  props.onToast('先在设置里填写 AI Key')
                  return
                }
                const contents = renditionRef.current ? firstContents(renditionRef.current) : null
                const text = contents?.document?.body?.innerText ?? ''
                if (text.trim().length < 20) {
                  props.onToast('这一章没有足够的文字')
                  return
                }
                const list = await extractPlaces(config, text, { bookTitle: book.title })
                if (!list.length) {
                  props.onToast('AI 没有识别到地名')
                  return
                }
                const names = list.map((item) => item.name).join('、')
                if (window.confirm('识别到 ' + list.length + ' 个地名：' + names + '\n\n加入地名库？')) {
                  props.onAiCharacters(list, 'place')
                }
              } catch (error) {
                props.onToast('AI 失败：' + (error instanceof Error ? error.message : String(error)))
              } finally {
                setAiBusy(false)
              }
            })()
          }}
        >
          {aiBusy ? 'AI…' : 'AI 地名'}
        </button>
        <button className="toc-btn" onClick={props.onOpenMap}>地图</button>
        <div className="reader-progress"><span style={{ width: percent + '%' }} /></div>
        <div className="tools">
          <button onClick={() => setFontSize(Math.max(15, fontSize - 1))}>A−</button>
          <span className="size">{fontSize}</span>
          <button onClick={() => setFontSize(Math.min(30, fontSize + 1))}>A+</button>
          <button className="font-btn" onClick={cycleFont} title="切换字体">{fontOption.label}</button>
          <button className="theme-btn" onClick={() => setTheme(theme === 'paper' ? 'night' : 'paper')}>
            {theme === 'paper' ? '夜' : '日'}
          </button>
        </div>
      </div>

      <div className={'epub-stage' + (theme === 'night' ? ' is-night' : '')}>
        <div className="epub-viewer" ref={viewerRef} />
        {status === 'loading' && (
          <div className="stage-veil">
            <span className="spinner" />
            <p>正在展开 EPUB…</p>
          </div>
        )}
        {status === 'error' && (
          <div className="stage-veil">
            <p className="reader-note error">{error}</p>
            <button className="btn" onClick={() => setAttempt((value) => value + 1)}>重试</button>
          </div>
        )}
      </div>

      <footer className="reader-foot">
        <span className="epub-chapter">{chapterTitle}</span>
        <div className="epub-nav">
          <button disabled={atStart} onClick={goPrev}>← 上一章</button>
          <span>{linearOrdinal(currentIndex)} / {linearCount} · {percent}%</span>
          <button disabled={atEnd} onClick={goNext}>下一章 →</button>
        </div>
        <span>{book.title}</span>
      </footer>

      {toolbar && !editor && (
        <div className="hl-toolbar" style={{ left: toolbar.left, top: toolbar.top }} onMouseDown={(event) => event.preventDefault()}>
          <div className="hl-colors">
            {NOTE_COLORS.map((color) => (
              <button
                key={color.key}
                className="hl-dot"
                style={{ ['--dot' as string]: color.hex }}
                title={color.label}
                onClick={() => void quickHighlight(color.key)}
              />
            ))}
          </div>
          <span className="hl-sep" />
          <button className="hl-action" onClick={() => openCreate(false)}>批注</button>
          <button className="hl-action" onClick={() => openCreate(true)}>标签</button>
          <button
            className="hl-action"
            onClick={() => {
              const name = toolbar.text
              const rendition = renditionRef.current
              if (rendition) {
                const value = rendition.getContents() as unknown
                const list = Array.isArray(value) ? value : value ? [value] : []
                for (const contents of list as Contents[]) {
                  try {
                    contents.window?.getSelection()?.removeAllRanges()
                  } catch {
                    /* ignore */
                  }
                }
              }
              setToolbar(null)
              props.onMakeCharacter(name)
            }}
          >
            标为人物
          </button>
          <button className="hl-close" onClick={() => setToolbar(null)} title="关闭">×</button>
        </div>
      )}

      {drawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
          <aside className="drawer">
            <div className="drawer-head">
              <div>
                <div className="drawer-title">目录</div>
                <div className="drawer-sub">{book.title} · 共 {drawerRows.length} 条</div>
              </div>
              <button className="drawer-close" onClick={() => setDrawer(false)}>关闭</button>
            </div>
            <div className="drawer-list">
              {drawerRows.map((row, index) => {
                const current = row.href && row.href === currentHref
                return (
                  <button
                    key={row.href + index}
                    className={'toc-item' + (current ? ' is-current' : '')}
                    style={{ paddingLeft: 12 + Math.min(3, row.level) * 14 }}
                    onClick={() => {
                      setDrawer(false)
                      if (row.href) renditionRef.current?.display(row.href).catch(() => {})
                    }}
                  >
                    <span className="toc-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="toc-text">{row.label}</span>
                  </button>
                )
              })}
            </div>
          </aside>
        </>
      )}

      {editor && (
        <NoteEditor
          key={editor.mode + (editor.noteId || editor.cfiRange) + (editor.focusTag ? 'tag' : 'note')}
          mode={editor.mode}
          quote={editor.quote}
          chapterTitle={editor.chapterTitle}
          initialColor={editor.color}
          initialNote={editor.note}
          initialTags={editor.tags}
          initialCharacterIds={editor.characterIds}
          characters={props.characters}
          focusTag={editor.focusTag}
          onSave={(values) => void saveEditor(values)}
          onDelete={editor.mode === 'edit' ? () => void deleteEditor() : undefined}
          onClose={() => setEditor(null)}
        />
      )}

      {zoomImage && (
        <div className="image-zoom" onClick={() => setZoomImage(null)}>
          <div className="image-zoom-bar" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => setZoomScale((value) => Math.max(0.5, value - 0.25))}>−</button>
            <span>{Math.round(zoomScale * 100)}%</span>
            <button onClick={() => setZoomScale((value) => Math.min(6, value + 0.25))}>+</button>
            <button onClick={() => { setZoomScale(1); setZoomPan({ x: 0, y: 0 }) }}>1:1</button>
            <button onClick={() => setZoomImage(null)}>关闭</button>
          </div>
          <img
            src={zoomImage}
            alt=""
            draggable={false}
            style={{ transform: 'translate(' + zoomPan.x + 'px, ' + zoomPan.y + 'px) scale(' + zoomScale + ')' }}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => {
              event.preventDefault()
              setZoomScale((value) => Math.min(6, Math.max(0.5, value - event.deltaY * 0.0015)))
            }}
            onPointerDown={(event) => {
              zoomDragRef.current = { x: event.clientX, y: event.clientY, ox: zoomPan.x, oy: zoomPan.y }
              try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* synthetic */ }
            }}
            onPointerMove={(event) => {
              const drag = zoomDragRef.current
              if (!drag) return
              setZoomPan({ x: drag.ox + event.clientX - drag.x, y: drag.oy + event.clientY - drag.y })
            }}
            onPointerUp={() => { zoomDragRef.current = null }}
            onPointerCancel={() => { zoomDragRef.current = null }}
          />
        </div>
      )}
    </main>
  )
}
