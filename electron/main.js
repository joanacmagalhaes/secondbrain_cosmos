const { app, BrowserWindow, shell, Menu } = require('electron')
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
  const iconExt = os.platform() === 'darwin' ? 'icns' : os.platform() === 'win32' ? 'ico' : 'png'
  const iconPath = path.join(__dirname, `icon.${iconExt}`)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'secondmind',
    icon: require('fs').existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })

  // app.isPackaged is false when running via `electron .` (dev), true when built
  if (!app.isPackaged) {
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
  Menu.setApplicationMenu(null) // remove the default File/Edit/View/Window/Help menu bar
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
