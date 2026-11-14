(async () => {
  const H = window.__e2e
  const out = { errors: [] }
  try {
    document.querySelector('.note-card').click()
    await H.waitFor(() => document.querySelector('.epub-stage'), 10000)
    await H.waitFor(() => H.viewer().querySelector('svg g'), 15000)
    out.jump = {
      chapter: (document.querySelector('.epub-chapter') || {}).textContent,
      marks: H.viewer().querySelectorAll('svg g').length,
    }

    document.querySelector('.back').click()
    await H.waitFor(() => document.querySelector('.notes-page') === null, 5000)
    Array.from(document.querySelectorAll('.nav-item')).find((item) => item.textContent.includes('笔记')).click()
    await H.waitFor(() => document.querySelectorAll('.note-card').length >= 1, 6000)
    H.clickButton('导出 Markdown')
    out.exportToast = await H.waitFor(() => {
      const toast = document.querySelector('.toast')
      return toast && toast.textContent.includes('已导出') ? toast.textContent : null
    }, 8000)

    Array.from(document.querySelectorAll('.nav-item')).find((item) => item.textContent.includes('书架')).click()
    await H.waitFor(() => H.bookCard('旧渡口'), 6000)
    document.querySelector('.book-open').click()
    await H.waitFor(() => (document.querySelector('.epub-chapter') || {}).textContent?.includes('第二章'), 15000)
    await H.waitFor(() => H.viewer().querySelector('svg g'), 12000)
    H.clickHighlight()
    await H.waitFor(() => document.querySelector('.note-editor'), 5000)
    H.clickButton('删除笔记', document.querySelector('.note-editor'))
    await H.waitFor(() => !document.querySelector('.note-editor'), 5000)
    await H.sleep(400)
    out.deleted = {
      notes: (await H.notes()).length,
      marks: H.viewer().querySelectorAll('svg g').length,
    }

    document.querySelector('.back').click()
    await H.waitFor(() => document.querySelector('.shelf'), 5000)
    H.pickFiles([H.makeFile(window.__e2eFiles.txt, 'sample-utf8.txt', 'text/plain')])
    await H.waitBookCard('sample-utf8', 20000)
    const txtCard = await H.waitBookCard('sample-utf8')
    txtCard.querySelector('.book-open').click()
    await H.waitFor(() => document.querySelector('.page p'), 10000)
    out.txt = {
      heading: document.querySelector('.reader-head h2').textContent,
      paragraphs: document.querySelectorAll('.page p').length,
      firstParagraph: document.querySelector('.page p').textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
    }
    const beforeHeading = document.querySelector('.reader-head h2').textContent
    const chapterButtons = document.querySelectorAll('.chapter-nav button')
    chapterButtons[chapterButtons.length - 1].click()
    await H.waitFor(() => document.querySelector('.reader-head h2').textContent !== beforeHeading, 8000)
    out.txt.nextChapter = document.querySelector('.reader-head h2').textContent
    await H.sleep(700)
    const txtBooks = (await H.books()).filter((book) => book.format === 'txt')
    out.txt.progress = { chapterIndex: txtBooks[0].chapterIndex, chapterCount: txtBooks[0].chapterCount }

    document.querySelector('.back').click()
    await H.waitFor(() => document.querySelector('.shelf'), 5000)
    const importStart = performance.now()
    H.dropFile(H.makeFile(window.__e2eFiles.big, '长夜灯影.epub', 'application/epub+zip'))
    const bigCard = await H.waitBookCard('长夜灯影', 40000)
    out.big = {
      importMs: Math.round(performance.now() - importStart),
      shelfTitle: bigCard.querySelector('.book-title').textContent,
    }
    const openStart = performance.now()
    bigCard.querySelector('.book-open').click()
    await H.waitChapterText('山雨落在旧渡口', 30000)
    out.big.openMs = Math.round(performance.now() - openStart)
    out.big.iframeText = H.iframeDoc().body.textContent.replace(/\s+/g, ' ').trim().slice(0, 30)
    document.querySelector('.toc-btn').click()
    await H.waitFor(() => document.querySelectorAll('.toc-item').length > 200, 8000)
    out.big.tocCount = document.querySelectorAll('.toc-item').length
    document.querySelector('.drawer-close').click()
    await H.sleep(200)
    document.querySelector('.back').click()
    await H.waitFor(() => document.querySelector('.shelf'), 5000)
    out.bookCount = document.querySelectorAll('.book').length
  } catch (error) {
    out.errors.push(String(error && error.stack ? error.stack : error))
  }
  return out
})()
