import { useEffect, useRef, useState } from 'react'
import { NOTE_COLORS, parseTags } from '../lib/notes'
import type { Character, NoteColor } from '../lib/types'

export type NoteEditorValues = {
  color: NoteColor
  note: string
  tags: string[]
  characterIds: string[]
}

type NoteEditorProps = {
  mode: 'create' | 'edit'
  quote: string
  chapterTitle: string
  initialColor: NoteColor
  initialNote: string
  initialTags: string[]
  initialCharacterIds?: string[]
  characters?: Character[]
  focusTag?: boolean
  onSave: (values: NoteEditorValues) => void
  onDelete?: () => void
  onClose: () => void
}

export default function NoteEditor({
  mode,
  quote,
  chapterTitle,
  initialColor,
  initialNote,
  initialTags,
  initialCharacterIds,
  characters = [],
  focusTag,
  onSave,
  onDelete,
  onClose,
}: NoteEditorProps) {
  const [color, setColor] = useState<NoteColor>(initialColor)
  const [note, setNote] = useState(initialNote)
  const [tagsText, setTagsText] = useState(initialTags.join(' '))
  const [characterIds, setCharacterIds] = useState<string[]>(initialCharacterIds || [])
  const noteRef = useRef<HTMLTextAreaElement | null>(null)
  const tagRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const target = focusTag ? tagRef.current : noteRef.current
    if (target) window.setTimeout(() => target.focus(), 30)
  }, [focusTag])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onSave({ color, note, tags: parseTags(tagsText), characterIds })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [color, note, tagsText, characterIds, onClose, onSave])

  const colors = NOTE_COLORS.map((item) => (
    <button
      key={item.key}
      type="button"
      className={'swatch' + (color === item.key ? ' is-on' : '')}
      style={{ ['--swatch' as string]: item.hex }}
      title={item.label}
      onClick={() => setColor(item.key)}
    >
      <span />
      <em>{item.label}</em>
    </button>
  ))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal note-editor" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">{mode === 'create' ? '添加笔记' : '编辑笔记'}</div>
            <h2>{chapterTitle || '未标注章节'}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>关闭</button>
        </div>

        <blockquote className="note-quote">{quote}</blockquote>

        <div className="field">
          <label>颜色</label>
          <div className="swatch-row">{colors}</div>
        </div>

        <div className="field">
          <label htmlFor="note-text">批注</label>
          <textarea
            id="note-text"
            ref={noteRef}
            className="textarea"
            rows={4}
            value={note}
            placeholder="写下此刻的想法…"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="note-tags">标签</label>
          <input
            id="note-tags"
            ref={tagRef}
            className="text-input"
            value={tagsText}
            placeholder="用空格或逗号分隔，如：山雨 开篇"
            onChange={(event) => setTagsText(event.target.value)}
          />
          <p className="field-hint">标签会随笔记一起导出到 Markdown。</p>
        </div>

        {characters.length > 0 && (
          <div className="field">
            <label>关联人物</label>
            <div className="char-pick-row">
              {characters.map((character) => {
                const active = characterIds.includes(character.id)
                return (
                  <button
                    key={character.id}
                    type="button"
                    className={'chip' + (active ? ' is-on' : '')}
                    onClick={() =>
                      setCharacterIds((current) =>
                        current.includes(character.id) ? current.filter((id) => id !== character.id) : [...current, character.id],
                      )
                    }
                  >
                    {character.name}
                  </button>
                )
              })}
            </div>
            <p className="field-hint">关联后，这条笔记会出现在人物档案的「相关笔记」里。</p>
          </div>
        )}

        <div className="modal-actions">
          <div className="editor-left">
            {mode === 'edit' && onDelete && (
              <button className="btn danger" onClick={onDelete}>删除笔记</button>
            )}
          </div>
          <div className="editor-right">
            <button className="btn" onClick={onClose}>取消</button>
            <button
              className="btn solid"
              onClick={() => onSave({ color, note, tags: parseTags(tagsText), characterIds })}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
