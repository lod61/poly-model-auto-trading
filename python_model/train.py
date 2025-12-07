#!/usr/bin/env python3
"""
模型训练 - XGBoost + 概率校准 + ONNX 导出。

关键改进:
1. 使用 15 分钟数据
2. 时序交叉验证
3. 概率校准 (Platt Scaling)
4. 保存校准后的概率用于 Kelly 计算
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    classification_report,
    log_loss,
    roc_auc_score,
)
from sklearn.model_selection import TimeSeriesSplit
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType as SklearnFloatTensorType
try:
    from onnxmltools import convert_xgboost
    from onnxmltools.convert.common.data_types import FloatTensorType as OnnxmltoolsFloatTensorType
except ImportError:
    convert_xgboost = None
    OnnxmltoolsFloatTensorType = None

from collect_data import load_data
from features import build_features, get_feature_columns

MODEL_DIR = Path(__file__).parent.parent / "model"
MODEL_DIR.mkdir(exist_ok=True)


def train_with_cv(
    X: np.ndarray,
    y: np.ndarray,
    n_splits: int = 5,
) -> tuple[xgb.XGBClassifier, dict]:
    """
    使用时序交叉验证训练模型。
    
    Returns:
        (模型, 交叉验证结果)
    """
    print(f"\n[训练] 使用 {n_splits} 折时序交叉验证")
    
    tscv = TimeSeriesSplit(n_splits=n_splits)
    cv_scores = []
    
    for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
        X_train, X_val = X[train_idx], X[val_idx]
        y_train, y_val = y[train_idx], y[val_idx]
        
        model = xgb.XGBClassifier(
            objective="binary:logistic",
            n_estimators=200,
            max_depth=4,  # 降低深度防止过拟合
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=5,
            reg_alpha=0.1,
            reg_lambda=1.0,
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        )
        
        model.fit(X_train, y_train)
        
        y_pred = model.predict(X_val)
        y_proba = model.predict_proba(X_val)[:, 1]
        
        acc = accuracy_score(y_val, y_pred)
        auc = roc_auc_score(y_val, y_proba)
        brier = brier_score_loss(y_val, y_proba)
        
        cv_scores.append({"acc": acc, "auc": auc, "brier": brier})
        print(f"  Fold {fold+1}: Acc={acc:.4f}, AUC={auc:.4f}, Brier={brier:.4f}")
    
    # 计算平均分数
    avg_scores = {
        "cv_acc_mean": np.mean([s["acc"] for s in cv_scores]),
        "cv_acc_std": np.std([s["acc"] for s in cv_scores]),
        "cv_auc_mean": np.mean([s["auc"] for s in cv_scores]),
        "cv_auc_std": np.std([s["auc"] for s in cv_scores]),
        "cv_brier_mean": np.mean([s["brier"] for s in cv_scores]),
    }
    
    print(f"\n[CV 结果] Acc: {avg_scores['cv_acc_mean']:.4f} ± {avg_scores['cv_acc_std']:.4f}")
    print(f"[CV 结果] AUC: {avg_scores['cv_auc_mean']:.4f} ± {avg_scores['cv_auc_std']:.4f}")
    
    # 使用全部数据训练最终模型
    print("\n[训练] 使用全部数据训练最终模型...")
    final_model = xgb.XGBClassifier(
        objective="binary:logistic",
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=-1,
        verbosity=0,
    )
    final_model.fit(X, y)
    
    return final_model, avg_scores


def calibrate_model(
    model: xgb.XGBClassifier,
    X_cal: np.ndarray,
    y_cal: np.ndarray,
    method: str = "sigmoid",  # Platt Scaling
) -> CalibratedClassifierCV:
    """
    对模型进行概率校准。
    
    Args:
        model: 原始模型
        X_cal: 校准数据特征
        y_cal: 校准数据标签
        method: 校准方法 ("sigmoid" = Platt Scaling, "isotonic")
    
    Returns:
        校准后的模型
    """
    print(f"\n[校准] 使用 {method} 方法进行概率校准...")
    
    # 使用预拟合的模型进行校准
    calibrated = CalibratedClassifierCV(model, method=method, cv="prefit")
    calibrated.fit(X_cal, y_cal)
    
    # 评估校准效果
    y_proba_raw = model.predict_proba(X_cal)[:, 1]
    y_proba_cal = calibrated.predict_proba(X_cal)[:, 1]
    
    brier_raw = brier_score_loss(y_cal, y_proba_raw)
    brier_cal = brier_score_loss(y_cal, y_proba_cal)
    
    print(f"  Brier Score (原始): {brier_raw:.4f}")
    print(f"  Brier Score (校准后): {brier_cal:.4f}")
    
    # 打印校准曲线
    print("\n[校准曲线]")
    prob_true, prob_pred = calibration_curve(y_cal, y_proba_cal, n_bins=10)
    for pt, pp in zip(prob_true, prob_pred):
        print(f"  预测 {pp:.2f} → 实际 {pt:.2f}")
    
    return calibrated


def evaluate_model(
    model,
    X: np.ndarray,
    y: np.ndarray,
    name: str = "Test",
) -> dict:
    """评估模型性能。"""
    y_pred = model.predict(X)
    y_proba = model.predict_proba(X)[:, 1]
    
    metrics = {
        "accuracy": accuracy_score(y, y_pred),
        "auc": roc_auc_score(y, y_proba),
        "brier": brier_score_loss(y, y_proba),
        "log_loss": log_loss(y, y_proba),
    }
    
    print(f"\n[{name}] 结果:")
    print(f"  Accuracy: {metrics['accuracy']:.4f}")
    print(f"  AUC: {metrics['auc']:.4f}")
    print(f"  Brier Score: {metrics['brier']:.4f}")
    print(f"  Log Loss: {metrics['log_loss']:.4f}")
    print(f"\n{classification_report(y, y_pred, target_names=['Down', 'Up'])}")
    
    return metrics


def export_onnx(model, n_features: int, filepath: Path) -> None:
    """导出 ONNX 模型。"""
    # 如果是 XGBoost 模型，使用 onnxmltools
    if isinstance(model, xgb.XGBClassifier) and convert_xgboost is not None and OnnxmltoolsFloatTensorType is not None:
        print(f"[导出] 使用 onnxmltools 导出 XGBoost 模型...")
        initial_type = [("float_input", OnnxmltoolsFloatTensorType([None, n_features]))]
        onnx_model = convert_xgboost(model, initial_types=initial_type, target_opset=12)
    else:
        # 尝试使用 skl2onnx
        initial_type = [("float_input", SklearnFloatTensorType([None, n_features]))]
        try:
            onnx_model = convert_sklearn(
                model,
                initial_types=initial_type,
                target_opset=12,
                options={id(model): {"zipmap": False}} if hasattr(model, '__class__') else None,
            )
        except Exception as e:
            raise RuntimeError(f"无法导出模型到 ONNX: {e}")
    
    with open(filepath, "wb") as f:
        f.write(onnx_model.SerializeToString())
    
    print(f"\n[导出] ONNX 模型已保存到 {filepath}")


def save_metadata(feature_names: list[str], metrics: dict, filepath: Path) -> None:
    """保存模型元数据。"""
    metadata = {
        "feature_names": feature_names,
        "n_features": len(feature_names),
        "target": "15m_up_down_polymarket",
        "target_definition": "next_close >= next_open (Polymarket rule)",
        "metrics": metrics,
    }
    
    with open(filepath, "w") as f:
        json.dump(metadata, f, indent=2)
    
    print(f"[导出] 元数据已保存到 {filepath}")


def main():
    """主训练流程。"""
    print("=" * 60)
    print("BTC 15 分钟涨跌预测 - 模型训练")
    print("=" * 60)
    
    # 1. 加载数据 (使用 15 分钟数据)
    print("\n[1/6] 加载 15 分钟数据...")
    try:
        df = load_data(interval="15m")
    except FileNotFoundError:
        print("15 分钟数据不存在，尝试从 1 分钟数据生成...")
        df = load_data(interval="1m")
        from collect_data import resample_to_15m, save_data
        df = resample_to_15m(df)
        save_data(df, "btc_15m.csv")
    
    print(f"  数据量: {len(df)} 条")
    print(f"  时间范围: {df.index.min()} ~ {df.index.max()}")
    
    # 2. 构建特征
    print("\n[2/6] 构建特征...")
    features_df = build_features(df)
    feature_cols = get_feature_columns(features_df)
    
    X = features_df[feature_cols].values
    y = features_df["target"].values
    
    print(f"  特征数量: {len(feature_cols)}")
    print(f"  样本数量: {len(X)}")
    print(f"  目标分布: Up={y.mean():.2%}, Down={1-y.mean():.2%}")
    
    # 3. 数据分割 (70% 训练, 15% 校准, 15% 测试)
    print("\n[3/6] 时序数据分割...")
    n = len(X)
    train_end = int(n * 0.70)
    cal_end = int(n * 0.85)
    
    X_train, y_train = X[:train_end], y[:train_end]
    X_cal, y_cal = X[train_end:cal_end], y[train_end:cal_end]
    X_test, y_test = X[cal_end:], y[cal_end:]
    
    print(f"  训练集: {len(X_train)} 条 ({len(X_train)/n:.0%})")
    print(f"  校准集: {len(X_cal)} 条 ({len(X_cal)/n:.0%})")
    print(f"  测试集: {len(X_test)} 条 ({len(X_test)/n:.0%})")
    
    # 4. 训练 (带交叉验证)
    print("\n[4/6] 训练 XGBoost...")
    model, cv_scores = train_with_cv(X_train, y_train, n_splits=5)
    
    # 5. 概率校准
    print("\n[5/6] 概率校准...")
    calibrated_model = calibrate_model(model, X_cal, y_cal, method="sigmoid")
    
    # 6. 评估
    print("\n[6/6] 模型评估...")
    train_metrics = evaluate_model(calibrated_model, X_train, y_train, "训练集")
    cal_metrics = evaluate_model(calibrated_model, X_cal, y_cal, "校准集")
    test_metrics = evaluate_model(calibrated_model, X_test, y_test, "测试集")
    
    # 特征重要性
    print("\n[特征重要性] Top 15:")
    importance = sorted(
        zip(feature_cols, model.feature_importances_),
        key=lambda x: x[1],
        reverse=True,
    )
    for name, score in importance[:15]:
        print(f"  {name}: {score:.4f}")
    
    # 保存模型
    print("\n[保存模型]")
    
    # 保存原始 XGBoost 模型
    model.save_model(MODEL_DIR / "model_raw.json")
    
    # 先保存元数据（即使 ONNX 导出失败也要保存）
    all_metrics = {
        **cv_scores,
        "test_accuracy": test_metrics["accuracy"],
        "test_auc": test_metrics["auc"],
        "test_brier": test_metrics["brier"],
    }
    save_metadata(feature_cols, all_metrics, MODEL_DIR / "metadata.json")
    
    # 导出原始模型到 ONNX（CalibratedClassifierCV 可能不支持直接转换）
    # 注意: 对于模拟交易，可以使用原始模型；生产环境可能需要额外校准
    try:
        print("[导出] 尝试导出校准后的模型到 ONNX...")
        export_onnx(calibrated_model, len(feature_cols), MODEL_DIR / "model.onnx")
    except Exception as e:
        print(f"[警告] 校准模型导出失败: {e}")
        try:
            print("[导出] 使用原始模型导出 ONNX...")
            export_onnx(model, len(feature_cols), MODEL_DIR / "model.onnx")
        except Exception as e2:
            print(f"[警告] ONNX 导出失败: {e2}")
            print("[提示] 模型已保存为 JSON 格式，可以稍后使用 convert_to_onnx.py 转换")
    
    print("\n" + "=" * 60)
    print("训练完成!")
    print(f"测试集准确率: {test_metrics['accuracy']:.4f}")
    print(f"测试集 AUC: {test_metrics['auc']:.4f}")
    print(f"测试集 Brier: {test_metrics['brier']:.4f}")
    print("=" * 60)


if __name__ == "__main__":
    main()
