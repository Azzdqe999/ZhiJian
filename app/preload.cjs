const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('paperSync', {
  request: (opts) => ipcRenderer.invoke('paper-sync:request', opts),
})
