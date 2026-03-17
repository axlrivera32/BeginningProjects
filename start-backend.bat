@echo off
setlocal

echo.
echo ============================================================
echo  NexDeFi v5 -- Backend Startup
echo ============================================================
echo.

REM -- 1. Check Python version (3.10-3.13 recommended) ----------
python --version 2>nul
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.12 from python.org
    pause & exit /b 1
)

for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo Python version: %PY_VER%

REM -- 2. Create venv if missing --------------------------------
if not exist "venv\Scripts\activate.bat" (
    echo [INFO] Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create venv.
        echo  If using Python 3.14 try: py -3.12 -m venv venv
        pause & exit /b 1
    )
)

REM -- 3. Activate ----------------------------------------------
call venv\Scripts\activate.bat

REM -- 4. Upgrade pip silently ----------------------------------
python -m pip install --upgrade pip -q

REM -- 5. Install dependencies ----------------------------------
echo [INFO] Installing backend dependencies...
pip install -r backend\requirements.txt
if errorlevel 1 (
    echo.
    echo [ERROR] pip install failed.
    echo.
    echo  CAUSE: Python 3.14 has no pre-built wheel for pydantic-core.
    echo         pydantic-core requires Rust to compile from source.
    echo.
    echo  FIX A - Install Python 3.12 (recommended):
    echo    https://python.org/downloads/release/python-3129/
    echo    Then run:  py -3.12 -m venv venv
    echo    Then re-run this script.
    echo.
    echo  FIX B - Install Rust so pip can compile pydantic-core:
    echo    https://rustup.rs
    echo    Restart terminal after installing Rust, then re-run.
    echo.
    pause & exit /b 1
)

REM -- 6. Copy .env if missing ----------------------------------
if not exist "backend\.env" (
    if exist "backend\.env.example" copy backend\.env.example backend\.env >nul
    echo [INFO] Created backend\.env from example
)

echo.
echo [OK] Starting NexDeFi backend...
echo      API:  http://localhost:8000
echo      Docs: http://localhost:8000/docs
echo.
echo NOTE: Run this script from the nexdefi-v5\ folder, not from inside backend\
echo.

uvicorn backend.main:app --reload --port 8000
