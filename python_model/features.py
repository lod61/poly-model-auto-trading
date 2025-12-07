#!/usr/bin/env python3
"""
特征工程 - BTC 15 分钟涨跌预测。

关键修正:
1. 目标变量: close >= open (不是 >，因为 Polymarket 规则是 >=)
2. 使用 15 分钟 K 线，对齐到固定窗口
3. 精简特征，只保留对短期预测有效的指标
"""

import numpy as np
import pandas as pd


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """计算 RSI 指标。"""
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    
    avg_gain = gain.ewm(span=period, adjust=False).mean()
    avg_loss = loss.ewm(span=period, adjust=False).mean()
    
    rs = avg_gain / (avg_loss + 1e-10)
    return 100 - (100 / (1 + rs))


def ema(series: pd.Series, period: int) -> pd.Series:
    """计算 EMA。"""
    return series.ewm(span=period, adjust=False).mean()


def sma(series: pd.Series, period: int) -> pd.Series:
    """计算 SMA。"""
    return series.rolling(window=period).mean()


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    """计算 MACD。"""
    ema_fast = ema(series, fast)
    ema_slow = ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def bollinger_bands(series: pd.Series, period: int = 20, std_dev: float = 2.0):
    """计算布林带。"""
    middle = sma(series, period)
    std = series.rolling(window=period).std()
    upper = middle + std_dev * std
    lower = middle - std_dev * std
    return upper, middle, lower


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """计算 ATR。"""
    prev_close = close.shift(1)
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(window=period).mean()


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    构建 ML 特征。
    
    输入: 15 分钟 OHLCV 数据
    输出: 特征 + 目标变量
    
    目标变量定义 (严格按照 Polymarket 规则):
    - target = 1 if 下一根 K 线的 close >= open (涨或平)
    - target = 0 if 下一根 K 线的 close < open (跌)
    """
    df = df.copy()
    close = df["close"]
    high = df["high"]
    low = df["low"]
    open_ = df["open"]
    volume = df["volume"]
    
    # === 核心特征 (精简版，针对 15 分钟预测) ===
    
    # 1. 价格收益率 (短期)
    df["return_1"] = close.pct_change(1)   # 15 分钟收益
    df["return_2"] = close.pct_change(2)   # 30 分钟收益
    df["return_4"] = close.pct_change(4)   # 1 小时收益
    df["return_8"] = close.pct_change(8)   # 2 小时收益
    
    # 2. 当前 K 线特征
    df["candle_body"] = (close - open_) / (high - low + 1e-10)  # K 线实体占比
    df["candle_upper"] = (high - close.combine(open_, max)) / (high - low + 1e-10)  # 上影线
    df["candle_lower"] = (close.combine(open_, min) - low) / (high - low + 1e-10)  # 下影线
    df["is_bullish"] = (close >= open_).astype(int)  # 阳线
    
    # 3. RSI (短周期)
    df["rsi_7"] = rsi(close, 7)
    df["rsi_14"] = rsi(close, 14)
    
    # 4. MACD
    macd_line, macd_signal, macd_hist = macd(close)
    df["macd"] = macd_line
    df["macd_signal"] = macd_signal
    df["macd_hist"] = macd_hist
    
    # 5. 布林带
    bb_upper, bb_middle, bb_lower = bollinger_bands(close, period=20)
    df["bb_position"] = (close - bb_lower) / (bb_upper - bb_lower + 1e-10)  # 价格在布林带中的位置
    df["bb_width"] = (bb_upper - bb_lower) / bb_middle  # 布林带宽度
    
    # 6. 波动率
    df["volatility_4"] = close.rolling(4).std() / close  # 1 小时波动率
    df["volatility_8"] = close.rolling(8).std() / close  # 2 小时波动率
    df["atr_7"] = atr(high, low, close, 7) / close  # ATR 比率
    
    # 7. 成交量
    df["volume_ratio"] = volume / volume.rolling(8).mean()  # 成交量比率
    df["volume_change"] = volume.pct_change()  # 成交量变化
    
    # 8. 动量
    df["momentum_4"] = close - close.shift(4)  # 1 小时动量
    df["roc_4"] = (close - close.shift(4)) / close.shift(4)  # 1 小时 ROC
    
    # 9. 均线
    df["ema_4"] = ema(close, 4)
    df["ema_8"] = ema(close, 8)
    df["close_ema_4_ratio"] = close / df["ema_4"]  # 价格/EMA 比率
    df["close_ema_8_ratio"] = close / df["ema_8"]
    df["ema_cross"] = (df["ema_4"] > df["ema_8"]).astype(int)  # 均线交叉
    
    # 10. 统计特征
    df["zscore_8"] = (close - close.rolling(8).mean()) / (close.rolling(8).std() + 1e-10)
    
    # 11. 时间特征 (循环编码)
    if isinstance(df.index, pd.DatetimeIndex):
        hour = df.index.hour
        minute = df.index.minute
        # 小时循环编码
        df["hour_sin"] = np.sin(2 * np.pi * hour / 24)
        df["hour_cos"] = np.cos(2 * np.pi * hour / 24)
        # 15 分钟在小时内的位置 (0, 15, 30, 45)
        df["quarter_sin"] = np.sin(2 * np.pi * minute / 60)
        df["quarter_cos"] = np.cos(2 * np.pi * minute / 60)
    
    # === 目标变量 ===
    # Polymarket 规则: 结束价格 >= 开始价格 → Up
    # 预测下一根 K 线: next_close >= next_open → 1
    next_open = open_.shift(-1)
    next_close = close.shift(-1)
    
    # 关键: 使用 >= (不是 >)
    df["target"] = (next_close >= next_open).astype(int)
    
    # === 清理 ===
    # 移除原始 OHLCV 列
    feature_cols = [c for c in df.columns if c not in ["open", "high", "low", "close", "volume", "quote_volume", "trades"]]
    df = df[feature_cols]
    
    # 删除 NaN
    df = df.dropna()
    
    return df


def get_feature_columns(df: pd.DataFrame) -> list[str]:
    """获取特征列名 (不含 target)。"""
    return [c for c in df.columns if c != "target"]


def prepare_training_data(
    df: pd.DataFrame,
    test_size: float = 0.2,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    """
    准备训练数据，时序分割。
    
    Args:
        df: 原始 15 分钟 OHLCV 数据
        test_size: 测试集比例
    
    Returns:
        X_train, X_test, y_train, y_test
    """
    features_df = build_features(df)
    
    feature_cols = get_feature_columns(features_df)
    X = features_df[feature_cols]
    y = features_df["target"]
    
    # 时序分割 (不能 shuffle)
    split_idx = int(len(X) * (1 - test_size))
    
    X_train = X.iloc[:split_idx]
    X_test = X.iloc[split_idx:]
    y_train = y.iloc[:split_idx]
    y_test = y.iloc[split_idx:]
    
    print(f"训练集: {len(X_train)} 条")
    print(f"测试集: {len(X_test)} 条")
    print(f"训练集目标分布:\n{y_train.value_counts()}")
    print(f"测试集目标分布:\n{y_test.value_counts()}")
    
    # 检查类别平衡
    train_ratio = y_train.mean()
    print(f"\n训练集 Up 比例: {train_ratio:.2%}")
    print(f"注: >= 边界使 Up 略多于 50%，这是正常的")
    
    return X_train, X_test, y_train, y_test


if __name__ == "__main__":
    from collect_data import load_data
    
    # 使用 15 分钟数据
    df = load_data(interval="15m")
    print(f"原始数据: {len(df)} 条")
    
    features_df = build_features(df)
    print(f"\n特征数据: {len(features_df)} 条")
    print(f"特征数量: {len(get_feature_columns(features_df))}")
    print(f"\n特征列表:\n{get_feature_columns(features_df)}")
    print(f"\n目标分布:\n{features_df['target'].value_counts()}")
    print(f"\n样本:\n{features_df.head()}")
