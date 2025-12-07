# 🎯 下一步行动计划

## ✅ 当前状态

机器人已在开发模式下运行（模拟交易），基础流程已打通。

---

## 📋 优先事项

### 1. 监控机器人运行（立即）

**查看实时日志：**
```bash
tail -f /tmp/bot.log
```

**检查关键指标：**
- 每 15 分钟是否正常预测
- 价格数据是否正常更新
- 是否有错误或警告

**停止机器人（如需要）：**
```bash
pkill -f "tsx watch"
```

---

### 2. 修复 ONNX 模型导出（重要）

当前使用的是占位符模型，预测不准确。需要修复 XGBoost 到 ONNX 的转换。

**选项 A: 尝试修复 onnxmltools 转换**
```bash
cd python_model
source venv/bin/activate
# 尝试调整 XGBoost 模型参数后重新导出
```

**选项 B: 使用 XGBoost 原生格式**
- 在 Node.js 端使用 `xgboost` npm 包直接加载 JSON 模型
- 需要修改 `node_bot/src/model.ts`

**选项 C: 使用 Treelite**
- 将 XGBoost 模型转换为 Treelite 格式
- 在 Node.js 端使用 `treelite-runtime`

**建议：先监控几天，确认基础设施稳定后，再优化模型。**

---

### 3. 优化和验证（短期）

#### 3.1 收集更多数据
```bash
cd node_bot
# 采集 30-90 天数据用于更好的训练
npm run collect-data 30
```

#### 3.2 重新训练模型
```bash
cd python_model
source venv/bin/activate
python train.py
```

#### 3.3 回测验证
```bash
python backtest.py
```

#### 3.4 评估模型性能
- 检查准确率、AUC、Brier Score
- 分析特征重要性
- 调整超参数

---

### 4. 配置生产环境（准备就绪后）

#### 4.1 配置真实的 API 密钥
```bash
cd node_bot
# 编辑 .env 文件，填入真实的：
# - POLYMARKET_API_KEY
# - POLYMARKET_API_SECRET
# - POLYMARKET_PASSPHRASE
# - PRIVATE_KEY
# - WALLET_ADDRESS
# - RPC_URL (配置自己的 Alchemy/Infura 密钥)
```

#### 4.2 调整交易参数
在 `.env` 中调整：
- `POSITION_SIZE_USD` - 每次下注金额
- `MIN_CONFIDENCE_UP` - 最小上涨置信度
- `MIN_CONFIDENCE_DOWN` - 最大下跌置信度
- `MAX_KELLY_FRACTION` - Kelly 公式仓位限制
- `BANKROLL` - 总资金

#### 4.3 测试小资金运行
```bash
# 切换到生产模式（真实交易）
cd node_bot
NODE_ENV=production npm run start
```

**⚠️ 重要：先用小资金测试（$10-50），确认无误后再增加！**

---

### 5. 持续改进（长期）

#### 5.1 监控和日志
- 设置日志文件轮转
- 添加性能指标收集
- 创建监控仪表板

#### 5.2 策略优化
- 分析历史交易记录
- 调整置信度阈值
- 优化 Kelly 公式参数
- 添加止损/止盈机制

#### 5.3 风险管理
- 设置每日/每周损失限制
- 添加市场异常检测
- 实现自动暂停机制

#### 5.4 特征工程
- 尝试新的技术指标
- 添加市场情绪指标
- 考虑多时间框架分析

---

## 🛠️ 立即可以做的事情

### 选项 1: 观察机器人运行（推荐）
```bash
# 实时查看日志
tail -f /tmp/bot.log

# 让机器人运行几小时，观察：
# - 预测频率
# - 预测结果分布
# - 错误日志
```

### 选项 2: 改进数据质量
```bash
# 采集更多历史数据
cd node_bot
npm run collect-data 30  # 30天数据

# 重新训练模型
cd ../python_model
source venv/bin/activate
python train.py
```

### 选项 3: 运行回测
```bash
cd python_model
source venv/bin/activate
python backtest.py
```

### 选项 4: 修复 ONNX 导出
查看 `python_model/convert_to_onnx.py`，尝试修复转换问题。

---

## 📊 评估当前策略有效性

**关注指标：**
1. **预测准确率** - 当前约 45%，目标 > 52%
2. **AUC 分数** - 当前 0.43，目标 > 0.55
3. **Brier Score** - 当前 0.27，越低越好（< 0.20 为优秀）

**如果准确率低于随机（50%）：**
- 可能需要更多数据
- 特征工程需要改进
- 模型超参数需要调整

---

## 🚀 快速命令参考

```bash
# 查看机器人日志
tail -f /tmp/bot.log

# 停止机器人
pkill -f "tsx watch"

# 重启机器人
cd node_bot
NODE_ENV=development npm run dev > /tmp/bot.log 2>&1 &

# 采集新数据
cd node_bot && npm run collect-data 7

# 重新训练
cd python_model && source venv/bin/activate && python train.py

# 运行回测
cd python_model && source venv/bin/activate && python backtest.py
```

---

## 💡 建议的下一步顺序

1. **现在**：观察机器人运行 1-2 小时，确认基础设施稳定
2. **今天**：采集更多数据（30 天），重新训练模型
3. **本周**：运行回测，分析策略有效性
4. **下周**：如果回测结果好，小资金实盘测试
5. **持续**：监控、优化、迭代

---

## ⚠️ 注意事项

- **当前是占位符模型**，预测不准确，仅用于测试基础设施
- **开发模式**是模拟交易，不会真实下单
- **生产模式**需要真实的 API 密钥和资金
- **永远不要用超过你能承受损失的资金进行交易**

---

祝交易顺利！📈

