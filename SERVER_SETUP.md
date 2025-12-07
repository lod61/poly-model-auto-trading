# 🖥️ 服务器部署 - 一键启动指南

## 🚀 快速开始

### 在服务器上执行：

```bash
# 1. 克隆代码
git clone https://github.com/your-username/poly-auto-trading.git
cd poly-auto-trading

# 2. 配置环境变量（必需）
cd node_bot
cp .env.example .env
nano .env  # 填入你的 API 密钥

# 3. 运行！
cd ..
chmod +x run.sh
./run.sh
```

**就这么简单！** `./run.sh` 会自动：
- ✅ 检查并准备 Python 环境
- ✅ 检查数据，不存在则自动采集
- ✅ 检查模型，不存在则自动训练
- ✅ 构建并启动机器人

---

## 📊 查看日志

在另一个终端：

```bash
cd /path/to/poly-auto-trading
tail -f logs/bot.log
```

**或者：**
```bash
cd node_bot
npm run logs    # 查看实时日志
npm run status  # 查看状态统计
```

---

## 📝 日志中包含的信息

### 预测记录
```
[INFO] [MAIN] 📊 预测结果: Up=55.23% | Down=44.77%
[INFO] [PREDICTION] {"prediction":1,"probUp":0.5523,"direction":"Up",...}
```

### 交易记录
```
[INFO] [MAIN] 💰 下注 UP | 金额: $10.50
[INFO] [ORDER_SUCCESS] {"type":"UP","amount":10.5,...}
```

### 统计信息（每15分钟）
```
[INFO] [STATS] 总预测: 10 (Up: 3, Down: 2, 跳过: 5)
[INFO] [STATS] 订单: 5 (成功: 4, 失败: 1)
```

---

## ✅ 验证运行状态

### 1. 检查进程
```bash
ps aux | grep "node dist/index.js" | grep -v grep
```

### 2. 检查日志文件
```bash
ls -lh logs/bot.log
tail -20 logs/bot.log
```

### 3. 查看状态
```bash
cd node_bot
npm run status
```

---

## 🎯 判断项目是否有效

运行 `npm run status` 查看：

1. **🟢 运行状态** - 应该显示"运行中"
2. **📊 预测次数** - 应该持续增长（每15分钟+1）
3. **📈 最新预测** - 显示最近的预测结果
4. **💰 最新价格** - BTC 当前价格
5. **没有严重错误** - 日志中没有大量 ERROR

**健康指标：**
- ✅ 每15分钟有一次预测记录
- ✅ 价格数据正常更新
- ✅ 没有连续的连接错误

---

## 🔧 环境变量配置

编辑 `node_bot/.env`：

```env
# 必需
POLYMARKET_API_KEY=your_key
POLYMARKET_API_SECRET=your_secret
POLYMARKET_PASSPHRASE=your_passphrase
PRIVATE_KEY=0x_your_private_key
WALLET_ADDRESS=0x_your_wallet
RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY

# 可选（调整策略）
POSITION_SIZE_USD=10
MIN_CONFIDENCE_UP=0.55
MIN_CONFIDENCE_DOWN=0.45
MAX_KELLY_FRACTION=0.25
BANKROLL=1000

# 运行模式
NODE_ENV=development  # development=模拟, production=真实交易
LOG_LEVEL=info
```

---

## ⚠️ 重要提示

1. **首次运行**：
   - 可能需要几分钟来采集数据和训练模型
   - 如果模型训练失败，会自动使用占位符模型（预测不准确，但可以测试基础设施）

2. **开发模式 vs 生产模式**：
   - `NODE_ENV=development` - 模拟交易，不会真实下单
   - `NODE_ENV=production` - 真实交易，会真实下单！

3. **日志文件**：
   - 日志会持续增长，建议定期清理或使用日志轮转
   - 日志位置：`logs/bot.log`

---

## 🔄 更新和重启

```bash
# 拉取最新代码
git pull

# 重新构建（如果代码有变化）
cd node_bot
npm run build

# 重启（如果在 run.sh 终端，按 Ctrl+C 然后重新运行）
# 或使用 PM2
pm2 restart btc-bot
```

---

## 📊 监控命令

```bash
# 实时日志
tail -f logs/bot.log

# 查看最新预测
grep "PREDICTION" logs/bot.log | tail -10

# 查看下注记录
grep "ORDER_SUCCESS" logs/bot.log | tail -10

# 查看错误
grep "ERROR" logs/bot.log | tail -20

# 查看统计
grep "STATS" logs/bot.log | tail -5
```

---

## 🎉 现在就开始！

```bash
./run.sh
```

然后在另一个终端：
```bash
tail -f logs/bot.log
```

一切就绪！🚀

