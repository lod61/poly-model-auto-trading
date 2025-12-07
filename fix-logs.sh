#!/bin/bash
# 修复日志文件问题

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 修复日志文件 ==="
echo ""

# 确保日志目录存在
mkdir -p "$PROJECT_DIR/logs"

# 创建日志文件（如果不存在）
if [ ! -f "$PROJECT_DIR/logs/bot.log" ]; then
    touch "$PROJECT_DIR/logs/bot.log"
    echo "✅ 创建日志文件: $PROJECT_DIR/logs/bot.log"
else
    echo "ℹ️  日志文件已存在"
fi

# 设置权限
chmod 666 "$PROJECT_DIR/logs/bot.log" 2>/dev/null || true

echo ""
echo "📊 日志文件位置:"
ls -lh "$PROJECT_DIR/logs/bot.log" 2>/dev/null || echo "  文件不存在"

echo ""
echo "💡 下一步："
echo "   1. 重新编译代码（如果有修改）"
echo "   2. 重启机器人: ./stop.sh && ./run.sh"
echo "   3. 查看日志: tail -f logs/bot.log"

