@echo off
REM Starts the overlay in development mode with a double click.
REM
REM The project needs Node 20.19+. If the node on PATH is older, this script
REM looks for a suitable version installed by nvm-windows and uses it without
REM needing admin (`nvm use` requires elevation to recreate the symlink).

setlocal enabledelayedexpansion
cd /d "%~dp0"

set "GOOD_NODE="

REM 1) Does the node on PATH already work?
for /f "tokens=1 delims=." %%M in ('node --version 2^>nul') do (
    set "MAJOR=%%M"
    set "MAJOR=!MAJOR:v=!"
    if !MAJOR! GEQ 20 set "GOOD_NODE=path"
)

REM 2) Otherwise look in nvm-windows. Keeps the highest version found.
if not defined GOOD_NODE (
    for /d %%D in ("%APPDATA%\nvm\v*") do (
        for /f "tokens=1 delims=." %%M in ("%%~nxD") do (
            set "MAJOR=%%M"
            set "MAJOR=!MAJOR:v=!"
            if !MAJOR! GEQ 20 (
                if exist "%%D\node.exe" set "GOOD_NODE=%%D"
            )
        )
    )
    if defined GOOD_NODE set "PATH=!GOOD_NODE!;%PATH%"
)

if not defined GOOD_NODE (
    echo [error] This project needs Node 20.19 or newer.
    echo         Install it from https://nodejs.org and run again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
)

REM Electron's postinstall does not always run; without the binary the app
REM will not start.
if not exist "node_modules\electron\path.txt" (
    echo Downloading the Electron binary...
    call node "node_modules\electron\install.js"
)

echo.
echo Starting the overlay... close this window to stop it.
echo.

call npm run dev
