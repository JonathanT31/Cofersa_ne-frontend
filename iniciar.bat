@echo off
title Panel de Control Cofersa
cls

echo ===================================================
echo   Iniciando Servicios del Ecosistema Cofersa...
echo ===================================================

:: 1. Iniciar el Backend (cofersa-api con Python)
echo Levantando API (Python)...
start "Cofersa API - Backend" cmd /k "cd /d "%~dp0cofersa-api" && python main.py"

:: 2. Iniciar el Frontend (cofersa-frontend con npm)
echo Levantando Frontend (Node/React)...
start "Cofersa Frontend" cmd /k "cd /d "%~dp0cofersa-frontend" && npm run dev"

echo ===================================================
echo   [OK] Ambas consolas han sido levantadas.
echo   Puedes cerrar esta ventana principal.
echo ===================================================
timeout /t 5