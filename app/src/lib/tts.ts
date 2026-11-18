import { Capacitor, registerPlugin } from '@capacitor/core'

type TtsBridge = {
  speak: (options: { text: string; rate?: number }) => Promise<void>
  stop: () => Promise<void>
  isAvailable: () => Promise<{ available: boolean }>
}

type EdgeBridge = {
  synthesize: (options: { text: string; voice?: string; rate?: string }) => Promise<string>
}

type Handlers = {
  onSegment?: (index: number) => void
  onDone?: () => void
  onError?: (error: Error) => void
}

declare global {
  interface Window {
    paperTts?: EdgeBridge
  }
}

const Tts = registerPlugin<TtsBridge>('Tts')
let current: TtsPlayer | null = null
let currentAudio: HTMLAudioElement | null = null

export function ttsSupported(): boolean {
  if (Capacitor.isNativePlatform()) return false
  return Boolean(typeof window !== 'undefined' && window.paperTts)
}

function edgeRate(rate: number): string {
  const value = Math.round((rate - 1) * 100)
  return (value >= 0 ? '+' : '') + value + '%'
}

function speakWeb(text: string, rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = rate
    utterance.onend = () => resolve()
    utterance.onerror = (event) => reject(new Error(String(event.error || '朗读失败')))
    window.speechSynthesis.speak(utterance)
  })
}

async function synthesizeEdge(text: string, rate: number): Promise<HTMLAudioElement> {
  if (!window.paperTts) throw new Error('Edge TTS 不可用')
  const base64 = await window.paperTts.synthesize({
    text,
    voice: 'zh-CN-XiaoyiNeural',
    rate: edgeRate(rate),
  })
  const audio = new Audio('data:audio/mpeg;base64,' + base64)
  audio.preload = 'auto'
  return audio
}

function playAudio(audio: HTMLAudioElement): Promise<void> {
  currentAudio = audio
  return new Promise((resolve, reject) => {
    audio.onended = () => { if (currentAudio === audio) currentAudio = null; resolve() }
    audio.onerror = () => { if (currentAudio === audio) currentAudio = null; reject(new Error('音频播放失败')) }
    void audio.play().catch(reject)
  })
}

export class TtsPlayer {
  private stopped = true
  private sequence = 0

  get active(): boolean {
    return !this.stopped
  }

  async play(segments: string[], start: number, rate: number, handlers: Handlers = {}): Promise<void> {
    current?.stop()
    current = this
    this.stopped = false
    const run = ++this.sequence
    try {
      if (window.paperTts && !Capacitor.isNativePlatform()) {
        let next: Promise<HTMLAudioElement> | null = null
        for (let index = Math.max(0, start); index < segments.length; index++) {
          if (this.stopped || run !== this.sequence) return
          const text = segments[index].trim()
          if (!text) continue
          handlers.onSegment?.(index)
          if (!next) next = synthesizeEdge(text, rate)
          const audio = await next
          next = index + 1 < segments.length ? synthesizeEdge(segments[index + 1].trim(), rate) : null
          if (this.stopped || run !== this.sequence) return
          await playAudio(audio)
        }
        if (!this.stopped && run === this.sequence) handlers.onDone?.()
        return
      }

      for (let index = Math.max(0, start); index < segments.length; index++) {
        if (this.stopped || run !== this.sequence) return
        const text = segments[index].trim()
        if (!text) continue
        handlers.onSegment?.(index)
        if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
          await Tts.speak({ text, rate })
        } else {
          await speakWeb(text, rate)
        }
      }
      if (!this.stopped && run === this.sequence) handlers.onDone?.()
    } catch (error) {
      if (!this.stopped && run === this.sequence) handlers.onError?.(error instanceof Error ? error : new Error(String(error)))
    } finally {
      if (run === this.sequence) {
        this.stopped = true
        if (current === this) current = null
      }
    }
  }

  stop(): void {
    this.stopped = true
    this.sequence += 1
    if (current === this) current = null
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.src = ''
      currentAudio = null
    }
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      void Tts.stop().catch(() => {})
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }
}

export async function stopTts(): Promise<void> {
  current?.stop()
  current = null
}
