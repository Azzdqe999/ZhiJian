const { app, BrowserWindow, session } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const appDir = path.resolve(__dirname, '..')
const root = path.resolve(appDir, '..')
const buildDir = path.join(root, 'build')
const samplesDir = path.join(root, 'samples')
const profileDir = path.join(buildDir, 'e2e-profile')
const downloadDir = path.join(buildDir, 'e2e-downloads')

fs.mkdirSync(buildDir, { recursive: true })
fs.rmSync(profileDir, { recursive: true, force: true })
fs.mkdirSync(profileDir, { recursive: true })
fs.rmSync(downloadDir, { recursive: true, force: true })
fs.mkdirSync(downloadDir, { recursive: true })
app.setPath('userData', profileDir)
// E2E 窗口可能被其他窗口遮住，关掉 Chromium 的遮挡降频，避免 iframe 渲染被暂停
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8')
const helpers = read('e2e-helpers.js')
const phase1Source = read('e2e-phase1.js')
const phase2aSource = read('e2e-phase2a.js')
const phase2bSource = read('e2e-phase2b.js')
const phase3Source = read('e2e-phase3.js')
const phase4Source = read('e2e-phase4.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let downloadPath = null
const consoleLogs = []

async function main() {
  await app.whenReady()
  console.log('userData:', app.getPath('userData'))

  session.defaultSession.on('will-download', (event, item) => {
    const filename = item.getFilename() || 'notes.md'
    downloadPath = path.join(downloadDir, filename)
    item.setSavePath(downloadPath)
    item.once('done', (doneEvent, state) => {
      console.log('DOWNLOAD DONE', state, downloadPath)
    })
  })

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    show: true,
    backgroundColor: '#f6f2e9',
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })

  win.webContents.on('console-message', (event, level, message) => {
    const text = event && typeof event === 'object' && typeof event.message === 'string' ? event.message : String(message === undefined ? event : message)
    if (!text.includes('Electron Security Warning')) consoleLogs.push(text)
  })
  win.webContents.on('render-process-gone', (event, details) => {
    consoleLogs.push('RENDER PROCESS GONE ' + JSON.stringify(details))
  })
  win.webContents.on('did-fail-load', (event, code, description, url) => {
    consoleLogs.push('DID FAIL LOAD ' + code + ' ' + description + ' ' + url)
  })

  const screenshot = async (name) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await wait(300)
        const image = await win.webContents.capturePage()
        fs.writeFileSync(path.join(buildDir, name), image.toPNG())
        return
      } catch (error) {
        console.log('SCREENSHOT RETRY', name, String(error && error.message ? error.message : error))
        await wait(500)
      }
    }
  }

  const runPhase = async (source) => {
    return win.webContents.executeJavaScript(helpers + ';\n' + source, true)
  }

  const small = fs.readFileSync(path.join(samplesDir, 'epub-3章.epub')).toString('base64')
  const big = fs.readFileSync(path.join(samplesDir, 'epub-5mb.epub')).toString('base64')
  const txt = fs.readFileSync(path.join(samplesDir, 'sample-utf8.txt')).toString('base64')
  const charEpub = fs.readFileSync(path.join(samplesDir, 'epub-人物.epub')).toString('base64')
  const noCover = fs.readFileSync(path.join(samplesDir, 'epub-无封面.epub')).toString('base64')

  await win.loadFile(path.join(appDir, 'dist', 'index.html'))
  win.show()
  win.focus()
  win.moveTop()
  await wait(700)

  await win.webContents.executeJavaScript('window.__e2eFiles = ' + JSON.stringify({ small }) + '; true')
  const phase1 = await runPhase(phase1Source)
  console.log('PHASE1', JSON.stringify(phase1, null, 2))
  await screenshot('e2e-reader.png')

  const loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve))
  win.webContents.reload()
  await loaded
  await wait(800)

  await win.webContents.executeJavaScript('window.__e2eFiles = ' + JSON.stringify({}) + '; true')
  const phase2a = await runPhase(phase2aSource)
  console.log('PHASE2A', JSON.stringify(phase2a, null, 2))
  await screenshot('e2e-notes.png')

  await win.webContents.executeJavaScript('window.__e2eFiles = ' + JSON.stringify({ txt, big }) + '; true')
  const phase2b = await runPhase(phase2bSource)
  console.log('PHASE2B', JSON.stringify(phase2b, null, 2))
  await screenshot('e2e-shelf.png')

  await wait(700)
  let download = null
  if (downloadPath && fs.existsSync(downloadPath)) {
    const content = fs.readFileSync(downloadPath, 'utf8')
    download = {
      path: downloadPath,
      bytes: Buffer.byteLength(content),
      checks: {
        title: content.includes('纸间 · 读书笔记'),
        book: content.includes('## 《旧渡口》'),
        chapter: content.includes('### 第二章 夜行'),
        quote: content.includes('> 原文') === false && content.includes('>'),
        comment: content.includes('**批注**：改过之后：雨声像旧信。'),
        tags: content.includes('**标签**：'),
        color: content.includes('颜色：胭脂'),
        time: /时间：\d{4}-\d{2}-\d{2}/.test(content),
      },
      head: content.slice(0, 420),
    }
  }

  await win.webContents.executeJavaScript('window.__e2eFiles = ' + JSON.stringify({ charEpub, noCover }) + '; true')
  const phase3 = await runPhase(phase3Source)
  console.log('PHASE3', JSON.stringify(phase3, null, 2))
  await screenshot('e2e-char-drawer.png')

  const phase4Loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve))
  win.webContents.reload()
  await phase4Loaded
  await wait(900)
  await win.webContents.executeJavaScript('window.__e2eFiles = ' + JSON.stringify({ noCover }) + '; true')
  const phase4 = await runPhase(phase4Source)
  console.log('PHASE4', JSON.stringify(phase4, null, 2))
  await screenshot('e2e-people.png')

  const summary = {
    phase1Errors: phase1.errors || [],
    phase2aErrors: phase2a.errors || [],
    phase2bErrors: phase2b.errors || [],
    phase3Errors: phase3.errors || [],
    phase4Errors: phase4.errors || [],
    checks: {
      importMeta: phase1.shelf && phase1.shelf.title === '旧渡口' && phase1.shelf.author.includes('纸间测试组') && phase1.shelf.hasCoverImage === true && phase1.shelf.badge === 'EPUB',
      coverStored: Boolean(phase1.shelf && phase1.shelf.hasCoverImage),
      toc: Array.isArray(phase1.toc) && phase1.toc.length === 4,
      chapterJump: Boolean(phase1.chapter2 && phase1.chapter2.label.includes('第二章')),
      typography: Boolean(
        phase1.typography &&
          phase1.typography.bigger.fontSize === '21px' &&
          phase1.typography.night.background === 'rgb(27, 26, 24)' &&
          phase1.typography.night.color === 'rgb(216, 209, 196)' &&
          phase1.typography.sans.fontFamily.toLowerCase().includes('inter') &&
          phase1.typography.restored.background === 'rgb(246, 242, 233)' &&
          phase1.typography.restored.color === 'rgb(42, 39, 35)',
      ),
      layoutColumn: Boolean(
        phase1.layout && phase1.layout.scrollWidth <= phase1.layout.clientWidth + 2 && phase1.layout.bodyWidth <= 800,
      ),
      selectionToolbar: Boolean(phase1.selection && phase1.selection.length > 0),
      fourColorToolbar: phase1.toolbarDots === 4,
      prevNextChapter: Boolean(
        phase1.prevNext &&
          phase1.prevNext.next &&
          phase1.prevNext.next.includes('第三章') &&
          phase1.prevNext.back &&
          phase1.prevNext.back.includes('第二章'),
      ),
      noteSaved: Boolean(phase1.note && phase1.note.count === 1 && phase1.note.color === 'pink' && phase1.note.tags.length === 2 && phase1.note.hasCfi),
      highlightVisible: Boolean(phase1.highlight && phase1.highlight.marks >= 1),
      cfiPersisted: Boolean(phase1.book && phase1.book.hasCfi),
      epubBytesStored: Boolean(phase1.book && phase1.book.storedBytes === fs.statSync(path.join(samplesDir, 'epub-3章.epub')).size),
      epubBytesUnchanged: Boolean(
        phase1.book &&
          phase1.book.storedHash === require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(samplesDir, 'epub-3章.epub'))).digest('hex'),
      ),
      restoredAfterReload: Boolean(phase2a.restored && phase2a.restored.chapter.includes('第二章')),
      noteRestored: phase2a.notesAfterReload === 1,
      highlightRestored: Boolean(phase2a.restored && phase2a.restored.marks >= 1),
      noteEdited: Boolean(phase2a.edited && phase2a.edited.note.includes('雨声像旧信')),
      notesPanel: Boolean(phase2a.panel && phase2a.panel.cards === 1 && phase2a.panel.hasComment && phase2a.panel.hasTags && phase2a.panel.hasChapter && phase2a.panel.hasTime),
      colorFilter: Boolean(phase2a.filter && phase2a.filter.pinkCards === 1),
      timeFilter: Boolean(phase2a.timeFilter && phase2a.timeFilter.range7 === 1 && phase2a.timeFilter.range30 === 1),
      jumpBack: Boolean(phase2b.jump && phase2b.jump.chapter.includes('第二章') && phase2b.jump.marks >= 1),
      exportDownloaded: Boolean(download && download.bytes > 100),
      exportContent: Boolean(download && download.checks.title && download.checks.book && download.checks.chapter && download.checks.comment && download.checks.color && download.checks.time),
      noteDeleted: Boolean(phase2b.deleted && phase2b.deleted.notes === 0 && phase2b.deleted.marks === 0),
      txtRegression: Boolean(phase2b.txt && phase2b.txt.paragraphs > 0 && phase2b.txt.nextChapter && phase2b.txt.nextChapter !== phase2b.txt.heading && phase2b.txt.progress.chapterIndex === 1),
      bigImport: Boolean(phase2b.big && phase2b.big.shelfTitle === '长夜灯影'),
      bigOpenUnder3s: Boolean(phase2b.big && phase2b.big.openMs < 3000),
      bigToc: Boolean(phase2b.big && phase2b.big.tocCount > 200),
      shelfCoexist: phase2b.bookCount === 3,
      peopleCrud: Boolean(
        phase3.character &&
          phase3.character.count === 1 &&
          phase3.character.name === '李寒衣' &&
          phase3.character.aliases.includes('李三娘') &&
          phase3.character.tags.length === 2 &&
          phase3.character.hasBook,
      ),
      epubCreateFromSelection: Boolean(phase3.toolbarHasCharacter && phase3.editorPrefill === '李寒衣'),
      mergeAlias: Boolean(
        phase3.merge &&
          phase3.merge.prompt &&
          phase3.merge.aliases.includes('李三娘') &&
          phase3.merge.count === 1,
      ),
      epubMarks: phase3.marks >= 2,
      hoverCard: Boolean(
        phase3.card &&
          phase3.card.name === '李寒衣' &&
          phase3.card.hasAvatar &&
          phase3.card.inside &&
          phase3.card.shots === 3,
      ),
      profileDrawer: Boolean(phase3.drawer && phase3.drawer.visible && phase3.drawer.name === '李寒衣' && phase3.drawer.iframeAlive),
      illustrationLibrary: Boolean(
        phase3.images &&
          phase3.images.count === 2 &&
          phase3.images.blob &&
          phase3.images.reordered &&
          phase3.images.avatar &&
          phase3.images.lightbox,
      ),
      duplicateHighlight: Boolean(
        phase3.duplicate &&
          phase3.duplicate.editorOpened &&
          phase3.duplicate.notes === 1 &&
          phase3.duplicate.toast.includes('已经高亮过'),
      ),
      noteCharacter: Boolean(phase3.noteCharacter && phase3.noteCharacter.characterIds.length === 1),
      noteAggregated: phase3.noteAggregated === true,
      appearances: Boolean(phase3.appearances && phase3.appearances.count >= 2),
      appearanceJump: Boolean(phase3.jump && phase3.jump.chapter.includes('第二章') && phase3.jump.marks > 0),
      persistence: Boolean(
        phase4.persisted &&
          phase4.persisted.characters === 1 &&
          phase4.persisted.images === 2 &&
          phase4.persisted.tiles === 1 &&
          phase4.persisted.avatar &&
          phase4.persisted.imageBlobs,
      ),
      bookFilter: Boolean(
        phase4.persisted && phase4.persisted.filteredTiles === 1 && phase4.persisted.filterOptions >= 5,
      ),
      imagePasteDelete: Boolean(phase4.persisted && phase4.persisted.pasted && phase4.persisted.deleted === 2),
      markToggle: Boolean(phase4.markToggle && phase4.markToggle.offCount === 0 && phase4.markToggle.onCount > 0),
      txtCharacter: Boolean(
        phase4.txt &&
          phase4.txt.marks > 0 &&
          phase4.txt.characterCount === 2 &&
          phase4.txt.bookScoped &&
          phase4.txt.hover &&
          phase4.txt.hover.name === '李寒衣' &&
          phase4.txt.drawer === '李寒衣',
      ),
      coverFallback: Boolean(
        phase4.cover && phase4.cover.generated && !phase4.cover.hasImage && phase4.cover.detail.includes('3 章'),
      ),
      footnoteChapter: Boolean(
        phase4.cover &&
          phase4.cover.bookMeta &&
          phase4.cover.bookMeta.chapterCount === 3 &&
          phase4.cover.toc === 4 &&
          phase4.cover.tocLast === '注释' &&
          phase4.cover.footer.includes('1 / 3'),
      ),
      noPageErrors: consoleLogs.filter((line) => /error|uncaught|exception/i.test(line)).length === 0,
    },
    timings: {
      importSmallMs: phase1.importMs,
      bigImportMs: phase2b.big && phase2b.big.importMs,
      bigOpenMs: phase2b.big && phase2b.big.openMs,
    },
    download,
    consoleLogs: consoleLogs.slice(-30),
  }
  console.log('SUMMARY', JSON.stringify(summary, null, 2))
  const failed = Object.entries(summary.checks).filter(([, value]) => !value).map(([key]) => key)
  console.log('FAILED CHECKS:', failed.length ? failed.join(', ') : '(none)')
  app.exit(failed.length ? 1 : 0)
}

setTimeout(() => {
  console.log('E2E TIMEOUT')
  app.exit(2)
}, 420000)

main().catch((error) => {
  console.log('E2E MAIN ERROR', error && error.stack ? error.stack : String(error))
  app.exit(3)
})
