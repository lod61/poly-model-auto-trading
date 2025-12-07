# 🚀 部署指南

## 前置条件

- Node.js 18+ 已安装
- Python 3.8+ 已安装（如果需要训练模型）
- Git 已安装

---

## 📦 部署步骤

### 1. 推送到 GitHub

```bash
# 确保所有更改已提交
git add .
git commit -m "准备部署到服务器"
git push origin main
```

### 2. 在服务器上克隆项目

```bash
git clone https://github.com/your-username/poly-auto-trading.git
cd poly-auto-trading
```

### 3. 安装依赖

```bash
# 安装 Node.js 依赖
cd node_bot
npm install

# 构建 TypeScript
npm run build
```

### 4. 配置环境变量

```bash
cd node_bot
cp .env.example .env
# 编辑 .env 文件，填入真实的 API 密钥
nano .env  # 或使用 vim/vi
```

**必需的环境变量：**
- `POLYMARKET_API_KEY`
- `POLYMARKET_API_SECRET`
- `POLYMARKET_PASSPHRASE`
- `PRIVATE_KEY`
- `WALLET_ADDRESS`
- `RPC_URL`

### 5. 准备数据和模型

**选项 A: 在服务器上采集和训练**
```bash
# 采集数据
cd node_bot
npm run collect-data 30

# 训练模型（需要 Python 环境）
cd ../python_model
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python train.py
```

**选项 B: 从本地上传**
```bash
# 在本地压缩数据和模型
tar czf deploy-data.tar.gz data/ model/

# 上传到服务器
scp deploy-data.tar.gz user@server:/path/to/poly-auto-trading/

# 在服务器上解压
tar xzf deploy-data.tar.gz
```

### 6. 启动机器人

**开发模式（模拟交易）：**
```bash
cd node_bot
NODE_ENV=development npm run start
```

**生产模式（真实交易）：**
```bash
cd node_bot
NODE_ENV=production npm run start
```

---

## 🔄 使用 PM2 管理进程（推荐）

### 安装 PM2
```bash
npm install -g pm2
```

### 启动机器人
```bash
cd node_bot
pm2 start npm --name "btc-bot" -- run start
pm2 save
pm2 startup  # 设置开机自启
```

### PM2 常用命令
```bash
pm2 list              # 查看所有进程
pm2 logs btc-bot      # 查看日志
pm2 restart btc-bot   # 重启
pm2 stop btc-bot      # 停止
pm2 delete btc-bot    # 删除
pm2 monit             # 监控面板
```

### 配置文件 `ecosystem.config.js`（可选）

创建 `node_bot/ecosystem.config.js`：
```javascript
module.exports = {
  apps: [{
    name: 'btc-bot',
    script: 'dist/index.js',
    cwd: '/path/to/poly-auto-trading/node_bot',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
    },
    error_file: '../logs/err.log',
    out_file: '../logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '500M',
  }]
};
```

然后使用：
```bash
pm2 start ecosystem.config.js
```

---

## 🐳 Docker 部署（可选）

### 构建镜像
```bash
cd node_bot
docker build -t btc-bot .
```

### 运行容器
```bash
docker run -d \
  --name btc-bot \
  --env-file .env \
  -v $(pwd)/../data:/app/data \
  -v $(pwd)/../model:/app/model \
  btc-bot
```

或使用 docker-compose：
```bash
cd ..
docker-compose up -d
```

---

## ✅ 验证部署

### 检查日志
```bash
# 如果使用 PM2
pm2 logs btc-bot

# 如果直接运行
tail -f logs/*.log
```

### 检查进程
```bash
ps aux | grep node
```

### 检查关键功能
1. ✅ 模型加载成功
2. ✅ 价格源连接成功
3. ✅ 主循环运行中
4. ✅ 没有严重错误

---

## 🔧 常见问题

### 1. 模型文件不存在
```bash
# 检查模型文件
ls -lh model/model.onnx
ls -lh model/metadata.json

# 如果不存在，需要训练或上传
```

### 2. 数据文件不存在
```bash
# 检查数据文件
ls -lh data/btc_15m.csv

# 如果不存在，需要采集
cd node_bot && npm run collect-data 7
```

### 3. 环境变量未配置
```bash
# 检查 .env 文件
cat node_bot/.env | grep -v "KEY\|SECRET\|PRIVATE" | grep -v "^#"
```

### 4. 端口被占用
```bash
# 检查是否有其他进程在运行
lsof -i :PORT_NUMBER
```

---

## 🔄 更新部署

### 拉取最新代码
```bash
cd /path/to/poly-auto-trading
git pull origin main

# 重新构建
cd node_bot
npm install  # 如果有新的依赖
npm run build

# 重启
pm2 restart btc-bot  # 如果使用 PM2
# 或
pkill -f "node dist/index.js" && npm run start &
```

---

## 📊 监控和维护

### 设置日志轮转
```bash
# 安装 logrotate
sudo apt install logrotate

# 创建配置 /etc/logrotate.d/btc-bot
/path/to/poly-auto-trading/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 user user
}
```

### 设置系统服务（systemd）

创建 `/etc/systemd/system/btc-bot.service`：
```ini
[Unit]
Description=BTC Trading Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/poly-auto-trading/node_bot
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用服务：
```bash
sudo systemctl daemon-reload
sudo systemctl enable btc-bot
sudo systemctl start btc-bot
sudo systemctl status btc-bot
```

---

## ⚠️ 注意事项

1. **生产环境部署前：**
   - ✅ 确保 `.env` 文件已正确配置
   - ✅ 确认使用的是真实的训练好的模型
   - ✅ 先用小资金测试（`POSITION_SIZE_USD=10`）
   - ✅ 设置合理的 `BANKROLL` 和 `MAX_KELLY_FRACTION`

2. **安全建议：**
   - 🔒 `.env` 文件不要提交到 Git
   - 🔒 使用强密码保护服务器
   - 🔒 定期备份数据和模型
   - 🔒 监控异常活动

3. **性能优化：**
   - 使用 PM2 或 systemd 管理进程
   - 设置日志轮转避免磁盘满
   - 监控内存和 CPU 使用

---

## 🎯 快速部署命令

```bash
# 完整部署流程（假设代码已在服务器上）
cd /path/to/poly-auto-trading/node_bot
npm install
npm run build
cp .env.example .env  # 然后编辑 .env
npm run start  # 或使用 PM2: pm2 start npm --name "btc-bot" -- run start
```

---

祝部署顺利！🚀

