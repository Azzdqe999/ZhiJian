import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { BookMeta, Character, CharacterImage } from '../lib/types'
import { CHARACTER_COLORS, DEFAULT_CHARACTER_COLOR, initialsOf, parseAliases, parseCharacterTags } from '../lib/characters'
import { imageFilesFromDataTransfer } from '../lib/images'
import { useObjectUrl } from '../lib/objectUrl'

export type CharacterDraft = {
  bookId: string
  kind: 'character' | 'place'
  name: string
  aliases: string[]
  role: string
  bio: string
  tags: string[]
  color: string
  avatarImageId?: string
  avatarFile?: File
}

type Props = {
  mode: 'create' | 'edit'
  initial?: Character | null
  prefillName?: string
  bookId: string
  kind?: 'character' | 'place'
  books: BookMeta[]
  images: CharacterImage[]
  onSave: (draft: CharacterDraft) => void
  onDelete?: () => void
  onClose: () => void
}

export default function CharacterEditor({ mode, initial, prefillName, bookId, books, images, onSave, onDelete, onClose, kind }: Props) {
  const [entryKind, setEntryKind] = useState<'character' | 'place'>(initial?.kind || kind || 'character')
  const [name, setName] = useState(initial?.name || prefillName || '')
  const [aliases, setAliases] = useState((initial?.aliases || []).join('、'))
  const [role, setRole] = useState(initial?.role || '')
  const [bio, setBio] = useState(initial?.bio || '')
  const [tags, setTags] = useState((initial?.tags || []).join(' '))
  const [color, setColor] = useState(initial?.color || DEFAULT_CHARACTER_COLOR)
  const [avatarImageId, setAvatarImageId] = useState<string | undefined>(initial?.avatarImageId)
  const [avatarFile, setAvatarFile] = useState<File | undefined>(undefined)
  const [book, setBook] = useState(initial?.bookId || bookId)
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)

  const selectedImage = images.find((image) => image.id === avatarImageId)
  const selectedUrl = useObjectUrl(selectedImage ? selectedImage.thumb || selectedImage.blob : null)
  const fileUrl = useObjectUrl(avatarFile || null)
  const avatarUrl = fileUrl || selectedUrl

  useEffect(() => {
    const timer = window.setTimeout(() => nameRef.current?.focus(), 40)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pickFiles = (files: File[]) => {
    const image = files.find((file) => file.type.startsWith('image/'))
    if (image) {
      setAvatarFile(image)
      setAvatarImageId(undefined)
    }
  }

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave({
      bookId: book,
      kind: entryKind,
      name: trimmed,
      aliases: parseAliases(aliases, trimmed),
      role: role.trim(),
      bio: bio.trim(),
      tags: parseCharacterTags(tags),
      color,
      avatarImageId: avatarFile ? undefined : avatarImageId,
      avatarFile,
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal character-editor"
        onClick={(event) => event.stopPropagation()}
        onPaste={(event) => {
          const files = imageFilesFromDataTransfer(event.clipboardData)
          if (files.length) {
            event.preventDefault()
            pickFiles(files)
          }
        }}
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">{mode === 'create' ? (entryKind === 'place' ? '新建地名' : '新建人物') : (entryKind === 'place' ? '编辑地名' : '编辑人物')}</div>
            <h2>{name.trim() || '未命名'}</h2>
            <p className="modal-sub">名字与别名会参与正文标记；单字名默认不标。</p>
          </div>
          <button className="modal-close" onClick={onClose}>关闭</button>
        </div>

        <div className="character-editor-hero">
          <div className="ce-avatar" style={{ background: avatarUrl ? '#e8e0d2' : color }}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initialsOf(name || '人')}</span>}
          </div>
          <div className="ce-avatar-actions">
            <button className="btn small" type="button" onClick={() => fileRef.current?.click()}>上传头像</button>
            <span className="ce-hint">也可以直接 Ctrl+V 粘贴图片</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="file-input"
            onChange={(event) => {
              const files = event.target.files
              if (files && files.length) pickFiles(Array.from(files))
              event.target.value = ''
            }}
          />
        </div>

        <div className="field">
          <label>类型</label>
          <div className="setting-inline">
            <button type="button" className={'chip' + (entryKind === 'character' ? ' is-on' : '')} onClick={() => setEntryKind('character')}>人物</button>
            <button type="button" className={'chip' + (entryKind === 'place' ? ' is-on' : '')} onClick={() => setEntryKind('place')}>地名</button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="ce-name">{entryKind === 'place' ? '地名' : '姓名'}</label>
          <input
            id="ce-name"
            ref={nameRef}
            className="text-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={entryKind === 'place' ? '如：北境渡口' : '如：李寒衣'}
          />
        </div>

        <div className="field">
          <label htmlFor="ce-alias">别名</label>
          <input
            id="ce-alias"
            className="text-input"
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            placeholder="用顿号或空格分隔，如：李三娘 寒衣"
          />
          <p className="field-hint">别名同样参与正文标记，最长优先，不会互相吃掉。</p>
        </div>

        <div className="field">
          <label htmlFor="ce-role">身份</label>
          <input
            id="ce-role"
            className="text-input"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder="一句话，如：北境刀客"
          />
        </div>

        <div className="field">
          <label htmlFor="ce-bio">简介</label>
          <textarea
            id="ce-bio"
            className="textarea"
            rows={4}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="支持换行与 **加粗** 的简版 Markdown"
          />
        </div>

        <div className="field">
          <label htmlFor="ce-tags">标签</label>
          <input
            id="ce-tags"
            className="text-input"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="空格分隔，如：主角 刀客 北境"
          />
        </div>

        <div className="field">
          <label>颜色</label>
          <div className="swatch-row">
            {CHARACTER_COLORS.map((item) => (
              <button
                key={item.hex}
                type="button"
                className={'color-dot' + (color === item.hex ? ' is-on' : '')}
                style={{ ['--dot' as string]: item.hex } as CSSProperties}
                title={item.label}
                onClick={() => setColor(item.hex)}
              />
            ))}
          </div>
        </div>

        {images.length > 0 && (
          <div className="field">
            <label>从插画里选头像</label>
            <div className="avatar-picker">
              {images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className={'avatar-option' + (avatarImageId === image.id && !avatarFile ? ' is-on' : '')}
                  onClick={() => {
                    setAvatarImageId(image.id)
                    setAvatarFile(undefined)
                  }}
                >
                  <PickerThumb image={image} />
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'create' && (
          <div className="field">
            <label htmlFor="ce-book">属于哪本书</label>
            <select id="ce-book" className="select" value={book} onChange={(event) => setBook(event.target.value)}>
              {books.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
            <p className="field-hint">人物按书独立，同名不同书不会合并。</p>
          </div>
        )}

        <div className="modal-actions">
          <div className="editor-left">
            {mode === 'edit' && onDelete && (
              confirming ? (
                <div className="confirm-row">
                  <span>删除人物不会删笔记。</span>
                  <button className="btn danger" onClick={onDelete}>确定删除</button>
                  <button className="btn" onClick={() => setConfirming(false)}>取消</button>
                </div>
              ) : (
                <button className="btn danger" onClick={() => setConfirming(true)}>删除人物</button>
              )
            )}
          </div>
          <div className="editor-right">
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn solid" disabled={!name.trim()} onClick={submit}>保存</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PickerThumb({ image }: { image: CharacterImage }) {
  const url = useObjectUrl(image.thumb || image.blob)
  return <span className="avatar-option-img" style={url ? { backgroundImage: 'url(' + url + ')' } : undefined} />
}
