#!/usr/bin/env python3
"""将 XGBoost JSON 模型转换为 ONNX"""

import sys
from pathlib import Path

try:
    import xgboost as xgb
    from onnxmltools import convert_xgboost
    from onnxmltools.convert.common.data_types import FloatTensorType
except ImportError as e:
    print(f"错误: 缺少依赖 {e}")
    sys.exit(1)

MODEL_DIR = Path(__file__).parent.parent / "model"
JSON_MODEL = MODEL_DIR / "model_raw.json"
ONNX_MODEL = MODEL_DIR / "model.onnx"

# 从 metadata.json 读取特征数量
import json
metadata_path = MODEL_DIR / "metadata.json"
if not metadata_path.exists():
    print("错误: metadata.json 不存在，请先运行 train.py")
    sys.exit(1)

with open(metadata_path) as f:
    metadata = json.load(f)
    n_features = metadata["n_features"]

print(f"加载模型: {JSON_MODEL}")
model = xgb.XGBClassifier()
model.load_model(JSON_MODEL)

print(f"转换为 ONNX (特征数: {n_features})...")
initial_type = [("float_input", FloatTensorType([None, n_features]))]

try:
    onnx_model = convert_xgboost(model, initial_types=initial_type, target_opset=12)
    
    with open(ONNX_MODEL, "wb") as f:
        f.write(onnx_model.SerializeToString())
    
    print(f"✅ ONNX 模型已保存到: {ONNX_MODEL}")
except Exception as e:
    print(f"❌ 转换失败: {e}")
    print("\n尝试使用 xgboost2onnx...")
    try:
        import subprocess
        result = subprocess.run(
            ["python", "-m", "xgboost2onnx", str(JSON_MODEL), str(ONNX_MODEL), "-n", str(n_features)],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("✅ 使用 xgboost2onnx 转换成功")
        else:
            print(f"❌ xgboost2onnx 也失败: {result.stderr}")
            sys.exit(1)
    except:
        print("❌ 所有转换方法都失败了")
        sys.exit(1)

