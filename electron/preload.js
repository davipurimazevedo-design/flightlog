const { contextBridge, ipcRenderer } = require('electron')

// Expõe apenas o necessário ao frontend via contextBridge (segurança)
contextBridge.exposeInMainWorld('flightlog', {
  version: '1.9.3',
  platform: process.platform,
  isElectron: true,
  backup:    () => ipcRenderer.invoke('backup-db'),
  restore:   () => ipcRenderer.invoke('restore-db'),
  getDbPath: () => ipcRenderer.invoke('get-db-path'),
})
