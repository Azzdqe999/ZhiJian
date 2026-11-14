import JSZip from 'jszip'
import { buildEpub } from './epub-build'
import type { BuildAsset } from './epub-build'
import type { BookMeta } from './types'

type Volume = { title: string; blob: Blob; toc: string[]; charCount: number }

const VOLUME_RE = /^第([一二三四五六七八九十百零〇两\d]+)卷/

function volumeLabel(title: string): string {
  const match = title.match(VOLUME_RE)
  return match ? match[1] : ''
}

function dirOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index >= 0 ? path.slice(0, index) : ''
}

function resolvePath(baseDir: string, relative: string): string {
  if (!relative || /^(data:|https?:|#)/i.test(relative)) return ''
  const parts = (baseDir ? baseDir + '/' : '') + relative
  const out: string[] = []
  for (const part of parts.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

function mimeOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ')
}

function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { bytes, mime: match[1] }
}

export async function splitEpubWithImages(
  buffer: ArrayBuffer,
  book: BookMeta,
  coverByTitle: Map<string, string | undefined>,
): Promise<Volume[]> {
  const zip = await JSZip.loadAsync(buffer)
  const container = await zip.file('META-INF/container.xml')?.async('text')
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1]
  if (!opfPath) throw new Error('EPUB 缺少 container.xml')
  const opfText = await zip.file(opfPath)?.async('text')
  if (!opfText) throw new Error('EPUB 缺少 OPF')

  const doc = new DOMParser().parseFromString(opfText, 'application/xml')
  const manifest = new Map<string, string>()
  for (const item of Array.from(doc.querySelectorAll('manifest > item'))) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) manifest.set(id, href)
  }
  const opfDir = dirOf(opfPath)
  const spine = Array.from(doc.querySelectorAll('spine > itemref'))
    .filter((item) => item.getAttribute('linear') !== 'no')
    .map((item) => item.getAttribute('idref') || '')
    .map((id) => manifest.get(id) || '')
    .filter(Boolean)
    .map((href) => resolvePath(opfDir, href))

  const groups = new Map<string, { label: string; chapters: Array<{ title: string; path: string }> }>()
  let linearIndex = 0
  for (const path of spine) {
    const fallbackTitle = path.split('/').pop()?.replace(/\.[^.]+$/, '') || ''
    const title = book.toc[linearIndex] || fallbackTitle
    linearIndex += 1
    const label = volumeLabel(title)
    if (!label) continue
    if (!groups.has(label)) groups.set(label, { label, chapters: [] })
    groups.get(label)!.chapters.push({ title, path })
  }

  const volumes: Volume[] = []
  for (const group of groups.values()) {
    const assets = new Map<string, BuildAsset>()
    const chapters: Array<{ title: string; html: string }> = []
    const assetName = (path: string, index: number) => {
      const existing = assets.get(path)
      if (existing) return existing.path
      const base = path.split('/').pop() || 'image'
      const name = 'assets/' + index + '-' + base.replace(/[^a-zA-Z0-9._-]/g, '_')
      return name
    }

    let assetIndex = 0
    for (const chapter of group.chapters) {
      const raw = await zip.file(chapter.path)?.async('text')
      if (!raw) continue
      const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
      let body = bodyMatch ? bodyMatch[1] : raw
      body = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<link[^>]+>/gi, '')

      const refs = [...body.matchAll(/(src|xlink:href)="([^"]+)"/g)]
      for (const ref of refs) {
        const relative = ref[2]
        if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(relative)) continue
        const resolved = resolvePath(dirOf(chapter.path), relative)
        if (!resolved) continue
        const file = zip.file(resolved)
        if (!file) continue
        let asset = assets.get(resolved)
        if (!asset) {
          const name = assetName(resolved, assetIndex++)
          asset = { path: name, bytes: await file.async('uint8array'), mime: mimeOf(resolved) }
          assets.set(resolved, asset)
        }
        body = body.split('"' + relative + '"').join('"' + asset.path + '"')
      }

      chapters.push({ title: chapter.title, html: body })
    }

    if (!chapters.length) continue
    const title = book.title + ' 第' + group.label + '卷'
    const blob = await buildEpub({
      title,
      author: book.author,
      chapters,
      assets: [...assets.values()],
      coverDataUrl: coverByTitle.get(title),
    })
    volumes.push({
      title,
      blob,
      toc: chapters.map((chapter) => chapter.title),
      charCount: chapters.reduce((sum, chapter) => sum + textOf(chapter.html).length, 0),
    })
  }
  return volumes
}
