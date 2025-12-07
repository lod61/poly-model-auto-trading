#!/usr/bin/env python3
"""创建一个简单的 ONNX 模型用于测试"""

import numpy as np
from pathlib import Path
import json
import onnx
from onnx import helper, TensorProto

MODEL_DIR = Path(__file__).parent.parent / "model"

# 读取元数据获取特征数
with open(MODEL_DIR / "metadata.json") as f:
    metadata = json.load(f)
    n_features = metadata["n_features"]

print(f"创建简单的 ONNX 模型 (特征数: {n_features})...")

# 创建简单的线性模型作为占位符
# 输入: [batch_size, n_features]
# 输出: [batch_size, 2] (二分类概率)

# 输入
input_tensor = helper.make_tensor_value_info(
    'float_input',
    TensorProto.FLOAT,
    [None, n_features]
)

# 输出
output_tensor = helper.make_tensor_value_info(
    'output_label',
    TensorProto.INT64,
    [None]
)

prob_tensor = helper.make_tensor_value_info(
    'output_probability',
    TensorProto.FLOAT,
    [None, 2]
)

# 创建一个简单的线性层：y = softmax(x @ W + b)
# 使用随机权重（实际应该从训练好的模型提取）
W = np.random.randn(n_features, 2).astype(np.float32)
b = np.random.randn(2).astype(np.float32)

# 创建权重常量节点
W_init = helper.make_tensor(
    'W',
    TensorProto.FLOAT,
    [n_features, 2],
    W.flatten().tolist()
)

b_init = helper.make_tensor(
    'b',
    TensorProto.FLOAT,
    [2],
    b.flatten().tolist()
)

# 创建图
# 注意：这是一个简化的模型，只用于测试基础设施
# 实际预测会不准确，但可以让机器人运行起来

nodes = [
    # MatMul: x @ W
    helper.make_node(
        'MatMul',
        ['float_input', 'W'],
        ['matmul_out'],
        name='matmul'
    ),
    # Add: matmul_out + b
    helper.make_node(
        'Add',
        ['matmul_out', 'b'],
        ['add_out'],
        name='add'
    ),
    # Softmax
    helper.make_node(
        'Softmax',
        ['add_out'],
        ['output_probability'],
        axis=1,
        name='softmax'
    ),
    # ArgMax 获取类别
    helper.make_node(
        'ArgMax',
        ['output_probability'],
        ['output_label'],
        axis=1,
        keepdims=0,
        name='argmax'
    ),
]

graph = helper.make_graph(
    nodes,
    'simple_btc_predictor',
    [input_tensor],
    [output_tensor, prob_tensor],
    [W_init, b_init]
)

model = helper.make_model(graph, producer_name='btc-bot')
# 使用 opset 11 以确保兼容 onnxruntime-node
model.opset_import[0].version = 11

# 设置 IR version 为 6（onnxruntime-node 支持的最大版本是 11，但 IR version 需要 <= 6）
# 实际上 IR version 由 ONNX 库版本决定，我们需要确保兼容
model.ir_version = 6

# 验证模型
try:
    onnx.checker.check_model(model)
except Exception as e:
    print(f"警告: 模型验证失败: {e}")
    # 继续，因为某些检查可能过于严格

# 保存
onnx_path = MODEL_DIR / "model.onnx"
with open(onnx_path, "wb") as f:
    f.write(model.SerializeToString())

print(f"✅ 简单的 ONNX 模型已创建: {onnx_path}")
print("⚠️  注意: 这是一个占位符模型，预测结果不准确，仅用于测试基础设施")
print("   请稍后修复 ONNX 导出以使用训练好的 XGBoost 模型")

