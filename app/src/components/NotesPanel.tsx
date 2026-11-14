import { useMemo, useState } from 'react'
import { NOTE_COLORS, NOTE_COLOR_MAP, excerpt, filterNotes, formatTime, groupNotesByBook } from '../lib/notes'
import type { NoteFilter } from '../lib/notes'
import type { BookMeta, Note, NoteColor } from '../lib/types'

type NotesPanelProps = {
  notes: Note[]
  books: BookMeta[]
  onJump: (note: Note) => void
  onExport: (notes: Note[]) => void
  onToast: (message: string) => void
}

const RANGE_LABELS: Array<{ key: NoteFilter['range']; label: string }> = [
  { key: 'all', label: '全部' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
]

function Cover({ book }: { book: BookMeta }) {
  if (book.coverImage) {
    return (
      <div className={'cover mini has-image ' + book.cover}>
        <img src={book.coverImage} alt="" />
      </div>
    )
  }
  return (
    <div className={'cover mini ' + book.cover}>
      <span className="cover-title">{book.title}</span>
    </div>
  )
}

export default function NotesPanel({ notes, books, onJump, onExport, onToast }: NotesPanelProps) {
  const [filter, setFilter] = useState<NoteFilter>({ bookId: 'all', color: 'all', order: 'new', range: 'all' })

  const filtered = useMemo(() => filterNotes(notes, filter), [notes, filter])
  const groups = useMemo(() => groupNotesByBook(filtered, books), [filtered, books])
  const booksWithNotes = useMemo(() => {
    const ids = new Set(notes.map((note) => note.bookId))
    return books.filter((book) => ids.has(book.id))
  }, [notes, books])

  const patch = (next: Partial<NoteFilter>) => setFilter((current) => ({ ...current, ...next }))

  return (
    <main className="main notes-page">
      <header className="page-head">
        <div>
          <h1>笔记</h1>
          <p className="sub">
            {notes.length} 条划线 · 批注 · {booksWithNotes.length} 本书 · 当前筛选 {filtered.length} 条
          </p>
        </div>
        <div className="head-actions">
          <button
            className="btn solid"
            disabled={!filtered.length}
            onClick={() => {
              if (!filtered.length) {
                onToast('当前筛选没有笔记')
                return
              }
              onExport(filtered)
            }}
          >
            导出 Markdown
          </button>
        </div>
      </header>

      <div className="filter-bar">
        <div className="filter-group">
          <span className="filter-label">书</span>
          <select className="select mini-select" value={filter.bookId} onChange={(event) => patch({ bookId: event.target.value })}>
            <option value="all">全部书</option>
            {booksWithNotes.map((book) => (
              <option key={book.id} value={book.id}>{book.title}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <span className="filter-label">颜色</span>
          <button className={'chip' + (filter.color === 'all' ? ' is-on' : '')} onClick={() => patch({ color: 'all' })}>全部</button>
          {NOTE_COLORS.map((color) => (
            <button
              key={color.key}
              className={'chip chip-color' + (filter.color === color.key ? ' is-on' : '')}
              onClick={() => patch({ color: color.key as NoteColor })}
              title={color.label}
            >
              <span style={{ background: color.hex }} />
              {color.label}
            </button>
          ))}
        </div>

        <div className="filter-group">
          <span className="filter-label">时间</span>
          {RANGE_LABELS.map((range) => (
            <button
              key={range.key}
              className={'chip' + (filter.range === range.key ? ' is-on' : '')}
              onClick={() => patch({ range: range.key })}
            >
              {range.label}
            </button>
          ))}
        </div>

        <div className="filter-group">
          <span className="filter-label">排序</span>
          <button className={'chip' + (filter.order === 'new' ? ' is-on' : '')} onClick={() => patch({ order: 'new' })}>最新在前</button>
          <button className={'chip' + (filter.order === 'old' ? ' is-on' : '')} onClick={() => patch({ order: 'old' })}>最早在前</button>
        </div>
      </div>

      {!notes.length ? (
        <div className="empty notes-empty">
          <div className="empty-mark">记</div>
          <h2>还没有笔记</h2>
          <p>打开一本书，选中喜欢的句子，就能留下四色高亮、批注和标签。<br />笔记会按书与章节聚合在这里，也能导出成 Markdown。</p>
        </div>
      ) : !filtered.length ? (
        <p className="empty-note">当前筛选下没有笔记，换个颜色或时间范围试试。</p>
      ) : (
        <div className="note-books">
          {groups.map((group) => (
            <section className="note-book" key={group.book.id}>
              <div className="note-book-head">
                <Cover book={group.book} />
                <div className="note-book-id">
                  <h2>{group.book.title}</h2>
                  <p className="note-book-sub">
                    {group.book.author} · {group.book.chapterCount} 章 · {group.notes.length} 条
                    {(group.book.format ?? 'txt') === 'epub' ? ' · EPUB' : ''}
                  </p>
                </div>
                <button className="btn small" onClick={() => onExport(group.notes)}>导出此书</button>
              </div>

              <div className="note-list">
                {group.notes.map((note) => (
                  <article className="note-card" key={note.id} onClick={() => onJump(note)}>
                    <span className="note-color" style={{ background: NOTE_COLOR_MAP[note.color].hex }} />
                    <div className="note-body">
                      <p className="note-text">“{excerpt(note.text, 120)}”</p>
                      {note.note.trim() ? <p className="note-comment">{note.note}</p> : null}
                      <div className="note-meta">
                        <span className="note-chapter">{note.chapterTitle || '未标注章节'}</span>
                        <span>{formatTime(note.createdAt)}</span>
                        <span className="note-color-label">{NOTE_COLOR_MAP[note.color].label}</span>
                        {note.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>)}
                      </div>
                    </div>
                    <span className="note-jump">跳回原文 →</span>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
