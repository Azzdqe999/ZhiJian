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
  onRelate: (a: Character, b: Character, label: string) => void
  onUnrelate: (a: Character, b: Character) => void
}

export default function CharactersPanel(props: Props) {
  const { books, collections, characters, images, bookId, onBookChange, markEnabled, onToggleMark } = props
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'character' | 'place'>('all')
  const [collectionFilter, setCollectionFilter] = useState('all')
  const [view, setView] = useState<'grid' | 'graph'>('grid')
  const [selectedId, setSelectedId] = useState('')
  const [hover, setHover] = useState<{ id: string; name: string; x: number; y: number } | null>(null)
  const [relationEditor, setRelationEditor] = useState<{ a: Character; b: Character; label: string } | null>(null)

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

  const graph = useMemo(() => {
    const index = new Map<string, Character>()
    const normalize = (value: string) => value.trim().toLowerCase()
    for (const character of shown) {
      index.set(normalize(character.name), character)
      for (const alias of character.aliases) index.set(normalize(alias), character)
    }
    const edgeMap = new Map<string, { a: Character; b: Character; label: string }>()
    for (const character of shown) {
      for (const relation of character.relations || []) {
        const target = index.get(normalize(relation.name))
        if (!target || target.id === character.id) continue
        const key = [character.id, target.id].sort().join('|')
        if (!edgeMap.has(key)) edgeMap.set(key, { a: character, b: target, label: relation.label })
      }
    }
    const nodes = shown.slice(0, 80)
    const edges = [...edgeMap.values()]
    const width = 900
    const height = 600
    const centerX = width / 2
    const centerY = height / 2
    const positions = nodes.map((_, index) => {
      const angle = index * 2.399963
      const radius = 20 + 13 * Math.sqrt(index)
      return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius }
    })
    const indexOf = new Map(nodes.map((node, index) => [node.id, index]))
    const links = edges
      .map((edge) => ({ a: indexOf.get(edge.a.id), b: indexOf.get(edge.b.id) }))
      .filter((link): link is { a: number; b: number } => typeof link.a === 'number' && typeof link.b === 'number')

    // 轻量力导向：关系边像弹簧拉近，所有节点互相排斥，孤立节点自然散开
    for (let iteration = 0; iteration < 280; iteration++) {
      const forces = positions.map(() => ({ x: 0, y: 0 }))
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          let dx = positions[i].x - positions[j].x
          let dy = positions[i].y - positions[j].y
          if (dx === 0 && dy === 0) { dx = 0.5; dy = 0.5 }
          const distance = Math.max(28, Math.hypot(dx, dy))
          const force = 5200 / (distance * distance)
          const fx = (dx / distance) * force
          const fy = (dy / distance) * force
          forces[i].x += fx
          forces[i].y += fy
          forces[j].x -= fx
          forces[j].y -= fy
        }
      }
      for (const link of links) {
        const a = positions[link.a]
        const b = positions[link.b]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.max(1, Math.hypot(dx, dy))
        const force = (distance - 132) * 0.014
        const fx = (dx / distance) * force
        const fy = (dy / distance) * force
        forces[link.a].x += fx
        forces[link.a].y += fy
        forces[link.b].x -= fx
        forces[link.b].y -= fy
      }
      for (let i = 0; i < positions.length; i++) {
        forces[i].x += (centerX - positions[i].x) * 0.0016
        forces[i].y += (centerY - positions[i].y) * 0.0016
        const length = Math.hypot(forces[i].x, forces[i].y)
        const limit = length > 9 ? 9 / length : 1
        positions[i].x = Math.max(24, Math.min(width - 24, positions[i].x + forces[i].x * limit))
        positions[i].y = Math.max(24, Math.min(height - 24, positions[i].y + forces[i].y * limit))
      }
    }

    return {
      nodes,
      edges,
      points: nodes.map((character, index) => ({ character, x: positions[index].x, y: positions[index].y })),
    }
  }, [shown])

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
          <button className={'chip' + (view === 'graph' ? ' is-on' : '')} onClick={() => setView(view === 'graph' ? 'grid' : 'graph')}>
            {view === 'graph' ? '卡片视图' : '关系图'}
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
      ) : view === 'graph' ? (
        <div className="relation-wrap">
          <p className="relation-hint">
            {selectedId
              ? '已选中「' + (graph.nodes.find((item) => item.id === selectedId)?.name || '') + '」，再点另一个人建立关系'
              : '点第一个人，再点第二个人，填写关系；点连线可以修改或删除。'}
          </p>
          <svg className="relation-svg" viewBox="0 0 900 600">
            {graph.edges.map((edge) => {
              const a = graph.points.find((point) => point.character.id === edge.a.id)
              const b = graph.points.find((point) => point.character.id === edge.b.id)
              if (!a || !b) return null
              return (
                <g key={edge.a.id + '-' + edge.b.id}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="relation-line" />
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className="relation-line-hit"
                    onClick={(event) => {
                      event.stopPropagation()
                      setRelationEditor({ a: edge.a, b: edge.b, label: edge.label })
                    }}
                  />
                  {graph.edges.length <= 18 ? (
                    <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} className="relation-edge-label">{edge.label}</text>
                  ) : null}
                </g>
              )
            })}
            {graph.points.map((point) => (
              <g
                key={point.character.id}
                className={'relation-node' + (selectedId === point.character.id ? ' is-selected' : '')}
                onClick={() => {
                  if (!selectedId) { setSelectedId(point.character.id); return }
                  if (selectedId === point.character.id) { setSelectedId(''); return }
                  const a = graph.nodes.find((item) => item.id === selectedId)
                  if (a) {
                    const existing = (a.relations || []).find((item) => item.name === point.character.name || point.character.aliases.includes(item.name))
                    setRelationEditor({ a, b: point.character, label: existing?.label || '' })
                  }
                }}
                onDoubleClick={() => props.onOpen(point.character)}
                onPointerEnter={(event) => setHover({ id: point.character.id, name: point.character.name, x: event.clientX, y: event.clientY })}
                onPointerMove={(event) => setHover({ id: point.character.id, name: point.character.name, x: event.clientX, y: event.clientY })}
                onPointerLeave={() => setHover(null)}
              >
                <circle cx={point.x} cy={point.y} r={18} fill={point.character.color || '#a4552f'} />
                <text x={point.x} y={point.y + 4} textAnchor="middle" className="relation-initial">{point.character.name.slice(0, 1)}</text>
                {graph.nodes.length <= 40 || selectedId === point.character.id || hover?.id === point.character.id ? <text x={point.x} y={point.y + 34} textAnchor="middle" className="relation-name">{point.character.name}</text> : null}
              </g>
            ))}
          </svg>
          {hover ? <div className="relation-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>{hover.name}</div> : null}
          {shown.length > 80 ? <p className="setting-foot">只显示前 80 个，用搜索缩小范围后再连线。</p> : null}
          {!graph.edges.length ? <p className="setting-foot">还没有关系。点两个节点即可建立第一条关系。</p> : null}

          {relationEditor ? (
            <div className="relation-editor-backdrop" onClick={() => setRelationEditor(null)}>
              <div className="relation-editor" onClick={(event) => event.stopPropagation()}>
                <div className="eyebrow">人物关系</div>
                <h3>{relationEditor.a.name} ↔ {relationEditor.b.name}</h3>
                <input
                  autoFocus
                  className="text-input"
                  placeholder="关系，如：主从 / 盟友 / 母子"
                  value={relationEditor.label}
                  onChange={(event) => setRelationEditor({ ...relationEditor, label: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && relationEditor.label.trim()) {
                      props.onRelate(relationEditor.a, relationEditor.b, relationEditor.label.trim())
                      setRelationEditor(null)
                      setSelectedId('')
                    }
                  }}
                />
                <div className="modal-actions">
                  {relationEditor.label.trim() ? (
                    <button className="btn danger" onClick={() => {
                      props.onUnrelate(relationEditor.a, relationEditor.b)
                      setRelationEditor(null)
                      setSelectedId('')
                    }}>删除关系</button>
                  ) : null}
                  <button className="btn" onClick={() => setRelationEditor(null)}>取消</button>
                  <button
                    className="btn solid"
                    disabled={!relationEditor.label.trim()}
                    onClick={() => {
                      props.onRelate(relationEditor.a, relationEditor.b, relationEditor.label.trim())
                      setRelationEditor(null)
                      setSelectedId('')
                    }}
                  >保存</button>
                </div>
              </div>
            </div>
          ) : null}
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
