const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
