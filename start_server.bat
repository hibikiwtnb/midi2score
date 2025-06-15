@echo off
REM 切換到腳本所在目錄
cd /d %~dp0

REM 啟動 FastAPI 後端（8000端口）
start "FastAPI" cmd /c "python main.py > backend.log 2>&1"

REM 啟動前端靜態伺服器（8080端口）
start "Frontend" cmd /c "python -m http.server 8080 > frontend.log 2>&1"

REM 提示信息
@echo -----------------------------------
@echo 前端請訪問：http://localhost:8080/index.html
@echo API 端點：http://localhost:8000
@echo 如需停止服務，請關閉對應命令視窗
@echo -----------------------------------
