import { useEffect, useRef, useState } from 'react'
import { applyBrightness, supportsBrightness } from '../lib/brightness'

export default function BrightnessEdge() {
  const [value, setValue] = useState(() => {
    const saved = Number(localStorage.getItem('paper-brightness'))
    return Number.isFinite(saved) && saved > 0 ? saved : 0.8
  })
  const [visible, setVisible] = useState(false)
  const drag = useRef<{ y: number; value: number } | null>(null)
  const hideTimer = useRef(0)

  useEffect(() => {
    void applyBrightness(value)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!supportsBrightness()) return null

  const commit = (next: number) => {
    const clamped = Math.max(0.05, Math.min(1, next))
    setValue(clamped)
    localStorage.setItem('paper-brightness', String(clamped))
    void applyBrightness(clamped)
    setVisible(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setVisible(false), 900)
  }

  return (
    <>
      <div
        className="brightness-strip"
        onPointerDown={(event) => {
          drag.current = { y: event.clientY, value }
          setVisible(true)
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* synthetic */ }
        }}
        onPointerMove={(event) => {
          const start = drag.current
          if (!start) return
          const delta = (start.y - event.clientY) / Math.max(200, window.innerHeight * 0.6)
          commit(start.value + delta)
        }}
        onPointerUp={() => {
          drag.current = null
          if (hideTimer.current) window.clearTimeout(hideTimer.current)
          hideTimer.current = window.setTimeout(() => setVisible(false), 700)
        }}
        onPointerCancel={() => { drag.current = null }}
      />
      {visible ? <div className="brightness-hud">{Math.round(value * 100)}%</div> : null}
    </>
  )
}
