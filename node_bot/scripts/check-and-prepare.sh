#!/bin/bash
# 自动检查和准备脚本 - 确保所有依赖都已就绪

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_DIR"

echo "[准备] 检查环境和依赖..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi

# 检查数据文件
if [ ! -f "data/btc_15m.csv" ] || [ ! -s "data/btc_15m.csv" ]; then
    echo "[准备] 数据文件不存在或为空，开始采集..."
    cd node_bot
    npm run collect-data 7  # 采集 7 天数据（快速）
    cd ..
fi

# 检查模型文件
if [ ! -f "model/model.onnx" ] || [ ! -f "model/metadata.json" ]; then
    echo "[准备] 模型文件不存在，需要训练模型..."
    
    # 检查 Python 环境
    if command -v python3 &> /dev/null; then
        cd python_model
        
        # 创建虚拟环境（如果不存在）
        if [ ! -d "venv" ]; then
            echo "[准备] 创建 Python 虚拟环境..."
            python3 -m venv venv
        fi
        
        source venv/bin/activate
        
        # 安装依赖（如果还没安装）
        if [ ! -f "venv/.installed" ]; then
            echo "[准备] 安装 Python 依赖..."
            pip install -q -r requirements.txt
            touch venv/.installed
        fi
        
        # 训练模型
        echo "[准备] 训练模型（这可能需要几分钟）..."
        export LDFLAGS="-L/opt/homebrew/opt/libomp/lib" 2>/dev/null || true
        export CPPFLAGS="-I/opt/homebrew/opt/libomp/include" 2>/dev/null || true
        python train.py || {
            echo "[警告] 模型训练失败，将使用占位符模型..."
            python create_simple_onnx.py || true
        }
        
        deactivate
        cd ..
    else
        echo "[警告] Python 未安装，无法训练模型。将尝试使用现有模型或占位符模型..."
        if [ ! -f "model/model.onnx" ]; then
            echo "[错误] 没有可用的模型文件，请安装 Python 并运行训练，或手动上传模型文件"
            exit 1
        fi
    fi
fi

echo "[准备] ✅ 所有依赖已就绪！"

