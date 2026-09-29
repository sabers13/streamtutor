@echo off
setlocal enabledelayedexpansion

echo ==========================================================
echo   StreamTutor Backend - Starting up (Windows)
echo ==========================================================

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "VENV_DIR=%BACKEND_DIR%\.venv"

:: Find Python
set "PY_CMD="
where python >nul 2>nul
if %errorlevel% equ 0 (
    set "PY_CMD=python"
) else (
    where py >nul 2>nul
    if %errorlevel% equ 0 (
        set "PY_CMD=py"
    )
)

if "%PY_CMD%"=="" (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo (Make sure to check "Add Python to PATH" during installation)
    pause
    exit /b 1
)

:: Create venv if not exists
if not exist "%VENV_DIR%\Scripts\activate.bat" (
    echo [SETUP] Creating virtual environment in %VENV_DIR%...
    "%PY_CMD%" -m venv "%VENV_DIR%"
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

:: Activate venv
call "%VENV_DIR%\Scripts\activate.bat"

:: Install dependencies
echo [SETUP] Installing required Python packages...
python -m pip install -q --upgrade pip
python -m pip install -q -r "%BACKEND_DIR%\requirements.txt"
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

echo [OK] Dependencies are ready.
echo [START] Running StreamTutor server on http://127.0.0.1:8000...
echo Health check: http://127.0.0.1:8000/health
echo Press Ctrl+C to stop.
echo ==========================================================

cd /d "%BACKEND_DIR%"
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
