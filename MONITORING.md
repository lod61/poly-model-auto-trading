# 📊 监控和查看预测情况

## 🚀 快速开始

运行 `npm run start` 后，机器人会自动：
1. ✅ 检查并准备所有依赖（数据、模型）
2. ✅ 启动并开始运行
3. ✅ 将所有日志保存到 `logs/bot.log`

---

## 📈 查看预测情况

### 方式 1: 查看状态（推荐）
```bash
cd node_bot
npm run status
```

这会显示：
- 📊 运行统计（预测次数、下注次数等）
- 📈 最新预测（方向、概率、时间）
- 💰 最新价格
- 🔄 运行状态

### 方式 2: 查看实时日志
```bash
cd node_bot
npm run logs
```

或直接查看日志文件：
```bash
tail -f logs/bot.log
```

### 方式 3: 查看最新预测
```bash
# 查看最新的预测记录
grep "PREDICTION" logs/bot.log | tail -10

# 查看下注记录
grep "ORDER" logs/bot.log | tail -10

# 查看统计信息
grep "STATS" logs/bot.log | tail -5
```

---

## 🔍 日志关键词

在日志中搜索这些关键词来了解机器人状态：

### 预测相关
- `预测 #` - 每次预测的编号
- `预测结果:` - 预测的概率
- `[PREDICTION]` - 预测详情（JSON格式）

### 交易相关
- `下注 UP` / `下注 DOWN` - 下单决策
- `[ORDER]` - 订单详情
- `[ORDER_SUCCESS]` - 成功下单
- `[ORDER_FAILED]` - 下单失败
- `不交易` - 跳过交易的原因

### 状态相关
- `[STATS]` - 统计信息（每15分钟）
- `初始化完成` - 启动成功
- `主循环启动` - 开始运行
- `ERROR` - 错误信息

---

## 📊 重要指标

### 1. 预测准确率
机器人会在日志中记录每次预测。你可以通过对比预测结果和实际结果来计算准确率。

**查看预测记录：**
```bash
grep "PREDICTION" logs/bot.log | jq .  # 如果安装了 jq
```

### 2. 交易统计
```bash
# 查看总交易次数
grep "ORDER_SUCCESS" logs/bot.log | wc -l

# 查看总金额
grep "ORDER_SUCCESS" logs/bot.log | grep -oP '"amount":\K[\d.]+' | awk '{s+=$1} END {print s}'
```

### 3. 运行状态
```bash
# 检查是否在运行（5分钟内有日志）
find logs/bot.log -mmin -5 -type f

# 查看最后几条日志
tail -20 logs/bot.log
```

---

## 🎯 如何判断项目是否有效

### ✅ 健康指标

1. **机器人正在运行**
   ```bash
   ps aux | grep "node dist/index.js" | grep -v grep
   ```

2. **定期产生预测**
   ```bash
   # 查看最近的预测（应该每15分钟有一个）
   grep "预测 #" logs/bot.log | tail -5
   ```

3. **价格数据正常更新**
   ```bash
   # 查看价格更新
   grep "当前价格" logs/bot.log | tail -5
   ```

4. **没有严重错误**
   ```bash
   # 查看错误（应该很少或没有）
   grep "ERROR" logs/bot.log | tail -10
   ```

### 📈 性能指标

1. **预测频率** - 应该每15分钟有一次预测
2. **下注频率** - 取决于置信度阈值，可能不是每次预测都下注
3. **成功率** - 需要长期跟踪，短期数据不准确

### ⚠️ 警告信号

- ❌ 长时间没有预测（> 30分钟）
- ❌ 大量错误日志
- ❌ 价格数据不更新
- ❌ 进程崩溃

---

## 🔧 使用 PM2 时查看状态

如果使用 PM2 管理进程：

```bash
# 查看进程状态
pm2 status

# 查看实时日志
pm2 logs btc-bot

# 查看最近的日志
pm2 logs btc-bot --lines 100

# 查看错误日志
pm2 logs btc-bot --err

# 监控
pm2 monit
```

---

## 📝 日志格式说明

### 预测日志示例
```
[2025-12-07T20:00:00.000Z] [INFO] [MAIN] 📊 预测结果: Up=55.23% | Down=44.77%
[2025-12-07T20:00:00.001Z] [INFO] [PREDICTION] {"prediction":1,"timestamp":"2025-12-07T20:00:00.000Z","probUp":0.5523,"probDown":0.4477,"currentPrice":91354.35,"direction":"Up","confidence":0.5523}
```

### 订单日志示例
```
[2025-12-07T20:00:05.000Z] [INFO] [MAIN] 💰 下注 UP | 金额: $10.50
[2025-12-07T20:00:05.001Z] [INFO] [ORDER] {"type":"UP","amount":10.5,"prob":0.5523,"price":91354.35}
[2025-12-07T20:00:06.000Z] [INFO] [MAIN] ✅ UP 下注成功
[2025-12-07T20:00:06.001Z] [INFO] [ORDER_SUCCESS] {"type":"UP","amount":10.5,"result":{...}}
```

### 统计日志示例
```
[2025-12-07T20:15:00.000Z] [INFO] [STATS] ═══════════════════════════════════════
[2025-12-07T20:15:00.001Z] [INFO] [STATS] 总预测: 10 (Up: 3, Down: 2, 跳过: 5)
[2025-12-07T20:15:00.002Z] [INFO] [STATS] 订单: 5 (成功: 4, 失败: 1)
[2025-12-07T20:15:00.003Z] [INFO] [STATS] 总金额: $52.30
[2025-12-07T20:15:00.004Z] [INFO] [STATS] API 错误: 1/3
```

---

## 💡 建议

1. **定期检查状态** - 每天运行 `npm run status` 查看整体情况
2. **监控日志文件大小** - 定期清理或轮转日志
3. **保存重要数据** - 定期备份 `logs/bot.log` 用于分析
4. **设置告警** - 可以设置监控脚本，在异常时发送通知

---

## 🎯 快速命令总结

```bash
# 查看状态
npm run status

# 查看实时日志
npm run logs

# 查看最新预测
tail -100 logs/bot.log | grep "PREDICTION"

# 查看下注记录
tail -100 logs/bot.log | grep "ORDER_SUCCESS"

# 检查是否运行
ps aux | grep "node dist/index.js"
```

---

祝监控顺利！📊

