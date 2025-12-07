# 🚀 快速启动指南

## 完整流程（按顺序执行）

### 1️⃣ 安装 Python 依赖 ✅
```bash
cd python_model
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2️⃣ 采集数据（必需）

**方式 1: 使用 JavaScript（推荐，不会卡住）⭐**

```bash
cd node_bot
npm install  # 如果还没安装依赖

# 快速测试（7 天数据，约 1 分钟）
npm run collect-data 7

# 完整数据（90 天数据，约 5-10 分钟）
npm run collect-data 90
```

**方式 2: 使用 Python**

```bash
cd python_model
source venv/bin/activate

# 快速测试（7 天数据，约 1 分钟）
python -c "
from collect_data import fetch_binance_historical, resample_to_15m, save_data
from pathlib import Path
Path('../data').mkdir(exist_ok=True)
df_1m = fetch_binance_historical(days=7)
save_data(df_1m, '../data/btc_1m.csv')
df_15m = resample_to_15m(df_1m)
save_data(df_15m, '../data/btc_15m.csv')
print('完成!')
"

# 或完整采集（90 天）
python collect_data.py
```

**功能说明：**
- 从 Binance 获取 BTC/USDT 1分钟 K 线
- 自动重采样为 15 分钟数据
- 保存到 `data/` 目录（btc_1m.csv, btc_15m.csv）
- JavaScript 版本包含完整的超时和错误处理，不会卡住

### 3️⃣ 训练模型（必需）
```bash
cd python_model
source venv/bin/activate
python train.py
```

**预期输出：**
- `model/model.onnx` - ONNX 模型
- `model/metadata.json` - 特征元数据
- 训练准确率、AUC 等指标

### 4️⃣ 安装 Node.js 依赖
```bash
cd node_bot
npm install
# 或使用 bun
bun install
```

### 5️⃣ 配置环境变量
```bash
cd node_bot
cp .env.example .env
# 编辑 .env 文件，填入你的 API 密钥和钱包信息
```

**必需的环境变量：**
- `POLYMARKET_API_KEY` - Polymarket API 密钥
- `POLYMARKET_API_SECRET` - Polymarket API 密钥
- `POLYMARKET_PASSPHRASE` - Polymarket API 密码短语
- `PRIVATE_KEY` - 钱包私钥（0x 开头）
- `WALLET_ADDRESS` - 钱包地址（0x 开头）
- `RPC_URL` - Polygon RPC URL（推荐配置自己的，避免限流）

**可选配置：**
- `POSITION_SIZE_USD` - 每次下注金额（默认: 10）
- `MIN_CONFIDENCE_UP` - 最小上涨置信度（默认: 0.55）
- `MIN_CONFIDENCE_DOWN` - 最大下跌置信度（默认: 0.45）
- `MAX_KELLY_FRACTION` - Kelly 公式最大仓位（默认: 0.25）
- `BANKROLL` - 总资金（默认: 1000）
- `NODE_ENV` - 运行模式：`development`（模拟）或 `production`（真实交易）

### 6️⃣ 启动机器人

**开发模式（模拟交易，不真实下单）：**
```bash
cd node_bot
NODE_ENV=development npm run dev
```

**生产模式（真实交易）：**
```bash
cd node_bot
NODE_ENV=production npm run start
```

---

## ⚡ 一键启动脚本

```bash
# 使用 run.sh（自动完成所有步骤）
chmod +x run.sh
./run.sh

# 默认使用 JavaScript 数据采集（推荐）
# 如需使用 Python 版本：
USE_JS_DATA_COLLECTION=false ./run.sh

# 指定数据采集天数：
DATA_DAYS=7 ./run.sh

# 或使用 Docker
./run.sh --docker
```

**run.sh 会自动完成：**
1. ✅ 安装 Python 依赖
2. ✅ 采集数据（默认使用 JavaScript 版本，90 天）
3. ✅ 训练模型
4. ✅ 运行回测（可选）
5. ✅ 启动 Node.js 机器人

---

## 📊 检查清单

运行前确认：

- [ ] Python 依赖已安装
- [ ] `data/btc_15m.csv` 存在（至少 1000+ 条数据）
- [ ] `model/model.onnx` 存在
- [ ] `model/metadata.json` 存在
- [ ] Node.js 依赖已安装
- [ ] `.env` 文件已配置
- [ ] 钱包有足够 USDC（Polygon 网络）

---

## 🐛 常见问题

### 数据采集失败

**如果使用 JavaScript 版本：**
```bash
cd node_bot

# 测试连接（采集 1 天数据）
npm run collect-data 1

# 检查网络连接
ping api.binance.com
```

**如果使用 Python 版本：**
```bash
cd python_model
source venv/bin/activate

# 减少数据量测试
python -c "from collect_data import fetch_binance_historical; fetch_binance_historical(days=1)"
```

**常见问题：**
- 超时：检查网络连接，或减少采集天数
- 卡住：使用 JavaScript 版本（有完整的超时保护）
- API 限流：等待几分钟后重试

### 模型训练失败
```bash
# 检查数据文件
ls -lh data/btc_15m.csv

# 检查数据行数（需要至少 1000 条）
python -c "import pandas as pd; df = pd.read_csv('data/btc_15m.csv'); print(len(df))"
```

### Node 机器人启动失败
```bash
# 检查模型文件
ls -lh model/model.onnx

# 检查环境变量
cat node_bot/.env | grep -v "KEY\|SECRET"
```

---

## 💰 最小测试资金

建议先用小资金测试：
- 开发模式：$0（模拟交易）
- 生产模式：$50-100（小资金验证）

---

## 📈 监控

机器人运行时会输出：
- 每 15 分钟窗口的预测
- 下注决策和金额
- 统计信息（每 15 分钟）

查看日志：
```bash
# 如果使用 PM2
pm2 logs btc-bot

# 如果直接运行
# 日志直接输出到控制台
```

