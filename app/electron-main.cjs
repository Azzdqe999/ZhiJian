const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const readline = require('node:readline')

function statePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function readWindowState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeWindowState(next) {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true })
    fs.writeFileSync(statePath(), JSON.stringify(next))
  } catch {
    /* 状态写入失败不影响窗口 */
  }
}

function applyAlwaysOnTop(win, value) {
  if (!win || win.isDestroyed()) return false
  const next = Boolean(value)
  win.setAlwaysOnTop(next)
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(next, { visibleOnFullScreen: true })
  }
  writeWindowState({ ...readWindowState(), alwaysOnTop: next })
  return next
}

let ttsProcess = null
let ttsSequence = 0
let overlayWindow = null
let overlayOwner = null
const ttsWaiters = new Map()

function ttsHelperPath() {
  const local = path.join(__dirname, 'resources', 'tts-helper.exe')
  if (fs.existsSync(local)) return local
  return path.join(process.resourcesPath, 'tts-helper.exe')
}

function ensureTtsProcess() {
  if (ttsProcess && !ttsProcess.killed) return ttsProcess
  const exe = ttsHelperPath()
  if (!fs.existsSync(exe)) throw new Error('TTS 组件缺失：resources/tts-helper.exe')
  ttsProcess = spawn(exe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  readline.createInterface({ input: ttsProcess.stdout }).on('line', (line) => {
    try {
      const message = JSON.parse(line)
      const waiter = ttsWaiters.get(message.id)
      if (!waiter) return
      ttsWaiters.delete(message.id)
      clearTimeout(waiter.timer)
      if (message.ok) waiter.resolve(message.path)
      else waiter.reject(new Error(message.error || 'TTS 合成失败'))
    } catch {
      /* 忽略非 JSON 输出 */
    }
  })
  ttsProcess.on('exit', () => {
    ttsProcess = null
    for (const waiter of ttsWaiters.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('TTS 进程已退出'))
    }
    ttsWaiters.clear()
  })
  return ttsProcess
}

function ensureOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow
  overlayWindow = new BrowserWindow({
    width: 520,
    height: 230,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: true,
    backgroundColor: '#1b1a18',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'overlay-preload.cjs'),
    },
  })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.loadFile(path.join(__dirname, 'tts-overlay.html'))
  overlayWindow.once('ready-to-show', () => overlayWindow?.showInactive())
  overlayWindow.on('closed', () => { overlayWindow = null; overlayOwner = null })
  const area = require('electron').screen.getPrimaryDisplay().workArea
  overlayWindow.setPosition(area.x + area.width - 540, area.y + area.height - 250)
  return overlayWindow
}

ipcMain.handle('paper-tts:overlay', (event, payload) => {
  const win = ensureOverlayWindow()
  overlayOwner = event.sender
  win.showInactive()
  win.webContents.send('paper-overlay:update', payload)
  return true
})

ipcMain.handle('paper-tts:overlay:hide', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide()
  return true
})

ipcMain.handle('paper-tts:overlay:action', (_event, action) => {
  if (action === 'close' && overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide()
  if (overlayOwner && !overlayOwner.isDestroyed()) overlayOwner.send('paper-tts:action', action)
  return true
})

ipcMain.handle('paper-tts:speak', async (_event, options) => {
  const process = ensureTtsProcess()
  const id = String(++ttsSequence)
  const out = path.join(app.getPath('temp'), 'paper-tts-' + id + '.mp3')
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ttsWaiters.delete(id)
      reject(new Error('TTS 合成超时'))
    }, 60000)
    ttsWaiters.set(id, { resolve, reject, timer })
  })
  process.stdin.write(JSON.stringify({
    id,
    text: options.text,
    voice: options.voice || 'zh-CN-XiaoyiNeural',
    rate: options.rate || '-8%',
    path: out,
  }) + '\n')
  await result
  const buffer = await fs.promises.readFile(out)
  await fs.promises.unlink(out).catch(() => {})
  return buffer.toString('base64')
})

ipcMain.handle('paper-window:set-always-on-top', (event, value) => {
  return applyAlwaysOnTop(BrowserWindow.fromWebContents(event.sender), value)
})

ipcMain.handle('paper-window:get-always-on-top', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win ? win.isAlwaysOnTop() : false
})

ipcMain.handle('paper-sync:request', async (_event, opts) => {
  const body = opts.body == null
    ? undefined
    : (typeof opts.body === 'string' ? Buffer.from(opts.body, 'utf8') : Buffer.from(opts.body))
  const res = await fetch(opts.url, {
    method: opts.method,
    headers: opts.headers || {},
    body,
  })
  const buf = Buffer.from(await res.arrayBuffer())
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: buf,
  }
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f6f2e9',
    autoHideMenuBar: true,
    title: '纸间',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })
  const saved = readWindowState()
  if (saved.alwaysOnTop) applyAlwaysOnTop(win, true)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 't') {
      event.preventDefault()
      applyAlwaysOnTop(win, !win.isAlwaysOnTop())
    }
  })
  win.loadFile(path.join(__dirname, 'dist/index.html'))
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  if (ttsProcess && !ttsProcess.killed) ttsProcess.kill()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
