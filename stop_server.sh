#!/bin/bash

# 切換到腳本所在目錄
cd "$(dirname "$0")"

echo "正在嘗試停止伺服器進程..."

# 定義 PID 檔案的路徑 (與 start_server.sh 中隱含的 PID 儲存方式對應)
# 由於 start_server.sh 並沒有顯式儲存 PID 到檔案，
# 我們將依賴 pkill 通過命令名稱來查找。
# 如果 start_server.sh 未來會儲存 PID 到檔案，可以取消註解以下行並修改 start_server.sh
# BACKEND_PID_FILE="backend.pid"
# FRONTEND_PID_FILE="frontend.pid"

# 停止 FastAPI 後端 (Uvicorn)
echo "正在停止 FastAPI 後端 (Uvicorn)..."
# if [ -f "$BACKEND_PID_FILE" ]; then
#     BACKEND_PID_TO_KILL=$(cat "$BACKEND_PID_FILE")
#     if ps -p $BACKEND_PID_TO_KILL > /dev/null; then
#         kill $BACKEND_PID_TO_KILL
#         rm -f "$BACKEND_PID_FILE"
#         echo "FastAPI 後端 (PID: $BACKEND_PID_TO_KILL) 已停止。"
#     else
#         echo "找不到 PID 為 $BACKEND_PID_TO_KILL 的 FastAPI 後端進程，可能已停止。"
#         rm -f "$BACKEND_PID_FILE" # 清理無效的 PID 檔案
#     fi
# else
#     echo "找不到 FastAPI 後端 PID 檔案。嘗試通過名稱停止..."
    pkill -f "uvicorn main:app --host 0.0.0.0 --port 8000"
    if [ $? -eq 0 ]; then
        echo "已通過名稱停止 FastAPI 後端 (uvicorn main:app)。"
    else
        echo "未找到運行的 FastAPI 後端 (uvicorn main:app) 或停止失敗。"
    fi
# fi

# 停止前端靜態伺服器 (http.server)
echo "正在停止前端靜態伺服器 (http.server)..."
# if [ -f "$FRONTEND_PID_FILE" ]; then
#     FRONTEND_PID_TO_KILL=$(cat "$FRONTEND_PID_FILE")
#     if ps -p $FRONTEND_PID_TO_KILL > /dev/null; then
#         kill $FRONTEND_PID_TO_KILL
#         rm -f "$FRONTEND_PID_FILE"
#         echo "前端伺服器 (PID: $FRONTEND_PID_TO_KILL) 已停止。"
#     else
#         echo "找不到 PID 為 $FRONTEND_PID_TO_KILL 的前端伺服器進程，可能已停止。"
#         rm -f "$FRONTEND_PID_FILE" # 清理無效的 PID 檔案
#     fi
# else
#     echo "找不到前端伺服器 PID 檔案。嘗試通過名稱停止..."
    # 假設前端伺服器在 8080 端口運行
    # 如果你的 start_server.sh 中的端口是變數，這裡需要對應修改
    FRONTEND_PORT_IN_USE=$(grep 'python3 -m http.server' start_server.sh | grep -oE '[0-9]{4,5}' | head -n 1)
    if [ -z "$FRONTEND_PORT_IN_USE" ]; then
        FRONTEND_PORT_IN_USE="8080" # 預設值
        echo "警告：無法從 start_server.sh 中檢測到前端端口，使用預設值 $FRONTEND_PORT_IN_USE"
    fi
    pkill -f "python3 -m http.server $FRONTEND_PORT_IN_USE"
    if [ $? -eq 0 ]; then
        echo "已通過名稱停止前端伺服器 (http.server on port $FRONTEND_PORT_IN_USE)。"
    else
        echo "未找到運行的前端伺服器 (http.server on port $FRONTEND_PORT_IN_USE) 或停止失敗。"
    fi
# fi

echo "所有伺服器停止操作完成。"