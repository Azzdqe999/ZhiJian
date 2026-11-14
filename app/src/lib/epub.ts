import JSZip from 'jszip'
import { countWords } from './txt.ts'

export type EpubTocEntry = {
  label: string
  href: string
  level: number
}

export type EpubSection = {
  /** 相对 OPF 的 href，可直接交给 epub.js display() */
  href: string
  label: string
  /** 在 spine 里的位置（含非正文节） */
  index: number
  /** spine itemref linear != "no" */
  linear: boolean
  text: string
}

export type ParsedEpub = {
  title: string
  author: string
  language: string
  toc: EpubTocEntry[]
  spineCount: number
  /** 正文章节数（spine 中 linear 的项），注释页不计入 */
  linearCount: number
  coverDataUrl: string | null
  charCount: number
  opfPath: string
  /** 仅 collectText 时返回，供「出场章节」按需扫描 */
  sections?: EpubSection[]
}

type ManifestItem = {
  id: string
  href: string
  path: string
  mediaType: string
  properties: string
}

const OPS_NS = 'http://www.idpf.org/2007/ops'

function normalizePath(path: string): string {
  const parts: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function resolveHref(baseDir: string, href: string): string {
  const clean = safeDecode(href.split('#')[0].split('?')[0])
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) return normalizePath(clean)
  return normalizePath(baseDir ? baseDir + '/' + clean : clean)
}

export function normalizeHref(href: string): string {
  return normalizePath(safeDecode(String(href || '').split('#')[0].split('?')[0]))
}

/** 把 epub.js 给的 href 映射到目录标题（忽略锚点、目录前缀差异） */
export function titleForHref(href: string, entries: Array<{ label: string; href: string }>): string {
  const target = normalizeHref(href)
  if (!target) return ''
  const exact = entries.find((entry) => normalizeHref(entry.href) === target)
  if (exact) return exact.label
  const base = target.split('/').pop() || target
  const byBase = entries.find((entry) => (normalizeHref(entry.href).split('/').pop() || '') === base)
  return byBase ? byBase.label : ''
}

function parseXml(text: string, what: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (!doc || doc.getElementsByTagName('parsererror').length) {
    throw new Error(what + ' 不是合法的 XML')
  }
  return doc
}

function byLocalName(root: Document | Element, name: string): Element[] {
  const all = root.getElementsByTagName('*')
  const out: Element[] = []
  for (let i = 0; i < all.length; i++) {
    const element = all[i]
    if (element.localName === name || element.tagName === name) out.push(element)
  }
  return out
}

function firstByLocalName(root: Document | Element, name: string): Element | null {
  const all = byLocalName(root, name)
  return all.length ? all[0] : null
}

function attr(element: Element | null, name: string): string {
  if (!element) return ''
  return element.getAttribute(name) ?? element.getAttributeNS(OPS_NS, name.replace(/^epub:/, '')) ?? ''
}

function textOf(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function epubType(element: Element): string {
  return (element.getAttribute('epub:type') || element.getAttributeNS(OPS_NS, 'type') || '').toLowerCase()
}

function stripTags(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCodePoint(Number(code))
      } catch {
        return ' '
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 16))
      } catch {
        return ' '
      }
    })
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path) ?? zip.file(safeDecode(path))
  if (!file) return null
  try {
    return await file.async('string')
  } catch {
    return null
  }
}

async function readBytes(zip: JSZip, path: string): Promise<ArrayBuffer | null> {
  const file = zip.file(path) ?? zip.file(safeDecode(path))
  if (!file) return null
  try {
    return await file.async('arraybuffer')
  } catch {
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('封面读取失败'))
    reader.readAsDataURL(blob)
  })
}

async function imageToDataUrl(bytes: ArrayBuffer, mime: string): Promise<string> {
  const type = mime && mime.startsWith('image/') ? mime : 'image/png'
  const blob = new Blob([bytes], { type })
  try {
    if (typeof createImageBitmap !== 'function') return blobToDataUrl(blob)
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, 480 / bitmap.width, 680 / bitmap.height)
    if (scale >= 1 && bytes.byteLength < 180 * 1024) {
      bitmap.close()
      return blobToDataUrl(blob)
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return blobToDataUrl(blob)
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return blobToDataUrl(blob)
  }
}

function opfRelative(opfDir: string, fullPath: string): string {
  if (!opfDir) return fullPath
  const prefix = opfDir + '/'
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath
}

function parseNav(xml: string, navPath: string, opfDir: string): EpubTocEntry[] {
  const doc = parseXml(xml, '导航文件 nav.xhtml')
  const navs = byLocalName(doc, 'nav')
  const tocNav =
    navs.find((nav) => epubType(nav).split(/\s+/).includes('toc')) ||
    navs.find((nav) => byLocalName(nav, 'a').length > 0) ||
    doc.documentElement
  const anchors = byLocalName(tocNav, 'a')
  const entries: EpubTocEntry[] = []
  const navDir = dirname(navPath)
  for (const anchor of anchors) {
    const href = attr(anchor, 'href')
    if (!href) continue
    let level = 0
    let parent: Node | null = anchor.parentNode
    while (parent && parent !== tocNav) {
      const element = parent as Element
      if (element.localName === 'ol' || element.localName === 'ul') level++
      parent = parent.parentNode
    }
    const label = textOf(anchor) || href
    const fullPath = resolveHref(navDir, href)
    entries.push({ label, href: opfRelative(opfDir, fullPath), level: Math.max(0, level - 1) })
  }
  return entries
}

function parseNcx(xml: string, ncxPath: string, opfDir: string): EpubTocEntry[] {
  const doc = parseXml(xml, '目录 toc.ncx')
  const points = byLocalName(doc, 'navPoint')
  const entries: EpubTocEntry[] = []
  const ncxDir = dirname(ncxPath)
  for (const point of points) {
    const label = textOf(firstByLocalName(point, 'text'))
    const content = firstByLocalName(point, 'content')
    const src = attr(content, 'src')
    if (!label || !src) continue
    let level = 0
    let parent: Node | null = point.parentNode
    while (parent) {
      if ((parent as Element).localName === 'navPoint') level++
      parent = parent.parentNode
    }
    entries.push({ label, href: opfRelative(opfDir, resolveHref(ncxDir, src)), level })
  }
  return entries
}

function findOpfPath(zip: JSZip): string {
  const names = Object.keys(zip.files).filter((name) => /\.opf$/i.test(name) && !zip.files[name].dir)
  if (!names.length) throw new Error('EPUB 里没有找到 content.opf')
  return names[0]
}

export async function parseEpub(input: ArrayBuffer | Uint8Array, options: { collectText?: boolean } = {}): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(input)
  if (!zip.file('mimetype')) {
    throw new Error('不是有效的 EPUB：缺少 mimetype')
  }

  let opfPath = ''
  const containerText = await readText(zip, 'META-INF/container.xml')
  if (containerText) {
    const containerDoc = parseXml(containerText, 'META-INF/container.xml')
    const rootfile = firstByLocalName(containerDoc, 'rootfile')
    opfPath = normalizePath(attr(rootfile, 'full-path'))
  }
  if (!opfPath || !zip.file(opfPath)) opfPath = findOpfPath(zip)

  const opfText = await readText(zip, opfPath)
  if (!opfText) throw new Error('EPUB 的 ' + opfPath + ' 读不出来')
  const opf = parseXml(opfText, 'content.opf')
  const opfDir = dirname(opfPath)

  const metadata = firstByLocalName(opf, 'metadata') ?? opf.documentElement
  const title = textOf(firstByLocalName(metadata, 'title'))
  const creators = byLocalName(metadata, 'creator').map(textOf).filter(Boolean)
  const language = textOf(firstByLocalName(metadata, 'language'))

  const manifestRoot = firstByLocalName(opf, 'manifest')
  const manifestItems: ManifestItem[] = manifestRoot
    ? byLocalName(manifestRoot, 'item').map((item) => {
        const href = attr(item, 'href')
        return {
          id: attr(item, 'id'),
          href,
          path: resolveHref(opfDir, href),
          mediaType: attr(item, 'media-type'),
          properties: attr(item, 'properties'),
        }
      })
    : []
  const manifestById = new Map(manifestItems.map((item) => [item.id, item]))

  const spineRoot = firstByLocalName(opf, 'spine')
  const itemrefs = spineRoot ? byLocalName(spineRoot, 'itemref') : []
  const spineEntries = itemrefs
    .map((itemref) => ({
      item: manifestById.get(attr(itemref, 'idref')),
      linear: attr(itemref, 'linear').toLowerCase() !== 'no',
    }))
    .filter((entry): entry is { item: ManifestItem; linear: boolean } => Boolean(entry.item))
  const spineItems = spineEntries.map((entry) => entry.item)
  const linearItems = spineEntries.filter((entry) => entry.linear).map((entry) => entry.item)

  const navItem = manifestItems.find((item) => item.properties.split(/\s+/).includes('nav'))
  let toc: EpubTocEntry[] = []
  if (navItem) {
    const navText = await readText(zip, navItem.path)
    if (navText) {
      try {
        toc = parseNav(navText, navItem.path, opfDir)
      } catch {
        toc = []
      }
    }
  }
  if (!toc.length) {
    const ncxItem =
      manifestItems.find((item) => item.mediaType.includes('dtbncx')) ||
      manifestById.get(attr(spineRoot, 'toc'))
    if (ncxItem) {
      const ncxText = await readText(zip, ncxItem.path)
      if (ncxText) {
        try {
          toc = parseNcx(ncxText, ncxItem.path, opfDir)
        } catch {
          toc = []
        }
      }
    }
  }
  if (!toc.length) {
    toc = linearItems.map((item, index) => ({
      label: '第 ' + (index + 1) + ' 节',
      href: opfRelative(opfDir, item.path),
      level: 0,
    }))
  }

  let coverItem: ManifestItem | null = null
  const coverMeta = byLocalName(metadata, 'meta').find((meta) => attr(meta, 'name').toLowerCase() === 'cover')
  if (coverMeta) {
    coverItem = manifestById.get(attr(coverMeta, 'content')) ?? null
  }
  if (!coverItem) {
    coverItem = manifestItems.find((item) => item.properties.split(/\s+/).includes('cover-image')) ?? null
  }
  if (!coverItem) {
    coverItem =
      manifestItems.find(
        (item) => item.mediaType.startsWith('image/') && /cover/i.test(item.id + ' ' + item.href),
      ) ?? null
  }
  let coverDataUrl: string | null = null
  if (coverItem) {
    const bytes = await readBytes(zip, coverItem.path)
    if (bytes && bytes.byteLength) {
      coverDataUrl = await imageToDataUrl(bytes, coverItem.mediaType)
    }
  }

  const labelByHref = new Map(toc.map((entry) => [normalizeHref(entry.href), entry.label]))
  const sections: EpubSection[] = []
  let charCount = 0
  for (let i = 0; i < spineEntries.length; i++) {
    const entry = spineEntries[i]
    if (!/xhtml|html/i.test(entry.item.mediaType)) continue
    const html = await readText(zip, entry.item.path)
    if (!html) continue
    const text = stripTags(html)
    if (entry.linear) charCount += countWords(text)
    if (options.collectText) {
      const href = opfRelative(opfDir, entry.item.path)
      sections.push({
        href,
        label: labelByHref.get(normalizeHref(href)) || '第 ' + (i + 1) + ' 节',
        index: i,
        linear: entry.linear,
        text,
      })
    }
  }

  return {
    title: title || '',
    author: creators.join('、'),
    language,
    toc,
    spineCount: spineItems.length,
    linearCount: linearItems.length || spineItems.length,
    coverDataUrl,
    charCount,
    opfPath,
    sections: options.collectText ? sections : undefined,
  }
}
