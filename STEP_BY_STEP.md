# 📝 服务器部署 - 分步详细指南（新手专用）

## 🎯 目标
在服务器上运行 `./run.sh`，然后在另一个终端 `tail -f logs/bot.log` 查看日志。

---

## ⚡ 快速命令（复制粘贴）

### 第一步：安装系统依赖

```bash
# 更新系统
sudo apt update

# 安装 Node.js 和 npm（使用 NodeSource 官方仓库，避免依赖冲突）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# ⚠️ 注意：不要单独安装 npm，NodeSource 的 nodejs 包已经包含 npm
# 如果之前尝试安装过 npm 导致冲突，先清理：
# sudo apt remove -y nodejs npm
# sudo apt autoremove -y
# 然后重新运行上面的命令

# 安装 Python 和相关工具
sudo apt install -y python3 python3-pip python3-venv build-essential

# 验证安装
node --version
npm --version
python3 --version
```

**如果所有命令都显示版本号，说明安装成功！** ✅

**如果 npm 安装失败（依赖冲突）：**
```bash
# 清理并重新安装
sudo apt remove -y nodejs npm
sudo apt autoremove -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

---

### 第二步：进入项目目录并配置环境变量

```bash
# 进入项目目录（假设你已经克隆了代码）
cd ~/poly-model-auto-trading

# 或者如果是其他路径，替换为你的实际路径
cd /path/to/your/project

# 配置环境变量
cd node_bot
cp .env.example .env
nano .env
```

**在 nano 编辑器中：**
1. 找到以下行并填入你的真实密钥：
   ```
   POLYMARKET_API_KEY=你的API密钥
   POLYMARKET_API_SECRET=你的密钥
   POLYMARKET_PASSPHRASE=你的密码短语
   PRIVATE_KEY=0x你的私钥
   WALLET_ADDRESS=0x你的钱包地址
   RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
   ```
2. 保存：按 `Ctrl+O`，然后 `Enter`
3. 退出：按 `Ctrl+X`

**回到项目根目录：**
```bash
cd ..
```

---

### 第三步：运行机器人

```bash
# 确保脚本可执行
chmod +x run.sh

# 运行（这会在前台运行，你可以看到输出）
./run.sh
```

**脚本会自动：**
- ✅ 检查依赖
- ✅ 创建 Python 虚拟环境
- ✅ 安装 Python 依赖
- ✅ 采集数据（如果不存在，需要几分钟）
- ✅ 训练模型（如果不存在，需要几分钟）
- ✅ 启动机器人

**等待看到：**
```
✓ 启动机器人...
[INFO] [MAIN] 初始化完成 ✓
[INFO] [MAIN] 启动主循环...
```

---

### 第四步：在另一个终端查看日志

**打开新的 SSH 终端连接到同一台服务器，然后：**

```bash
# 进入项目目录
cd ~/poly-model-auto-trading

# 查看实时日志
tail -f logs/bot.log
```

**你会看到：**
- 预测记录
- 交易记录
- 统计信息

---

## 🔍 查看预测情况

### 方法 1: 实时查看日志（推荐）
```bash
tail -f logs/bot.log
```

### 方法 2: 查看最新预测
```bash
grep "PREDICTION" logs/bot.log | tail -10
```

### 方法 3: 查看状态统计
```bash
cd node_bot
npm run status
```

---

## ❌ 如果遇到错误

### 错误 1: "npm: command not found"

**解决：**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs npm
```

### 错误 2: "python3-venv" 错误

**解决：**
```bash
sudo apt install -y python3-venv
```

### 错误 3: "pip: command not found"

**解决：**
```bash
sudo apt install -y python3-pip
```

### 错误 4: 数据采集失败

**解决：**
```bash
# 检查网络
ping api.binance.com

# 手动采集
cd node_bot
npm install
npm run collect-data 7
```

---

## ✅ 成功标志

**在日志中看到以下内容说明运行成功：**

```
[INFO] [MAIN] 初始化完成 ✓
[INFO] [MAIN] 启动主循环...
[INFO] [MAIN] 预测 #1 | 目标窗口: ...
[INFO] [MAIN] 📊 预测结果: Up=XX% | Down=XX%
[INFO] [PREDICTION] {...}
```

---

## 🎯 完整命令序列（复制粘贴）

```bash
# === 第一步：安装依赖 ===
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs npm python3 python3-pip python3-venv build-essential

# === 第二步：配置环境变量 ===
cd ~/poly-model-auto-trading/node_bot
cp .env.example .env
nano .env  # 编辑填入你的 API 密钥，保存退出

# === 第三步：运行 ===
cd ..
chmod +x run.sh
./run.sh
```

**然后在另一个终端：**
```bash
cd ~/poly-model-auto-trading
tail -f logs/bot.log
```

---

## 💡 提示

1. **首次运行**：需要 5-10 分钟来安装依赖、采集数据、训练模型
2. **后续运行**：如果所有东西都已准备好，启动会很快
3. **停止机器人**：在运行 `./run.sh` 的终端按 `Ctrl+C`
4. **后台运行**（可选）：使用 `nohup ./run.sh > /dev/null 2>&1 &` 或 PM2

---

## 📊 判断项目是否有效

运行后，在日志中检查：

1. ✅ 每 15 分钟有一次 "预测 #X" 记录
2. ✅ 有 "📊 预测结果" 记录
3. ✅ 有 "最新价格" 信息
4. ✅ 没有大量 ERROR

如果看到这些，说明项目正常运行！🎉

---

祝你部署顺利！

