import { Fragment, useRef, useState } from 'react'
import type { BookMeta, Character, CharacterAppearance, CharacterImage, Note } from '../lib/types'
import { excerpt, formatTime } from '../lib/notes'
import { imageFilesFromDataTransfer } from '../lib/images'
import { useObjectUrl } from '../lib/objectUrl'
import CharacterAvatar from './CharacterAvatar'
import { analyzeCharacter, loadAiConfig } from '../lib/ai'
import { startAiBusy, stopAiBusy } from '../lib/ai-busy'

type Props = {
  character: Character
  book: BookMeta | null
  images: CharacterImage[]
  notes: Note[]
  appearances: CharacterAppearance[]
  appearancesLoading: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onAddImages: (files: File[]) => void
  onDeleteImage: (imageId: string) => void
  onSetAvatar: (imageId: string) => void
  onMoveImage: (imageId: string, direction: -1 | 1) => void
  onOpenImage: (index: number) => void
  onJumpNote: (note: Note) => void
  onJumpChapter: (appearance: CharacterAppearance) => void
}

function inlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    return <Fragment key={index}>{part}</Fragment>
  })
}

function Bio({ bio }: { bio: string }) {
  if (!bio.trim()) return <p className="cd-bio is-empty">还没有写简介。</p>
  const blocks = bio.trim().split(/\n{2,}/)
  return (
    <div className="cd-bio">
      {blocks.map((block, blockIndex) => (
        <p key={blockIndex}>
          {block.split('\n').map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && <br />}
              {inlineMarkdown(line)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  )
}

function ImageThumb({ image, onOpen }: { image: CharacterImage; onOpen: () => void }) {
  const url = useObjectUrl(image.thumb || image.blob)
  return <img src={url || ''} alt={image.caption || '插画'} loading="lazy" onClick={onOpen} />
}

export default function CharacterDrawer(props: Props) {
  const { character, book, images, notes, appearances, appearancesLoading } = props
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const related = notes
    .filter((note) => (note.characterIds || []).includes(character.id))
    .sort((a, b) => b.createdAt - a.createdAt)

  const runAnalysis = async () => {
    if (aiBusy) return
    setAiBusy(true)
    try {
      const config = await loadAiConfig()
      if (!config.apiKey.trim() && config.provider !== 'ollama') {
        setAiText('先在设置里配置 AI。')
        return
      }
      startAiBusy('AI 正在分析人物')
      setAiText(await analyzeCharacter(config, character, related, book?.title))
      stopAiBusy()
    } catch (error) {
      stopAiBusy()
      setAiText('分析失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setAiBusy(false)
    }
  }

  const pick = (files: File[]) => {
    const picked = files.filter((file) => file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name))
    if (picked.length) props.onAddImages(picked)
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={props.onClose} />
      <aside
        className="drawer char-drawer"
        onPaste={(event) => {
          const files = imageFilesFromDataTransfer(event.clipboardData)
          if (files.length) {
            event.preventDefault()
            pick(files)
          }
        }}
      >
        <div className="drawer-head">
          <div>
            <div className="drawer-title">人物档案</div>
            <div className="drawer-sub">{book ? '《' + book.title + '》' : '本地人物'}</div>
          </div>
          <button className="drawer-close" onClick={props.onClose}>关闭</button>
        </div>

        <div className="char-drawer-body">
          <div className="cd-hero">
            <CharacterAvatar character={character} images={images} size={76} />
            <div className="cd-id">
              <h2>{character.name}</h2>
              <p className="cd-role">{character.role || '身份未写'}</p>
              <p className="cd-alias">别名：{character.aliases.length ? character.aliases.join('、') : '暂无'}</p>
            </div>
          </div>

          <div className="cd-tags">
            {character.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
            {!character.tags.length && <span className="cd-empty-inline">还没有标签</span>}
          </div>

          <Bio bio={character.bio} />

          <section className="cd-section">
            <div className="cd-section-head">
              <h3>AI 分析</h3>
              <div className="cd-section-actions">
                <button className="btn small" onClick={() => void runAnalysis()} disabled={aiBusy}>
                  {aiBusy ? '分析中…' : '生成分析'}
                </button>
              </div>
            </div>
            {aiText ? <div className="cd-ai">{aiText}</div> : <p className="cd-empty-inline">根据简介、别名、标签和相关笔记生成角色分析；不会编造资料外剧情。</p>}
          </section>

          <section className="cd-section">
            <div className="cd-section-head">
              <h3>插画库</h3>
              <div className="cd-section-actions">
                <button className="btn small" onClick={() => fileRef.current?.click()}>上传 / 粘贴</button>
                <input
                  ref={fileRef}
                  className="file-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    const files = event.target.files
                    if (files && files.length) pick(Array.from(files))
                    event.target.value = ''
                  }}
                />
              </div>
            </div>
            <div className="cd-gallery">
              {images.map((image, index) => (
                <div className={'cd-image' + (character.avatarImageId === image.id ? ' is-avatar' : '')} key={image.id}>
                  <ImageThumb image={image} onOpen={() => props.onOpenImage(index)} />
                  <div className="cd-image-actions">
                    <button
                      className="cd-img-btn"
                      title="设为头像"
                      onClick={() => props.onSetAvatar(image.id)}
                    >
                      {character.avatarImageId === image.id ? '头像' : '设头像'}
                    </button>
                    <button className="cd-img-btn" title="前移" disabled={index === 0} onClick={() => props.onMoveImage(image.id, -1)}>←</button>
                    <button className="cd-img-btn" title="后移" disabled={index === images.length - 1} onClick={() => props.onMoveImage(image.id, 1)}>→</button>
                    <button className="cd-img-btn danger" title="删除" onClick={() => props.onDeleteImage(image.id)}>删</button>
                  </div>
                  {image.caption ? <div className="cd-image-caption">{image.caption}</div> : null}
                </div>
              ))}
              {!images.length && (
                <button className="cd-gallery-empty" onClick={() => fileRef.current?.click()}>
                  <span>＋</span>
                  上传或 Ctrl+V 粘贴插画
                </button>
              )}
            </div>
            <p className="cd-hint">图片存本机 IndexedDB，不上传；对象 URL 用完即回收。</p>
          </section>

          <section className="cd-section">
            <div className="cd-section-head">
              <h3>出场章节</h3>
              <span className="cd-count">{appearancesLoading ? '扫描中…' : appearances.length + ' 章'}</span>
            </div>
            {appearancesLoading ? (
              <p className="cd-empty-inline">正在按章节扫描名字与别名…</p>
            ) : appearances.length ? (
              <div className="cd-chapters">
                {appearances.map((appearance) => (
                  <button
                    key={appearance.chapterIndex + ':' + appearance.title}
                    className="cd-chapter"
                    onClick={() => props.onJumpChapter(appearance)}
                  >
                    <span className="cd-chapter-title">{appearance.title}</span>
                    <span className="cd-chapter-count">{appearance.count} 次</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="cd-empty-inline">这本书里还没有扫到这个名字。</p>
            )}
          </section>

          <section className="cd-section">
            <div className="cd-section-head">
              <h3>相关笔记</h3>
              <span className="cd-count">{related.length} 条</span>
            </div>
            {related.length ? (
              <div className="cd-notes">
                {related.map((note) => (
                  <button key={note.id} className="cd-note" onClick={() => props.onJumpNote(note)}>
                    <p>“{excerpt(note.text, 70)}”</p>
                    {note.note.trim() ? <span>{excerpt(note.note, 60)}</span> : null}
                    <em>{note.chapterTitle || '未标注章节'} · {formatTime(note.createdAt)}</em>
                  </button>
                ))}
              </div>
            ) : (
              <p className="cd-empty-inline">在笔记编辑器里把这条笔记关联到人物，就会汇总到这里。</p>
            )}
          </section>

          <div className="cd-actions">
            <button className="btn" onClick={props.onEdit}>编辑人物</button>
            <button className="btn danger" onClick={props.onDelete}>删除人物</button>
          </div>
        </div>
      </aside>
    </>
  )
}
