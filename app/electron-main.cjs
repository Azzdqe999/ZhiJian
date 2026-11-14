const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const path = require('node:path')

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
