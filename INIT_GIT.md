# 📦 Git 初始化和推送指南

## 初始化 Git 仓库

```bash
cd /Users/v/person/poly-auto-trading

# 初始化 Git
git init

# 添加所有文件
git add .

# 第一次提交
git commit -m "Initial commit: BTC trading bot"

# 在 GitHub 上创建新仓库后，添加远程仓库
git remote add origin https://github.com/your-username/poly-auto-trading.git

# 推送代码
git branch -M main
git push -u origin main
```

---

## ⚠️ 推送前确认

运行以下命令确认敏感文件不会被提交：

```bash
# 检查 .gitignore 是否正确
cat .gitignore

# 检查哪些文件会被提交（确保没有 .env）
git status

# 检查是否包含敏感文件
git ls-files | grep -E "\.env$|\.key$|secret"
```

如果看到 `.env` 或敏感文件，需要从 Git 中移除：
```bash
git rm --cached node_bot/.env
git commit -m "Remove .env from git"
```

---

## 🔒 安全提示

1. **永远不要提交：**
   - `.env` 文件
   - API 密钥
   - 私钥文件
   - 数据文件（CSV）
   - 模型文件（如果很大）

2. **已在 .gitignore 中的文件：**
   - ✅ `.env`
   - ✅ `node_modules/`
   - ✅ `data/*.csv`
   - ✅ `model/*.onnx`
   - ✅ `*.log`

---

## 🚀 快速命令

```bash
# 完整流程
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/poly-auto-trading.git
git branch -M main
git push -u origin main
```

