#!/bin/bash
# 检查机器人状态和日志

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$PROJECT_DIR/logs/bot.pid"
LOG_FILE="$PROJECT_DIR/logs/bot.log"
CONSOLE_LOG="$PROJECT_DIR/logs/bot_console.log"

echo "=== 机器人状态检查 ==="
echo ""

# 检查 PID 文件
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    echo "📋 PID 文件: $PID"
    
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "✅ 机器人正在运行 (PID: $PID)"
    else
        echo "❌ 机器人未运行（PID 文件存在但进程不存在）"
        echo "   清理 PID 文件: rm -f $PID_FILE"
    fi
else
    echo "❌ 未找到 PID 文件，机器人可能未启动"
fi

echo ""

# 检查日志文件
if [ -f "$LOG_FILE" ]; then
    SIZE=$(wc -l < "$LOG_FILE" 2>/dev/null || echo "0")
    echo "📊 日志文件: $LOG_FILE ($SIZE 行)"
    
    if [ "$SIZE" -gt 0 ]; then
        echo "   最后 5 行:"
        tail -5 "$LOG_FILE" | sed 's/^/   /'
    else
        echo "   ⚠️  日志文件为空"
    fi
else
    echo "❌ 日志文件不存在: $LOG_FILE"
    echo "   说明机器人还未写入日志（可能未启动或启动失败）"
fi

echo ""

# 检查控制台日志
if [ -f "$CONSOLE_LOG" ]; then
    SIZE=$(wc -l < "$CONSOLE_LOG" 2>/dev/null || echo "0")
    echo "📋 控制台日志: $CONSOLE_LOG ($SIZE 行)"
    
    if [ "$SIZE" -gt 0 ]; then
        echo "   最后 10 行:"
        tail -10 "$CONSOLE_LOG" | sed 's/^/   /'
    fi
else
    echo "⚠️  控制台日志不存在: $CONSOLE_LOG"
fi

echo ""

# 检查进程
echo "🔍 查找相关进程:"
ps aux | grep -E "(node.*dist/index|bun.*start)" | grep -v grep || echo "   未找到相关进程"

echo ""
echo "💡 命令:"
echo "   启动机器人: ./run.sh"
echo "   查看日志: tail -f logs/bot.log"
echo "   查看控制台: tail -f logs/bot_console.log"
echo "   停止机器人: ./stop.sh"

