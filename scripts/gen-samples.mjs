import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const outDir = path.join(root, 'samples')
fs.mkdirSync(outDir, { recursive: true })

// Node 只有 TextDecoder，没有 GBK/Big5 编码器。
// 用 TextDecoder 反查双字节码表来构造编码器，纯 JS，不依赖 iconv。
function buildEncoder(label) {
  const decoder = new TextDecoder(label)
  const map = new Map()
  const pair = new Uint8Array(2)
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x40; trail <= 0xfe; trail++) {
      if (trail === 0x7f) continue
      pair[0] = lead
      pair[1] = trail
      const ch = decoder.decode(pair)
      if (ch.length === 1 && ch !== '\uFFFD' && !map.has(ch)) map.set(ch, [lead, trail])
    }
  }
  return {
    canEncode(ch) {
      const code = ch.codePointAt(0)
      return code < 0x80 || map.has(ch)
    },
    encode(text) {
      const out = []
      for (const ch of text) {
        const code = ch.codePointAt(0)
        if (code < 0x80) {
          out.push(code)
          continue
        }
        const bytes = map.get(ch)
        if (!bytes) throw new Error('编码表里没有字符：' + ch + ' (U+' + code.toString(16) + ')')
        out.push(bytes[0], bytes[1])
      }
      return Buffer.from(out)
    },
  }
}

const gbk = buildEncoder('gbk')
const big5 = buildEncoder('big5')

const DIGITS = '零一二三四五六七八九'
function cnNum(n) {
  if (n < 10) return DIGITS[n]
  if (n < 20) return '十' + (n % 10 ? DIGITS[n % 10] : '')
  if (n < 100) return DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? DIGITS[n % 10] : '')
  return String(n)
}

function mulberry32(seed) {
  let a = seed
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SIMPLE_POOL =
  '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题程展五果料象员位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严龙飞'
const TRAD_POOL =
  '的一是了我不人在他有這个上們來到時大地為子中你說生國年著就那和要她出也得里後自以會家可下而過天去能對小多然於心學麼之都發當沒成只如事把還用第樣道想作種開美總從無情見最女但現些所本經動起兩分實問意建月公系軍很者立代已通並提直題展五果料象員位入常文總次品式活設及管特件長求老頭基資邊流路級少圖山統接知較將組計別她手角期根論運農指幾九區強放決西被幹做必戰先回則任取據處隊南給色光門即保治北造百規熱領七海口東導器壓志世金增爭濟階油思術極交受聯什認六共權收證改清己美再採轉更單風切打白教速花帶安場身車例真務具萬每目至達走積示議聲報鬥完類八離華名確才科張信馬節話米整空元況今集溫傳土許步群廣石記需段研界拉林律叫且究觀越織裝影算低持音眾書布復容兒須際商非驗連斷深難近礦千周委素技備半辦青省列習響約支般史感勞便團往酸歷市克何除消構府稱太準精值號率族維劃選標寫存候毛親快效斯院查江型眼王按格養易置派層片始卻專狀育廠京識適屬圓包火住調滿縣局照參紅細引聽該鐵價嚴龍飛'

function filterPool(pool, encoder, label) {
  const unique = [...new Set(pool)]
  const kept = unique.filter((ch) => encoder.canEncode(ch))
  const dropped = unique.filter((ch) => !encoder.canEncode(ch))
  if (dropped.length) console.log('  [' + label + '] 忽略编码表外字符 ' + dropped.length + ' 个：' + dropped.join(''))
  return kept.join('')
}

const SIMPLE_OK = filterPool(SIMPLE_POOL, gbk, 'GBK')
const TRAD_OK = filterPool(TRAD_POOL, big5, 'Big5')

function makeSentence(random, pool) {
  const length = 8 + Math.floor(random() * 11)
  let text = ''
  for (let i = 0; i < length; i++) text += pool[Math.floor(random() * pool.length)]
  const endings = ['，', '，', '。', '。', '；', '？']
  return text + endings[Math.floor(random() * endings.length)]
}

function makeParagraph(random, pool) {
  const count = 5 + Math.floor(random() * 5)
  let text = ''
  for (let i = 0; i < count; i++) text += makeSentence(random, pool)
  if (!text.endsWith('。')) text = text.slice(0, -1) + '。'
  return text
}

const TITLES = [
  '风起', '夜行', '旧渡', '长街', '雪落', '孤灯', '山雨', '归人', '残卷', '灯影',
  '渡口', '远信', '寒江', '薄雾', '空城', '春信', '晚钟', '旧疾', '青石', '白露',
  '纸鸢', '铁马', '秋水', '断桥', '北窗', '松声', '云低', '月出', '无声', '终章',
]

const TITLES_TRAD = [
  '風起', '夜行', '舊渡', '長街', '雪落', '孤燈', '山雨', '歸人', '殘卷', '燈影',
  '渡口', '遠信', '寒江', '薄霧', '空城', '春信', '晚鐘', '舊疾', '青石', '白露',
  '紙鳶', '鐵馬', '秋水', '斷橋', '北窗', '松聲', '雲低', '月出', '無聲', '終章',
]

function buildBook({ chapters, paragraphs, minChars = 0, pool, seed, traditional = false, titles = TITLES }) {
  const random = mulberry32(seed)
  const parts = []
  for (let i = 1; i <= chapters; i++) {
    const title = '第' + cnNum(i) + '章 ' + titles[(i - 1) % titles.length]
    parts.push(title)
    parts.push('')
    let size = title.length + 2
    let count = 0
    while (count < paragraphs || size < minChars) {
      const paragraph = makeParagraph(random, pool)
      parts.push(paragraph)
      parts.push('')
      size += paragraph.length + 1
      count++
      if (minChars > 0 && size >= minChars) break
    }
  }
  return parts.join('\n').replace(/\n+$/, '') + '\n'
}

function buildPlain() {
  const random = mulberry32(97531)
  const parts = []
  for (let i = 0; i < 90; i++) {
    parts.push(makeParagraph(random, SIMPLE_OK))
    parts.push('')
  }
  return parts.join('\n').replace(/\n+$/, '') + '\n'
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function countChars(text) {
  return text.replace(/\s/g, '').length
}

const entries = []
function writeSample(file, text, bytes, encoding, chapterTitles) {
  const full = path.join(outDir, file)
  fs.writeFileSync(full, bytes)
  entries.push({
    file,
    encoding,
    chapters: chapterTitles.length,
    chars: countChars(text),
    sha256: sha256(text),
    titles: chapterTitles,
    bytes: bytes.length,
  })
  console.log(
    '  ' + file.padEnd(22) + String(bytes.length).padStart(9) + ' B  ' +
      encoding.padEnd(9) + ' ' + chapterTitles.length + ' 章  ' + countChars(text) + ' 字',
  )
}

const chapterTitles = (count, traditional = false) => {
  const titles = traditional ? TITLES_TRAD : TITLES
  return Array.from({ length: count }, (_, i) => '第' + cnNum(i + 1) + '章 ' + titles[i % titles.length])
}

console.log('开始生成测试样本…')

const utf8Text = buildBook({ chapters: 30, paragraphs: 5, pool: SIMPLE_OK, seed: 1001 })
writeSample('utf8-30章.txt', utf8Text, Buffer.from(utf8Text, 'utf8'), 'utf-8', chapterTitles(30))

const gbkText = buildBook({ chapters: 30, paragraphs: 4, minChars: Math.ceil(1550000 / 30), pool: SIMPLE_OK, seed: 2002 })
writeSample('gbk-30章.txt', gbkText, gbk.encode(gbkText), 'gb18030', chapterTitles(30))

const plainText = buildPlain()

writeSample('plain-无章节.txt', plainText, Buffer.from(plainText, 'utf8'), 'utf-8', ['全文'])

const big5Text = buildBook({ chapters: 5, paragraphs: 5, pool: TRAD_OK, seed: 3003, traditional: true, titles: TITLES_TRAD })
writeSample('big5-5章.txt', big5Text, big5.encode(big5Text), 'big5', chapterTitles(5, true))

const utf16Text = buildBook({ chapters: 3, paragraphs: 4, pool: SIMPLE_OK, seed: 4004 })
const utf16Bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(utf16Text, 'utf16le')])
writeSample('utf16le-3章.txt', utf16Text, utf16Bytes, 'utf-16le', chapterTitles(3))

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(entries, null, 2) + '\n', 'utf8')
console.log('manifest.json 已写入，共 ' + entries.length + ' 份样本。')
