(async () => {
  const H = window.__e2e
  const out = { errors: [] }
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const waitRows = async (read, predicate, timeout = 9000) => {
    const started = performance.now()
    let rows = []
    while (performance.now() - started < timeout) {
      rows = await read()
      if (predicate(rows)) return rows
      await H.sleep(80)
    }
    throw new Error('等待 IndexedDB 超时')
  }
  const nav = (label) => {
    const item = Array.from(document.querySelectorAll('.nav-item')).find((element) => element.textContent.includes(label))
    if (!item) throw new Error('找不到导航：' + label)
    item.click()
  }
  try {
    // 1) 重启后人物 / 插画仍在
    nav('人物')
    await H.waitFor(() => document.querySelector('.char-tile'), 8000)
    const characters = await H.characters()
    const images = await H.characterImages()
    const tile = document.querySelector('.char-tile')
    out.persisted = {
      characters: characters.length,
      images: images.length,
      tiles: document.querySelectorAll('.char-tile').length,
      name: tile.querySelector('h3').textContent,
      avatar: Boolean(tile.querySelector('.char-avatar img')),
      imageBlobs: images.every((row) => row.blob instanceof Blob),
    }

    // 2) 按书筛选
    const select = document.querySelector('.people-filter select')
    out.persisted.filterOptions = select.options.length
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    setter.call(select, characters[0].bookId)
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await H.sleep(250)
    out.persisted.filteredTiles = document.querySelectorAll('.char-tile').length
    out.persisted.filterValue = select.value
    setter.call(select, 'all')
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await H.sleep(200)

    // 3) 档案数据（插画 / 出场章节缓存）
    document.querySelector('.char-tile-actions .btn').click()
    const drawer = await H.waitFor(() => document.querySelector('.char-drawer'), 6000)
    out.persisted.drawerImages = drawer.querySelectorAll('.cd-image').length
    await H.waitFor(() => document.querySelectorAll('.char-drawer .cd-chapter').length >= 2, 10000)
    out.persisted.drawerChapters = document.querySelectorAll('.char-drawer .cd-chapter').length

    // 粘贴第三张 → 删除 → 证明粘贴导入与删除都可用
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(H.pngFile('paste.png', png))
    const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(pasteEvent, 'clipboardData', { value: dataTransfer })
    drawer.dispatchEvent(pasteEvent)
    await waitRows(H.characterImages, (rows) => rows.length === 3)
    out.persisted.pasted = (await H.characterImages()).length === 3
    const tiles = drawer.querySelectorAll('.cd-image')
    tiles[tiles.length - 1].querySelector('.cd-img-btn.danger').click()
    await waitRows(H.characterImages, (rows) => rows.length === 2)
    out.persisted.deleted = (await H.characterImages()).length

    drawer.querySelector('.drawer-close').click()
    await H.waitFor(() => !document.querySelector('.char-drawer'), 4000)

    // 4) 设置里关闭正文标记
    nav('设置')
    const settings = await H.waitFor(() => document.querySelector('.settings-page'), 6000)
    const toggle = settings.querySelector('.switch')
    out.markToggle = { before: toggle.getAttribute('aria-checked') }
    toggle.click()
    await H.waitFor(() => toggle.getAttribute('aria-checked') === 'false', 4000)
    out.markToggle.after = toggle.getAttribute('aria-checked')

    nav('书架')
    const charBook = await H.waitBookCard('旧渡口 · 人物', 8000)
    charBook.querySelector('.book-open').click()
    await H.waitChapterText('李寒衣', 15000)
    await H.sleep(900)
    out.markToggle.offCount = H.charMarks().length
    document.querySelector('.back').click()
    await H.waitFor(() => document.querySelector('.shelf'), 5000)

    nav('设置')
    const settings2 = await H.waitFor(() => document.querySelector('.settings-page'), 6000)
    settings2.querySelector('.switch').click()
    await H.waitFor(() => settings2.querySelector('.switch').getAttribute('aria-checked') === 'true', 4000)
    nav('书架')
    const charBook2 = await H.waitBookCard('旧渡口 · 人物', 8000)
    charBook2.querySelector('.book-open').click()
    await H.waitChapterText('李寒衣', 15000)
    await H.waitFor(() => H.charMarks().length > 0, 9000)
    out.markToggle.onCount = H.charMarks().length
    document.querySelector('.back').click()
    await H.waitFor(() => document.querySelector('.shelf'), 5000)

    // 5) TXT：选中建卡 + 标记 + 悬停 + 抽屉
    const txtCard = await H.waitBookCard('sample-utf8', 10000)
    txtCard.querySelector('.book-open').click()
    await H.waitFor(() => document.querySelector('.page p'), 10000)
    H.selectPageText('李寒衣')
    const toolbar = await H.waitFor(() => document.querySelector('.txt-toolbar'), 6000)
    out.txt = { toolbar: toolbar.textContent.includes('标为人物') }
    H.clickButton('标为人物', toolbar)
    const editor = await H.waitFor(() => document.querySelector('.character-editor'), 6000)
    out.txt.prefill = editor.querySelector('#ce-name').value
    H.clickButton('保存', editor)
    await H.waitFor(() => !document.querySelector('.character-editor'), 6000)
    await H.waitFor(() => document.querySelectorAll('.page .char').length > 0, 8000)
    const txtBooks = (await H.books()).filter((book) => book.title === 'sample-utf8')
    const allCharacters = await H.characters()
    const txtCharacter = allCharacters.find((character) => character.bookId === (txtBooks[0] || {}).id)
    out.txt = {
      ...out.txt,
      marks: document.querySelectorAll('.page .char').length,
      characterCount: allCharacters.length,
      bookScoped: Boolean(txtCharacter),
      name: txtCharacter ? txtCharacter.name : '',
    }

    const span = document.querySelector('.page .char')
    span.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    const card = await H.waitFor(() => document.querySelector('.char-card'), 4000)
    out.txt.hover = { name: card.querySelector('.cc-name').textContent, inside: card.getBoundingClientRect().right <= window.innerWidth }
    span.click()
    const txtDrawer = await H.waitFor(() => document.querySelector('.char-drawer'), 5000)
    out.txt.drawer = txtDrawer.querySelector('.cd-id h2').textContent
    txtDrawer.querySelector('.drawer-close').click()
    document.querySelector('.back').click()
    await H.waitFor(() => document.querySelector('.shelf'), 5000)

    // 6) M2 修复 12：无封面 EPUB 用纸感封面；修复 10：注释不计章节
    H.pickFiles([H.makeFile(window.__e2eFiles.noCover, 'epub-无封面.epub', 'application/epub+zip')])
    const noCoverCard = await H.waitBookCard('无题·无封面', 30000)
    const cover = noCoverCard.querySelector('.cover')
    out.cover = {
      generated: cover.classList.contains('is-gen'),
      hasImage: Boolean(cover.querySelector('img')),
      title: (cover.querySelector('.cover-title') || {}).textContent,
    }
    noCoverCard.querySelector('.book-more').click()
    const modal = await H.waitFor(() => document.querySelector('.modal'), 5000)
    out.cover.detail = modal.querySelector('.modal-sub').textContent
    modal.querySelector('.modal-close').click()
    await H.sleep(200)

    noCoverCard.querySelector('.book-open').click()
    await H.waitChapterText('第一章', 20000)
    await H.sleep(400)
    document.querySelector('.toc-btn').click()
    await H.waitFor(() => document.querySelectorAll('.toc-item').length === 4, 6000)
    const tocRows = Array.from(document.querySelectorAll('.toc-item'))
    out.cover.toc = tocRows.length
    out.cover.tocLast = tocRows[tocRows.length - 1].querySelector('.toc-text').textContent
    out.cover.footer = (document.querySelector('.epub-nav span') || {}).textContent || ''
    const noCoverMeta = (await H.books()).find((book) => book.title === '无题·无封面')
    out.cover.bookMeta = noCoverMeta ? { chapterCount: noCoverMeta.chapterCount, tocLength: (noCoverMeta.toc || []).length } : null

    // 收尾：回到人物页留给截图
    document.querySelector('.drawer-close')?.click()
    nav('人物')
    await H.waitFor(() => document.querySelectorAll('.char-tile').length >= 1, 6000)
  } catch (error) {
    out.errors.push(String(error && error.stack ? error.stack : error))
  }
  return out
})()
