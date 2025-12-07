#!/bin/bash
# 快速设置脚本 - 完成所有初始化步骤

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[SETUP]${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  BTC 15M PREDICTION BOT - 快速设置"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────────────
# Step 1: 检查 Node.js
# ─────────────────────────────────────────────────────────────────────
log "检查 Node.js 环境..."

if ! command -v node &> /dev/null; then
    warn "Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    warn "Node.js 版本过低（当前: $(node -v)），需要 18+"
    exit 1
fi

success "Node.js 版本: $(node -v)"

# ─────────────────────────────────────────────────────────────────────
# Step 2: 安装 Node.js 依赖
# ─────────────────────────────────────────────────────────────────────
log "安装 Node.js 依赖..."
cd "$PROJECT_DIR/node_bot"

if [ ! -d "node_modules" ]; then
    if command -v bun &> /dev/null; then
        log "使用 bun 安装依赖..."
        bun install
    else
        log "使用 npm 安装依赖..."
        npm install
    fi
else
    success "依赖已安装"
fi

cd "$PROJECT_DIR"

# ─────────────────────────────────────────────────────────────────────
# Step 3: 设置 Python 环境（如果需要训练模型）
# ─────────────────────────────────────────────────────────────────────
log "检查 Python 环境..."

cd "$PROJECT_DIR/python_model"

if [ ! -d "venv" ]; then
    log "创建 Python 虚拟环境..."
    python3 -m venv venv
fi

source venv/bin/activate

if [ ! -f "venv/.installed" ]; then
    log "安装 Python 依赖..."
    pip install -q -r requirements.txt
    touch venv/.installed
else
    success "Python 依赖已安装"
fi

deactivate
cd "$PROJECT_DIR"

# ─────────────────────────────────────────────────────────────────────
# Step 4: 创建数据目录
# ─────────────────────────────────────────────────────────────────────
log "创建数据目录..."
mkdir -p "$PROJECT_DIR/data"
mkdir -p "$PROJECT_DIR/model"
mkdir -p "$PROJECT_DIR/logs"
success "目录已创建"

# ─────────────────────────────────────────────────────────────────────
# Step 5: 配置环境变量
# ─────────────────────────────────────────────────────────────────────
log "检查环境变量配置..."

cd "$PROJECT_DIR/node_bot"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        log "创建 .env 文件..."
        cp .env.example .env
        warn ".env 文件已创建，请编辑并填入你的 API 密钥"
        echo ""
        echo "需要配置的变量："
        echo "  - POLYMARKET_API_KEY"
        echo "  - POLYMARKET_API_SECRET"
        echo "  - POLYMARKET_PASSPHRASE"
        echo "  - PRIVATE_KEY"
        echo "  - WALLET_ADDRESS"
        echo "  - RPC_URL"
        echo ""
    else
        warn ".env.example 不存在，请手动创建 .env 文件"
    fi
else
    success ".env 文件已存在"
fi

cd "$PROJECT_DIR"

# ─────────────────────────────────────────────────────────────────────
# 完成
# ─────────────────────────────────────────────────────────────────────
echo ""
success "设置完成！"
echo ""
echo "下一步："
echo "  1. 编辑 node_bot/.env 文件，填入 API 密钥"
echo "  2. 采集数据: cd node_bot && npm run collect-data 7"
echo "  3. 训练模型: cd python_model && source venv/bin/activate && python train.py"
echo "  4. 启动机器人: cd node_bot && npm run dev"
echo ""
echo "或使用一键脚本: ./run.sh"
echo ""

