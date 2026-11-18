const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('paperSync', {
  request: (opts) => ipcRenderer.invoke('paper-sync:request', opts),
})

contextBridge.exposeInMainWorld('paperWindow', {
  setAlwaysOnTop: (value) => ipcRenderer.invoke('paper-window:set-always-on-top', value),
  getAlwaysOnTop: () => ipcRenderer.invoke('paper-window:get-always-on-top'),
})
