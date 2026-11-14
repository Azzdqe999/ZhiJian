import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

// 依赖装在 app/ 里（Electron 工程），脚本在仓库根目录，显式从 app 侧解析。
const appRequire = createRequire(path.join(root, 'app', 'package.json'))
const JSZip = appRequire('jszip')

const outDir = path.join(root, 'samples')
fs.mkdirSync(outDir, { recursive: true })

const ACCENT = [0xa4, 0x55, 0x2f]
const PAPER = [0xf6, 0xf2, 0xe9]
const INK = [0x2b, 0x26, 0x21]
const BIG_TARGET = 5 * 1024 * 1024

/* ---------- 极简 PNG 编码（无第三方依赖） ---------- */
const CRC_TABLE = (function () {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, tail])
}

function encodePng(width, height, pixelAt) {
  const stride = width * 3 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < width; x++) {
      const rgb = pixelAt(x, y)
      const p = y * stride + 1 + x * 3
      raw[p] = rgb[0]
      raw[p + 1] = rgb[1]
      raw[p + 2] = rgb[2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function makeCover(width, height) {
  return encodePng(width, height, function (x, y) {
    const edge = 26
    if (x < edge || y < edge || x >= width - edge || y >= height - edge) {
      const inner = x < edge + 3 || y < edge + 3 || x >= width - edge - 3 || y >= height - edge - 3
      return inner ? ACCENT : PAPER
    }
    if (y > height * 0.62 && y < height * 0.625) return ACCENT
    if (x > width * 0.16 && x < width * 0.2 && y > height * 0.18 && y < height * 0.5) return ACCENT
    if (x > width * 0.2 && x < width * 0.62 && y > height * 0.31 && y < height * 0.335) return INK
    if (x > width * 0.2 && x < width * 0.52 && y > height * 0.38 && y < height * 0.4) return [0x6d, 0x66, 0x5c]
    return mix(PAPER, [0xf1, 0xea, 0xdb], 0.5)
  })
}

function makeScene(width, height) {
  return encodePng(width, height, function (x, y) {
    const horizon = Math.round(height * 0.58)
    if (y < horizon) {
      const t = y / horizon
      return mix([0xd9, 0xca, 0xb2], [0xf3, 0xec, 0xdd], t)
    }
    const t = (y - horizon) / (height - horizon)
    let color = mix([0x9a, 0x8e, 0x7c], [0x3c, 0x38, 0x33], t)
    const ripple = Math.sin((x / width) * Math.PI * 5 + t * 4) * 5
    const shade = Math.max(-14, Math.min(14, ripple))
    color = color.map(function (v) { return Math.max(0, Math.min(255, v + shade)) })
    if (y > horizon + 8 && y < horizon + 12) color = [0xb4, 0x7a, 0x58]
    return color
  })
}

// 带颗粒的夜色插图：接近真实照片，压缩率低，用来把大样本撑到 5MB 量级。
function makeGrainyScene(width, height, seed) {
  let s = seed >>> 0 || 7
  const rnd = function () {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  return encodePng(width, height, function (x, y) {
    const horizon = Math.round(height * 0.55)
    let base
    if (y < horizon) {
      const t = y / horizon
      base = mix([0x6f, 0x64, 0x55], [0xd8, 0xc9, 0xae], t)
    } else {
      const t = (y - horizon) / (height - horizon)
      base = mix([0x4a, 0x44, 0x3c], [0x17, 0x16, 0x14], t)
      if (y > horizon && y < horizon + 6) base = [0xa4, 0x55, 0x2f]
    }
    const grain = (rnd() - 0.5) * 26
    return base.map(function (v) { return Math.max(0, Math.min(255, Math.round(v + grain))) })
  })
}

/* ---------- EPUB 内容 ---------- */
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function xhtml(title, body) {
  return '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<!DOCTYPE html>\n' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN">\n' +
    '<head>\n  <meta charset="utf-8" />\n  <title>' + esc(title) + '</title>\n' +
    '  <link rel="stylesheet" type="text/css" href="style.css" />\n</head>\n' +
    '<body>\n' + body + '\n</body>\n</html>\n'
}

const CSS = [
  'body { font-family: "Noto Serif CJK SC", "Source Han Serif SC", serif; line-height: 1.9; margin: 1.4em; color: #2b2621; }',
  'h1 { font-size: 1.5em; font-weight: 600; margin: 0 0 1em; }',
  'h2 { font-size: 1.1em; margin: 1.6em 0 0.6em; }',
  'p { margin: 0 0 0.9em; text-indent: 2em; }',
  'figure { margin: 1.4em 0; }',
  'img { max-width: 100%; }',
  'figcaption { font-size: 0.85em; color: #6d665c; text-align: center; text-indent: 0; }',
  '.note-ref { font-size: 0.75em; vertical-align: super; color: #a4552f; }',
  'aside[epub|type~="footnote"] { border-top: 1px solid #d8cfc0; margin-top: 2em; padding-top: 1em; font-size: 0.9em; }',
].join('\n')

function navXhtml(entries) {
  const items = entries
    .map(function (entry) { return '      <li><a href="' + esc(entry.href) + '">' + esc(entry.title) + '</a></li>' })
    .join('\n')
  return xhtml(
    '目录',
    '  <nav epub:type="toc" id="toc">\n    <h1>目录</h1>\n    <ol>\n' + items + '\n    </ol>\n  </nav>\n' +
      '  <nav epub:type="landmarks" hidden="hidden">\n    <ol>\n      <li><a epub:type="bodymatter" href="text/chapter-1.xhtml">正文</a></li>\n    </ol>\n  </nav>',
  )
}

function opf(options) {
  const chapterItems = options.chapters
    .map(function (ch, i) {
      return '    <item id="ch' + (i + 1) + '" href="text/chapter-' + (i + 1) + '.xhtml" media-type="application/xhtml+xml" />'
    })
    .join('\n')
  const chapterSpine = options.chapters
    .map(function (ch, i) { return '    <itemref idref="ch' + (i + 1) + '" />' })
    .join('\n')
  return '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">\n' +
    '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    '    <dc:identifier id="bookid">' + esc(options.uid) + '</dc:identifier>\n' +
    '    <dc:title>' + esc(options.title) + '</dc:title>\n' +
    '    <dc:creator id="creator">' + esc(options.author) + '</dc:creator>\n' +
    '    <dc:language>zh-CN</dc:language>\n' +
    '    <dc:publisher>纸间测试样本</dc:publisher>\n' +
    '    <dc:description>纸间 M2 自动生成的合法 EPUB3 样本。</dc:description>\n' +
    '    <meta property="dcterms:modified">2026-11-13T00:00:00Z</meta>\n' +
    (options.hasCover ? '    <meta name="cover" content="cover-image" />\n' : '') +
    '  </metadata>\n' +
    '  <manifest>\n' +
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />\n' +
    '    <item id="css" href="style.css" media-type="text/css" />\n' +
    '    <item id="footnotes" href="text/footnotes.xhtml" media-type="application/xhtml+xml" />\n' +
    (options.hasCover
      ? '    <item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image" />\n'
      : '') +
    '    <item id="scene" href="images/scene.png" media-type="image/png" />\n' +
    options.extraImages.map(function (img, i) {
      return '    <item id="plate' + (i + 1) + '" href="' + esc(img) + '" media-type="image/png" />'
    }).join('\n') + (options.extraImages.length ? '\n' : '') +
    chapterItems + '\n' +
    '  </manifest>\n' +
    '  <spine>\n' +
    chapterSpine + '\n' +
    '    <itemref idref="footnotes" linear="no" />\n' +
    '  </spine>\n' +
    '</package>\n'
}

function chapterXhtml(title, paragraphs, options) {
  const opts = options || {}
  const body = ['  <h1>' + esc(title) + '</h1>']
  paragraphs.forEach(function (text, i) {
    let html = '  <p>' + esc(text)
    if (opts.footnote && i === 1) {
      html += '<a class="note-ref" epub:type="noteref" href="footnotes.xhtml#fn1" id="fnref1">[1]</a>'
    }
    html += '</p>'
    body.push(html)
  })
  if (opts.images) {
    opts.images.forEach(function (img, i) {
      body.push('  <figure>\n    <img src="' + esc(img) + '" alt="插图 ' + (i + 1) + '" />\n    <figcaption>图 · 旧渡口</figcaption>\n  </figure>')
    })
    body.push('  <p>船篷上的雨声密起来，她把灯芯挑亮了一些，看见水面浮着一层薄薄的白气。</p>')
  }
  return xhtml(title, body.join('\n'))
}

function footnotesXhtml() {
  return xhtml(
    '注释',
    '  <h1>注释</h1>\n' +
      '  <aside epub:type="footnote" id="fn1">\n' +
      '    <p><span class="note-ref">[1]</span>旧渡口：城西十里，旧时官船夜泊之处，今仅存石阶三级。</p>\n' +
      '  </aside>\n' +
      '  <p><a href="chapter-1.xhtml#fnref1">返回正文</a></p>',
  )
}

async function buildEpub(options) {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
      '  <rootfiles>\n' +
      '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />\n' +
      '  </rootfiles>\n' +
      '</container>\n',
  )
  const navEntries = options.chapterTitles.map(function (chapterTitle, i) {
    return { href: 'text/chapter-' + (i + 1) + '.xhtml', title: chapterTitle }
  })
  navEntries.push({ href: 'text/footnotes.xhtml', title: '注释' })
  zip.file('OEBPS/nav.xhtml', navXhtml(navEntries))
  zip.file('OEBPS/style.css', CSS)
  zip.file('OEBPS/content.opf', opf({
    uid: options.uid,
    title: options.title,
    author: options.author,
    chapters: options.chapterTitles,
    hasCover: options.includeCover !== false,
    extraImages: options.extraImages || [],
  }))
  if (options.includeCover !== false) zip.file('OEBPS/images/cover.png', makeCover(600, 800))
  zip.file('OEBPS/images/scene.png', makeScene(900, 500))
  ;(options.extraImages || []).forEach(function (href, i) {
    zip.file('OEBPS/' + href, makeGrainyScene(1100, 760, 9001 + i * 137))
  })
  const firstParagraphs = options.firstParagraphs || [
    '山雨落在旧渡口，木桩上积着薄薄一层水。',
    '她没有说话，只把斗笠压低了些，听见船底擦过浅滩的沙声。',
    '船到河心时，风忽然停了。',
  ]
  options.chapterTitles.forEach(function (chapterTitle, i) {
    const paragraphs = i === 0 ? firstParagraphs : options.paragraphsFor(i)
    const images = []
    if (i === 1) images.push('images/scene.png')
    if (options.extraImages && i % 20 === 3) images.push(options.extraImages[Math.floor(i / 20) % options.extraImages.length])
    // 章节在 text/ 目录下，图片路径要回退一级
    const relativeImages = images.map(function (href) { return '../' + href })
    zip.file(
      'OEBPS/text/chapter-' + (i + 1) + '.xhtml',
      chapterXhtml(chapterTitle, paragraphs, { images: relativeImages, footnote: i === 0 }),
    )
  })
  zip.file('OEBPS/text/footnotes.xhtml', footnotesXhtml())

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/epub+zip',
  })
}

/* ---------- 语料 ---------- */
const titlePool = ['风起', '夜行', '旧渡', '长街', '雪落', '孤灯', '山雨', '归人', '残卷', '灯影', '渡口', '远信', '寒江', '薄雾', '空城', '春信', '晚钟', '旧疾', '青石', '白露', '纸鸢', '铁马', '秋水', '断桥', '北窗', '松声', '云低', '月出', '无声', '终章', '余音', '回望', '落雪', '江晚', '灯下', '石阶', '夜航', '闻笛', '旧约', '长夜']

const NOUNS = ['山雨', '渡口', '灯影', '长街', '旧船', '石阶', '风声', '夜色', '纸伞', '青石', '远山', '薄雾', '船篷', '灯芯', '水声', '衣角', '窗纸', '檐角', '雨丝', '尘埃', '灯火', '河湾', '木桩', '乌篷', '堤岸', '塔影', '芦花', '故人', '旧信', '茶烟', '竹帘', '铜锁', '井台', '碑石', '钟声', '暮色', '霜气', '灯花', '瓦当', '归鸟', '渔火', '蓑衣', '短笛', '残雪', '晚潮', '孤舟', '寒星', '旧梦', '灯影']
const VERBS = ['落下来', '漫过去', '停在原地', '被风吹散', '顺着船舷滑落', '压在瓦上', '沉进夜色', '贴着水面', '绕过石阶', '散在灯下', '伏在窗沿', '挤进门缝', '掠过檐角', '沉入河底', '挂上枝头', '绕过塔影']
const ADJS = ['旧的', '冷的', '薄的', '迟钝的', '潮湿的', '安静的', '半旧的', '发白的', '昏黄的', '细碎的', '遥远的', '模糊的', '低低的', '缓慢的', '清凉的']
const TAILS = ['她没有回头。', '他听见远处有人在唤。', '像是很久以前的事。', '灯火晃了一下。', '雨还在下。', '船家收了篙。', '有人把门掩上。', '檐水断断续续。', '江面起了雾。', '更鼓敲过三下。', '风把帘子掀起一角。', '他把信折好收起。']
const NUM_WORDS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']

function makeRng(seed) {
  let s = seed >>> 0
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function pick(rnd, list) {
  return list[Math.floor(rnd() * list.length)]
}

function makeParagraphs(seed, count) {
  const rnd = makeRng(seed)
  const out = []
  for (let i = 0; i < count; i++) {
    const sentences = 3 + Math.floor(rnd() * 4)
    let text = ''
    for (let j = 0; j < sentences; j++) {
      const a = pick(rnd, NOUNS)
      const b = pick(rnd, VERBS)
      const c = pick(rnd, ADJS)
      const d = pick(rnd, NOUNS)
      const e = pick(rnd, VERBS)
      const tail = pick(rnd, TAILS)
      const num = pick(rnd, NUM_WORDS)
      const variant = Math.floor(rnd() * 4)
      if (variant === 0) text += a + b + '，' + c + d + e + '，' + tail
      else if (variant === 1) text += '第' + num + '次听见' + a + b + '，' + d + '在' + c + '光里' + e + '，' + tail
      else if (variant === 2) text += a + '上' + b + '的' + d + '，' + c + '像' + a + '，' + tail
      else text += '她把' + a + '与' + d + '放在' + c + '灯下，' + tail
    }
    out.push(text)
  }
  return out
}

/* ---------- 生成 ---------- */
const smallTitles = ['第一章 风起', '第二章 夜行', '第三章 旧渡']
const small = await buildEpub({
  uid: 'urn:uuid:paper-between-epub-0001',
  title: '旧渡口',
  author: '纸间测试组',
  chapterTitles: smallTitles,
  paragraphsFor: function (i) { return makeParagraphs(100 + i, 4) },
  extraImages: [],
})
fs.writeFileSync(path.join(outDir, 'epub-3章.epub'), small)

const CHAPTERS = Number(process.env.EPUB_CHAPTERS || 230)
const PARAGRAPHS = Number(process.env.EPUB_PARAGRAPHS || 260)
const longTitles = Array.from({ length: CHAPTERS }, function (_, i) {
  return '第' + (i + 1) + '章 ' + titlePool[i % titlePool.length]
})
const longParagraphs = Array.from({ length: CHAPTERS }, function (_, i) {
  return makeParagraphs(5000 + i * 31, PARAGRAPHS)
})
const big = await buildEpub({
  uid: 'urn:uuid:paper-between-epub-5mb',
  title: '长夜灯影',
  author: '纸间测试组',
  chapterTitles: longTitles,
  paragraphsFor: function (i) { return longParagraphs[i] },
  extraImages: ['images/plate-1.png', 'images/plate-2.png'],
})
fs.writeFileSync(path.join(outDir, 'epub-5mb.epub'), big)

// M3 专用样本（不进 manifest，避免改变 M2 的样本数量断言）
const characterParagraphs = [
  '李寒衣站在旧渡口，斗笠压得很低，雨顺着刀鞘往下淌。',
  '谢无咎收拢纸伞，隔着雨幕唤了一声「寒衣」，声音很轻。',
  '阿沅把船撑到石阶边，看见李三娘袖口那道旧刀痕。',
  '李寒衣没有回头，只把灯芯挑亮了一些，江面起了雾。',
  '阿沅低声说，渡口的人都记得李寒衣欠下的船钱。',
]
const characterBook = await buildEpub({
  uid: 'urn:uuid:paper-between-epub-characters',
  title: '旧渡口 · 人物',
  author: '纸间测试组',
  chapterTitles: ['第一章 刀痕', '第二章 夜渡'],
  paragraphsFor: function (i) { return characterParagraphs.map(function (line) { return line + '（' + (i + 1) + '）' }) },
  firstParagraphs: characterParagraphs,
  extraImages: [],
})
fs.writeFileSync(path.join(outDir, 'epub-人物.epub'), characterBook)

const noCoverBook = await buildEpub({
  uid: 'urn:uuid:paper-between-epub-nocover',
  title: '无题·无封面',
  author: '纸间测试组',
  chapterTitles: ['第一章 空白', '第二章 纸页', '第三章 落款'],
  paragraphsFor: function (i) { return makeParagraphs(700 + i, 3) },
  includeCover: false,
  extraImages: [],
})
fs.writeFileSync(path.join(outDir, 'epub-无封面.epub'), noCoverBook)

/* ---------- manifest ---------- */
const epubEntries = [
  {
    file: 'epub-3章.epub',
    format: 'epub',
    title: '旧渡口',
    author: '纸间测试组',
    chapters: smallTitles.length,
    toc: smallTitles,
    footnoteChapter: '注释',
    images: 2,
    bytes: small.length,
  },
  {
    file: 'epub-5mb.epub',
    format: 'epub',
    title: '长夜灯影',
    author: '纸间测试组',
    chapters: CHAPTERS,
    toc: longTitles,
    footnoteChapter: '注释',
    images: 4,
    bytes: big.length,
  },
]
const manifestPath = path.join(outDir, 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const keep = manifest.filter(function (entry) { return entry.format !== 'epub' })
fs.writeFileSync(manifestPath, JSON.stringify(keep.concat(epubEntries), null, 2) + '\n')
fs.writeFileSync(path.join(outDir, 'manifest-epub.json'), JSON.stringify(epubEntries, null, 2) + '\n')

console.log('epub-3章.epub  ' + (small.length / 1024).toFixed(1) + ' KB')
console.log('epub-5mb.epub  ' + (big.length / 1024 / 1024).toFixed(2) + ' MB  (' + CHAPTERS + ' 章)')
console.log('目标 5MB ±20%：' + (big.length >= BIG_TARGET * 0.8 && big.length <= BIG_TARGET * 1.2 ? 'ok' : '需要调整 EPUB_CHAPTERS / EPUB_PARAGRAPHS'))
console.log('manifest: ' + manifestPath + ' / manifest-epub.json')
