# ✅ 设置完成 - 完整流程指南

## 📦 已完成的更新

### 1. JavaScript 数据采集脚本 ✅
- **文件**: `node_bot/src/collectData.ts`
- **功能**: 从 Binance 获取历史数据，包含完整的超时和错误处理
- **优势**: 不会卡住，自动重试，实时进度提示

### 2. 更新的脚本和文档 ✅
- `run.sh` - 支持 JavaScript 数据采集选项
- `setup.sh` - 新增快速设置脚本
- `QUICKSTART.md` - 更新了数据采集说明
- `DATA_COLLECTION.md` - 详细的数据采集指南
- `node_bot/.env.example` - 环境变量模板

---

## 🚀 快速开始

### 方式 1: 使用一键脚本（推荐）

```bash
# 1. 运行快速设置
chmod +x setup.sh
./setup.sh

# 2. 配置环境变量
cd node_bot
cp .env.example .env
# 编辑 .env 文件，填入 API 密钥

# 3. 运行完整流程
cd ..
./run.sh
```

### 方式 2: 手动步骤

#### 步骤 1: 初始设置
```bash
# 运行设置脚本
./setup.sh
```

#### 步骤 2: 配置环境变量
```bash
cd node_bot
cp .env.example .env
# 编辑 .env 文件，填入：
# - POLYMARKET_API_KEY
# - POLYMARKET_API_SECRET  
# - POLYMARKET_PASSPHRASE
# - PRIVATE_KEY
# - WALLET_ADDRESS
# - RPC_URL
```

#### 步骤 3: 采集数据（使用 JavaScript 版本，推荐）
```bash
cd node_bot

# 快速测试（7 天数据，约 1 分钟）
npm run collect-data 7

# 完整数据（90 天数据，约 5-10 分钟）
npm run collect-data 90
```

#### 步骤 4: 训练模型
```bash
cd python_model
source venv/bin/activate
python train.py
```

#### 步骤 5: 启动机器人

**开发模式（模拟交易）：**
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

## 📋 检查清单

运行前确认：

- [ ] 已运行 `./setup.sh` 完成初始设置
- [ ] `node_bot/.env` 文件已配置（从 `.env.example` 复制）
- [ ] `data/btc_1m.csv` 和 `data/btc_15m.csv` 存在
- [ ] `model/model.onnx` 存在
- [ ] `model/metadata.json` 存在
- [ ] Node.js 18+ 已安装
- [ ] Python 3.8+ 已安装
- [ ] 钱包有足够 USDC（仅在生产模式需要）

---

## 🔧 环境变量说明

### 必需变量

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `POLYMARKET_API_KEY` | Polymarket API 密钥 | https://polymarket.com/settings/api-keys |
| `POLYMARKET_API_SECRET` | Polymarket API 密钥 | 同上 |
| `POLYMARKET_PASSPHRASE` | API 密码短语 | 同上 |
| `PRIVATE_KEY` | 钱包私钥（0x 开头） | 从 MetaMask 或其他钱包导出 |
| `WALLET_ADDRESS` | 钱包地址（0x 开头） | 从 MetaMask 或其他钱包获取 |
| `RPC_URL` | Polygon RPC URL | Alchemy/Infura/QuickNode |

### 可选变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `POSITION_SIZE_USD` | 10 | 每次下注金额（USD） |
| `MIN_CONFIDENCE_UP` | 0.55 | 最小上涨置信度阈值 |
| `MIN_CONFIDENCE_DOWN` | 0.45 | 最大下跌置信度阈值 |
| `MAX_KELLY_FRACTION` | 0.25 | Kelly 公式最大仓位比例 |
| `BANKROLL` | 1000 | 总资金（用于 Kelly 公式） |
| `NODE_ENV` | development | 运行模式：development/production |
| `LOG_LEVEL` | info | 日志级别：debug/info/warn/error |

---

## 🎯 数据采集说明

### JavaScript 版本（推荐）

**优点：**
- ✅ 不会卡住（30秒超时保护）
- ✅ 自动重试机制（最多3次）
- ✅ 实时进度提示
- ✅ 与 Node.js 机器人使用相同技术栈

**使用方法：**
```bash
cd node_bot
npm run collect-data [天数]  # 默认 7 天
```

### Python 版本（备选）

**使用方法：**
```bash
cd python_model
source venv/bin/activate

# 快速测试（7 天）
python -c "
from collect_data import fetch_binance_historical, resample_to_15m, save_data
from pathlib import Path
Path('../data').mkdir(exist_ok=True)
df_1m = fetch_binance_historical(days=7)
save_data(df_1m, '../data/btc_1m.csv')
df_15m = resample_to_15m(df_1m)
save_data(df_15m, '../data/btc_15m.csv')
print(f'✅ 完成! 1m: {len(df_1m)} 条, 15m: {len(df_15m)} 条')
"

# 完整采集（90 天）
python collect_data.py
```

---

## 🐛 常见问题

### 数据采集卡住
**解决方案：** 使用 JavaScript 版本，它包含完整的超时和错误处理
```bash
cd node_bot
npm run collect-data 7
```

### 模型训练失败
**检查：**
```bash
# 检查数据文件是否存在
ls -lh data/btc_15m.csv

# 检查数据量（需要至少 1000 条）
wc -l data/btc_15m.csv
```

### 机器人启动失败
**检查：**
```bash
# 检查模型文件
ls -lh model/model.onnx model/metadata.json

# 检查环境变量（不显示敏感信息）
cd node_bot
cat .env | grep -v "KEY\|SECRET\|PRIVATE" | grep -v "^#"
```

### 网络请求超时
**解决方案：**
- 检查网络连接
- 减少数据采集天数进行测试
- 使用自己的 RPC URL（避免公共节点限流）

---

## 📚 相关文档

- `README.md` - 项目总览
- `QUICKSTART.md` - 快速启动指南
- `DATA_COLLECTION.md` - 数据采集详细说明
- `OPTIMIZATION.md` - 优化建议

---

## 🎉 下一步

1. ✅ 完成设置和配置
2. ✅ 采集数据并训练模型
3. ✅ 在开发模式下测试机器人
4. ✅ 观察预测准确性和决策逻辑
5. ✅ 确认无误后切换到生产模式

**重要提示：** 建议先在开发模式（`NODE_ENV=development`）下运行，观察一段时间后再切换到生产模式。

