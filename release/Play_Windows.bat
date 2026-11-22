@echo off
setlocal
cd /d "%~dp0"
title Command & Conquer: Generals HTML5 — Local Launcher

set "PORT=8080"
set "URL=http://localhost:%PORT%"

echo ====================================================================
echo   Command ^& Conquer: Generals HTML5 Edition — Local Launcher
echo ====================================================================
echo.

if exist "%~dp0runtime\node.exe" (
    echo [OK] Using bundled portable Node.js! Starting full Offline + LAN Multiplayer server...
    echo      Opening %URL% in your browser...
    echo      (Keep this window open while playing. Press Ctrl+C to stop.)
    echo.
    start "" "%URL%"
    "%~dp0runtime\node.exe" scripts\lan_server.mjs --no-build --port=%PORT%
    goto :end
)

where node >nul 2>&1
if %ERRORLEVEL%==0 (
    echo [OK] Node.js detected! Starting full Offline + LAN Multiplayer server...
    echo      Opening %URL% in your browser...
    echo      (Keep this window open while playing. Press Ctrl+C to stop.)
    echo.
    start "" "%URL%"
    node scripts\lan_server.mjs --no-build --port=%PORT%
    goto :end
)

where python >nul 2>&1
if %ERRORLEVEL%==0 (
    echo [OK] Python detected! Starting Offline Skirmish server...
    echo      (Tip: Install Node.js from https://nodejs.org for LAN Multiplayer.)
    echo      Opening %URL% in your browser...
    echo      (Keep this window open while playing. Press Ctrl+C to stop.)
    echo.
    start "" "%URL%"
    python -m http.server %PORT%
    goto :end
)

echo [OK] Starting built-in Windows PowerShell server (Offline Skirmish)...
echo      (Tip: Install Node.js from https://nodejs.org for LAN Multiplayer.)
echo      Opening %URL% in your browser...
echo      (Keep this window open while playing. Press Ctrl+C to stop.)
echo.
start "" "%URL%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = (Get-Location).Path; $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://localhost:%PORT%/'); $listener.Start(); Write-Host 'Serving at http://localhost:%PORT%/ (Press Ctrl+C to stop)'; $mime = @{'.html'='text/html; charset=utf-8';'.js'='application/javascript; charset=utf-8';'.mjs'='application/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json; charset=utf-8';'.png'='image/png';'.jpg'='image/jpeg';'.svg'='image/svg+xml';'.wav'='audio/wav';'.mp3'='audio/mpeg'}; while ($listener.IsListening) { $ctx = $listener.GetContext(); $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/')); if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }; $file = Join-Path $root $rel; if ((Test-Path $file -PathType Leaf) -and ([IO.Path]::GetFullPath($file).StartsWith($root))) { $ext = [IO.Path]::GetExtension($file).ToLower(); $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }; $bytes = [IO.File]::ReadAllBytes($file); $ctx.Response.ContentLength64 = $bytes.Length; $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) } else { $ctx.Response.StatusCode = 404 }; $ctx.Response.Close() }"

:end
echo.
echo Server stopped. You can close this window now.
pause
