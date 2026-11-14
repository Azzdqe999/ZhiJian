const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

app.disableHardwareAcceleration()

const profile = path.join(__dirname, '..', 'tmp-e2e-profile')
fs.mkdirSync(profile, { recursive: true })
app.setPath('userData', profile)

const resultFile = path.join(__dirname, '..', 'tmp-e2e-result.json')
const phase = process.env.E2E_PHASE || '1'

function writeResult(value) {
  fs.writeFileSync(resultFile, JSON.stringify(value, null, 2), 'utf8')
}

async function phase1() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const waitFor = async (fn, label, timeout = 20000) => {
    const started = Date.now()
    let last
    while (Date.now() - started < timeout) {
      try {
        last = fn()
        if (last) return last
      } catch (error) {
        last = error
      }
      await wait(100)
    }
    throw new Error('等待超时：' + label)
  }

  await waitFor(() => document.querySelector('.empty') || document.querySelector('.book'), '书架加载')
  if (!document.querySelector('.empty')) throw new Error('新 profile 下书架不是空的')

  const text = [
    '第一章 风起',
    '',
    '风从北边来，吹动渡口的木桩。她把斗笠压低，听见冰面下有水在走。',
    '',
    '第二章 夜行',
    '',
    '夜色落在长街上，灯一盏一盏亮起来。',
    '',
    '第三章 旧渡',
    '',
    '旧渡口的船还在，船篷上积了薄薄一层雪。',
    '',
  ].join('\n')

  const file = new File([text], '冒烟测试-三章.txt', { type: 'text/plain' })
  const transfer = new DataTransfer()
  transfer.items.add(file)
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))

  await waitFor(
    () => Array.from(document.querySelectorAll('.book-title')).find((el) => el.textContent.includes('冒烟测试')),
    '拖拽导入后书架出现新书',
  )
  const toast = document.querySelector('.toast') ? document.querySelector('.toast').textContent : ''

  document.querySelector('.book-open').click()
  await waitFor(() => {
    const head = document.querySelector('.page h2')
    return head && head.textContent.includes('第一章 风起')
  }, '阅读页显示第一章')

  const firstTitle = document.querySelector('.page h2').textContent
  const nextButton = document.querySelectorAll('.chapter-nav button')[1]
  nextButton.click()
  await waitFor(() => {
    const head = document.querySelector('.page h2')
    return head && head.textContent.includes('第二章 夜行')
  }, '下一章切换')

  const secondTitle = document.querySelector('.page h2').textContent
  document.querySelector('.toc-btn').click()
  await waitFor(() => document.querySelectorAll('.toc-item').length === 3, '目录抽屉列出 3 章')
  const tocTitles = Array.from(document.querySelectorAll('.toc-item')).map((el) => el.textContent)
  document.querySelectorAll('.toc-item')[2].click()
  await waitFor(() => {
    const head = document.querySelector('.page h2')
    return head && head.textContent.includes('第三章 旧渡')
  }, '目录跳转到第三章')
  const thirdTitle = document.querySelector('.page h2').textContent

  document.querySelector('.theme-btn').click()
  const appClass = document.querySelector('.app').className

  const minus = document.querySelector('.tools button')
  minus.click()
  await wait(250)
  const pageFont = getComputedStyle(document.querySelector('.page')).fontSize

  await wait(1600)
  return {
    toast,
    firstTitle,
    secondTitle,
    thirdTitle,
    tocCount: tocTitles.length,
    tocTitles,
    appClass,
    pageFont,
    progressText: document.querySelector('.chapter-meta') ? document.querySelector('.chapter-meta').textContent : '',
  }
}

async function phase2() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const waitFor = async (fn, label, timeout = 20000) => {
    const started = Date.now()
    let last
    while (Date.now() - started < timeout) {
      try {
        last = fn()
        if (last) return last
      } catch (error) {
        last = error
      }
      await wait(100)
    }
    throw new Error('等待超时：' + label)
  }

  await waitFor(() => document.querySelector('.book-title'), '重启后书架恢复')
  const bookTitle = document.querySelector('.book-title').textContent
  const appClass = document.querySelector('.app').className

  document.querySelector('.book-open').click()
  await waitFor(() => document.querySelector('.page h2'), '重启后打开阅读页')
  await wait(400)

  return {
    bookTitle,
    appClass,
    chapterTitle: document.querySelector('.page h2').textContent,
    pageFont: getComputedStyle(document.querySelector('.page')).fontSize,
    progressText: document.querySelector('.chapter-meta') ? document.querySelector('.chapter-meta').textContent : '',
    chapterCount: document.querySelectorAll('.toc-item').length,
  }
}

async function phase3() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const waitFor = async (fn, label, timeout = 20000) => {
    const started = Date.now()
    let last
    while (Date.now() - started < timeout) {
      try {
        last = fn()
        if (last) return last
      } catch (error) {
        last = error
      }
      await wait(100)
    }
    throw new Error('等待超时：' + label)
  }

  await waitFor(() => document.querySelector('.book-title'), '书架恢复')
  document.querySelector('.book-more').click()
  await waitFor(() => document.querySelector('.modal'), '书籍详情弹层')
  const select = document.querySelector('#encoding-select')
  const optionCount = select.options.length

  select.value = 'big5'
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await wait(120)
  const reload1 = Array.from(document.querySelectorAll('.modal .btn')).find((btn) => btn.textContent.includes('重新载入'))
  reload1.click()
  const notice1 = await waitFor(() => {
    const notice = document.querySelector('.notice')
    return notice && notice.textContent.includes('重新载入') ? notice.textContent : ''
  }, 'Big5 重载提示', 15000)
  const subAfterBig5 = document.querySelector('.modal-sub').textContent

  select.value = 'utf-8'
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await wait(120)
  const reload2 = Array.from(document.querySelectorAll('.modal .btn')).find((btn) => btn.textContent.includes('重新载入'))
  reload2.click()
  const notice2 = await waitFor(() => {
    const notice = document.querySelector('.notice')
    return notice && notice.textContent.includes('UTF-8') && notice.textContent.includes('3 章') ? notice.textContent : ''
  }, '切回 UTF-8 后恢复 3 章', 15000)
  const subRestored = document.querySelector('.modal-sub').textContent

  document.querySelector('.modal-close').click()
  await wait(300)
  document.querySelector('.book-open').click()
  await waitFor(() => document.querySelector('.page h2'), '再次打开阅读页')
  await wait(300)
  return {
    optionCount,
    notice1,
    subAfterBig5,
    notice2,
    subRestored,
    firstTitle: document.querySelector('.page h2').textContent,
  }
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 860,
    backgroundColor: '#f6f2e9',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  win.webContents.on('did-fail-load', (_event, code, description) => {
    writeResult({ ok: false, phase, error: 'did-fail-load ' + code + ' ' + description })
    app.quit()
  })
  try {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    const fn = phase === '3' ? phase3 : phase === '2' ? phase2 : phase1
    const result = await win.webContents.executeJavaScript('(' + fn.toString() + ')()')
    writeResult({ ok: true, phase, result })
  } catch (error) {
    writeResult({ ok: false, phase, error: error && error.message ? error.message : String(error) })
  }
  await new Promise((resolve) => setTimeout(resolve, 400))
  app.quit()
})