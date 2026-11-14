import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeSnapshots } from '../js/lib/sync-merge.js'

const book = (id, at) => ({ id, title: id, author: 'a', cover: 'c1', encoding: 'utf-8', charCount: 1, chapterCount: 1, toc: [], byteSize: 1, createdAt: 1, lastReadAt: at, chapterIndex: 0, scrollRatio: 0 })
const note = (id, bookId, at) => ({ id, bookId, cfi: '', text: 'x', color: 'yellow', note: '', tags: [], chapterTitle: '', createdAt: at, updatedAt: at })
const ch = (id, bookId, at) => ({ id, bookId, name: id, aliases: [], role: '', bio: '', tags: [], color: '#000', createdAt: at, updatedAt: at })

const local = {
  version: 1, deviceId: 'a', exportedAt: 1,
  books: [book('b1', 100), book('b2', 100)],
  notes: [note('n1', 'b1', 100), note('n2', 'b2', 100)],
  characters: [ch('c1', 'b1', 100), ch('c2', 'b2', 100)],
  images: [{ id: 'i1', characterId: 'c1', caption: '', sort: 0, createdAt: 100 }],
  tombstones: [],
}
const remote = {
  version: 1, deviceId: 'b', exportedAt: 2,
  books: [book('b1', 200), book('b3', 150)],
  notes: [note('n1', 'b1', 50), note('n3', 'b3', 150)],
  characters: [ch('c1', 'b1', 50), ch('c3', 'b3', 150)],
  images: [],
  tombstones: [{ key: 'book:b2', kind: 'book', id: 'b2', deletedAt: 300 }],
}

const merged = mergeSnapshots(local, [remote])
assert.equal(merged.books.length, 2, 'b2 deleted, b1 + b3 remain')
assert.equal(merged.books.find((b) => b.id === 'b1').lastReadAt, 200, 'newer progress wins')
assert.equal(merged.notes.length, 2, 'n2 dropped with its book')
assert.ok(merged.notes.find((n) => n.id === 'n1').updatedAt === 100, 'local newer note retained')
assert.equal(merged.characters.length, 2, 'c2 dropped with its book')
assert.equal(merged.images.length, 1, 'i1 kept because c1 survives')
