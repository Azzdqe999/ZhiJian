const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('paperOverlay', {
  onUpdate: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('paper-overlay:update', handler)
    return () => ipcRenderer.removeListener('paper-overlay:update', handler)
  },
  action: (name) => ipcRenderer.invoke('paper-tts:overlay:action', name),
  close: () => ipcRenderer.invoke('paper-tts:overlay:action', 'close'),
})
