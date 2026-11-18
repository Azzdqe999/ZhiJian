import { Capacitor, registerPlugin } from '@capacitor/core'

type TtsBridge = {
  speak: (options: { text: string; rate?: number }) => Promise<void>
  stop: () => Promise<void>
  isAvailable: () => Promise<{ available: boolean }>
}

type Handlers = {
  onSegment?: (index: number) => void
  onDone?: () => void
  onError?: (error: Error) => void
}

const Tts = registerPlugin<TtsBridge>('Tts')
let current: TtsPlayer | null = null

export function ttsSupported(): boolean {
  return (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') || (typeof window !== 'undefined' && 'speechSynthesis' in window)
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
