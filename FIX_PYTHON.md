# 🔧 修复 Python 命令问题

## 问题
`python: command not found` - 虚拟环境激活后找不到 python 命令。

## ✅ 解决方案

**方法 1: 确保虚拟环境正确创建（推荐）**

```bash
cd ~/poly-model-auto-trading/python_model

# 删除旧的虚拟环境（如果有问题）
rm -rf venv

# 重新创建虚拟环境
python3 -m venv venv

# 创建 python 符号链接（如果不存在）
cd venv/bin
ln -sf python3 python
cd ../../..

# 验证
./python_model/venv/bin/python --version
```

**方法 2: 手动创建占位符模型（快速解决）**

如果模型训练一直失败，可以手动创建占位符模型：

```bash
cd ~/poly-model-auto-trading/python_model

# 激活虚拟环境
source venv/bin/python3 -m venv venv  # 如果还没有

# 或者直接使用 python3
python3 -m venv venv

# 安装依赖
venv/bin/pip install onnx

# 创建占位符模型
python3 create_simple_onnx.py
```

**方法 3: 跳过模型训练（如果只需要测试基础设施）**

```bash
cd ~/poly-model-auto-trading
SKIP_TRAINING=true ./run.sh  # 如果脚本支持跳过训练
```

---

## 🚀 完整修复步骤

```bash
# 1. 确保 Python 和 venv 已安装
sudo apt install -y python3 python3-venv

# 2. 重新创建虚拟环境
cd ~/poly-model-auto-trading/python_model
rm -rf venv
python3 -m venv venv

# 3. 创建 python 符号链接
cd venv/bin
ln -sf python3 python
cd ../../..

# 4. 安装依赖
venv/bin/pip install -r requirements.txt

# 5. 重新运行
cd ..
./run.sh
```

---

## ✅ 验证

运行以下命令验证：

```bash
# 检查虚拟环境中的 Python
ls -la ~/poly-model-auto-trading/python_model/venv/bin/python*

# 测试 Python
~/poly-model-auto-trading/python_model/venv/bin/python --version
```

如果显示 Python 版本号，说明修复成功！

---

## 📝 已更新的 run.sh

我已经更新了 `run.sh` 脚本，现在会：
- ✅ 使用虚拟环境中 Python 的绝对路径
- ✅ 自动创建 python 符号链接（如果不存在）
- ✅ 更好的错误提示

**重新拉取代码或手动更新 run.sh 后，应该就能正常工作了！**

