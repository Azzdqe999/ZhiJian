export function startAiBusy(label: string): void {
  window.dispatchEvent(new CustomEvent('paper:ai-busy', { detail: { busy: true, label } }))
}

export function stopAiBusy(message?: string): void {
  window.dispatchEvent(new CustomEvent('paper:ai-busy', { detail: { busy: false, message } }))
}
