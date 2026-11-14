import { useEffect } from 'react'
import type { CharacterImage } from '../lib/types'
import { useObjectUrl } from '../lib/objectUrl'

type Props = {
  title: string
  images: CharacterImage[]
  index: number
  onClose: () => void
  onChange: (index: number) => void
  onDelete: (imageId: string) => void
}

export default function ImageLightbox({ title, images, index, onClose, onChange, onDelete }: Props) {
  const image = images[index] || null
  const url = useObjectUrl(image ? image.blob : null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && index > 0) onChange(index - 1)
      if (event.key === 'ArrowRight' && index < images.length - 1) onChange(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onClose, onChange])

  if (!image) return null

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-inner" onClick={(event) => event.stopPropagation()}>
        <div className="lightbox-head">
          <span className="lightbox-title">{title} · 第 {index + 1} / {images.length} 张</span>
          <button className="lightbox-close" onClick={onClose}>关闭</button>
        </div>
        <div className="lightbox-stage">
          <button className="lightbox-nav" disabled={index <= 0} onClick={() => onChange(index - 1)}>←</button>
          <img src={url || ''} alt={image.caption || title} />
          <button className="lightbox-nav" disabled={index >= images.length - 1} onClick={() => onChange(index + 1)}>→</button>
        </div>
        <div className="lightbox-foot">
          <span>{image.caption || '未命名插画'}</span>
          <button className="btn danger small" onClick={() => onDelete(image.id)}>删除这张</button>
        </div>
      </div>
    </div>
  )
}
