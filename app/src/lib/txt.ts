export type TextEncoding = 'utf-8' | 'gb18030' | 'big5' | 'utf-16le' | 'utf-16be'

export type DecodeResult = {
  text: string
  encoding: TextEncoding
}

export type Chapter = {
  title: string
  text: string
}

export const ENCODING_LABELS: Record<TextEncoding, string> = {
  'utf-8': 'UTF-8',
  gb18030: 'GBK / GB18030',
  big5: 'Big5（繁体）',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
}

export const ENCODINGS: TextEncoding[] = ['utf-8', 'gb18030', 'big5', 'utf-16le', 'utf-16be']

const DECODER_LABELS: Record<TextEncoding, string> = {
  'utf-8': 'utf-8',
  gb18030: 'gb18030',
  big5: 'big5',
  'utf-16le': 'utf-16le',
  'utf-16be': 'utf-16be',
}

// 常用汉字（简体 + 繁体）用于给候选编码的解码结果打分。
// 错误编码解出来的多半是生僻字，命中率会明显偏低。
const COMMON_CHARS = new Set(
  (
    '的一是不了在人有我他這这为之為大来來以个個中上们們到说說国國和地也子时時道出而要于於就下得可你年生自会會那后後能对對着著事其里裡所去行过過家十用发發天如然作方成者多日都三小军軍二无無同么麼经經法当當起与與好看学學进進种種将將还還分此心前面又定见見只主没沒公从從最更真想些因开開点點几幾问問手知风風云雲雪夜山城灯燈影剑劍客酒马馬河船旧舊梦夢声聲长長天章节節回卷部篇集序楔尾番外'
  ).split('')
)

const CANDIDATES: TextEncoding[] = ['utf-8', 'utf-16le', 'utf-16be', 'gb18030', 'big5']

function sniffBom(bytes: Uint8Array): TextEncoding | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  return null
}

function tryDecode(bytes: Uint8Array, encoding: TextEncoding): string | null {
  try {
    return new TextDecoder(DECODER_LABELS[encoding], { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function scoreText(text: string): number {
  // 采样即可：编码判别不依赖整本书。
  const sample = text.length > 40000 ? text.slice(0, 40000) : text
  const total = sample.length
  if (!total) return -1
  let common = 0
  let cjk = 0
  let printable = 0
  let bad = 0
  for (const ch of sample) {
    const code = ch.codePointAt(0) as number
    if (code === 0xfffd) {
      bad += 4
      continue
    }
    if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) {
      bad += 5
      continue
    }
    if (code >= 0x4e00 && code <= 0x9fff) {
      cjk++
      printable++
      if (COMMON_CHARS.has(ch)) common++
      continue
    }
    if (code >= 0x3400 && code <= 0x4dbf) {
      printable++
      bad += 0.2
      continue
    }
    if ((code >= 0x20 && code < 0x7f) || code === 10 || code === 13 || code === 9) {
      printable++
      continue
    }
    if (code >= 0x3000 && code <= 0x303f) {
      printable++
      continue
    }
    if (code >= 0xff00 && code <= 0xffef) {
      printable++
      continue
    }
    if (code >= 0x2010 && code <= 0x201f) {
      printable++
      continue
    }
    bad += 0.05
  }
  const commonRatio = cjk ? common / cjk : 0
  return 0.55 * commonRatio + 0.35 * (printable / total) - (bad / total) * 2
}

export function sniffEncoding(bytes: Uint8Array): TextEncoding {
  const bom = sniffBom(bytes)
  if (bom) return bom

  let best: TextEncoding = 'utf-8'
  let bestScore = -Infinity
  for (const encoding of CANDIDATES) {
    const text = tryDecode(bytes, encoding)
    if (text == null) continue
    const score = scoreText(text)
    if (score > bestScore + 0.01) {
      best = encoding
      bestScore = score
    }
  }
  if (bestScore === -Infinity) return 'gb18030'
  return best
}

function decodeWith(bytes: Uint8Array, encoding: TextEncoding): string {
  try {
    return new TextDecoder(DECODER_LABELS[encoding]).decode(bytes)
  } catch {
    return new TextDecoder('gb18030').decode(bytes)
  }
}

export function decodeBytes(bytes: Uint8Array, forced?: TextEncoding): DecodeResult {
  const encoding = forced ?? sniffEncoding(bytes)
  return { text: decodeWith(bytes, encoding), encoding }
}

const CN_NUM = '[0-9０-９零〇○一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟]+'

const CHAPTER_HEAD = new RegExp('^第[\\s]*' + CN_NUM + '[\\s]*([章节節回卷部篇集])')

const SPECIAL_HEAD =
  /^(?:序章|序言|序曲|序幕|楔子|引子|引言|前传|前傳|前言|尾声|尾聲|终章|終章|后记|後記|后序|大结局|大結局|结局|結局|番外(?:篇)?|外传|外傳|附录|附錄)(?:[\s·:：、.\-—].{0,30}|[一二三四五六七八九十0-9]{1,4})?$/

const EN_HEAD = /^(?:chapter|chap\.|ch\.)\s*[0-9]{1,4}(?:[\s·:：.\-—].{0,40})?$/i

const NUM_HEAD = /^[0-9]{1,4}(?:[.、:：\-—]\s*.{0,30}|\s+.{1,30})?$/

function looksLikeHeading(line: string): string | null {
  const t = line.trim()
  if (!t || t.length > 40) return null
  if (/[。！？!?；;，,]$/.test(t)) return null
  if (/[。！？]/.test(t)) return null

  const m = t.match(CHAPTER_HEAD)
  if (m) {
    const rest = t.slice(m[0].length).trim()
    if (rest && !/^[：:·、.\-—\s]/.test(rest) && rest.length > 12) return null
    return t
  }
  if (SPECIAL_HEAD.test(t)) return t
  if (EN_HEAD.test(t)) return t
  if (NUM_HEAD.test(t)) return t
  return null
}

export function splitChapters(text: string): Chapter[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')

  const marks: Array<{ line: number; title: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const title = looksLikeHeading(lines[i])
    if (title) marks.push({ line: i, title })
  }

  if (!marks.length) {
    const body = normalized.trim()
    return body ? [{ title: '全文', text: body }] : []
  }

  const pre = lines.slice(0, marks[0].line).join('\n').trim()
  const chapters: Chapter[] = []

  for (let i = 0; i < marks.length; i++) {
    const from = marks[i].line + 1
    const to = i + 1 < marks.length ? marks[i + 1].line : lines.length
    let body = lines.slice(from, to).join('\n').trim()
    // 正文前只有书名/作者这种短抬头时，并进第一章，避免多出一个空章。
    if (i === 0 && pre && pre.length < 60) body = (pre + '\n' + body).trim()
    chapters.push({ title: marks[i].title, text: body })
  }

  if (pre && pre.length >= 60) chapters.unshift({ title: '前言', text: pre })

  // 有些 TXT 开头带一份目录：目录行会被识别成空章。去掉与正文章节同名的空条目。
  const filledTitles = new Set(chapters.filter((c) => c.text.trim().length > 0).map((c) => c.title))
  const cleaned = chapters.filter((c) => c.text.trim().length > 0 || !filledTitles.has(c.title))
  return cleaned.length ? cleaned : chapters
}

const SENTENCE_END = /[。！？…”’」』）)]$/

export function toParagraphs(text: string): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\u3000/g, ' ').trim())
    .filter((line) => line.length > 0)
  if (!lines.length) return []

  const sample = lines.slice(0, 120)
  const longLines = lines.filter((line) => line.length >= 30)
  const noEnd = lines.filter((line) => !SENTENCE_END.test(line))
  const wrapped =
    lines.length > 4 && noEnd.length / lines.length > 0.55 && longLines.length / lines.length > 0.4

  if (!wrapped) return lines

  const paragraphs: string[] = []
  let buf = ''
  for (const line of lines) {
    if (buf && /[A-Za-z0-9]$/.test(buf) && /^[A-Za-z0-9]/.test(line)) buf += ' '
    buf += line
    if (SENTENCE_END.test(line) || buf.length > 900) {
      paragraphs.push(buf)
      buf = ''
    }
  }
  if (buf) paragraphs.push(buf)
  return paragraphs
}

export function countWords(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 32 || code === 9 || code === 10 || code === 13 || code === 0x0b || code === 0x0c) continue
    if (code === 0xa0 || code === 0x3000 || code === 0xfeff) continue
    if (code >= 0x2000 && code <= 0x200a) continue
    if (code === 0x2028 || code === 0x2029) continue
    count++
  }
  return count
}
