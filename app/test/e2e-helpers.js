(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  async function waitFor(fn, timeout = 10000, step = 60) {
    const start = performance.now()
    let lastError = null
    while (performance.now() - start < timeout) {
      try {
        const value = fn()
        if (value) return value
      } catch (error) {
        lastError = error
      }
      await sleep(step)
    }
    throw new Error('waitFor 超时' + (lastError ? '：' + lastError.message : ''))
  }

  function bytesFrom(base64) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  function makeFile(base64, name, type) {
    return new File([bytesFrom(base64)], name, { type })
  }

  function dropFile(file) {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
    window.dispatchEvent(event)
  }

  function pickFiles(files) {
    const input = document.querySelector('.file-input')
    const dataTransfer = new DataTransfer()
    for (const file of files) dataTransfer.items.add(file)
    input.files = dataTransfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function iframe() {
    return document.querySelector('.epub-stage iframe')
  }

  function iframeDoc() {
    const frame = iframe()
    return frame ? frame.contentDocument : null
  }

  function viewer() {
    return document.querySelector('.epub-viewer')
  }

  function bookCard(title) {
    return Array.from(document.querySelectorAll('.book')).find((element) => element.innerText.includes(title))
  }

  async function waitBookCard(title, timeout = 20000) {
    return waitFor(() => bookCard(title), timeout)
  }

  async function openBook(title) {
    const card = await waitBookCard(title)
    card.querySelector('.book-open').click()
    return card
  }

  async function waitChapterText(needle, timeout = 15000) {
    return waitFor(() => {
      const doc = iframeDoc()
      return doc && doc.body && doc.body.textContent.includes(needle) ? doc : null
    }, timeout)
  }

  function selectCharsInParagraph(count) {
    const doc = iframeDoc()
    const paragraph = doc.querySelector('p')
    if (!paragraph) throw new Error('没有段落可选中')
    const walker = doc.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
    const node = walker.nextNode()
    if (!node) throw new Error('段落没有文本节点')
    const length = Math.min(count, node.nodeValue.length)
    const range = doc.createRange()
    range.setStart(node, 0)
    range.setEnd(node, length)
    const selection = doc.defaultView.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    const event = doc.createEvent('MouseEvents')
    event.initMouseEvent('mouseup', true, true, doc.defaultView, 0, 0, 0, 0, 0, false, false, false, false, 0, null)
    doc.dispatchEvent(event)
    return node.nodeValue.slice(0, length)
  }

  function clickHighlight() {
    const container = viewer()
    const svg = container ? container.querySelector('svg') : null
    const mark = svg ? svg.querySelector('g') : null
    if (!mark) throw new Error('当前章节没有高亮')
    const frame = iframe()
    const frameRect = frame.getBoundingClientRect()
    const markRect = mark.getBoundingClientRect()
    const doc = frame.contentDocument
    const event = new doc.defaultView.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: markRect.left - frameRect.left + Math.max(2, markRect.width / 2),
      clientY: markRect.top - frameRect.top + Math.max(2, markRect.height / 2),
    })
    doc.dispatchEvent(event)
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set
    setter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function findButton(text, scope = document) {
    return Array.from(scope.querySelectorAll('button')).find((button) => (button.textContent || '').includes(text))
  }

  function clickButton(text, scope = document) {
    const button = findButton(text, scope)
    if (!button) throw new Error('找不到按钮：' + text)
    button.click()
    return button
  }

  function bodyStyle() {
    const doc = iframeDoc()
    if (!doc) return null
    const style = doc.defaultView.getComputedStyle(doc.body)
    return { fontSize: style.fontSize, fontFamily: style.fontFamily, color: style.color, background: style.backgroundColor }
  }

  async function readStore(storeName) {
    return new Promise((resolve, reject) => {
      // 不写死版本号：M3 把库升到 v3，跟着当前库打开
      const request = indexedDB.open('paper-between')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(storeName)) {
          resolve([])
          db.close()
          return
        }
        const transaction = db.transaction(storeName, 'readonly')
        const all = transaction.objectStore(storeName).getAll()
        all.onsuccess = () => {
          resolve(all.result)
          db.close()
        }
        all.onerror = () => {
          reject(all.error)
          db.close()
        }
      }
    })
  }

  async function notes() {
    return readStore('notes')
  }

  async function books() {
    return readStore('books')
  }

  async function storedFileBuffer(bookId) {
    const rows = await readStore('files')
    const row = rows.find((entry) => entry.id === bookId)
    return row ? row.bytes : null
  }

  async function storedFileBytes(bookId) {
    const buffer = await storedFileBuffer(bookId)
    return buffer ? buffer.byteLength : 0
  }


  function selectTextIn(root, needle, eventTarget) {
    if (!root) throw new Error('没有可选中文字的容器')
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const value = node.nodeValue || ''
      const index = value.indexOf(needle)
      if (index >= 0) {
        const range = root.ownerDocument.createRange()
        range.setStart(node, index)
        range.setEnd(node, index + needle.length)
        const selection = root.ownerDocument.defaultView.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        const doc = root.ownerDocument
        const event = doc.createEvent('MouseEvents')
        event.initMouseEvent('mouseup', true, true, doc.defaultView, 0, 0, 0, 0, 0, false, false, false, false, 0, null)
        ;(eventTarget || root).dispatchEvent(event)
        return needle
      }
      node = walker.nextNode()
    }
    throw new Error('选中不到文字：' + needle)
  }

  function selectIframeText(needle) {
    const doc = iframeDoc()
    if (!doc || !doc.body) throw new Error('EPUB 正文还没渲染')
    return selectTextIn(doc.body, needle, doc)
  }

  function selectPageText(needle) {
    const page = document.querySelector('.page')
    if (!page) throw new Error('TXT 正文还没渲染')
    return selectTextIn(page, needle, page)
  }

  function charMarks() {
    return Array.from(viewer() ? viewer().querySelectorAll('g.char-mark') : [])
  }

  function markRects() {
    return charMarks().map((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, cid: element.getAttribute('data-cid') }
    })
  }

  function dispatchInIframe(type, clientX, clientY) {
    const doc = iframeDoc()
    if (!doc) throw new Error('EPUB 正文还没渲染')
    const event = new doc.defaultView.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
    })
    doc.dispatchEvent(event)
  }

  function hoverCharMark(index = 0) {
    const rect = markRects()[index]
    if (!rect) throw new Error('没有可悬停的人名标记')
    const frameRect = iframe().getBoundingClientRect()
    dispatchInIframe('mousemove', rect.left - frameRect.left + Math.max(1, rect.width / 2), rect.top - frameRect.top + Math.max(1, rect.height / 2))
    return rect
  }

  function clickCharMark(index = 0) {
    const rect = markRects()[index]
    if (!rect) throw new Error('没有可点击的人名标记')
    const frameRect = iframe().getBoundingClientRect()
    dispatchInIframe('click', rect.left - frameRect.left + Math.max(1, rect.width / 2), rect.top - frameRect.top + Math.max(1, rect.height / 2))
    return rect
  }

  function clickNoteHighlight() {
    const svg = viewer() ? viewer().querySelector('svg') : null
    const mark = svg ? svg.querySelector('g[class*="paper-hl"]') : null
    if (!mark) throw new Error('当前章节没有笔记高亮')
    const frame = iframe()
    const frameRect = frame.getBoundingClientRect()
    const markRect = mark.getBoundingClientRect()
    const doc = frame.contentDocument
    const event = new doc.defaultView.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: markRect.left - frameRect.left + Math.max(2, markRect.width / 2),
      clientY: markRect.top - frameRect.top + Math.max(2, markRect.height / 2),
    })
    doc.dispatchEvent(event)
  }

  function setFiles(input, files) {
    const dataTransfer = new DataTransfer()
    for (const file of files) dataTransfer.items.add(file)
    input.files = dataTransfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function pngFile(name, base64) {
    return makeFile(base64, name, 'image/png')
  }

  async function characters() {
    return readStore('characters')
  }

  async function characterImages() {
    return readStore('characterImages')
  }

  window.__e2e = {
    sleep,
    waitFor,
    makeFile,
    dropFile,
    pickFiles,
    iframe,
    iframeDoc,
    viewer,
    bookCard,
    waitBookCard,
    openBook,
    waitChapterText,
    selectCharsInParagraph,
    clickHighlight,
    setNativeValue,
    findButton,
    clickButton,
    bodyStyle,
    readStore,
    notes,
    books,
    storedFileBytes,
    storedFileBuffer,
    selectIframeText,
    selectPageText,
    charMarks,
    markRects,
    hoverCharMark,
    clickCharMark,
    clickNoteHighlight,
    setFiles,
    pngFile,
    characters,
    characterImages,
  }
})()