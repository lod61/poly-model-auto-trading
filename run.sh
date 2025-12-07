#!/bin/bash
# 使用宽松的错误处理，允许某些步骤失败但继续
set +e  # 允许命令失败但不立即退出

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# Project root
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# 确保必要的目录存在
mkdir -p "$PROJECT_DIR/data"
mkdir -p "$PROJECT_DIR/model"
mkdir -p "$PROJECT_DIR/logs"

# 检查基本依赖
check_dependencies() {
    local missing_deps=()
    
    if ! command -v node &> /dev/null; then
        missing_deps+=("Node.js (安装: apt install nodejs)")
    fi
    
    if ! command -v npm &> /dev/null; then
        missing_deps+=("npm (安装: apt install npm)")
    fi
    
    if ! command -v python3 &> /dev/null; then
        missing_deps+=("Python 3 (安装: apt install python3)")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        error "缺少以下依赖:\n$(printf '  - %s\n' "${missing_deps[@]}")\n\n运行: ./install-dependencies.sh 或手动安装上述依赖"
    fi
}

log "检查系统依赖..."
check_dependencies
success "系统依赖检查通过"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  BTC 15M PREDICTION BOT - FULL PIPELINE"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────────────
# Step 1: Setup Python environment
# ─────────────────────────────────────────────────────────────────────
log "Step 1/5: Setting up Python environment..."

cd "$PROJECT_DIR/python_model"

if [ ! -d "venv" ]; then
    log "Creating virtual environment..."
    if ! python3 -m venv venv 2>&1; then
        error "创建虚拟环境失败。请运行: apt install python3-venv\n或运行: ./install-dependencies.sh"
    fi
fi

# 使用虚拟环境中 Python 的绝对路径（更可靠）
PYTHON_VENV="$PROJECT_DIR/python_model/venv/bin/python3"
if [ ! -f "$PYTHON_VENV" ]; then
    error "虚拟环境创建失败，Python 不可用"
fi

# 在虚拟环境中创建 python 符号链接（如果不存在）
if [ ! -f "$PROJECT_DIR/python_model/venv/bin/python" ]; then
    ln -sf python3 "$PROJECT_DIR/python_model/venv/bin/python"
fi

PYTHON_CMD="$PROJECT_DIR/python_model/venv/bin/python"

log "Installing Python dependencies..."
if ! $PYTHON_CMD -m pip install -q -r requirements.txt 2>&1; then
    warn "Python 依赖安装有警告，但继续..."
fi

success "Python environment ready (Python: $($PYTHON_CMD --version))"

# ─────────────────────────────────────────────────────────────────────
# Step 2: Collect data
# ─────────────────────────────────────────────────────────────────────
log "Step 2/5: Collecting BTC/USDT data..."

# 检查数据是否已存在
if [ -f "$PROJECT_DIR/data/btc_15m.csv" ] && [ -s "$PROJECT_DIR/data/btc_15m.csv" ]; then
    DATA_ROWS=$(wc -l < "$PROJECT_DIR/data/btc_15m.csv")
    if [ "$DATA_ROWS" -gt 100 ]; then
        success "Data file already exists: $DATA_ROWS rows (skipping collection)"
        log "To force re-collection, delete data/btc_15m.csv and run again"
    else
        log "Existing data file is too small ($DATA_ROWS rows), will re-collect..."
    fi
fi

# 如果数据不存在或太小，进行采集
DATA_ROWS=0
if [ -f "$PROJECT_DIR/data/btc_15m.csv" ]; then
    DATA_ROWS=$(wc -l < "$PROJECT_DIR/data/btc_15m.csv" 2>/dev/null || echo "0")
fi

if [ ! -f "$PROJECT_DIR/data/btc_15m.csv" ] || [ ! -s "$PROJECT_DIR/data/btc_15m.csv" ] || [ "$DATA_ROWS" -le 100 ]; then
    # 检查是否使用 JavaScript 版本（推荐，不会卡住）
    USE_JS_DATA_COLLECTION=${USE_JS_DATA_COLLECTION:-true}
    DATA_DAYS=${DATA_DAYS:-7}
    
if [ "$USE_JS_DATA_COLLECTION" = "true" ]; then
    log "Using JavaScript data collection (recommended)..."
    cd "$PROJECT_DIR/node_bot"
    
    # 检查 Node.js 和 npm
    if ! command -v node &> /dev/null; then
        error "Node.js 未安装。请运行: ./install-dependencies.sh 或 apt install nodejs npm"
    fi
    if ! command -v npm &> /dev/null; then
        error "npm 未安装。请运行: ./install-dependencies.sh 或 apt install npm"
    fi
    
    # 检查 Node.js 依赖
    if [ ! -d "node_modules" ]; then
        log "Installing Node.js dependencies..."
        if ! npm install --silent 2>&1; then
            error "npm install 失败。请检查网络连接或手动运行: cd node_bot && npm install"
        fi
    fi
    
    log "Collecting $DATA_DAYS days of data..."
    if npm run collect-data "$DATA_DAYS" 2>&1; then
        success "Data collection completed"
    else
        warn "Data collection had issues, but continuing..."
    fi
        
        cd "$PROJECT_DIR"
    else
        log "Using Python data collection..."
        cd "$PROJECT_DIR/python_model"
        PYTHON_CMD="$PROJECT_DIR/python_model/venv/bin/python"
        if [ ! -f "$PYTHON_CMD" ]; then
            PYTHON_CMD="$PROJECT_DIR/python_model/venv/bin/python3"
        fi
        $PYTHON_CMD collect_data.py || warn "Python data collection had issues, but continuing..."
    fi
fi

# 最终检查
if [ ! -f "$PROJECT_DIR/data/btc_15m.csv" ] || [ ! -s "$PROJECT_DIR/data/btc_15m.csv" ]; then
    error "Data collection failed - btc_15m.csv not found or empty"
fi

DATA_ROWS=$(wc -l < "$PROJECT_DIR/data/btc_15m.csv" 2>/dev/null || echo "0")
success "Data ready: $DATA_ROWS rows in btc_15m.csv"

# ─────────────────────────────────────────────────────────────────────
# Step 3: Train model
# ─────────────────────────────────────────────────────────────────────
log "Step 3/5: Training XGBoost model..."

# 使用虚拟环境中的 Python（绝对路径）
cd "$PROJECT_DIR/python_model"
PYTHON_CMD="$PROJECT_DIR/python_model/venv/bin/python"
if [ ! -f "$PYTHON_CMD" ]; then
    PYTHON_CMD="$PROJECT_DIR/python_model/venv/bin/python3"
fi

if [ ! -f "$PYTHON_CMD" ]; then
    error "虚拟环境中的 Python 不可用，请检查虚拟环境是否正确创建"
fi

if $PYTHON_CMD train.py 2>&1 | tee /tmp/train.log; then
    success "Model training completed"
else
    warn "Model training failed or ONNX export failed, attempting to create placeholder model..."
    if $PYTHON_CMD create_simple_onnx.py 2>&1; then
        warn "Using placeholder model (predictions may not be accurate)"
    else
        error "Failed to create any model file"
    fi
fi

if [ ! -f "$PROJECT_DIR/model/model.onnx" ]; then
    error "Model file not found - training and fallback both failed"
fi

success "Model ready (may be placeholder if training failed)"

# ─────────────────────────────────────────────────────────────────────
# Step 4: Run backtest (optional)
# ─────────────────────────────────────────────────────────────────────
SKIP_BACKTEST=${SKIP_BACKTEST:-false}

if [ "$SKIP_BACKTEST" != "true" ]; then
    log "Step 4/5: Running backtest..."
    
    # 使用虚拟环境中的 Python
    cd "$PROJECT_DIR/python_model"
    PYTHON_CMD="$PROJECT_DIR/python_model/venv/bin/python"
    if [ ! -f "$PYTHON_CMD" ]; then
        PYTHON_CMD="$PROJECT_DIR/python_model/venv/bin/python3"
    fi
    
    if [ -f "$PYTHON_CMD" ] && $PYTHON_CMD backtest.py 2>&1; then
        success "Backtest completed"
    else
        warn "Backtest had issues (non-critical, continuing...)"
    fi
else
    log "Step 4/5: Skipping backtest (set SKIP_BACKTEST=true to skip)"
fi

# ─────────────────────────────────────────────────────────────────────
# Step 5: Start Node bot
# ─────────────────────────────────────────────────────────────────────
log "Step 5/5: Starting Node.js bot..."

cd "$PROJECT_DIR/node_bot"

# Check for .env file
if [ ! -f ".env" ]; then
    warn ".env file not found!"
    echo ""
    echo "Please create .env file with your credentials:"
    echo "  cp .env.example .env"
    echo "  # Edit .env with your API keys"
    echo ""
    
    # 在开发模式下，尝试从 .env.example 创建 .env
    if [ -f ".env.example" ] && [ "$NODE_ENV" != "production" ]; then
        warn "Attempting to create .env from .env.example for development..."
        cp .env.example .env
        warn "Created .env from .env.example - PLEASE EDIT WITH YOUR REAL CREDENTIALS!"
    else
        error "Cannot start bot without .env configuration"
    fi
fi

# 确保日志目录存在
mkdir -p "$PROJECT_DIR/logs"
success "Logs directory ready: $PROJECT_DIR/logs"

# Check if using Docker
if [ "$1" = "--docker" ] || [ "$1" = "-d" ]; then
    log "Starting with Docker Compose..."
    cd "$PROJECT_DIR"
    
    # Build and start
    docker-compose build
    docker-compose up -d
    
    echo ""
    success "Bot started in Docker container"
    echo ""
    echo "Useful commands:"
    echo "  docker-compose logs -f      # View logs"
    echo "  docker-compose restart      # Restart bot"
    echo "  docker-compose down         # Stop bot"
    echo ""
else
    # Install Node dependencies
    if [ -f "bun.lockb" ] || command -v bun &> /dev/null; then
        log "Installing dependencies with bun..."
        bun install
        
        log "Building TypeScript..."
        bun run build
        
        echo ""
        success "Build complete!"
        echo ""
        echo "Starting bot..."
        echo ""
        
        # Run directly (for development)
        bun run start
    else
        log "Installing dependencies with npm..."
        if [ ! -d "node_modules" ]; then
            npm install --silent
        else
            log "Dependencies already installed, skipping..."
        fi
        
        log "Building TypeScript..."
        npm run build
        
        echo ""
        success "Build complete!"
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
        echo "  Starting bot..."
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        echo "📊 日志文件: $PROJECT_DIR/logs/bot.log"
        echo ""
        echo "💡 提示:"
        echo "   - 在另一个终端运行: tail -f logs/bot.log"
        echo "   - 或使用: cd node_bot && npm run logs"
        echo "   - 查看状态: cd node_bot && npm run status"
        echo ""
        echo "按 Ctrl+C 停止机器人"
        echo ""
        
        # Run directly (foreground so logs go to both console and file)
        npm run start
    fi
fi

