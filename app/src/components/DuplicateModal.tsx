import { useMemo } from 'react'
import type { BookMeta } from '../lib/types'

type Props = {
  books: BookMeta[]
  onClose: () => void
  onTrash: (id: string) => void
}

function keyOf(book: BookMeta): string {
  if (book.contentHash) return 'hash:' + book.contentHash
  return 'meta:' + book.title.trim().toLowerCase() + '|' + book.charCount + '|' + (book.format || 'txt')
}

export default function DuplicateModal({ books, onClose, onTrash }: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, BookMeta[]>()
    for (const book of books) {
      const key = keyOf(book)
      const list = map.get(key) || []
      list.push(book)
      map.set(key, list)
    }
    return [...map.values()].filter((group) => group.length > 1)
  }, [books])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">书库整理</div>
            <h2>重复书籍</h2>
            <p className="modal-sub">按文件哈希或「书名 + 字数 + 格式」判断，找到 {groups.length} 组。</p>
          </div>
          <button className="modal-close" onClick={onClose}>关闭</button>
        </div>
        {groups.length ? (
          <div className="duplicate-list">
            {groups.map((group) => (
              <div className="duplicate-group" key={keyOf(group[0])}>
                <div className="duplicate-title">{group[0].title}</div>
                {group.map((book) => (
                  <div className="duplicate-row" key={book.id}>
                    <span>{book.format === 'epub' ? 'EPUB' : 'TXT'} · {Math.max(1, Math.round(book.byteSize / 1024))} KB · {new Date(book.createdAt).toLocaleDateString()}</span>
                    <button className="btn small danger" onClick={() => onTrash(book.id)}>移入回收站</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="setting-foot">没有发现重复书籍。</p>
        )}
      </div>
    </div>
  )
}
