#!/bin/bash
# 重啟 midi2Score FastAPI 伺服器
cd "$(dirname "$0")"

# 查找 main.py 相關進程
PIDS=$(ps aux | grep '[p]ython3\? main.py' | awk '{print $2}')
if [ -n "$PIDS" ]; then
  echo "正在終止現有 FastAPI 進程: $PIDS"
  kill $PIDS
  sleep 2
fi

# 重新啟動 FastAPI 伺服器
nohup python3 main.py > backend.log 2>&1 &
NEW_PID=$!
echo "已重啟 FastAPI 伺服器，PID: $NEW_PID"
