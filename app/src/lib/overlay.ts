type OverlayPayload = {
  title: string
  prev: string
  current: string
  next: string
  paused: boolean
}

declare global {
  interface Window {
    paperOverlay?: {
      update: (payload: OverlayPayload) => Promise<boolean>
      hide: () => Promise<boolean>
      onAction: (callback: (action: string) => void) => () => void
    }
  }
}

export type { OverlayPayload }

export function supportsTtsOverlay(): boolean {
  return typeof window !== 'undefined' && Boolean(window.paperOverlay)
}
