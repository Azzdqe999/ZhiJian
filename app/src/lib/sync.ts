import {
  getBook,
  getFile,
  getSyncConfig,
  listAllBookMaps,
  listAllMapPins,
  listBooks,
  listCharacterImages,
  listCharacters,
  listNotes,
  listTombstones,
  putBook,
  putBookMap,
  putMapPin,
  putCharacter,
  putCharacterImage,
  putFile,
  putNote,
  putTombstone,
  saveSyncConfig,
  deleteBook,
  deleteBookMap,
  deleteMapPin,
  deleteCharacter,
  deleteCharacterImage,
  deleteNote,
} from './store'
import { detectBookConflicts, mergeSnapshots } from './sync-merge'
import { sha256 } from './hash'
import type {
  SyncConflict,
  SyncConfig,
  SyncImageMeta,
  SyncSnapshot,
} from './types'

declare global {
  interface Window {
    paperSync?: {
      request: (opts: {
        method: string
        url: string
        headers: Record<string, string>
        body?: string | Uint8Array | null
      }) => Promise<{ status: number; headers: Record<string, string>; body: Uint8Array | ArrayBuffer | null }>
    }
  }
}

const FOLDER = 'NovelReader/'
const PREFIX = 'paper-'
const REGISTRY = PREFIX + 'registry.json'

function joinUrl(base: string, name: string): string {
  return base.replace(/\/+$/, '') + '/' + FOLDER + name
}

import { Capacitor, registerPlugin } from '@capacitor/core'

type DavHttpPlugin = {
  request(options: {
    method: string
    url: string
    headers: Record<string, string>
    body?: string | null
  }): Promise<{ status: number; body: string }>
}

const DavHttp = registerPlugin<DavHttpPlugin>('DavHttp')

function basicAuth(user: string, pass: string): string {
  const bytes = new TextEncoder().encode(user + ':' + pass)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return 'Basic ' + btoa(bin)
}

function toArrayBuffer(body: Uint8Array | ArrayBuffer | null): ArrayBuffer {
  if (!body) return new ArrayBuffer(0)
  if (body instanceof ArrayBuffer) return body
  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
}

async function dav(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; text: string }> {
  if (window.paperSync) {
    const res = await window.paperSync.request({ method, url, headers, body: body ?? null })
    return { status: res.status, text: new TextDecoder().decode(toArrayBuffer(res.body)) }
  }
  if (Capacitor.isNativePlatform()) {
    const res = await DavHttp.request({ method, url, headers, body: body ?? null })
    const binary = atob(res.body || '')
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return { status: res.status, text: new TextDecoder().decode(bytes) }
  }
  const res = await fetch(url, { method, headers, body })
  return { status: res.status, text: await res.text() }
}

function ensureConfig(config: SyncConfig): SyncConfig {
  const deviceId = config.deviceId || ((crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? 'dev-' + Math.random().toString(36).slice(2))
  return { ...config, url: config.url.replace(/\/+$/, '') + '/', deviceId }
}

function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x2000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function decodeBase64(text: string): ArrayBuffer {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function isS3(config: SyncConfig): boolean {
  return config.provider === 's3'
}

function s3ObjectUrl(config: SyncConfig, name: string): string {
  const endpoint = (config.s3Endpoint || '').replace(/\/+$/, '')
  const bucket = (config.s3Bucket || '').replace(/^\/+|\/+$/g, '')
  return endpoint + '/' + bucket + '/NovelReader/' + name
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase())
}

async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const raw = key instanceof Uint8Array ? key : new Uint8Array(key)
  const cryptoKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
}

async function s3Headers(config: SyncConfig, method: string, name: string, body: string, contentType?: string): Promise<Record<string, string>> {
  const endpoint = new URL((config.s3Endpoint || '').replace(/\/+$/, ''))
  const bucket = (config.s3Bucket || '').replace(/^\/+|\/+$/g, '')
  const region = config.s3Region || 'us-east-1'
  const key = 'NovelReader/' + name
  const basePath = endpoint.pathname.replace(/\/+$/, '')
  const canonicalUri = basePath + '/' + rfc3986(bucket) + '/' + key.split('/').map(rfc3986).join('/')
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = await sha256Hex(body)
  const headers: Record<string, string> = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
  if (contentType) headers['content-type'] = contentType
  const signedHeaderNames = ['host', ...Object.keys(headers)].sort()
  const canonicalHeaders = signedHeaderNames.map((header) => header + ':' + (header === 'host' ? endpoint.host : headers[header]) + '\n').join('')
  const signedHeaders = signedHeaderNames.join(';')
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = dateStamp + '/' + region + '/s3/aws4_request'
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n')
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + config.s3SecretKey), dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, 's3')
  const kSigning = await hmacSha256(kService, 'aws4_request')
  const signature = [...new Uint8Array(await hmacSha256(kSigning, stringToSign))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  headers.Authorization = 'AWS4-HMAC-SHA256 Credential=' + config.s3AccessKey + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature
  return headers
}

async function s3(
  config: SyncConfig,
  method: string,
  name: string,
  body = '',
  contentType?: string,
): Promise<{ status: number; text: string }> {
  const url = s3ObjectUrl(config, name)
  const headers = await s3Headers(config, method, name, body, contentType)
  if (window.paperSync) {
    const res = await window.paperSync.request({ method, url, headers, body: body || null })
    return { status: res.status, text: new TextDecoder().decode(toArrayBuffer(res.body)) }
  }
  if (Capacitor.isNativePlatform()) {
    const res = await DavHttp.request({ method, url, headers, body: body || null })
    const binary = atob(res.body || '')
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return { status: res.status, text: new TextDecoder().decode(bytes) }
  }
  const res = await fetch(url, { method, headers, body: body || undefined })
  return { status: res.status, text: await res.text() }
}

async function getText(config: SyncConfig, name: string): Promise<string | null> {
  const res = isS3(config)
    ? await s3(config, 'GET', name)
    : await dav('GET', joinUrl(config.url, name), { Authorization: basicAuth(config.user, config.pass) })
  if (res.status === 404) return null
  if (res.status !== 200) throw new Error('下载失败 ' + name + '（HTTP ' + res.status + '）')
  return res.text
}

async function putText(config: SyncConfig, name: string, text: string): Promise<void> {
  const res = isS3(config)
    ? await s3(config, 'PUT', name, text, 'text/plain; charset=utf-8')
    : await dav('PUT', joinUrl(config.url, name), {
        Authorization: basicAuth(config.user, config.pass),
        'Content-Type': 'text/plain; charset=utf-8',
      }, text)
  if (![200, 201, 204, 207].includes(res.status)) throw new Error('上传失败 ' + name + '（HTTP ' + res.status + '）')
}

async function exists(config: SyncConfig, name: string): Promise<boolean> {
  try {
    const res = isS3(config)
      ? await s3(config, 'HEAD', name)
      : await dav('HEAD', joinUrl(config.url, name), { Authorization: basicAuth(config.user, config.pass) })
    return res.status === 200
  } catch {
    // Capacitor 的 fetch 对 404 的 HEAD 会抛错，这里按“不存在”处理
    return false
  }
}

export async function testConnection(config: SyncConfig): Promise<void> {
  const fixed = ensureConfig(config)
  const res = isS3(fixed)
    ? await s3(fixed, 'HEAD', REGISTRY)
    : await dav('GET', joinUrl(fixed.url, REGISTRY), { Authorization: basicAuth(fixed.user, fixed.pass) })
  if (![200, 404].includes(res.status)) {
    throw new Error(isS3(fixed)
      ? '连接失败（HTTP ' + res.status + '），检查 Endpoint/Bucket/Region/Access Key/Secret'
      : '连接失败（HTTP ' + res.status + '），检查地址/账号/应用密码')
  }
}

async function readRegistry(config: SyncConfig): Promise<string[]> {
  const text = await getText(config, REGISTRY)
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as { devices?: string[] }
    return Array.isArray(parsed.devices) ? parsed.devices.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

async function ensureHashes(): Promise<void> {
  const books = await listBooks()
  for (const book of books) {
    if (book.contentHash) continue
    const bytes = await getFile(book.id)
    if (!bytes) continue
    await putBook({ ...book, contentHash: await sha256(bytes) })
  }
}

function dedupeByContent(snapshot: SyncSnapshot): SyncSnapshot {
  const groups = new Map<string, typeof snapshot.books>()
  const keep: typeof snapshot.books = []
  for (const book of snapshot.books) {
    if (!book.contentHash) {
      keep.push(book)
      continue
    }
    const list = groups.get(book.contentHash) ?? []
    list.push(book)
    groups.set(book.contentHash, list)
  }
  const remap = new Map<string, string>()
  const tombstones = [...snapshot.tombstones]
  for (const list of groups.values()) {
    list.sort((a, b) => b.lastReadAt - a.lastReadAt)
    const canonical = list[0]
    keep.push(canonical)
    for (const dup of list.slice(1)) {
      remap.set(dup.id, canonical.id)
      tombstones.push({ key: 'book:' + dup.id, kind: 'book', id: dup.id, deletedAt: Date.now() })
    }
  }
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  return {
    ...snapshot,
    books: keep,
    notes: snapshot.notes.map((note) => (remap.has(note.bookId) ? { ...note, bookId: remap.get(note.bookId) as string } : note)),
    characters: snapshot.characters.map((character) => (remap.has(character.bookId) ? { ...character, bookId: remap.get(character.bookId) as string } : character)),
    tombstones: tombstones.filter((tomb) => tomb.deletedAt > cutoff),
  }
}

async function collect(deviceId: string): Promise<SyncSnapshot> {
  const [books, notes, characters, images, tombstones, allMaps, allPins] = await Promise.all([
    listBooks(),
    listNotes(),
    listCharacters(),
    listCharacterImages(),
    listTombstones(),
    listAllBookMaps(),
    listAllMapPins(),
  ])
  return {
    version: 1,
    deviceId,
    exportedAt: Date.now(),
    books,
    notes,
    characters,
    images: images.map((image) => ({
      id: image.id,
      characterId: image.characterId,
      caption: image.caption,
      sort: image.sort,
      createdAt: image.createdAt,
    })),
    maps: allMaps.map((map) => ({
      id: map.id,
      bookId: map.bookId,
      title: map.title,
      createdAt: map.createdAt,
      updatedAt: map.updatedAt,
    })),
    pins: allPins,
    tombstones,
  }
}

async function applySnapshot(merged: SyncSnapshot): Promise<void> {
  const [localBooks, localNotes, localCharacters, localImages, localMaps, localPins] = await Promise.all([
    listBooks(),
    listNotes(),
    listCharacters(),
    listCharacterImages(),
    listAllBookMaps(),
    listAllMapPins(),
  ])

  const bookIds = new Set(merged.books.map((book) => book.id))
  const noteIds = new Set(merged.notes.map((note) => note.id))
  const charIds = new Set(merged.characters.map((character) => character.id))
  const imageIds = new Set(merged.images.map((image) => image.id))
  const mapIds = new Set(merged.maps.map((map) => map.id))
  const pinIds = new Set(merged.pins.map((pin) => pin.id))

  for (const book of localBooks) if (!bookIds.has(book.id)) await deleteBook(book.id)
  for (const note of localNotes) if (!noteIds.has(note.id)) await deleteNote(note.id)
  for (const character of localCharacters) if (!charIds.has(character.id)) await deleteCharacter(character.id)
  for (const image of localImages) if (!imageIds.has(image.id)) await deleteCharacterImage(image.id)
  for (const map of localMaps) if (!mapIds.has(map.id)) await deleteBookMap(map.id)
  for (const pin of localPins) if (!pinIds.has(pin.id)) await deleteMapPin(pin.id)

  const localMapById = new Map(localMaps.map((map) => [map.id, map]))
  for (const meta of merged.maps) {
    const existing = localMapById.get(meta.id)
    if (existing) await putBookMap({ ...existing, title: meta.title, updatedAt: meta.updatedAt })
  }
  for (const pin of merged.pins) await putMapPin(pin)

  for (const book of merged.books) await putBook(book)
  for (const note of merged.notes) await putNote(note)
  for (const character of merged.characters) await putCharacter(character)
  for (const tomb of merged.tombstones) await putTombstone(tomb)
}

export async function applyConflictChoice(conflict: SyncConflict, choice: 'local' | 'remote'): Promise<void> {
  const book = await getBook(conflict.bookId)
  if (!book) return
  const side = choice === 'local' ? conflict.local : conflict.remote
  await putBook({
    ...book,
    chapterIndex: side.chapterIndex,
    scrollRatio: side.scrollRatio,
    epubCfi: side.epubCfi ?? book.epubCfi,
    lastReadAt: Date.now(),
  })
}

export type SyncResult = {
  books: number
  notes: number
  characters: number
  images: number
  uploaded: number
  downloaded: number
  skipped: number
  remotes: number
  registry: string[]
  conflicts: SyncConflict[]
  devices: Array<{ id: string; exportedAt: number; current?: boolean }>
  at: number
}

export async function syncNow(): Promise<SyncResult> {
  const raw = await getSyncConfig()
  if (!raw || !raw.url || !raw.user || !raw.pass) throw new Error('还没有配置同步账号')
  const config = ensureConfig(raw)
  await saveSyncConfig(config)
  const deviceId = config.deviceId as string

  // 坚果云不允许在 WebDAV 根写文件；桌面端负责确保子目录存在，Android 端假定已存在。
  if (window.paperSync && !isS3(config)) {
    await dav('MKCOL', config.url + FOLDER, { Authorization: basicAuth(config.user, config.pass) })
  }

  await ensureHashes()

  const registry = await readRegistry(config)
  if (!registry.includes(deviceId)) registry.push(deviceId)
  await putText(config, REGISTRY, JSON.stringify({ version: 1, devices: registry }))

  const local = await collect(deviceId)
  await putText(config, PREFIX + 'device-' + deviceId + '.json', JSON.stringify(local))

  const remotes: SyncSnapshot[] = []
  const devices: Array<{ id: string; exportedAt: number; current?: boolean }> = [
    { id: deviceId, exportedAt: Date.now(), current: true },
  ]
  for (const id of registry) {
    if (id === deviceId) continue
    const text = await getText(config, PREFIX + 'device-' + id + '.json')
    if (!text) continue
    try {
      const parsed = JSON.parse(text) as SyncSnapshot
      if (parsed && parsed.version === 1) {
        remotes.push(parsed)
        devices.push({ id, exportedAt: parsed.exportedAt || 0 })
      }
    } catch {
      // ignore broken snapshot
    }
  }

  const conflicts = detectBookConflicts(local, remotes)
  const merged = dedupeByContent(mergeSnapshots(local, remotes))
  await applySnapshot(merged)

  let uploaded = 0
  let downloaded = 0
  let skipped = 0
  const MAX_BOOK_BYTES = Math.max(5, config.maxFileMB || 50) * 1024 * 1024

  for (const book of merged.books) {
    if ((book.byteSize || 0) > MAX_BOOK_BYTES) {
      skipped += 1
      continue
    }
    const name = PREFIX + 'book-' + book.id + '.b64'
    const localBytes = await getFile(book.id)
    if (localBytes) {
      if (!(await exists(config, name))) {
        await putText(config, name, encodeBase64(localBytes))
        uploaded += 1
      }
    } else if (await exists(config, name)) {
      const text = await getText(config, name)
      if (text) {
        await putFile(book.id, decodeBase64(text))
        downloaded += 1
      }
    }
  }

  const localImages = await listCharacterImages()
  for (const image of localImages) {
    const name = PREFIX + 'image-' + image.id + '.b64'
    if (!(await exists(config, name))) {
      await putText(config, name, encodeBase64(await image.blob.arrayBuffer()))
      uploaded += 1
    }
  }

  for (const meta of merged.images) {
    const name = PREFIX + 'image-' + meta.id + '.b64'
    const has = (await listCharacterImages(meta.characterId)).some((image) => image.id === meta.id)
    if (has) continue
    if (await exists(config, name)) {
      const text = await getText(config, name)
      if (text) {
        await putCharacterImage({
          id: meta.id,
          characterId: meta.characterId,
          blob: new Blob([decodeBase64(text)]),
          caption: meta.caption,
          sort: meta.sort,
          createdAt: meta.createdAt,
        })
        downloaded += 1
      }
    }
  }

  const currentMaps = await listAllBookMaps()
  for (const meta of merged.maps) {
    const name = PREFIX + 'map-' + meta.id + '.b64'
    const local = currentMaps.find((map) => map.id === meta.id)
    if (local) {
      if (!(await exists(config, name))) {
        await putText(config, name, encodeBase64(await local.blob.arrayBuffer()))
        uploaded += 1
      }
    } else if (await exists(config, name)) {
      const text = await getText(config, name)
      if (text) {
        await putBookMap({ ...meta, blob: new Blob([decodeBase64(text)]) })
        downloaded += 1
      }
    }
  }

  const finalSnapshot = await collect(deviceId)
  await putText(config, PREFIX + 'device-' + deviceId + '.json', JSON.stringify(finalSnapshot))

  const at = Date.now()
  await saveSyncConfig({
    ...config,
    lastSyncAt: at,
    lastSummary: { at, books: merged.books.length, uploaded, downloaded, skipped, conflicts: conflicts.slice(0, 20), devices },
  })

  return {
    books: merged.books.length,
    notes: merged.notes.length,
    characters: merged.characters.length,
    images: merged.images.length,
    uploaded,
    downloaded,
    skipped,
    remotes: remotes.length,
    registry,
    conflicts,
    devices,
    at,
  }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __syncNow?: () => Promise<SyncResult> }).__syncNow = syncNow
}
