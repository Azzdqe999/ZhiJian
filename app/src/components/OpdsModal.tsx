import { useState } from 'react'

type OpdsEntry = {
  title: string
  author: string
  href: string
  type: string
}

type Props = {
  onClose: () => void
  onImport: (files: File[]) => void
  onToast: (message: string) => void
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  if (window.paperSync) {
    const res = await window.paperSync.request({ method: 'GET', url, headers: { Accept: '*/*' } })
    if (res.status < 200 || res.status >= 300) throw new Error('HTTP ' + res.status)
    const body = res.body
    if (!body) return new ArrayBuffer(0)
    if (body instanceof ArrayBuffer) return body
    return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.arrayBuffer()
}

export default function OpdsModal({ onClose, onImport, onToast }: Props) {
  const [url, setUrl] = useState('')
  const [entries, setEntries] = useState<OpdsEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const load = async () => {
    const target = url.trim()
    if (!target || busy) return
    setBusy(true)
    setStatus('读取目录…')
    setEntries([])
    try {
      const bytes = await fetchBytes(target)
      const text = new TextDecoder().decode(bytes)
      const doc = new DOMParser().parseFromString(text, 'application/xml')
      if (doc.querySelector('parsererror')) throw new Error('目录不是有效的 OPDS XML')
      const list: OpdsEntry[] = []
      for (const entry of Array.from(doc.querySelectorAll('entry'))) {
        const title = entry.querySelector('title')?.textContent?.trim() || '未命名'
        const author = entry.querySelector('author > name')?.textContent?.trim() || ''
        const links = Array.from(entry.querySelectorAll('link'))
        const link = links.find((item) => {
          const type = item.getAttribute('type') || ''
          const href = item.getAttribute('href') || ''
          return type.includes('epub') || type.includes('text/plain') || /\.(epub|txt)$/i.test(href)
        })
        if (!link) continue
        const href = link.getAttribute('href') || ''
        try {
          list.push({ title, author, type: link.getAttribute('type') || '', href: new URL(href, target).toString() })
        } catch {
          /* 跳过无效链接 */
        }
      }
      setEntries(list)
      setStatus(list.length ? '找到 ' + list.length + ' 本可导入的书' : '这个目录里没有 EPUB/TXT 条目')
    } catch (error) {
      setStatus('读取失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setBusy(false)
    }
  }

  const download = async (entry: OpdsEntry) => {
    setBusy(true)
    setStatus('下载《' + entry.title + '》…')
    try {
      const bytes = await fetchBytes(entry.href)
      const name = entry.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) + (entry.type.includes('epub') || /\.epub($|\?)/i.test(entry.href) ? '.epub' : '.txt')
      const file = new File([bytes], name, { type: entry.type || 'application/octet-stream' })
      onImport([file])
      setStatus('已交给导入：' + entry.title)
      onToast('开始导入《' + entry.title + '》')
    } catch (error) {
      setStatus('下载失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal search-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">OPDS</div>
            <h2>从书库目录导入</h2>
            <p className="modal-sub">支持 Calibre、COPS、标准 OPDS 目录；桌面端走主进程请求，避开浏览器跨域。</p>
          </div>
          <button className="modal-close" onClick={onClose}>关闭</button>
        </div>
        <div className="qa-actions">
          <input className="search-input" placeholder="OPDS 目录地址，例如 http://192.168.1.2:8080/opds" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load() }} />
          <button className="btn small solid" onClick={() => void load()} disabled={busy}>{busy ? '读取中…' : '读取'}</button>
        </div>
        {status ? <p className="setting-foot">{status}</p> : null}
        <div className="search-results">
          {entries.map((entry) => (
            <button className="search-hit" key={entry.href} onClick={() => void download(entry)}>
              <span className="search-hit-title">{entry.author || '未知作者'}</span>
              <span className="search-hit-snippet">{entry.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
