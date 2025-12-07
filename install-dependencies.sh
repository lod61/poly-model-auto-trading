#!/bin/bash
# 自动安装所有依赖 - 适用于 Ubuntu/Debian 服务器

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[INSTALL]${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  安装系统依赖"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    error "无法检测操作系统"
fi

log "检测到操作系统: $OS"

# 检查是否以 root 运行
if [ "$EUID" -ne 0 ]; then 
    warn "建议使用 sudo 运行此脚本以安装系统包"
    USE_SUDO="sudo"
else
    USE_SUDO=""
fi

# 更新包列表
log "更新包列表..."
$USE_SUDO apt-get update -qq

# 1. 安装 Node.js 18+ 和 npm（使用 NodeSource 官方仓库，避免依赖问题）
log "检查 Node.js..."
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    log "安装 Node.js 20 和 npm（使用 NodeSource 官方仓库）..."
    
    # 安装 curl（如果还没有）
    if ! command -v curl &> /dev/null; then
        $USE_SUDO apt-get install -y -qq curl
    fi
    
    # 添加 NodeSource 仓库
    log "添加 NodeSource 仓库..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | $USE_SUDO bash -
    
    # 安装 Node.js（包含 npm）
    log "安装 Node.js 和 npm..."
    $USE_SUDO apt-get install -y -qq nodejs
    
    success "Node.js 已安装: $(node --version)"
    success "npm 已安装: $(npm -v)"
else
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        warn "Node.js 版本过低 ($(node -v))，建议升级到 18+"
        log "升级 Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | $USE_SUDO bash -
        $USE_SUDO apt-get install -y -qq nodejs
        success "Node.js 已升级: $(node --version)"
    else
        success "Node.js 已安装: $(node -v)"
    fi
    
    if ! command -v npm &> /dev/null; then
        warn "npm 未找到，但 Node.js 已安装，尝试修复..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | $USE_SUDO bash -
        $USE_SUDO apt-get install -y -qq nodejs
        success "npm 已安装: $(npm -v)"
    else
        success "npm 已安装: $(npm -v)"
    fi
fi

# 3. 安装 Python 3 和 venv
log "检查 Python 3..."
if ! command -v python3 &> /dev/null; then
    log "安装 Python 3..."
    $USE_SUDO apt-get install -y -qq python3 python3-pip
    success "Python 3 已安装: $(python3 --version)"
else
    success "Python 3 已安装: $(python3 --version)"
fi

log "检查 python3-venv..."
if ! python3 -m venv --help &> /dev/null; then
    log "安装 python3-venv..."
    $USE_SUDO apt-get install -y -qq python3-venv
    success "python3-venv 已安装"
else
    success "python3-venv 已安装"
fi

# 4. 安装 build-essential (编译某些 Python 包需要)
log "检查 build-essential..."
if ! command -v gcc &> /dev/null; then
    log "安装 build-essential..."
    $USE_SUDO apt-get install -y -qq build-essential
    success "build-essential 已安装"
else
    success "build-essential 已安装"
fi

echo ""
success "所有系统依赖已安装完成！"
echo ""
echo "下一步："
echo "  1. 配置环境变量: cd node_bot && cp .env.example .env && nano .env"
echo "  2. 运行: ./run.sh"
echo ""

