let cancelled = false

export function startAiBusy(label: string): void {
  cancelled = false
  window.dispatchEvent(new CustomEvent('paper:ai-busy', { detail: { busy: true, label } }))
}

export function stopAiBusy(message?: string): void {
  window.dispatchEvent(new CustomEvent('paper:ai-busy', { detail: { busy: false, message } }))
}

export function cancelAiBusy(): void {
  cancelled = true
  window.dispatchEvent(new CustomEvent('paper:ai-busy', { detail: { busy: false, cancelled: true } }))
}

export function isAiCancelled(): boolean {
  return cancelled
}
