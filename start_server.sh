#!/bin/bash

# 切換到腳本所在目錄
cd "$(dirname "$0")"

# 停止舊的進程 (如果存在) - 可選但推薦
# pkill -f "main.py"
# pkill -f "http.server 8080"

# 啟動 FastAPI 後端（8000端口）使用 uvicorn 命令
# 注意：這裡的 'main:app' 指的是 main.py 文件中的 app FastAPI 實例
nohup uvicorn main:app --host 0.0.0.0 --port 8000 --log-level debug > backend.log 2>&1 &
BACKEND_PID=$!
echo "FastAPI 後端啟動 (Uvicorn)，PID: $BACKEND_PID"

# 啟動前端靜態伺服器（8080端口）
nohup python3 -m http.server 8080 > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "前端靜態伺服器啟動，PID: $FRONTEND_PID"

echo "---"
echo "前端請訪問：http://localhost:8080/index.html"
echo "API 端點：http://localhost:8000"
echo "如需停止服務，請執行: kill $BACKEND_PID $FRONTEND_PID"