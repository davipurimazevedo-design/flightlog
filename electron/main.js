const { app, BrowserWindow, shell, Menu, dialog, globalShortcut, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const https = require('https')
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
let botProcess = null
let botWasRunning = false      // já chegou a ficar 'running' nesta sessão?
let botShuttingDownOnPurpose = false  // evita aviso de "offline" ao fechar o app de propósito
// 'starting' | 'running' | 'stopped' | 'unavailable' (sem python/.env/script)
let botStatus = 'stopped'

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

// ── Telegram Bot ─────────────────────────────────────────────────────────────
function findPython() {
  // Tenta localizar o executável Python no sistema
  const candidates = ['python', 'py', 'python3']
  const { execSync } = require('child_process')
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 3000 })
      return cmd
    } catch {}
  }
  // Última tentativa: caminho direto onde o pip instalou (Python 3.14 no Windows)
  const appdata = process.env.APPDATA || ''
  const direct = path.join('C:\\Python314', 'python.exe')
  if (fs.existsSync(direct)) return direct
  return null
}

// ── Lê TELEGRAM_TOKEN e ALLOWED_USER_IDS direto do .env (sem depender do bot.py) ──
function readBotEnv(envFile) {
  const result = { token: null, allowedIds: [] }
  try {
    const content = fs.readFileSync(envFile, 'utf-8')
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const [, key, rawVal] = m
      const val = rawVal.trim().replace(/^["']|["']$/g, '')
      if (key === 'TELEGRAM_TOKEN') result.token = val
      if (key === 'ALLOWED_USER_IDS') {
        result.allowedIds = val.split(',').map(s => s.trim()).filter(Boolean)
      }
    }
  } catch (err) {
    log(`Não consegui ler .env do bot: ${err.message}`)
  }
  return result
}

// ── Envia mensagem via Telegram API direto (não depende do bot.py estar rodando) ──
function sendTelegramMessage(token, chatId, text) {
  return new Promise(resolve => {
    const data = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 8000,
    }, res => { res.on('data', () => {}); res.on('end', () => resolve(true)) })
    req.on('error', err => { log(`Falha ao avisar offline via Telegram: ${err.message}`); resolve(false) })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.write(data)
    req.end()
  })
}

// ── Avisa os usuários autorizados que o bot caiu inesperadamente ─────────────
async function notifyBotOffline(botDir) {
  const envFile = path.join(botDir, '.env')
  const { token, allowedIds } = readBotEnv(envFile)
  if (!token || allowedIds.length === 0) return
  const text = '🔴 *FlightLog Bot ficou offline.*\n\nEle parou de responder inesperadamente. Abra o FlightLog no computador para reiniciá-lo.'
  for (const chatId of allowedIds) {
    await sendTelegramMessage(token, chatId, text)
  }
  log('Aviso de "bot offline" enviado para os usuários autorizados.')
}

function startBot() {
  const botDir = isDev
    ? path.join(__dirname, '..', 'telegram-bot')
    : path.join(process.resourcesPath, 'telegram-bot')

  const botScript = path.join(botDir, 'bot.py')
  const envFile   = path.join(botDir, '.env')

  if (!fs.existsSync(botScript)) {
    log('Bot: bot.py não encontrado — pulando')
    botStatus = 'unavailable'
    return
  }
  if (!fs.existsSync(envFile)) {
    log('Bot: .env não encontrado — pulando (crie o arquivo .env na pasta telegram-bot)')
    botStatus = 'unavailable'
    return
  }

  const pythonCmd = findPython()
  if (!pythonCmd) {
    log('Bot: Python não encontrado no sistema — pulando')
    botStatus = 'unavailable'
    return
  }

  log(`Iniciando Telegram Bot com: ${pythonCmd}`)
  botStatus = 'starting'
  botProcess = spawn(pythonCmd, [botScript], {
    cwd: botDir,
    stdio: 'pipe',
    windowsHide: true,
    env: { ...process.env },  // herda o PATH completo do processo pai
  })
  const handleBotOutput = d => {
    const text = d.toString().trim()
    log(`[BOT] ${text}`)
    // O módulo `logging` do Python escreve no stderr por padrão — checamos os dois fluxos
    if (botStatus === 'starting' && /Bot rodando|Application started/i.test(text)) {
      botStatus = 'running'
      botWasRunning = true
    }
  }
  botProcess.stdout.on('data', handleBotOutput)
  botProcess.stderr.on('data', handleBotOutput)
  botProcess.on('exit', code => {
    log(`[BOT] encerrou (código ${code})`)
    const wasRunning = botStatus === 'running' || botWasRunning
    botStatus = 'stopped'
    botProcess = null
    if (wasRunning && !botShuttingDownOnPurpose) {
      log('Bot caiu inesperadamente — avisando usuários via Telegram...')
      notifyBotOffline(botDir)
    }
    botWasRunning = false
  })
  botProcess.on('error', err => {
    log(`[BOT] erro ao iniciar: ${err.message}`)
    botStatus = 'unavailable'
    botProcess = null
  })
}

function killBot(intentional = true) {
  if (!botProcess || botProcess.killed) return
  if (intentional) botShuttingDownOnPurpose = true
  try {
    require('child_process').execSync(`taskkill /F /T /PID ${botProcess.pid}`, { stdio: 'ignore' })
  } catch {
    botProcess.kill()
  }
  botProcess = null
  botStatus = 'stopped'
  log('Bot encerrado')
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
ipcMain.handle('get-bot-status', () => botStatus)

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
    await checkForUpdatesOnStartup()
    setSplashStatus('Aguardando conexão...')
    await waitForBackend()
    startBot()
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

// ── Auto-update (verificação no splash, antes de abrir a janela) ─────────────
async function checkForUpdatesOnStartup() {
  if (isDev) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  return new Promise((resolve) => {
    setSplashStatus('Verificando atualizações...')

    const done = () => resolve()

    // Timeout: se demorar mais de 8s, continua normalmente
    const timeout = setTimeout(done, 8000)

    autoUpdater.once('update-not-available', () => {
      log('Sem atualizações disponíveis')
      clearTimeout(timeout)
      setSplashStatus('App atualizado!')
      setTimeout(done, 600)
    })

    autoUpdater.once('error', (err) => {
      log(`Erro ao verificar update: ${err.message}`)
      clearTimeout(timeout)
      done()
    })

    autoUpdater.once('update-available', async (info) => {
      clearTimeout(timeout)
      log(`Update disponível: v${info.version}`)

      const { response } = await dialog.showMessageBox({
        type: 'info',
        title: 'Atualização disponível',
        message: `Nova versão disponível: v${info.version}`,
        detail: 'Deseja atualizar agora?\nO app será reiniciado após a instalação.',
        buttons: ['Atualizar agora', 'Agora não'],
        defaultId: 0,
        cancelId: 1,
      })

      if (response === 1) {
        // Usuário escolheu "Agora não" — abre normalmente
        done()
        return
      }

      // Usuário escolheu "Atualizar agora" — baixa e instala
      autoUpdater.on('download-progress', (progress) => {
        const pct = Math.round(progress.percent)
        setSplashStatus(`Baixando atualização... ${pct}%`)
      })

      autoUpdater.once('update-downloaded', () => {
        setSplashStatus('Instalando atualização...')
        setTimeout(() => autoUpdater.quitAndInstall(false, true), 800)
      })

      autoUpdater.downloadUpdate().catch(err => {
        log(`Erro no download: ${err.message}`)
        done()
      })
    })

    autoUpdater.checkForUpdates().catch(err => {
      log(`Erro ao verificar update: ${err.message}`)
      clearTimeout(timeout)
      done()
    })
  })
}

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  killBackend()
  killBot()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killBackend()
  killBot()
})
