# 项目优化分析

> 基于 Polymarket BTC 15分钟市场规则的专业分析

## ✅ 优化完成状态

| # | 优化项 | 状态 | 实现文件 |
|---|--------|------|----------|
| 1 | Chainlink 数据源 | ✅ 完成 | `collect_data.py` |
| 2 | 时间窗口对齐 | ✅ 完成 | `collect_data.py`, `utils.ts` |
| 3 | >= 边界条件 | ✅ 完成 | `features.py` |
| 4 | 特征精简 | ✅ 完成 | `features.py` |
| 5 | 概率校准 | ✅ 完成 | `train.py` |
| 6 | 1/4 Kelly | ✅ 完成 | `utils.ts` |
| 7 | 市场时机/窗口对齐 | ✅ 完成 | `index.ts` |
| 8 | 波动率过滤 | ✅ 完成 | `index.ts` |
| 9 | 市场价格边际检查 | ✅ 完成 | `index.ts` |
| 10 | 流动性检查 | ✅ 完成 | `polymarket.ts`, `index.ts` |

---

## 🎯 市场规则解读

```
Resolution: "Up" if 结束价格 >= 开始价格, else "Down"
数据源: Chainlink BTC/USD (data.chain.link/streams/btc-usd)
```

**关键点：**
- 使用 Chainlink 价格，不是 Binance/交易所现货价格
- `>=` 意味着平盘也算 "Up"（对 Up 有微小优势）
- 15分钟窗口是固定时间段（如 00:00-00:15）

---

## 🚨 关键问题 (已修复)

### 1. ✅ 数据源不匹配

**问题：** 当前用 Binance 数据训练，但市场用 Chainlink 结算。

**已修复：** `collect_data.py`
```python
# Polygon Mainnet BTC/USD Price Feed
CHAINLINK_BTC_USD_POLYGON = "0xc907E116054Ad103354f2D350FD2514433D57F6f"

def get_chainlink_price(rpc_url, contract_address):
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    contract = w3.eth.contract(address=contract_address, abi=CHAINLINK_ABI)
    _, answer, _, updated_at, _ = contract.functions.latestRoundData().call()
    ...
```

### 2. ✅ 时间窗口对齐

**问题：** 市场的 15 分钟是固定时间段，不是滚动窗口。

**已修复：** `collect_data.py` + `utils.ts`
```python
# Python: 重采样对齐到窗口边界
df_15m = df.resample("15min", origin="start_day").agg({...})
```
```typescript
// TypeScript: 获取窗口开始时间
export function get15MinWindowStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const minutes = d.getUTCMinutes();
  const windowStartMinute = Math.floor(minutes / 15) * 15;
  d.setUTCMinutes(windowStartMinute, 0, 0);
  return d;
}
```

### 3. ✅ >= 边界条件

**问题：** 当前用 `> 0`，市场用 `>=`。

**已修复：** `features.py`
```python
# 正确: 使用 >= (Polymarket 规则)
df["target"] = (next_close >= next_open).astype(int)
```

---

## ⚠️ 重要优化 (已完成)

### 4. ✅ 特征精简

**已修复：** `features.py` - 从 60+ 减少到 ~30 个核心特征
```python
# 精简后的核心特征:
# - 短期收益率 (1, 2, 4, 8 周期)
# - K 线形态 (body, upper, lower, is_bullish)
# - RSI 7/14
# - MACD
# - 布林带 (position, width)
# - 波动率 (4, 8 周期)
# - 成交量
# - 动量
# - 短期均线 (EMA 4/8)
# - 时间特征
```

### 5. ✅ 概率校准

**已修复：** `train.py`
```python
from sklearn.calibration import CalibratedClassifierCV

# Platt Scaling 校准
calibrated_model = CalibratedClassifierCV(model, method="sigmoid", cv="prefit")
calibrated_model.fit(X_cal, y_cal)
```

### 6. ✅ Kelly 公式修正

**已修复：** `utils.ts`
```typescript
export function kellyBetSize(
  probWin: number,
  marketPrice: number,
  kellyFraction: number = 0.25,  // 1/4 Kelly
  maxFraction: number = 0.10,   // 最大 10% 仓位
): number {
  const fullKelly = (b * probWin - q) / b;
  if (fullKelly <= 0) return 0;
  const adjustedKelly = fullKelly * kellyFraction;
  return Math.min(adjustedKelly, maxFraction);
}
```

---

## 📊 策略优化 (已完成)

### 7. ✅ 市场时机选择 / 窗口对齐

**已修复：** `index.ts`
```typescript
// 在窗口开始前 10-60 秒下注
export function isOptimalBettingTime(): boolean {
  const msUntil = msUntilNextWindow();
  return msUntil > 10000 && msUntil < 60000;
}
```

### 8. ✅ 波动率过滤

**已修复：** `index.ts`
```typescript
// 波动率过滤
const candleRange = (lastCandle.high - lastCandle.low) / lastCandle.close;
if (candleRange < 0.001) {
  log.info(`[MAIN] → 不交易 | 波动率过低: ${formatPct(candleRange)}`);
  skippedBets++;
  return;
}
```

### 9. ✅ 市场价格边际检查

**已修复：** `index.ts`
```typescript
// 边际优势检查
const upEdge = probUp - upPrice;
const downEdge = probDown - downPrice;

// 只有边际 > 2% 时才交易
if (probUp > MIN_CONFIDENCE_UP && upEdge > 0.02) {
  // 下注 UP
}
```

### 10. ✅ 流动性检查

**已修复：** `polymarket.ts` + `index.ts`
```typescript
// 检查流动性
export async function checkLiquidity(
  tokenId: string,
  sizeUsd: number,
  maxSlippage: number = 0.01
): Promise<{ sufficient: boolean; availableSize: number; avgPrice: number }> {
  const orderBook = await getOrderBook(tokenId);
  // ... 检查订单簿深度
}

// 下单前检查
const liquidity = await checkLiquidity(tokenId, betSize);
if (!liquidity.sufficient) {
  log.warn(`[MAIN] 流动性不足，跳过`);
  return;
}
```

---

## 📈 预期改进

| 优化项 | 预期效果 |
|--------|----------|
| Chainlink 数据源 | 消除 1-2% 错误结算 |
| 时间窗口对齐 | 提升 2-3% 准确率 |
| 特征精简 | 减少过拟合 |
| 概率校准 | 更准确的 Kelly 仓位 |
| 1/4 Kelly | 降低 50% 回撤 |
| 波动率过滤 | 避免无效交易 |
| 市场价格边际 | 额外 1-2% 边际 |
| 流动性检查 | 避免滑点损失 |

---

## 💡 最终建议

1. **先在测试网/小资金验证** - 不要直接上大资金
2. **记录每笔交易** - 建立回测数据库
3. **持续监控** - 真实市场与回测的偏差
4. **动态调整** - 根据实际表现调整参数

```bash
# 建议的测试流程
1. 收集 30 天 Chainlink 历史数据
2. 重新训练模型
3. 纸上交易 7 天
4. 小资金 ($50) 实盘 7 天
5. 评估后决定是否扩大
```

---

## 🔒 安全检查清单

- [x] 同一 15 分钟窗口不重复下注
- [x] API 错误计数熔断 (≥3 次停止)
- [x] 波动率过低不交易 (<0.1%)
- [x] 边际优势不足不交易 (<2%)
- [x] 流动性不足不交易
- [x] Kelly 仓位上限 (10%)
- [x] 1/4 Kelly 保守策略
- [x] 概率校准防止过度自信
