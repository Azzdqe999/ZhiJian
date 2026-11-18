const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('paperSync', {
  request: (opts) => ipcRenderer.invoke('paper-sync:request', opts),
})

contextBridge.exposeInMainWorld('paperTts', {
  synthesize: (options) => ipcRenderer.invoke('paper-tts:speak', options),
})

contextBridge.exposeInMainWorld('paperOverlay', {
  update: (payload) => ipcRenderer.invoke('paper-tts:overlay', payload),
  hide: () => ipcRenderer.invoke('paper-tts:overlay:hide'),
  onAction: (callback) => {
    const handler = (_event, action) => callback(action)
    ipcRenderer.on('paper-tts:action', handler)
    return () => ipcRenderer.removeListener('paper-tts:action', handler)
  },
})

contextBridge.exposeInMainWorld('paperWindow', {
  setAlwaysOnTop: (value) => ipcRenderer.invoke('paper-window:set-always-on-top', value),
  getAlwaysOnTop: () => ipcRenderer.invoke('paper-window:get-always-on-top'),
})
