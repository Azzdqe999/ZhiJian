import { Capacitor, registerPlugin } from '@capacitor/core'

type BrightnessBridge = {
  set: (options: { value: number }) => Promise<void>
}

const Brightness = registerPlugin<BrightnessBridge>('PaperBrightness')

export function supportsBrightness(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function applyBrightness(value: number): Promise<void> {
  if (!supportsBrightness()) return
  try {
    await Brightness.set({ value })
  } catch {
    /* 插件不可用时忽略 */
  }
}
