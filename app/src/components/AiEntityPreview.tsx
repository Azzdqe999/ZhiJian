import { useState } from 'react'
import type { AiCharacter } from '../lib/ai'

type Props = {
  kind: 'character' | 'place'
  items: AiCharacter[]
  onCancel: () => void
  onConfirm: (items: AiCharacter[]) => void
}

export default function AiEntityPreview({ kind, items, onCancel, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(items.map((_, index) => index)))
  const toggle = (index: number) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }
  const allOn = selected.size === items.length

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal ai-preview" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">AI 识别结果</div>
            <h2>{kind === 'place' ? '地名' : '人物'} · {items.length} 个</h2>
            <p className="modal-sub">先确认再入库，取消勾选可以跳过误识别。</p>
          </div>
          <button className="modal-close" onClick={onCancel}>关闭</button>
        </div>
        <div className="ai-preview-list">
          {items.map((item, index) => (
            <label className="ai-preview-row" key={item.name + '-' + index}>
              <input type="checkbox" checked={selected.has(index)} onChange={() => toggle(index)} />
              <span className="ai-preview-main">
                <strong>{item.name}</strong>
                {item.aliases.length ? <em>{item.aliases.join('、')}</em> : null}
                {item.role ? <small>{item.role}</small> : null}
                {item.bio ? <small>{item.bio}</small> : null}
              </span>
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn small" onClick={() => setSelected(allOn ? new Set() : new Set(items.map((_, index) => index)))}>
            {allOn ? '全不选' : '全选'}
          </button>
          <div className="setting-inline">
            <button className="btn" onClick={onCancel}>取消</button>
            <button
              className="btn solid"
              disabled={!selected.size}
              onClick={() => onConfirm(items.filter((_, index) => selected.has(index)))}
            >
              加入{kind === 'place' ? '地名库' : '人物库'}（{selected.size}）
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
