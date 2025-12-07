# ⚡ 快速开始 - 3步启动

## 1️⃣ 配置环境变量

```bash
cd node_bot
cp .env.example .env
nano .env  # 填入你的 API 密钥
```

## 2️⃣ 启动

```bash
npm run start
```

**就这么简单！** 会自动：
- ✅ 检查并准备数据
- ✅ 训练模型（如果需要）
- ✅ 启动机器人

## 3️⃣ 查看状态

在另一个终端：

```bash
cd node_bot
npm run status  # 查看预测情况和运行状态
```

或查看实时日志：

```bash
npm run logs
```

---

## 📊 查看预测情况

**最简单的方式：**
```bash
npm run status
```

**查看实时日志：**
```bash
npm run logs
```

**查看日志文件：**
```bash
tail -f logs/bot.log
```

---

## 🎯 判断项目是否有效

运行 `npm run status`，检查：

1. ✅ **运行状态** - 显示 "🟢 运行中"
2. ✅ **预测次数** - 持续增长（每15分钟+1）
3. ✅ **最新预测** - 显示最近的预测结果
4. ✅ **最新价格** - BTC 当前价格

---

**详细说明请查看 `USAGE.md`**

