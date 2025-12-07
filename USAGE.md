# 🚀 使用指南 - 一键启动和监控

## ✅ 完整自动化流程

现在所有内容都已自动化，**你只需要运行 `npm run start`**！

---

## 🎯 快速开始

### 在服务器上部署

```bash
# 1. 克隆代码（如果还没有）
git clone https://github.com/your-username/poly-auto-trading.git
cd poly-auto-trading/node_bot

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
nano .env  # 填入你的 API 密钥

# 4. 启动！✅
npm run start
```

**就是这么简单！** `npm run start` 会自动：
- ✅ 检查并采集数据（如果不存在）
- ✅ 训练模型（如果需要）
- ✅ 构建代码
- ✅ 启动机器人

---

## 📊 查看预测情况和项目状态

### 方式 1: 查看状态（最方便）⭐
```bash
cd node_bot
npm run status
```

**显示内容：**
- 📊 运行统计（预测次数、下注次数、错误数）
- 📈 最新预测（方向、概率、时间）
- 💰 最新价格
- 🔄 运行状态（是否活跃）

### 方式 2: 查看实时日志
```bash
cd node_bot
npm run logs
```

或直接：
```bash
tail -f logs/bot.log
```

### 方式 3: 查看特定信息
```bash
# 查看最新预测
grep "PREDICTION" logs/bot.log | tail -5

# 查看下注记录
grep "ORDER_SUCCESS" logs/bot.log | tail -5

# 查看统计
grep "STATS" logs/bot.log | tail -3
```

---

## 🔍 如何判断项目是否有效

### ✅ 健康指标

运行 `npm run status` 查看：

1. **🟢 运行状态** - 应该显示"运行中"
2. **📊 预测次数** - 应该持续增长（每15分钟一次）
3. **💰 最新价格** - 应该是最新的 BTC 价格
4. **📈 最新预测** - 应该显示最近15分钟的预测

### 📈 日志中的关键信息

**每15分钟你应该看到：**
```
[INFO] [MAIN] 预测 #X | 目标窗口: ...
[INFO] [MAIN] 📊 预测结果: Up=XX% | Down=XX%
[INFO] [PREDICTION] {...}  # JSON格式的预测详情
```

**如果下注：**
```
[INFO] [MAIN] 💰 下注 UP/DOWN | 金额: $XX
[INFO] [ORDER] {...}  # 订单详情
[INFO] [MAIN] ✅ UP/DOWN 下注成功
```

**每15分钟统计：**
```
[INFO] [STATS] 总预测: X (Up: X, Down: X, 跳过: X)
[INFO] [STATS] 订单: X (成功: X, 失败: X)
```

---

## 📝 日志位置

所有日志自动保存到：
- `logs/bot.log` - 完整的运行日志

日志包含：
- ✅ 所有预测记录（带时间戳和概率）
- ✅ 所有订单记录（成功/失败）
- ✅ 统计信息（每15分钟）
- ✅ 错误信息（如果有）

---

## 🔧 常用命令

```bash
# 启动机器人
npm run start

# 查看状态
npm run status

# 查看实时日志
npm run logs

# 停止机器人（如果直接运行）
Ctrl+C

# 如果使用 PM2
pm2 start npm --name "btc-bot" -- run start
pm2 logs btc-bot
pm2 status
```

---

## 📊 数据文件位置

运行后会自动创建/使用：

- `data/btc_1m.csv` - 1分钟K线数据
- `data/btc_15m.csv` - 15分钟K线数据（用于预测）
- `model/model.onnx` - ONNX 模型文件
- `model/metadata.json` - 模型元数据
- `logs/bot.log` - 运行日志

---

## ⚙️ 配置参数

在 `node_bot/.env` 中可以调整：

```env
# 交易配置
POSITION_SIZE_USD=10          # 每次下注金额（开发模式不影响）
MIN_CONFIDENCE_UP=0.55        # 最小上涨置信度
MIN_CONFIDENCE_DOWN=0.45      # 最大下跌置信度
MAX_KELLY_FRACTION=0.25       # Kelly 系数（1/4 Kelly）
BANKROLL=1000                 # 总资金

# 运行模式
NODE_ENV=development          # development=模拟交易, production=真实交易
LOG_LEVEL=info                # debug, info, warn, error
```

---

## 🚨 重要提示

1. **开发模式 vs 生产模式**
   - `NODE_ENV=development` - 模拟交易，不会真实下单
   - `NODE_ENV=production` - 真实交易，会真实下单！

2. **首次运行**
   - 可能需要几分钟来采集数据和训练模型
   - 之后启动会很快（< 10秒）

3. **日志文件**
   - 日志文件会持续增长，建议定期清理或使用日志轮转

---

## 📖 更多信息

- `MONITORING.md` - 详细的监控指南
- `DEPLOY.md` - 部署文档
- `README.md` - 项目说明

---

## ❓ 常见问题

**Q: 机器人启动后多久会有第一次预测？**
A: 通常在15分钟内，取决于当前时间到下一个15分钟窗口的距离。

**Q: 为什么没有下注？**
A: 只有当预测置信度超过阈值（Up>55% 或 Down<45%）并且有足够边际优势时才会下注。

**Q: 如何查看历史预测准确率？**
A: 需要手动分析日志文件，或者你可以提供数据给我，我可以帮你分析。

**Q: 日志文件太大怎么办？**
A: 可以使用日志轮转工具（如 logrotate），或者定期清理旧日志。

---

## 🎉 现在就开始！

```bash
cd node_bot
npm run start
```

然后在另一个终端查看状态：
```bash
cd node_bot
npm run status
```

就是这么简单！🚀

