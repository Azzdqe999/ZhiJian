import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookMap, Character, MapPin } from '../lib/types'
import { deleteBookMap, deleteMapPin, listBookMaps, listMapPins, putBookMap, putMapPin } from '../lib/store'
import { useObjectUrl } from '../lib/objectUrl'

type Props = {
  bookId: string
  bookTitle: string
  places: Character[]
  onOpenPlace: (id: string) => void
  onClose: () => void
}

function MapThumb({ map, active, onClick }: { map: BookMap; active: boolean; onClick: () => void }) {
  const url = useObjectUrl(map.blob)
  return (
    <button className={'map-thumb' + (active ? ' is-active' : '')} onClick={onClick} title={map.title}>
      {url ? <img src={url} alt={map.title} /> : null}
    </button>
  )
}

export default function MapViewer({ bookId, bookTitle, places, onOpenPlace, onClose }: Props) {
  const [maps, setMaps] = useState<BookMap[]>([])
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const pinDragRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const suppressPinClick = useRef(false)
  const [pins, setPins] = useState<MapPin[]>([])
  const [pinPlaceId, setPinPlaceId] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const current = maps[index]
  const url = useObjectUrl(current?.blob ?? null)

  const reload = useCallback(async () => {
    const rows = await listBookMaps(bookId)
    setMaps(rows)
    setIndex((value) => Math.min(value, Math.max(0, rows.length - 1)))
  }, [bookId])

  const reloadPins = useCallback(async () => {
    if (!current) {
      setPins([])
      return
    }
    setPins(await listMapPins(current.id))
  }, [current?.id])

  useEffect(() => {
    void reload()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reload, onClose])

  useEffect(() => {
    void reloadPins()
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [reloadPins])

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const now = Date.now()
      await putBookMap({
        id: 'map_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        bookId,
        title: file.name.replace(/\.[^.]+$/, ''),
        blob: file,
        createdAt: now,
        updatedAt: now,
      })
    }
    await reload()
  }

  const removeCurrent = async () => {
    if (!current) return
    await deleteBookMap(current.id)
    await reload()
  }

  const addPin = async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!current || !pinPlaceId) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    if (x < 0 || y < 0 || x > 100 || y > 100) return
    const place = places.find((item) => item.id === pinPlaceId)
    await putMapPin({
      id: 'pin_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
      mapId: current.id,
      placeId: pinPlaceId,
      x,
      y,
      label: place?.name || '',
    })
    await reloadPins()
  }

  const removePin = async (pin: MapPin) => {
    await deleteMapPin(pin.id)
    await reloadPins()
  }

  return (
    <div className="map-overlay" onClick={onClose}>
      <div className="map-panel" onClick={(event) => event.stopPropagation()}>
        <header className="map-head">
          <div>
            <div className="map-title">世界观地图</div>
            <div className="map-sub">《{bookTitle}》 · {maps.length} 张图 · {pins.length} 个标记</div>
          </div>
          <div className="map-actions">
            <button className="btn small" onClick={() => inputRef.current?.click()}>上传地图</button>
            <button className="btn small" onClick={() => setZoom((value) => Math.max(0.5, value - 0.2))}>−</button>
            <span className="setting-value">{Math.round(zoom * 100)}%</span>
            <button className="btn small" onClick={() => setZoom((value) => Math.min(4, value + 0.2))}>+</button>
            <button className="btn small" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>1:1</button>
            {current ? <button className="btn small" onClick={() => void removeCurrent()}>删除这张</button> : null}
            <button className="btn small" onClick={onClose}>关闭</button>
          </div>
        </header>

        <div className="map-body">
          <aside className="map-places">
            <div className="map-places-title">地名 · 选一个再点地图</div>
            {places.length ? places.map((place) => (
              <button
                key={place.id}
                className={'map-place' + (pinPlaceId === place.id ? ' is-active' : '')}
                onClick={() => setPinPlaceId(pinPlaceId === place.id ? '' : place.id)}
              >
                <span className="map-place-dot" style={{ background: place.color }} />
                {place.name}
              </button>
            )) : <p className="muted">还没有地名。去「人物」页新建地名后就能在这里标注。</p>}
          </aside>

          <div
            className={'map-stage' + (pinPlaceId ? ' is-pinning' : '')}
            onClick={(event) => void addPin(event)}
            onPointerDown={(event) => {
              if (pinPlaceId) return
              dragRef.current = { x: event.clientX, y: event.clientY, ox: pan.x, oy: pan.y }
              try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* synthetic events */ }
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current
              if (!drag) return
              setPan({ x: drag.ox + event.clientX - drag.x, y: drag.oy + event.clientY - drag.y })
            }}
            onPointerUp={() => { dragRef.current = null }}
            onPointerCancel={() => { dragRef.current = null }}
          >
            {url ? (
              <div className="map-canvas" ref={canvasRef} style={{ transform: 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + zoom + ')' }}>
                <img src={url} alt={current?.title || '地图'} draggable={false} />
                {pins.map((pin) => (
                  <button
                    key={pin.id}
                    className="map-pin"
                    style={{ left: pin.x + '%', top: pin.y + '%' }}
                    title={pin.label + '（右键删除）'}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (suppressPinClick.current) { suppressPinClick.current = false; return }
                      onOpenPlace(pin.placeId)
                    }}
                    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); void removePin(pin) }}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      pinDragRef.current = { id: pin.id, x: pin.x, y: pin.y }
                      suppressPinClick.current = false
                      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* synthetic */ }
                    }}
                    onPointerMove={(event) => {
                      const drag = pinDragRef.current
                      if (!drag || drag.id !== pin.id) return
                      const rect = canvasRef.current?.getBoundingClientRect()
                      if (!rect) return
                      const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))
                      const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
                      if (Math.abs(x - drag.x) > 0.4 || Math.abs(y - drag.y) > 0.4) suppressPinClick.current = true
                      drag.x = x
                      drag.y = y
                      setPins((value) => value.map((item) => (item.id === drag.id ? { ...item, x, y } : item)))
                    }}
                    onPointerUp={() => {
                      const drag = pinDragRef.current
                      pinDragRef.current = null
                      if (!drag) return
                      const current = pins.find((item) => item.id === drag.id)
                      if (!current) return
                      void putMapPin({ ...current, x: drag.x, y: drag.y, updatedAt: Date.now() }).then(reloadPins)
                    }}
                  >
                    <span>{pin.label.slice(0, 1)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="map-empty">
                <div className="empty-mark">图</div>
                <h2>还没有地图</h2>
                <p>上传一张世界观地图，阅读时点「地图」就能随时查看。</p>
                <button className="btn solid" onClick={() => inputRef.current?.click()}>选择图片</button>
              </div>
            )}
          </div>
        </div>

        {maps.length ? (
          <div className="map-strip">
            {maps.map((map, i) => (
              <MapThumb key={map.id} map={map} active={i === index} onClick={() => setIndex(i)} />
            ))}
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => { void addFiles(event.target.files); event.target.value = '' }}
        />
      </div>
    </div>
  )
}
