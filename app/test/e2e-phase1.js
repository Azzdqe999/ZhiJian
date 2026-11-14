(async () => {
  const H = window.__e2e
  const out = { errors: [] }
  try {
    const t0 = performance.now()
    H.dropFile(H.makeFile(window.__e2eFiles.small, '旧渡口.epub', 'application/epub+zip'))
    const card = await H.waitBookCard('旧渡口', 20000)
    out.importMs = Math.round(performance.now() - t0)
    out.shelf = {
      title: card.querySelector('.book-title').textContent.trim(),
      author: card.querySelector('.book-author').textContent.trim(),
      hasCoverImage: Boolean(card.querySelector('.cover.has-image img')),
      badge: (card.querySelector('.format-badge') || {}).textContent,
      toast: (document.querySelector('.toast') || {}).textContent,
    }
    card.querySelector('.book-open').click()
    await H.waitChapterText('山雨落在旧渡口', 20000)
    out.firstText = H.iframeDoc().body.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)

    document.querySelector('.toc-btn').click()
    await H.waitFor(() => document.querySelectorAll('.toc-item').length >= 4, 6000)
    out.toc = Array.from(document.querySelectorAll('.toc-item')).map((el) => el.textContent.replace(/\s+/g, ' ').trim())
    document.querySelectorAll('.toc-item')[1].click()
    await H.waitFor(() => (document.querySelector('.epub-chapter') || {}).textContent?.includes('第二章'), 10000)
    await H.sleep(800)
    out.chapter2 = {
      label: document.querySelector('.epub-chapter').textContent,
      nav: document.querySelector('.epub-nav span').textContent,
    }
    const rootElement = H.iframeDoc().documentElement
    out.layout = {
      scrollWidth: rootElement.scrollWidth,
      clientWidth: rootElement.clientWidth,
      bodyWidth: Math.round(H.iframeDoc().body.getBoundingClientRect().width),
      htmlOverflowX: H.iframeDoc().defaultView.getComputedStyle(rootElement).overflowX,
      bodyOverflowX: H.iframeDoc().defaultView.getComputedStyle(H.iframeDoc().body).overflowX,
      htmlScrollWidth: rootElement.scrollWidth,
      htmlClientWidth: rootElement.clientWidth,
      bodyScrollWidth: H.iframeDoc().body.scrollWidth,
      frameWidth: H.iframe().clientWidth,
      stageScrollWidth: document.querySelector('.epub-stage').scrollWidth,
      stageClientWidth: document.querySelector('.epub-stage').clientWidth,
      viewerScrollWidth: H.viewer().scrollWidth,
      viewerClientWidth: H.viewer().clientWidth,
      stageChild: (() => {
        const child = H.viewer().firstElementChild
        if (!child) return null
        const style = getComputedStyle(child)
        return {
          tag: child.tagName,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          scrollWidth: child.scrollWidth,
          clientWidth: child.clientWidth,
          scrollHeight: child.scrollHeight,
          clientHeight: child.clientHeight,
        }
      })(),
    }

    const before = H.bodyStyle()
    H.clickButton('A+')
    await H.sleep(180)
    H.clickButton('A+')
    await H.sleep(300)
    const bigger = H.bodyStyle()
    document.querySelector('.font-btn').click()
    await H.sleep(300)
    const sans = H.bodyStyle()
    document.querySelector('.theme-btn').click()
    await H.sleep(400)
    const night = H.bodyStyle()
    document.querySelector('.theme-btn').click()
    await H.sleep(300)
    document.querySelector('.font-btn').click()
    await H.sleep(120)
    document.querySelector('.font-btn').click()
    await H.sleep(300)
    H.clickButton('A−')
    await H.sleep(180)
    H.clickButton('A−')
    await H.sleep(300)
    out.typography = { before, bigger, sans, night, restored: H.bodyStyle() }

    document.querySelectorAll('.epub-nav button')[1].click()
    await H.waitFor(() => (document.querySelector('.epub-chapter') || {}).textContent?.includes('第三章'), 10000)
    await H.sleep(350)
    const nextLabel = document.querySelector('.epub-chapter').textContent
    document.querySelectorAll('.epub-nav button')[0].click()
    await H.waitFor(() => (document.querySelector('.epub-chapter') || {}).textContent?.includes('第二章'), 10000)
    await H.sleep(350)
    out.prevNext = { next: nextLabel, back: document.querySelector('.epub-chapter').textContent }
    // 通过目录重新进入第二章（从章首渲染），保证截图里能看到高亮
    document.querySelector('.toc-btn').click()
    await H.waitFor(() => document.querySelectorAll('.toc-item').length >= 4, 6000)
    document.querySelectorAll('.toc-item')[1].click()
    await H.waitFor(() => (document.querySelector('.epub-chapter') || {}).textContent?.includes('第二章'), 10000)
    await H.sleep(500)
    H.iframeDoc().scrollingElement && (H.iframeDoc().scrollingElement.scrollTop = 0)
    H.iframeDoc().documentElement.scrollTop = 0
    H.iframeDoc().body.scrollTop = 0
    await H.sleep(300)

    const selected = H.selectCharsInParagraph(12)
    await H.waitFor(() => document.querySelector('.hl-toolbar'), 6000)
    out.selection = selected
    out.toolbarDots = document.querySelectorAll('.hl-toolbar .hl-dot').length
    Array.from(document.querySelectorAll('.hl-action')).find((button) => button.textContent.includes('批注')).click()
    await H.waitFor(() => document.querySelector('.note-editor'), 5000)
    const editor = document.querySelector('.note-editor')
    out.editorQuote = editor.querySelector('.note-quote').textContent.replace(/\s+/g, ' ').trim()
    editor.querySelectorAll('.swatch')[1].click()
    H.setNativeValue(editor.querySelector('.textarea'), '这句里的光写得安静。')
    H.setNativeValue(editor.querySelector('.text-input'), '雨 渡口')
    H.clickButton('保存', editor)
    await H.waitFor(() => !document.querySelector('.note-editor'), 6000)
    await H.waitFor(() => H.viewer().querySelectorAll('svg g').length >= 1, 6000)

    const savedNotes = await H.notes()
    const note = savedNotes[0]
    const books = await H.books()
    out.note = {
      count: savedNotes.length,
      color: note.color,
      text: note.text,
      note: note.note,
      tags: note.tags,
      chapter: note.chapterTitle,
      hasCfi: /^epubcfi\(/.test(note.cfi),
    }
    out.highlight = {
      marks: H.viewer().querySelectorAll('svg g').length,
      rects: H.viewer().querySelectorAll('svg rect').length,
    }
    let storedHash = null
    try {
      const buffer = await H.storedFileBuffer(books[0].id)
      const digest = await crypto.subtle.digest('SHA-256', buffer)
      storedHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
    } catch (error) {
      storedHash = 'hash failed: ' + String(error)
    }
    out.book = {
      format: books[0].format,
      hasCfi: Boolean(books[0].epubCfi),
      chapterIndex: books[0].chapterIndex,
      charCount: books[0].charCount,
      tocCount: books[0].toc.length,
      storedBytes: await H.storedFileBytes(books[0].id),
      storedHash,
    }
  } catch (error) {
    out.errors.push(String(error && error.stack ? error.stack : error))
  }
  return out
})()
