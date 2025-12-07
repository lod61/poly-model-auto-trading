# 数据采集指南

## JavaScript 版本（推荐）

JavaScript/TypeScript 版本的数据采集脚本已经解决了 Python 版本可能卡住的问题，包含完整的超时和错误处理。

### 快速开始

```bash
cd node_bot

# 1. 安装依赖（如果还没安装）
npm install

# 2. 采集数据（默认 7 天）
npm run collect-data

# 3. 或者指定天数
npm run collect-data 90  # 采集 90 天数据
```

### 功能特点

✅ **不会卡住**：所有网络请求都有 30 秒超时  
✅ **自动重试**：失败后自动重试最多 3 次  
✅ **进度提示**：实时显示采集进度和批次信息  
✅ **错误处理**：连续失败 5 次后自动停止，不会无限等待  
✅ **CSV 兼容**：生成的 CSV 格式与 Python 版本完全兼容  

### 输出文件

- `data/btc_1m.csv` - 1 分钟 K 线数据
- `data/btc_15m.csv` - 15 分钟 K 线数据（自动重采样）

### 配置参数

可以在 `src/collectData.ts` 中调整：

```typescript
const REQUEST_TIMEOUT = 30000;  // 请求超时（毫秒）
const MAX_RETRIES = 3;          // 最大重试次数
const MAX_FAILURES = 5;         // 最大连续失败次数
```

---

## Python 版本（备选）

如果更偏向使用 Python，也可以使用 Python 版本：

```bash
cd python_model
source venv/bin/activate

# 快速测试（7天数据）
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
```

**注意**：Python 版本也已经添加了超时和重试机制，但如果网络环境不稳定，建议使用 JavaScript 版本。

---

## 数据格式

CSV 文件格式（与 Python pandas 兼容）：

```csv
timestamp,open,high,low,close,volume,quote_volume,trades
2024-01-01T00:00:00.000Z,50000.0,50100.0,49900.0,50050.0,100.5,5025025.0,1500
...
```

- `timestamp`: ISO 8601 格式时间戳（UTC）
- `open`, `high`, `low`, `close`: 价格（USD）
- `volume`: BTC 成交量
- `quote_volume`: USDT 成交量
- `trades`: 成交笔数

