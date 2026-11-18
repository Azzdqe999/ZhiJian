import { Capacitor, registerPlugin } from '@capacitor/core'

type PaperKeysBridge = {
  setEnabled: (options: { enabled: boolean }) => Promise<void>
}

const PaperKeys = registerPlugin<PaperKeysBridge>('PaperKeys')

export function supportsVolumePaging(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function setVolumePaging(enabled: boolean): Promise<void> {
  if (!supportsVolumePaging()) return
  try {
    await PaperKeys.setEnabled({ enabled })
  } catch {
    /* 插件不可用时不影响阅读 */
  }
}
