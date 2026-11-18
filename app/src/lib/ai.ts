import type { AiConfig } from './types'
import { getAiConfig, saveAiConfig } from './store'

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

export const AI_MODELS = [
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'qwen2.5:7b',
  'qwen2.5:14b',
  'qwen3:4b',
  'qwen3:8b',
  'llama3.2:3b',
  'deepseek-chat',
]

export const AI_PRESETS: Record<AiConfig['provider'], { label: string; baseUrl: string; model: string }> = {
  gemini: {
    label: 'Gemini（免费层）',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.8-flash',
  },
  ollama: {
    label: '本地 Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:7b',
  },
  lmstudio: {
    label: '本地 LM Studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'qwen2.5-7b-instruct',
  },
  custom: {
    label: 'OpenAI 兼容',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
}

export const EMPTY_AI: AiConfig = {
  provider: 'gemini',
  baseUrl: AI_PRESETS.gemini.baseUrl,
  model: AI_PRESETS.gemini.model,
  apiKey: '',
}

function endpoint(config: AiConfig): string {
  return config.baseUrl.replace(/\/+$/, '') + '/chat/completions'
}

function decodeBody(body: Uint8Array | ArrayBuffer | null): string {
  if (!body) return ''
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body)
  return new TextDecoder().decode(body)
}

async function postJson(config: AiConfig, payload: unknown): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey.trim()) headers.Authorization = 'Bearer ' + config.apiKey.trim()
  const body = JSON.stringify(payload)
  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error('AI 请求超时，本地模型可换更小的分段或模型')), 120000)
  })
  if (window.paperSync) {
    const res = await Promise.race([
      window.paperSync.request({ method: 'POST', url: endpoint(config), headers, body }),
      timeout,
    ])
    return { status: res.status, text: decodeBody(res.body) }
  }
  const res = await Promise.race([
    fetch(endpoint(config), { method: 'POST', headers, body }),
    timeout,
  ])
  return { status: res.status, text: await res.text() }
}

export async function loadAiConfig(): Promise<AiConfig> {
  const saved = await getAiConfig()
  return { ...EMPTY_AI, ...(saved || {}) }
}

export async function persistAiConfig(config: AiConfig): Promise<void> {
  await saveAiConfig(config)
}

export async function chat(config: AiConfig, messages: Array<{ role: string; content: string }>): Promise<string> {
  const res = await postJson(config, { model: config.model, messages, temperature: 0.2, max_tokens: 900 })
  if (res.status < 200 || res.status >= 300) {
    throw new Error('AI 请求失败（HTTP ' + res.status + '）：' + res.text.slice(0, 200))
  }
  let data: { choices?: Array<{ message?: { content?: string } }> }
  try {
    data = JSON.parse(res.text)
  } catch {
    throw new Error('AI 返回的不是 JSON：' + res.text.slice(0, 200))
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('AI 没有返回内容')
  return content
}

export async function listAiModels(config: AiConfig): Promise<string[]> {
  const base = config.baseUrl.replace(/\/+$/, '')
  const urls = [base + '/models']
  if (base.includes(':11434')) urls.unshift(base.replace(/\/v1$/, '') + '/api/tags')
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: config.apiKey.trim() ? { Authorization: 'Bearer ' + config.apiKey.trim() } : {} })
      if (!res.ok) continue
      const data = (await res.json()) as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> }
      const names = data.data?.map((item) => item.id).filter((item): item is string => Boolean(item)) || data.models?.map((item) => item.name).filter((item): item is string => Boolean(item)) || []
      if (names.length) return [...new Set(names)].sort()
    } catch {
      /* 尝试下一个地址 */
    }
  }
  return []
}

export async function analyzeCharacter(
  config: AiConfig,
  character: { name: string; aliases: string[]; role: string; bio: string; tags: string[] },
  notes: Array<{ text: string; note?: string; chapterTitle?: string }>,
  bookTitle?: string,
): Promise<string> {
  const material = [
    bookTitle ? '书名：' + bookTitle : '',
    '人物：' + character.name,
    '别名：' + (character.aliases.join('、') || '暂无'),
    '身份：' + (character.role || '未写'),
    '标签：' + (character.tags.join('、') || '暂无'),
    '简介：' + (character.bio || '暂无'),
    '相关笔记：',
    ...notes.slice(0, 12).map((note) => '- [' + (note.chapterTitle || '') + '] ' + (note.note || note.text).slice(0, 160)),
  ].join('\n')
  return (await chat(config, [
    { role: 'system', content: '你是小说人物分析助手。只根据给出的资料分析，不要编造资料里没有的情节。资料不足时明确说“资料不足”。' },
    { role: 'user', content: material + '\n\n请输出：1. 角色定位；2. 性格与动机；3. 人物关系；4. 剧情作用；5. 资料缺口或前后矛盾。用简洁中文，不超过 400 字。' },
  ])).trim()
}

export async function summarizeChapter(config: AiConfig, title: string, text: string): Promise<string> {
  const clipped = text.slice(0, 9000)
  const content = await chat(config, [
    { role: 'system', content: '你是小说阅读助手。用简洁中文概括本章剧情，保留关键人物和事件，不推测后文，不剧透。控制在 250 字以内。' },
    { role: 'user', content: '章节：' + title + '\n\n' + clipped },
  ])
  return content.trim()
}

export async function askBook(config: AiConfig, question: string, context: string): Promise<string> {
  const content = await chat(config, [
    {
      role: 'system',
      content: '你是小说阅读助手。只根据用户提供的正文回答，不要编造正文里没有的情节。如果正文不足以回答，就直接说“当前章节没有提到”，不要猜。回答用简洁中文，必要时引用原文短句。',
    },
    { role: 'user', content: '参考资料：\n' + context.slice(0, 9000) + '\n\n问题：' + question },
  ])
  return content.trim()
}

export async function testAi(config: AiConfig): Promise<string> {
  return chat(config, [{ role: 'user', content: '只回复两个字：可用' }])
}

export type AiCharacter = {
  name: string
  aliases: string[]
  role: string
  bio: string
}

function bookContext(context?: { bookTitle?: string; chapterTitle?: string }): string {
  if (!context) return ''
  const parts = []
  if (context.bookTitle) parts.push('书名：《' + context.bookTitle + '》')
  if (context.chapterTitle) parts.push('章节：' + context.chapterTitle)
  return parts.length ? parts.join('；') + '\n' : ''
}

type EntityKind = 'character' | 'place'

function splitChunks(input: string, size = 6000, maxChunks = 10): string[] {
  const text = input.replace(/\r/g, '')
  if (text.length <= size * 1.4) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length && chunks.length < maxChunks) {
    let end = Math.min(text.length, start + size)
    if (end < text.length) {
      const slice = text.slice(start, end)
      const cut = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('。'), slice.lastIndexOf('！'), slice.lastIndexOf('？'))
      if (cut > size * 0.5) end = start + cut + 1
    }
    chunks.push(text.slice(start, end))
    start = end
  }
  return chunks.filter((chunk) => chunk.trim().length > 0)
}

type EntityContext = {
  bookTitle?: string
  chapterTitle?: string
  knownCharacters?: string[]
  knownPlaces?: string[]
}

function promptFor(kind: EntityKind, text: string, context?: EntityContext): string {
  const common = [
    bookContext(context),
    '你是中文小说编辑。这一段只是整章的一部分，请只根据这一段抽取，但要把这一段里的人名/地名**尽量找全，宁多勿漏**。',
  ]
  if (kind === 'character') {
    common.push(
      '任务：找出这一段里所有“有称呼的角色”，包括姓名、小名、绰号、道号、封号、以及被当作称呼反复使用的称谓（如“谢先生”“船家”）。',
      '不要抽：纯代词（他/她/它）、只出现一次且没有称呼的路人、地名、组织名、器物名。',
      '规则：',
      '1. 名字照抄原文，不要改写；',
      '2. 同一角色的不同称呼合并进 aliases，主名选最常用的全名；',
      '3. 拿不准但像人名的也列出，不要因为不确定就漏掉；',
      '4. 身份/关系只写这一段能支撑的，不要编造。',
    )
  } else {
    common.push(
      '任务：找出这一段里所有“有专名的地点”，包括城池、山川、河流、渡口、门派驻地、建筑、区域。',
      '不要抽：普通名词（这里/远处/城里）、组织名、器物名、人物名。',
      '规则：',
      '1. 地名照抄原文，不要改写；',
      '2. 同一地点的不同称呼合并进 aliases；',
      '3. 拿不准但像地名的也列出，不要因为不确定就漏掉。',
    )
  }
  if (kind === 'place' && context?.knownCharacters?.length) {
    common.push('以下已经是人物/称呼，绝对不要标成地名：' + context.knownCharacters.slice(0, 80).join('、'))
  }
  if (kind === 'character' && context?.knownPlaces?.length) {
    common.push('以下已经是地名，绝对不要标成人物：' + context.knownPlaces.slice(0, 80).join('、'))
  }
  common.push(
    '只输出 JSON：{"characters":[{"name":"名称","aliases":["别称"],"role":"身份/类型","bio":"一句话说明"}]}',
    '正文：',
    text,
  )
  return common.join('\n')
}

function parseEntities(content: string): AiCharacter[] {
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0]) as { characters?: AiCharacter[] }
    if (!Array.isArray(parsed.characters)) return []
    return parsed.characters
      .filter((item) => item && typeof item.name === 'string' && item.name.trim())
      .map((item) => ({
        name: item.name.trim(),
        aliases: Array.isArray(item.aliases) ? item.aliases.filter((alias) => typeof alias === 'string' && alias.trim()).map((alias) => alias.trim()) : [],
        role: typeof item.role === 'string' ? item.role.trim() : '',
        bio: typeof item.bio === 'string' ? item.bio.trim() : '',
      }))
  } catch {
    return []
  }
}

function mergeEntities(map: Map<string, AiCharacter>, list: AiCharacter[]): void {
  for (const item of list) {
    const key = item.name.toLowerCase()
    let found = map.get(key)
    if (!found) {
      for (const value of map.values()) {
        if (value.aliases.includes(item.name) || item.aliases.includes(value.name)) {
          found = value
          break
        }
      }
    }
    if (!found) {
      map.set(key, { ...item, aliases: [...new Set(item.aliases.filter((alias) => alias !== item.name))] })
      continue
    }
    found.aliases = [...new Set([...found.aliases, ...item.aliases, item.name].filter((alias) => alias && alias !== found!.name))]
    if (!found.role && item.role) found.role = item.role
    if (item.bio.length > found.bio.length) found.bio = item.bio
  }
}

async function extractOnce(
  config: AiConfig,
  kind: EntityKind,
  text: string,
  context?: EntityContext,
): Promise<AiCharacter[]> {
  const content = await chat(config, [
    { role: 'system', content: '你只输出可解析的 JSON，不写解释。' },
    { role: 'user', content: promptFor(kind, text, context) },
  ])
  return parseEntities(content)
}

async function extractEntities(
  config: AiConfig,
  kind: EntityKind,
  text: string,
  context?: EntityContext,
): Promise<AiCharacter[]> {
  const local = config.provider === 'ollama' || config.provider === 'lmstudio'
  const chunks = splitChunks(text, local ? 2400 : 6000, local ? 1 : 10)
  const merged = new Map<string, AiCharacter>()
  for (const chunk of chunks) {
    const list = await extractOnce(config, kind, chunk, context)
    mergeEntities(merged, list)
  }
  const blocked = (kind === 'place' ? context?.knownCharacters : context?.knownPlaces) || []
  const blockedSet = new Set(blocked.map((name) => name.trim().toLowerCase()))
  return [...merged.values()].filter((item) => {
    if (blockedSet.has(item.name.trim().toLowerCase())) return false
    return !item.aliases.some((alias) => blockedSet.has(alias.trim().toLowerCase()))
  })
}

export async function extractPlaces(
  config: AiConfig,
  text: string,
  context?: EntityContext,
): Promise<AiCharacter[]> {
  return extractEntities(config, 'place', text, context)
}

export async function extractCharacters(
  config: AiConfig,
  text: string,
  context?: EntityContext,
): Promise<AiCharacter[]> {
  return extractEntities(config, 'character', text, context)
}

export type EntityClassification = {
  kind: 'character' | 'place' | 'other' | 'unknown'
  reason: string
}

export async function classifyEntity(
  config: AiConfig,
  name: string,
  context: { bookTitle?: string; chapterTitle?: string; excerpt?: string },
): Promise<EntityClassification> {
  const content = await chat(config, [
    { role: 'system', content: '你是中文小说实体分类器。只输出 JSON，不写解释。' },
    {
      role: 'user',
      content: [
        '书名：' + (context.bookTitle || '未知'),
        '章节：' + (context.chapterTitle || '未知'),
        '待判断名称：' + name,
        '上下文：' + (context.excerpt || '').slice(0, 1200),
        '请判断它是“人物/称呼”“地名”“其他专名”还是“无法判断”。',
        '只输出：{"kind":"character|place|other|unknown","reason":"一句话依据"}',
      ].join('\n'),
    },
  ])
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) return { kind: 'unknown', reason: content.slice(0, 120) }
  try {
    const parsed = JSON.parse(match[0]) as { kind?: string; reason?: string }
    const kind = parsed.kind === 'character' || parsed.kind === 'place' || parsed.kind === 'other' ? parsed.kind : 'unknown'
    return { kind, reason: String(parsed.reason || '').slice(0, 200) }
  } catch {
    return { kind: 'unknown', reason: content.slice(0, 120) }
  }
}
