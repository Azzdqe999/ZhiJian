import JSZip from 'jszip'

export type BuildChapter = { title: string; text?: string; html?: string }
export type BuildAsset = { path: string; bytes: Uint8Array; mime: string }

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function paragraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => '<p>' + escapeXml(line) + '</p>')
    .join('\n')
}

function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { bytes, mime: match[1] }
}

export async function buildEpub(options: {
  title: string
  author: string
  chapters: BuildChapter[]
  assets?: BuildAsset[]
  coverDataUrl?: string
  language?: string
}): Promise<Blob> {
  const zip = new JSZip()
  const id = 'paper-' + Math.random().toString(36).slice(2, 10)
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')

  const manifest: string[] = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '<item id="css" href="style.css" media-type="text/css"/>']
  const spine: string[] = []
  const navItems: string[] = []

  options.chapters.forEach((chapter, index) => {
    const href = 'chapter-' + (index + 1) + '.xhtml'
    const itemId = 'c' + (index + 1)
    manifest.push('<item id="' + itemId + '" href="' + href + '" media-type="application/xhtml+xml"/>')
    spine.push('<itemref idref="' + itemId + '"/>')
    navItems.push('<li><a href="' + href + '">' + escapeXml(chapter.title) + '</a></li>')
    const body = chapter.html || paragraphs(chapter.text || '')
    zip.file('OEBPS/' + href, '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>' + escapeXml(chapter.title) + '</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body><h1>' + escapeXml(chapter.title) + '</h1>' + body + '</body></html>')
  })

  ;(options.assets || []).forEach((asset, index) => {
    const itemId = 'a' + (index + 1)
    manifest.push('<item id="' + itemId + '" href="' + escapeXml(asset.path) + '" media-type="' + asset.mime + '"/>')
    zip.file('OEBPS/' + asset.path, asset.bytes)
  })

  let coverMeta = ''
  if (options.coverDataUrl) {
    const cover = dataUrlBytes(options.coverDataUrl)
    if (cover) {
      const ext = cover.mime.includes('png') ? 'png' : 'jpg'
      zip.file('OEBPS/cover.' + ext, cover.bytes)
      manifest.push('<item id="cover" href="cover.' + ext + '" media-type="' + cover.mime + '" properties="cover-image"/>')
      coverMeta = '<meta name="cover" content="cover"/>'
    }
  }

  zip.file('OEBPS/style.css', 'html,body{margin:0;padding:0;background:#f6f2e9;color:#2a2723;}body{padding:48px 32px 80px;font-family:"Noto Serif SC","Songti SC",serif;font-size:18px;line-height:1.9;max-width:720px;margin:0 auto;}h1{font-size:1.4em;line-height:1.5;margin:0 0 1.4em;}p{margin:0 0 1em;text-indent:2em;}img{max-width:100%;}')
  zip.file('OEBPS/nav.xhtml', '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc" id="toc"><h1>目录</h1><ol>' + navItems.join('') + '</ol></nav></body></html>')
  zip.file('OEBPS/content.opf', '<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">' + id + '</dc:identifier><dc:title>' + escapeXml(options.title) + '</dc:title><dc:creator>' + escapeXml(options.author) + '</dc:creator><dc:language>' + (options.language || 'zh') + '</dc:language><meta property="dcterms:modified">' + modified + '</meta>' + coverMeta + '</metadata><manifest>' + manifest.join('') + '</manifest><spine>' + spine.join('') + '</spine></package>')

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' })
}
