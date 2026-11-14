import type { FontFamily } from './types'

export const FONT_OPTIONS: Array<{ key: FontFamily; label: string; stack: string }> = [
  { key: 'serif', label: '宋', stack: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif' },
  { key: 'sans', label: '黑', stack: '"Inter", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif' },
  { key: 'kai', label: '楷', stack: '"Kaiti SC", "STKaiti", KaiTi, "Noto Serif SC", serif' },
]

export function fontStack(key: FontFamily): string {
  return (FONT_OPTIONS.find((item) => item.key === key) ?? FONT_OPTIONS[0]).stack
}

export function fontLabel(key: FontFamily): string {
  return (FONT_OPTIONS.find((item) => item.key === key) ?? FONT_OPTIONS[0]).label
}
