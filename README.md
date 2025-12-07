# Polymarket BTC 15分钟预测交易机器人

基于机器学习的 BTC 价格走势预测系统，在 Polymarket 上自动交易。

## 📋 目录

- [项目架构](#项目架构)
- [快速开始](#快速开始)
- [Python 模型训练](#python-模型训练)
- [Node.js 交易机器人](#nodejs-交易机器人)
- [策略原理](#策略原理)
- [风险控制](#风险控制)
- [Docker 部署](#docker-部署)

---

## 项目架构

```
poly-auto-trading/
├── python_model/          # Python ML 管道
│   ├── collect_data.py    # 从 Binance 获取 BTC 数据
│   ├── features.py        # 特征工程 (60+ 技术指标)
│   ├── train.py           # XGBoost 训练 + ONNX 导出
│   ├── backtest.py        # 滑动窗口回测
│   └── requirements.txt   # Python 依赖
├── model/                 # 模型输出目录
│   ├── model.onnx         # ONNX 格式模型
│   └── metadata.json      # 特征名称元数据
├── data/                  # 数据目录
│   └── btc_1m.csv         # BTC/USDT 1分钟K线
├── node_bot/              # Node.js 交易机器人
│   ├── src/
│   │   ├── index.ts       # 主循环
│   │   ├── config.ts      # 配置管理
│   │   ├── priceFeed.ts   # 实时价格源
│   │   ├── model.ts       # ONNX 推理
│   │   ├── polymarket.ts  # Polymarket API
│   │   └── utils.ts       # 工具函数
│   ├── Dockerfile         # Docker 镜像
│   └── .env.example       # 环境变量模板
├── docker-compose.yml     # Docker 编排
└── run.sh                 # 一键启动脚本
```

---

## 快速开始

### 一键运行

```bash
# 克隆项目后
chmod +x run.sh
./run.sh
```

脚本会自动：
1. 创建 Python 虚拟环境
2. 收集 90 天 BTC 数据
3. 训练模型并导出 ONNX
4. 运行回测
5. 启动 Node 机器人

---

## Python 模型训练

### 1. 安装依赖

```bash
cd python_model

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 安装依赖
pip install -r requirements.txt
```

**依赖包说明：**
| 包名 | 用途 |
|------|------|
| python-binance | Binance API 客户端 |
| pandas | 数据处理 |
| xgboost | 梯度提升模型 |
| scikit-learn | ML 工具 |
| skl2onnx | ONNX 导出 |
| matplotlib | 可视化 |

### 2. 收集数据

**方式 1: 使用 JavaScript（推荐，不会卡住）**

```bash
cd node_bot
npm install  # 如果还没安装依赖
npm run collect-data [天数]  # 默认 7 天，例如: npm run collect-data 90
```

**方式 2: 使用 Python**

```bash
cd python_model
source venv/bin/activate
python collect_data.py
```

**功能说明：**
- 从 Binance 获取 BTC/USDT 1分钟 K 线
- 自动重采样为 15 分钟数据
- 保存到 `data/` 目录（btc_1m.csv, btc_15m.csv）
- JavaScript 版本包含完整的超时和错误处理，不会卡住
- **幂等操作**：重复运行只追加新数据
- 输出：`data/btc_1m.csv`

### 3. 训练模型

```bash
python train.py
```

**训练流程：**
1. 加载数据
2. 构建 60+ 技术指标特征
3. 创建目标变量：15分钟后收益 ≥ 0 → 1，否则 → 0
4. 时序分割：80% 训练 / 10% 验证 / 10% 测试
5. 训练 XGBoost 二分类器
6. 导出 ONNX 模型

**输出文件：**
- `model/model.onnx` - ONNX 格式模型
- `model/model.json` - XGBoost 原生格式
- `model/metadata.json` - 特征名称列表

### 4. 导出 ONNX

ONNX 导出在 `train.py` 中自动完成，使用 `skl2onnx`：

```python
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

initial_type = [("float_input", FloatTensorType([None, n_features]))]
onnx_model = convert_sklearn(model, initial_types=initial_type)
```

### 5. 回测验证

```bash
python backtest.py
```

**滑动窗口回测：**
- 训练窗口：14 天
- 测试窗口：1 天
- 步长：1 天
- 输出：胜率、夏普比率、最大回撤、收益曲线

---

## Node.js 交易机器人

### 1. 配置环境变量

```bash
cd node_bot
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Polymarket API 密钥
POLYMARKET_API_KEY=your_api_key
POLYMARKET_API_SECRET=your_api_secret
POLYMARKET_PASSPHRASE=your_passphrase

# 钱包私钥 (Polygon)
PRIVATE_KEY=your_private_key
WALLET_ADDRESS=0xYourAddress

# RPC 节点 (Alchemy/Infura)
RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/your_key

# 交易配置
BANKROLL=1000          # 总资金 (USD)
MAX_KELLY_FRACTION=0.25  # 最大 Kelly 仓位
MIN_CONFIDENCE_UP=0.55   # 做多阈值
MIN_CONFIDENCE_DOWN=0.45 # 做空阈值
```

### 2. 安装依赖

```bash
# 使用 bun (推荐)
bun install

# 或使用 npm
npm install
```

### 3. 启动机器人

```bash
# 开发模式 (模拟交易)
NODE_ENV=development bun run dev

# 生产模式 (真实交易)
NODE_ENV=production bun run start
```

### 4. 主循环逻辑

每分钟执行：

```
1. 读取价格缓冲区 (100+ 根 K 线)
2. 生成特征 (与 Python 完全一致)
3. 运行 ONNX 模型推理
4. 决策：
   - probUp > 0.55 → 下注上涨
   - probUp < 0.45 → 下注下跌
   - 否则 → 不交易
5. 计算 Kelly 仓位大小
6. 通过 Polymarket API 下单
```

---

## 策略原理

### 预测目标

预测 BTC 在未来 15 分钟内价格是否上涨：

```
目标 = 1  如果  (Close[t+15] - Close[t]) / Close[t] >= 0
目标 = 0  否则
```

### 特征工程

**共 60+ 特征，分为 7 类：**

| 类别 | 特征 | 说明 |
|------|------|------|
| 收益率 | return_1m, return_5m, ... | 1/5/15/30/60 分钟收益率 |
| 均线 | ema_5, ema_10, sma_20, ... | 指数/简单移动平均 |
| 动量 | rsi_7, rsi_14, macd, ... | RSI、MACD 指标 |
| 波动率 | std_15m, atr_14, bb_width | 标准差、ATR、布林带宽 |
| 成交量 | volume_ratio, volume_change | 成交量比率 |
| 统计 | skew_30m, kurt_60m, zscore | 偏度、峰度、Z分数 |
| 时间 | hour_sin, dow_cos, ... | 小时/星期循环编码 |

### 模型架构

**XGBoost 二分类器：**

```python
XGBClassifier(
    n_estimators=500,
    max_depth=6,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    early_stopping_rounds=50
)
```

### Kelly 仓位管理

使用 Kelly 公式计算最优仓位：

```
f* = (b × p - q) / b

其中：
- p = 模型预测的胜率
- q = 1 - p
- b = 赔率 = (1 - 市场价格) / 市场价格
```

**示例：**
- 模型预测 probUp = 0.60
- 市场价格 upPrice = 0.50
- 赔率 b = (1 - 0.50) / 0.50 = 1.0
- Kelly = (1.0 × 0.60 - 0.40) / 1.0 = 0.20 (20%)

仓位 = min(Kelly, MAX_KELLY_FRACTION) × BANKROLL

---

## 风险控制

### 1. 15分钟窗口限制

```typescript
// 同一个 15 分钟窗口内不重复交易
const currentWindow = Math.floor(Date.now() / (15 * 60 * 1000));
if (currentWindow === lastTradeWindow) {
    return; // 跳过
}
```

### 2. API 错误熔断

```typescript
const MAX_API_ERRORS = 3;

if (apiErrorCount >= MAX_API_ERRORS) {
    log.error("API 错误过多，停止交易");
    process.exit(1);
}
```

### 3. 置信度阈值

```typescript
// 只在高置信度时交易
if (probUp > 0.55) {
    placeBetUp();
} else if (probUp < 0.45) {
    placeBetDown();
} else {
    // 不交易
}
```

### 4. Kelly 仓位上限

```typescript
const MAX_KELLY_FRACTION = 0.25;  // 单笔最多 25% 仓位
```

### 5. 价格源健康检查

```typescript
// 60秒内必须有价格更新
if (Date.now() - lastUpdateTime > 60000) {
    log.error("价格源异常");
    return;
}
```

### 6. 滑点保护

```typescript
// 订单价格加 0.5% 滑点容忍
const priceWithSlippage = Math.min(marketPrice * 1.005, 0.99);
```

---

## Docker 部署

### 构建并启动

```bash
# 使用 docker-compose
docker-compose up -d

# 或使用一键脚本
./run.sh --docker
```

### 常用命令

```bash
# 查看日志
docker-compose logs -f

# 重启
docker-compose restart

# 停止
docker-compose down

# 重新构建
docker-compose build --no-cache
```

### PM2 进程管理

Docker 内使用 PM2 管理进程：
- 自动重启 (崩溃后)
- 内存限制 500MB (超限重启)
- 日志轮转

---

## ⚠️ 免责声明

1. **本项目仅供学习研究使用**
2. 加密货币交易存在高风险
3. 历史回测不代表未来收益
4. 请勿投入超出承受能力的资金
5. 作者不对任何损失负责

---

## 📄 许可证

MIT License

