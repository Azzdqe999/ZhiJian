import { useMemo, useState } from 'react'
import type { BookMeta, Character, CharacterImage, Collection } from '../lib/types'
import { characterNames } from '../lib/characters'
import CharacterAvatar from './CharacterAvatar'

type Props = {
  books: BookMeta[]
  collections: Collection[]
  characters: Character[]
  images: CharacterImage[]
  bookId: string
  onBookChange: (bookId: string) => void
  markEnabled: boolean
  onToggleMark: () => void
  onCreate: (kind: 'character' | 'place') => void
  onEdit: (character: Character) => void
  onOpen: (character: Character) => void
  onDelete: (character: Character) => void
}

export default function CharactersPanel(props: Props) {
  const { books, collections, characters, images, bookId, onBookChange, markEnabled, onToggleMark } = props
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'character' | 'place'>('all')
  const [collectionFilter, setCollectionFilter] = useState('all')

  const collectionScopes = useMemo(() => {
    if (collectionFilter === 'all') return null
    const collection = collections.find((item) => item.id === collectionFilter)
    if (!collection) return null
    const scopes = new Set<string>()
    for (const book of books) {
      if (book.collectionId !== collection.id) continue
      scopes.add(book.id)
      if (book.series?.trim()) scopes.add('series:' + book.series.trim())
    }
    if (collection.isSeries) scopes.add('series:' + collection.name)
    return scopes
  }, [collectionFilter, collections, books])

  const bookMap = useMemo(() => new Map(books.map((book) => [book.id, book])), [books])
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const character of characters) map.set(character.bookId, (map.get(character.bookId) || 0) + 1)
    return map
  }, [characters])

  const shown = useMemo(() => {
    const keyword = query.trim()
    return characters
      .filter((character) => (bookId === 'all' ? true : character.bookId === bookId))
      .filter((character) => (kindFilter === 'all' ? true : (character.kind || 'character') === kindFilter))
      .filter((character) => (collectionScopes ? collectionScopes.has(character.bookId) : true))
      .filter((character) => {
        if (!keyword) return true
        return (
          character.name.includes(keyword) ||
          character.role.includes(keyword) ||
          character.aliases.some((alias) => alias.includes(keyword)) ||
          character.tags.some((tag) => tag.includes(keyword))
        )
      })
      .sort((a, b) => a.createdAt - b.createdAt)
  }, [characters, bookId, query, kindFilter, collectionScopes])

  const countFor = (id: string) => images.filter((image) => image.characterId === id).length

  return (
    <main className="main people-page">
      <header className="page-head">
        <div>
          <h1>人物</h1>
          <p className="sub">
            {characters.length} 位人物 · {images.length} 张插画
            {bookId !== 'all' ? ' · 当前《' + (bookMap.get(bookId)?.title || '未知') + '》' : ''}
          </p>
        </div>
        <div className="head-actions">
          <label className="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            <input placeholder="搜索姓名、别名、标签" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className={'chip' + (markEnabled ? ' is-on' : '')} onClick={onToggleMark} title="正文人物标记总开关">
            {markEnabled ? '正文标记：开' : '正文标记：关'}
          </button>
          <button className="btn" onClick={() => props.onCreate('place')}>新建地名</button>
          <button className="btn solid" onClick={() => props.onCreate('character')}>新建人物</button>
        </div>
      </header>

      <div className="filter-bar people-filter">
        <div className="filter-group">
          <span className="filter-label">书</span>
          <select className="select mini-select" value={bookId} onChange={(event) => onBookChange(event.target.value)}>
            <option value="all">全部书</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
                {counts.get(book.id) ? ' · ' + counts.get(book.id) : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">收藏夹</span>
          <select className="select mini-select" value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)}>
            <option value="all">全部收藏夹</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>{collection.name}{collection.isSeries ? ' · 系列' : ''}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">类型</span>
          {(['all', 'character', 'place'] as const).map((kind) => (
            <button
              key={kind}
              className={'chip' + (kindFilter === kind ? ' is-on' : '')}
              onClick={() => setKindFilter(kind)}
            >
              {kind === 'all' ? '全部' : kind === 'character' ? '人物' : '地名'}
            </button>
          ))}
        </div>
        <span className="muted">人物与地名按书独立；姓名、别名都会在正文里标虚线。</span>
      </div>

      {!shown.length ? (
        <div className="empty people-empty">
          <div className="empty-mark">人</div>
          <h2>{characters.length ? '这本书还没有人物' : '还没有人物卡'}</h2>
          <p>
            在正文里选中一个名字，点「标为人物」；或者在这里手动新建。<br />
            建好之后，当前章节里所有名字与别名都会标上虚线，悬停可预览。
          </p>
          <button className="btn solid" onClick={() => props.onCreate('character')}>新建人物</button>
        </div>
      ) : (
        <div className="char-grid">
          {shown.map((character) => {
            const book = bookMap.get(character.bookId)
            const names = characterNames(character)
            return (
              <article className={'char-tile' + (character.color ? '' : '')} key={character.id} data-cid={character.id}>
                <button className="char-tile-main" onClick={() => props.onOpen(character)}>
                  <CharacterAvatar character={character} images={images} size={64} />
                  <div className="char-tile-id">
                    <h3>{character.name}</h3>
                    <p className="char-tile-role">{character.role || '身份未写'}</p>
                    <p className="char-tile-alias">
                      {character.aliases.length ? character.aliases.join('、') : '暂无别名'}
                    </p>
                  </div>
                </button>
                <div className="char-tile-meta">
                  <span>{book ? book.title : character.bookId.startsWith('series:') ? '系列 · ' + character.bookId.slice(7) : '未知书目'}</span>
                  <span>{names.length} 个称呼 · {countFor(character.id)} 张插画</span>
                </div>
                <div className="char-tile-tags">
                  {character.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                </div>
                <div className="char-tile-actions">
                  <button className="btn small" onClick={() => props.onOpen(character)}>打开档案</button>
                  <button className="btn small" onClick={() => props.onEdit(character)}>编辑</button>
                  <button className="btn small danger" onClick={() => props.onDelete(character)}>删除</button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
