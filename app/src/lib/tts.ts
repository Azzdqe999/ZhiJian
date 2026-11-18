import { Capacitor, registerPlugin } from '@capacitor/core'

type TtsBridge = {
  speak: (options: { text: string; rate?: number }) => Promise<void>
  stop: () => Promise<void>
  isAvailable: () => Promise<{ available: boolean }>
}

const Tts = registerPlugin<TtsBridge>('Tts')

function chunks(text: string, size = 2200): string[] {
  const clean = text.replace(/\r/g, '').trim()
  if (!clean) return []
  const out: string[] = []
  let rest = clean
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n', size)
    if (cut < size * 0.5) cut = Math.max(rest.lastIndexOf('。', size), rest.lastIndexOf('！', size), rest.lastIndexOf('？', size))
    if (cut < size * 0.5) cut = size
    out.push(rest.slice(0, cut + 1))
    rest = rest.slice(cut + 1)
  }
  if (rest.trim()) out.push(rest)
  return out
}

export function ttsSupported(): boolean {
  return (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') || (typeof window !== 'undefined' && 'speechSynthesis' in window)
}

export async function speakTts(text: string, rate = 1): Promise<void> {
  const parts = chunks(text)
  if (!parts.length) throw new Error('没有可朗读的文字')
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    await Tts.stop()
    for (const part of parts) await Tts.speak({ text: part, rate })
    return
  }
  if (!('speechSynthesis' in window)) throw new Error('当前环境不支持朗读')
  window.speechSynthesis.cancel()
  for (const part of parts) {
    const utterance = new SpeechSynthesisUtterance(part)
    utterance.lang = 'zh-CN'
    utterance.rate = rate
    window.speechSynthesis.speak(utterance)
  }
}

export async function stopTts(): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try { await Tts.stop() } catch { /* 插件不可用时忽略 */ }
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
}
