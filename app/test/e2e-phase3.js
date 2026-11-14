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

  try {
    H.dropFile(H.makeFile(window.__e2eFiles.charEpub, '旧渡口·人物.epub', 'application/epub+zip'))
    const card = await H.waitBookCard('旧渡口 · 人物', 40000)
    card.querySelector('.book-open').click()
    await H.waitChapterText('李寒衣', 20000)
    await H.sleep(400)

    // 1) 从 EPUB 选中文字建卡
    H.selectIframeText('李寒衣')
    const toolbar = await H.waitFor(() => document.querySelector('.hl-toolbar'), 6000)
    out.toolbarHasCharacter = toolbar.textContent.includes('标为人物')
    H.clickButton('标为人物', toolbar)
    const editor = await H.waitFor(() => document.querySelector('.character-editor'), 6000)
    out.editorPrefill = editor.querySelector('#ce-name').value
    H.setNativeValue(editor.querySelector('#ce-alias'), '李三娘')
    H.setNativeValue(editor.querySelector('#ce-role'), '北境刀客')
    H.setNativeValue(editor.querySelector('#ce-bio'), '北境十三刀里唯一的活口。')
    H.setNativeValue(editor.querySelector('#ce-tags'), '主角 刀客')
    H.clickButton('保存', editor)
    await H.waitFor(() => !document.querySelector('.character-editor'), 6000)
    await H.waitFor(() => H.charMarks().length >= 2, 9000)

    // 2) 选中已有别名 → 合并提示 → 加入别名（不新建第二张卡）
    H.selectIframeText('李三娘')
    const mergeToolbar = await H.waitFor(() => document.querySelector('.hl-toolbar'), 6000)
    H.clickButton('标为人物', mergeToolbar)
    const mergeModal = await H.waitFor(() => document.querySelector('.merge-prompt'), 6000)
    out.merge = { prompt: true, text: mergeModal.textContent.slice(0, 80) }
    H.clickButton('加入', mergeModal)
    const mergedCharacters = await waitRows(
      H.characters,
      (rows) => rows.length === 1 && rows[0].aliases.includes('李三娘'),
    )
    out.merge.aliases = mergedCharacters[0].aliases
    out.merge.count = mergedCharacters.length
    await H.sleep(400)
    await H.waitFor(() => H.charMarks().length >= 2, 9000)

    const characters = await H.characters()
    const character = characters[0]
    out.character = {
      count: characters.length,
      name: character.name,
      aliases: character.aliases,
      role: character.role,
      tags: character.tags,
      color: character.color,
      hasBook: Boolean(character.bookId),
    }
    out.marks = H.charMarks().length
    {
      const mark = H.charMarks()[0]
      const rectElement = mark.querySelector('rect')
      const lineElement = mark.querySelector('line')
      const doc = H.iframeDoc()
      out.markStyle = {
        rectFill: rectElement ? getComputedStyle(rectElement).fill : null,
        rectStroke: rectElement ? getComputedStyle(rectElement).stroke : null,
        lineStroke: lineElement ? getComputedStyle(lineElement).stroke : null,
        lineDash: lineElement ? getComputedStyle(lineElement).strokeDasharray : null,
        selection: doc && doc.defaultView ? String(doc.defaultView.getSelection()) : '',
        gStyle: mark.getAttribute('style'),
        html: mark.outerHTML.slice(0, 300),
      }
    }

    // 2) 悬停 250ms 出卡
    H.hoverCharMark(0)
    const cardEl = await H.waitFor(() => document.querySelector('.char-card'), 4000)
    await H.sleep(180)
    const cardRect = cardEl.getBoundingClientRect()
    out.card = {
      name: (cardEl.querySelector('.cc-name') || {}).textContent,
      role: (cardEl.querySelector('.cc-role') || {}).textContent,
      hasAvatar: Boolean(cardEl.querySelector('.char-avatar')),
      shots: cardEl.querySelectorAll('.shot').length,
      inside:
        cardRect.left >= 0 &&
        cardRect.top >= 0 &&
        cardRect.right <= window.innerWidth &&
        cardRect.bottom <= window.innerHeight,
    }

    // 3) 点击名字 → 档案抽屉，阅读位置不丢
    H.clickCharMark(0)
    const drawer = await H.waitFor(() => document.querySelector('.char-drawer'), 6000)
    out.drawer = {
      visible: true,
      name: drawer.querySelector('.cd-id h2').textContent,
      alias: drawer.querySelector('.cd-alias').textContent,
      chapter: document.querySelector('.epub-chapter').textContent,
      iframeAlive: Boolean(H.iframe() && H.iframeDoc() && H.iframeDoc().body.textContent.includes('李寒衣')),
    }

    // 4) 插画：上传两张 → 排序 → 设头像 → 大图
    const fileInput = drawer.querySelector('input[type=file]')
    H.setFiles(fileInput, [H.pngFile('a.png', png)])
    await waitRows(H.characterImages, (rows) => rows.length === 1)
    H.setFiles(fileInput, [H.pngFile('b.png', png)])
    const rows = await waitRows(H.characterImages, (rows) => rows.length === 2)
    await H.waitFor(() => document.querySelectorAll('.char-drawer .cd-image').length === 2, 6000)
    const sortedFirst = rows.slice().sort((a, b) => a.sort - b.sort)
    const firstId = sortedFirst[0].id
    const secondId = sortedFirst[1].id

    document.querySelectorAll('.char-drawer .cd-image')[1].querySelector('.cd-img-btn[title="前移"]').click()
    const reordered = await waitRows(H.characterImages, (rows) => {
      const ordered = rows.slice().sort((a, b) => a.sort - b.sort)
      return ordered[0] && ordered[0].id === secondId
    })
    out.images = { count: reordered.length, blob: reordered[0].blob instanceof Blob, reordered: true }

    document.querySelectorAll('.char-drawer .cd-image')[0].querySelector('.cd-img-btn').click()
    const avatarRows = await waitRows(H.characters, (rows) => rows[0].avatarImageId === secondId)
    out.images.avatar = avatarRows[0].avatarImageId === secondId
    await H.waitFor(() => document.querySelector('.char-drawer .cd-hero .char-avatar img'), 4000)

    document.querySelector('.char-drawer .cd-image img').click()
    const lightbox = await H.waitFor(() => document.querySelector('.lightbox'), 5000)
    const image = lightbox.querySelector('.lightbox-stage img')
    await H.waitFor(() => image.complete && image.naturalWidth > 0, 5000)
    out.images.lightbox = image.naturalWidth > 0
    lightbox.querySelector('.lightbox-close').click()
    await H.waitFor(() => !document.querySelector('.lightbox'), 4000)

    // 5) 关抽屉，做笔记 + 重复高亮合并
    document.querySelector('.char-drawer .drawer-close').click()
    await H.waitFor(() => !document.querySelector('.char-drawer'), 4000)

    H.selectIframeText('谢无咎')
    const noteToolbar = await H.waitFor(() => document.querySelector('.hl-toolbar'), 6000)
    noteToolbar.querySelector('.hl-dot').click()
    await waitRows(H.notes, (rows) => rows.length === 1)
    await H.sleep(400)

    H.selectIframeText('谢无咎')
    const dupToolbar = await H.waitFor(() => document.querySelector('.hl-toolbar'), 6000)
    out.duplicate = { toolbar: Boolean(dupToolbar) }
    dupToolbar.querySelector('.hl-dot').click()
    const dupEditor = await H.waitFor(() => document.querySelector('.note-editor'), 6000)
    out.duplicate.editorOpened = Boolean(dupEditor)
    out.duplicate.notes = (await H.notes()).length
    out.duplicate.toast = (document.querySelector('.toast') || {}).textContent || ''
    dupEditor.querySelector('.modal-close').click()
    await H.waitFor(() => !document.querySelector('.note-editor'), 4000)

    // 6) 笔记关联人物
    H.clickNoteHighlight()
    const assocEditor = await H.waitFor(() => document.querySelector('.note-editor'), 6000)
    const chip = Array.from(assocEditor.querySelectorAll('.chip')).find((item) => item.textContent.trim() === '李寒衣')
    if (!chip) throw new Error('笔记编辑器里没有人物 chip')
    chip.click()
    await H.sleep(200)
    H.clickButton('保存', assocEditor)
    await H.waitFor(() => !document.querySelector('.note-editor'), 5000)
    const linked = await waitRows(H.notes, (rows) => rows.length === 1 && (rows[0].characterIds || []).includes(character.id))
    out.noteCharacter = { characterIds: linked[0].characterIds, count: linked.length }

    // 7) 抽屉里汇总相关笔记 + 出场章节
    H.clickCharMark(0)
    const drawer2 = await H.waitFor(() => document.querySelector('.char-drawer'), 6000)
    const related = await H.waitFor(() => document.querySelectorAll('.char-drawer .cd-note').length === 1 ? document.querySelectorAll('.char-drawer .cd-note') : null, 6000)
    out.noteAggregated = related.length === 1
    const chapters = await H.waitFor(() => {
      const list = document.querySelectorAll('.char-drawer .cd-chapter')
      return list.length >= 2 ? list : null
    }, 15000)
    out.appearances = { count: chapters.length, first: chapters[0].textContent, second: chapters[1].textContent }

    // 8) 出场章节跳转
    chapters[1].click()
    await H.waitFor(() => !document.querySelector('.char-drawer'), 6000)
    const jumped = await H.waitFor(() => {
      const label = (document.querySelector('.epub-chapter') || {}).textContent || ''
      return label.includes('第二章') ? label : null
    }, 10000)
    out.jump = { chapter: jumped, marks: H.charMarks().length }
    await H.waitFor(() => H.charMarks().length > 0, 8000)
    H.clickCharMark(0)
    await H.waitFor(() => document.querySelector('.char-drawer'), 6000)
  } catch (error) {
    out.errors.push(String(error && error.stack ? error.stack : error))
  }
  return out
})()
