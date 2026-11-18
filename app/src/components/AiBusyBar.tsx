import { useEffect, useRef, useState } from 'react'

export default function AiBusyBar() {
  const [state, setState] = useState<{ label: string; startedAt: number } | null>(null)
  const [seconds, setSeconds] = useState(0)
  const timer = useRef(0)

  useEffect(() => {
    const onBusy = (event: Event) => {
      const detail = (event as CustomEvent<{ busy?: boolean; label?: string }>).detail
      if (detail?.busy) {
        setState({ label: detail.label || 'AI 处理中', startedAt: Date.now() })
        setSeconds(0)
        return
      }
      setState(null)
    }
    window.addEventListener('paper:ai-busy', onBusy)
    return () => window.removeEventListener('paper:ai-busy', onBusy)
  }, [])

  useEffect(() => {
    if (!state) return
    timer.current = window.setInterval(() => {
      setSeconds(Math.max(0, Math.round((Date.now() - state.startedAt) / 1000)))
    }, 500)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [state])

  if (!state) return null

  return (
    <div className="ai-busy-bar">
      <span className="spinner" />
      <span>{state.label}</span>
      <span className="ai-busy-time">{seconds}s</span>
      <span className="ai-busy-hint">本地模型可能较慢，请稍候</span>
    </div>
  )
}
