# fix-electron.ps1
# Run this from the secondmind root folder if the desktop app fails with
# "Electron failed to install correctly, please delete node_modules/electron and try installing again"

$electronPkg = Get-Content "node_modules\electron\package.json" | ConvertFrom-Json
$version = $electronPkg.version
$distPath = "node_modules\electron\dist"
$electronExe = Join-Path $distPath "electron.exe"

if (Test-Path $electronExe) {
    Write-Host "Electron is already installed correctly ($version)." -ForegroundColor Green
    exit 0
}

Write-Host "Electron binary missing (v$version). Attempting to fix..." -ForegroundColor Yellow

# Trigger the download if it hasn't happened yet
$cacheRoot = Join-Path $env:LOCALAPPDATA "electron\Cache"
$zip = Get-ChildItem -Recurse $cacheRoot -Filter "electron-v$version-win32-x64.zip" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $zip) {
    Write-Host "Downloading Electron binary (this may take a minute)..." -ForegroundColor Cyan
    node node_modules\electron\install.js
    $zip = Get-ChildItem -Recurse $cacheRoot -Filter "electron-v$version-win32-x64.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
}

if (-not $zip) {
    Write-Host "ERROR: Could not find or download electron-v$version-win32-x64.zip" -ForegroundColor Red
    Write-Host "Check your internet connection and try again." -ForegroundColor Red
    exit 1
}

Write-Host "Extracting from cache..." -ForegroundColor Cyan
Expand-Archive -Path $zip.FullName -DestinationPath $distPath -Force

"electron.exe" | Out-File -FilePath "node_modules\electron\path.txt" -Encoding ascii -NoNewline
$version | Out-File -FilePath "$distPath\version" -Encoding ascii -NoNewline

if (Test-Path $electronExe) {
    Write-Host "Done! Electron fixed. Try running the app again." -ForegroundColor Green
} else {
    Write-Host "ERROR: electron.exe still not found after extraction. Something went wrong." -ForegroundColor Red
    exit 1
}
