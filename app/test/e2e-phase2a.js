(async () => {
  const H = window.__e2e
  const out = { errors: [] }
  try {
    const card = await H.waitBookCard('旧渡口', 15000)
    out.shelf = {
      title: card.querySelector('.book-title').textContent.trim(),
      author: card.querySelector('.book-author').textContent.trim(),
      hasCoverImage: Boolean(card.querySelector('.cover.has-image img')),
    }
    out.notesAfterReload = (await H.notes()).length
    card.querySelector('.book-open').click()
    await H.waitFor(() => (document.querySelector('.epub-chapter') || {}).textContent?.includes('第二章'), 15000)
    const doc = await H.waitFor(() => {
      const current = H.iframeDoc()
      return current && current.body && current.body.textContent.length > 80 ? current : null
    }, 15000)
    out.restored = {
      chapter: document.querySelector('.epub-chapter').textContent,
      textLength: doc.body.textContent.length,
      marks: H.viewer().querySelectorAll('svg g').length,
    }

    await H.waitFor(() => H.viewer().querySelector('svg g'), 10000)
    H.clickHighlight()
    await H.waitFor(() => document.querySelector('.note-editor'), 5000)
    const editor = document.querySelector('.note-editor')
    out.editor = {
      note: editor.querySelector('.textarea').value,
      tags: editor.querySelector('.text-input').value,
      quote: editor.querySelector('.note-quote').textContent.replace(/\s+/g, ' ').trim(),
    }
    H.setNativeValue(editor.querySelector('.textarea'), '改过之后：雨声像旧信。')
    H.clickButton('保存', editor)
    await H.waitFor(() => !document.querySelector('.note-editor'), 5000)
    const edited = (await H.notes())[0]
    out.edited = { note: edited.note, updatedAt: edited.updatedAt, createdAt: edited.createdAt }

    document.querySelector('.back').click()
    await H.waitFor(() => document.querySelector('.notes-page') === null, 5000)
    Array.from(document.querySelectorAll('.nav-item')).find((item) => item.textContent.includes('笔记')).click()
    await H.waitFor(() => document.querySelectorAll('.note-card').length >= 1, 6000)
    const cardText = document.querySelector('.note-card').textContent.replace(/\s+/g, ' ').trim()
    out.panel = {
      cards: document.querySelectorAll('.note-card').length,
      cardText,
      bookGroup: document.querySelector('.note-book-id h2').textContent,
      hasComment: cardText.includes('改过之后：雨声像旧信。'),
      hasTags: cardText.includes('#雨') && cardText.includes('#渡口'),
      hasChapter: cardText.includes('第二章 夜行'),
      hasTime: /\d{4}-\d{2}-\d{2}/.test(cardText),
    }
    const pinkChip = Array.from(document.querySelectorAll('.chip-color')).find((chip) => chip.textContent.includes('胭脂'))
    pinkChip.click()
    await H.sleep(250)
    out.filter = {
      pinkCards: document.querySelectorAll('.note-card').length,
      activeChip: (document.querySelector('.chip.is-on.chip-color') || {}).textContent,
    }
    const rangeChips = Array.from(document.querySelectorAll('.filter-group .chip')).filter((chip) => !chip.classList.contains('chip-color'))
    const last7 = rangeChips.find((chip) => chip.textContent.includes('近 7 天'))
    last7.click()
    await H.sleep(250)
    const range7 = document.querySelectorAll('.note-card').length
    const last30 = rangeChips.find((chip) => chip.textContent.includes('近 30 天'))
    last30.click()
    await H.sleep(250)
    const range30 = document.querySelectorAll('.note-card').length
    out.timeFilter = { range7, range30 }
  } catch (error) {
    out.errors.push(String(error && error.stack ? error.stack : error))
  }
  return out
})()
