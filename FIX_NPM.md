# 🔧 修复 npm 安装问题

## 问题
系统自带的 npm 包有依赖冲突，无法直接安装。

## ✅ 解决方案（推荐）

**使用 NodeSource 官方仓库安装 Node.js 和 npm（一起安装，避免依赖问题）：**

```bash
# 1. 添加 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -

# 2. 安装 Node.js（包含 npm）
sudo apt-get install -y nodejs

# 3. 验证安装
node --version
npm --version
```

**如果看到版本号，说明安装成功！** ✅

---

## 🔄 如果还有问题

### 方法 1: 清理并重新安装

```bash
# 清理可能冲突的包
sudo apt-get remove -y nodejs npm
sudo apt-get autoremove -y

# 添加 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -

# 安装
sudo apt-get install -y nodejs

# 验证
node --version
npm --version
```

### 方法 2: 使用 nvm（Node Version Manager）

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载 shell
source ~/.bashrc

# 安装 Node.js 20
nvm install 20
nvm use 20

# 验证
node --version
npm --version
```

---

## 🚀 安装完成后

继续运行项目：

```bash
cd ~/poly-model-auto-trading
./run.sh
```

---

## ✅ 验证

运行以下命令确认安装成功：

```bash
node --version   # 应该显示 v20.x.x 或更高
npm --version    # 应该显示版本号（如 10.x.x）
```

如果两个命令都显示版本号，就可以继续了！🎉

