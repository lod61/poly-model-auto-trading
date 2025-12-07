#!/bin/bash
# 停止后台运行的机器人

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$PROJECT_DIR/logs/bot.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "正在停止机器人 (PID: $PID)..."
        kill "$PID"
        
        # 等待进程结束
        for i in {1..10}; do
            if ! ps -p "$PID" > /dev/null 2>&1; then
                echo "✅ 机器人已停止"
                rm -f "$PID_FILE"
                exit 0
            fi
            sleep 1
        done
        
        # 如果还没停止，强制杀死
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "强制停止..."
            kill -9 "$PID"
            rm -f "$PID_FILE"
            echo "✅ 机器人已强制停止"
        fi
    else
        echo "⚠️  进程不存在 (PID: $PID)"
        rm -f "$PID_FILE"
    fi
else
    # 尝试通过进程名停止
    if pgrep -f "node dist/index.js" > /dev/null; then
        echo "通过进程名停止机器人..."
        pkill -f "node dist/index.js"
        echo "✅ 机器人已停止"
    else
        echo "⚠️  未找到运行中的机器人"
    fi
fi

