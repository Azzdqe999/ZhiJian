type PaperWindowBridge = {
  setAlwaysOnTop: (value: boolean) => Promise<boolean>
  getAlwaysOnTop: () => Promise<boolean>
}

declare global {
  interface Window {
    paperWindow?: PaperWindowBridge
  }
}

export function supportsAlwaysOnTop(): boolean {
  return typeof window !== 'undefined' && Boolean(window.paperWindow)
}

export async function getAlwaysOnTop(): Promise<boolean> {
  if (!window.paperWindow) return false
  try {
    return await window.paperWindow.getAlwaysOnTop()
  } catch {
    return false
  }
}

export async function setAlwaysOnTop(value: boolean): Promise<boolean> {
  if (!window.paperWindow) return false
  try {
    return await window.paperWindow.setAlwaysOnTop(value)
  } catch {
    return false
  }
}
