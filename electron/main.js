const { app, BrowserWindow, shell, Menu, dialog, globalShortcut, ipcMain } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')

const isDev   = !app.isPackaged
const VITE_DEV = !!process.env.VITE_DEV  // true quando iniciado via dev.bat
const PORT = 8000

// ── Instância única ───────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

let mainWindow = null
let splashWindow = null
let backendProcess = null

// ── Log ───────────────────────────────────────────────────────────────────────
const LOG_FILE = isDev
  ? path.join(__dirname, '..', 'flightlog-dev.log')
  : path.join(app.getPath('userData'), 'flightlog.log')

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  if (isDev) process.stdout.write(line)
  try { fs.appendFileSync(LOG_FILE, line) } catch {}
}

try { fs.writeFileSync(LOG_FILE, `=== FlightLog ${app.getVersion()} iniciado ${new Date().toISOString()} ===\n`) } catch {}

// ── Caminho do banco de dados ─────────────────────────────────────────────────
function getDbPath() {
  return isDev
    ? path.join(__dirname, '..', 'backend', 'logbook.db')
    : path.join(app.getPath('userData'), 'logbook.db')
}

// ── Verifica se a porta já está em uso ───────────────────────────────────────
function isPortInUse() {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${PORT}/health`, res => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(500, () => { req.destroy(); resolve(false) })
  })
}

// ── Backend ──────────────────────────────────────────────────────────────────
function startBackend() {
  let cmd, args, cwd

  if (isDev) {
    cwd  = path.join(__dirname, '..', 'backend')
    cmd  = 'python'
    args = ['-m', 'uvicorn', 'main:app', '--port', String(PORT), '--host', '127.0.0.1']
  } else {
    const exePath = path.join(process.resourcesPath, 'flightlog-backend.exe')
    if (!fs.existsSync(exePath)) {
      log(`ERRO: backend não encontrado em ${exePath}`)
      return false
    }
    cwd = process.resourcesPath
    cmd = exePath
    args = []
  }

  log(`Iniciando backend: ${path.basename(cmd)}`)
  backendProcess = spawn(cmd, args, { cwd, stdio: 'pipe', windowsHide: true })
  backendProcess.stdout.on('data', d => log(`[BE] ${d.toString().trim()}`))
  backendProcess.stderr.on('data', d => log(`[BE ERR] ${d.toString().trim()}`))
  backendProcess.on('exit', code => log(`[BE] encerrou (código ${code})`))
  backendProcess.on('error', err => log(`[BE] erro: ${err.message}`))
  return true
}

// ── Aguarda backend responder ─────────────────────────────────────────────────
function waitForBackend(retries = 40) {
  return new Promise((resolve, reject) => {
    const check = (n) => {
      if (n <= 0) return reject(new Error('O servidor interno não respondeu.\nTente reabrir o app.'))
      const req = http.get(`http://127.0.0.1:${PORT}/health`, res => {
        if (res.statusCode === 200) { log('Backend pronto'); resolve() }
        else setTimeout(() => check(n - 1), 500)
      })
      req.on('error', () => setTimeout(() => check(n - 1), 500))
      req.setTimeout(400, () => req.destroy())
    }
    check(retries)
  })
}

// ── Splash ────────────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
  splashWindow.on('closed', () => { splashWindow = null })
}

function setSplashStatus(msg) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(`setStatus(${JSON.stringify(msg)})`).catch(() => {})
  }
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy()
    splashWindow = null
  }
}

// ── Janela principal ─────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico')

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'FlightLog',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#060f1e',
    show: false,   // mostra só depois de pronto (evita flash branco)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  Menu.setApplicationMenu(null)

  if (isDev) {
    const devUrl = VITE_DEV
      ? 'http://localhost:5173'           // Vite HMR — dev.bat
      : `http://127.0.0.1:${PORT}`       // uvicorn  — npm start

    // Em dev, tenta recarregar automaticamente se o servidor ainda não estiver pronto
    const loadWithRetry = (url, attempt = 1) => {
      log(`Carregando ${url} (tentativa ${attempt})`)
      mainWindow.loadURL(url).catch(() => {})
    }

    mainWindow.webContents.on('did-fail-load', (_, code) => {
      if (code === -102 || code === -6 || code === -105) {
        // Servidor ainda não está pronto — tenta de novo em 1.5s
        log(`Servidor dev não pronto (${code}), tentando novamente...`)
        setTimeout(() => mainWindow && loadWithRetry(devUrl), 1500)
      }
    })

    loadWithRetry(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const candidates = [
      path.join(process.resourcesPath, '..', 'frontend', 'dist', 'index.html'),
      path.join(path.dirname(app.getPath('exe')), 'frontend', 'dist', 'index.html'),
      path.join(process.resourcesPath, 'frontend', 'dist', 'index.html'),
    ]
    const htmlPath = candidates.find(c => fs.existsSync(c))
    if (htmlPath) {
      log(`Carregando: ${htmlPath}`)
      mainWindow.loadFile(htmlPath)
    } else {
      log('ERRO: index.html não encontrado')
      dialog.showErrorBox('FlightLog — Erro', `Interface não encontrada.\nReinstalair o app pode resolver.\n\nLog: ${LOG_FILE}`)
      app.quit()
      return
    }
  }

  mainWindow.webContents.on('did-fail-load', (_, code, desc) => log(`Falha: ${desc} (${code})`))
  mainWindow.webContents.once('did-finish-load', () => {
    log('Interface carregada')
    closeSplash()
    mainWindow.show()
  })

  // Em dev, garante que a janela apareça mesmo sem splash
  if (isDev) {
    mainWindow.show()
  }

  // Links externos → navegador
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Ctrl+Shift+I → DevTools (atalho escondido)
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools()
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── IPC: Backup e Restore do banco ───────────────────────────────────────────
ipcMain.handle('get-db-path', () => getDbPath())

ipcMain.handle('backup-db', async () => {
  const dbPath = getDbPath()
  if (!fs.existsSync(dbPath)) return { success: false, error: 'Banco de dados não encontrado.' }

  const today = new Date().toISOString().slice(0, 10)
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar backup do logbook',
    defaultPath: `FlightLog-backup-${today}.db`,
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
  })
  if (canceled || !filePath) return { success: false, cancelled: true }

  try {
    fs.copyFileSync(dbPath, filePath)
    log(`Backup salvo em: ${filePath}`)
    return { success: true, filePath }
  } catch (err) {
    log(`Erro no backup: ${err.message}`)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('restore-db', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Restaurar backup do logbook',
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths?.length) return { success: false, cancelled: true }

  const srcPath = filePaths[0]
  const destPath = getDbPath()

  try {
    log('Restaurando banco — encerrando backend...')
    killBackend()
    await new Promise(r => setTimeout(r, 800)) // aguarda processo encerrar

    fs.copyFileSync(srcPath, destPath)
    log(`Banco restaurado de: ${srcPath}`)

    log('Reiniciando backend...')
    startBackend()
    await waitForBackend(30)
    log('Backend reiniciado com sucesso')

    return { success: true }
  } catch (err) {
    log(`Erro no restore: ${err.message}`)
    return { success: false, error: err.message }
  }
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log(`App pronto — versão ${app.getVersion()}`)

  // Mostra splash imediatamente
  createSplash()

  // Aguarda splash carregar antes de prosseguir (evita status perdido)
  await new Promise(r => setTimeout(r, 400))

  setSplashStatus('Verificando backend...')

  const portaBusy = await isPortInUse()
  if (portaBusy) {
    log('Backend já está rodando — reutilizando')
    setSplashStatus('Conectando ao backend...')
  } else {
    setSplashStatus('Iniciando backend...')
    const ok = startBackend()
    if (!ok) {
      closeSplash()
      dialog.showErrorBox('FlightLog — Erro', `Backend não encontrado.\nReinstalair o app.\n\nLog: ${LOG_FILE}`)
      app.quit()
      return
    }
  }

  try {
    setSplashStatus('Aguardando conexão...')
    await waitForBackend()
    setSplashStatus('Carregando interface...')
    createWindow()
  } catch (err) {
    log(`ERRO FATAL: ${err.message}`)
    closeSplash()
    dialog.showErrorBox('FlightLog — Erro ao iniciar', err.message)
    app.quit()
  }
})

function killBackend() {
  if (!backendProcess || backendProcess.killed) return
  try {
    require('child_process').execSync(`taskkill /F /T /PID ${backendProcess.pid}`, { stdio: 'ignore' })
  } catch {
    backendProcess.kill()
  }
  backendProcess = null
  log('Backend encerrado')
}

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  killBackend()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killBackend()
})
