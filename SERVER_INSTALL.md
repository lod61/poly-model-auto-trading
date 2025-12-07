# 🖥️ 服务器安装详细步骤（新手友好）

## 📋 前置条件检查

你的服务器需要：
- Ubuntu/Debian Linux
- root 权限或 sudo 权限
- 网络连接

---

## 🚀 完整安装步骤

### 步骤 1: 安装系统依赖（必需）

```bash
# 下载并运行依赖安装脚本
chmod +x install-dependencies.sh
./install-dependencies.sh
```

**或者手动安装（如果脚本失败）：**

```bash
# 更新系统
sudo apt update

# 安装 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# 安装 Python 3 和 venv
sudo apt install -y python3 python3-pip python3-venv

# 安装编译工具（某些 Python 包需要）
sudo apt install -y build-essential
```

**验证安装：**
```bash
node --version   # 应该显示 v18 或更高
npm --version    # 应该显示版本号
python3 --version  # 应该显示 Python 3.x
```

---

### 步骤 2: 克隆代码（如果还没有）

```bash
cd ~
git clone https://github.com/your-username/poly-auto-trading.git
cd poly-auto-trading
```

---

### 步骤 3: 配置环境变量（必需）

```bash
cd node_bot
cp .env.example .env
nano .env
```

**在 .env 文件中填入：**
```env
POLYMARKET_API_KEY=你的API密钥
POLYMARKET_API_SECRET=你的密钥
POLYMARKET_PASSPHRASE=你的密码短语
PRIVATE_KEY=0x你的私钥
WALLET_ADDRESS=0x你的钱包地址
RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
```

**保存并退出：**
- 按 `Ctrl+X`
- 按 `Y` 确认
- 按 `Enter` 保存

---

### 步骤 4: 运行（一键启动）

```bash
cd ..
chmod +x run.sh
./run.sh
```

**脚本会自动：**
1. ✅ 检查依赖
2. ✅ 创建 Python 虚拟环境
3. ✅ 安装 Python 依赖
4. ✅ 采集数据（如果不存在）
5. ✅ 训练模型（如果不存在）
6. ✅ 启动机器人

---

### 步骤 5: 查看日志（另一个终端）

```bash
tail -f logs/bot.log
```

---

## 🔧 如果遇到错误

### 错误 1: "npm: command not found"

**解决：**
```bash
# 安装 Node.js 和 npm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

### 错误 2: "python3-venv" 相关错误

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
# 检查网络连接
ping api.binance.com

# 手动采集数据
cd node_bot
npm run collect-data 7
```

### 错误 5: 模型训练失败

**解决：**
- 脚本会自动尝试创建占位符模型
- 如果还是失败，检查 Python 环境：
```bash
cd python_model
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python train.py
```

---

## 📊 验证安装

运行以下命令验证：

```bash
# 1. 检查 Node.js
node --version
npm --version

# 2. 检查 Python
python3 --version
python3 -m venv --help

# 3. 检查项目文件
ls -la node_bot/.env
ls -la logs/
ls -la data/
ls -la model/
```

---

## 🎯 一键安装所有依赖（推荐）

```bash
# 运行依赖安装脚本
chmod +x install-dependencies.sh
./install-dependencies.sh

# 然后运行项目
./run.sh
```

---

## 📝 完整命令序列

```bash
# 1. 安装依赖
chmod +x install-dependencies.sh
./install-dependencies.sh

# 2. 配置环境变量
cd node_bot
cp .env.example .env
nano .env  # 填入你的 API 密钥，保存退出

# 3. 运行
cd ..
chmod +x run.sh
./run.sh
```

**然后在另一个终端：**
```bash
tail -f logs/bot.log
```

---

## ✅ 成功标志

看到以下输出说明成功：
```
✓ 所有依赖已就绪！
✓ 数据准备完成
✓ 模型准备完成
✓ 启动机器人...
[INFO] [MAIN] 初始化完成 ✓
[INFO] [MAIN] 启动主循环...
```

---

## 💡 提示

1. **首次运行**：可能需要 5-10 分钟来采集数据和训练模型
2. **后续运行**：如果数据和模型已存在，启动会很快（< 30秒）
3. **查看状态**：使用 `cd node_bot && npm run status`
4. **停止机器人**：在运行 run.sh 的终端按 `Ctrl+C`

---

祝你部署顺利！🚀

