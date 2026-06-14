const { app, BrowserWindow, shell } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const os = require('os')

let mainWindow
let backendProcess

function startBackend() {
  const isWin = os.platform() === 'win32'
  const python = isWin
    ? path.join(__dirname, '../backend/venv/Scripts/python.exe')
    : path.join(__dirname, '../backend/venv/bin/python')

  backendProcess = spawn(
    python,
    ['-m', 'uvicorn', 'main:app', '--port', '8000', '--no-access-log'],
    { cwd: path.join(__dirname, '../backend'), stdio: 'pipe' }
  )

  backendProcess.stderr.on('data', d => process.stdout.write(`[backend] ${d}`))
  backendProcess.on('error', err => console.error('Backend failed to start:', err.message))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'secondmind',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'))
  }

  // Open external links in the system browser instead of a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  startBackend()
  setTimeout(createWindow, 1500) // give the backend a moment to bind to :8000

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill()
  if (os.platform() !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill()
})
