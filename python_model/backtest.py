#!/usr/bin/env python3
"""
Walk-forward sliding window backtesting for BTC 15m prediction strategy.
Calculates win rate, Sharpe ratio, and profit curve.
"""

from dataclasses import dataclass
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import xgboost as xgb

from collect_data import load_data
from features import build_features, get_feature_columns


@dataclass
class BacktestConfig:
    """Backtest configuration."""
    train_window: int = 60 * 24 * 30  # 30 days of 1m candles
    test_window: int = 60 * 24 * 1    # 1 day of 1m candles
    step_size: int = 60 * 24 * 1      # Step 1 day at a time
    min_confidence: float = 0.55      # Minimum prediction confidence
    position_size: float = 1.0        # Position size (1 = 100%)
    transaction_cost: float = 0.001   # 0.1% per trade


@dataclass
class BacktestResult:
    """Backtest results."""
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    total_return: float
    sharpe_ratio: float
    max_drawdown: float
    profit_curve: list[float]
    predictions: list[dict]


def train_window_model(X_train: np.ndarray, y_train: np.ndarray) -> xgb.XGBClassifier:
    """Train a model on a single window."""
    model = xgb.XGBClassifier(
        objective="binary:logistic",
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        verbosity=0,
    )
    model.fit(X_train, y_train)
    return model


def calculate_sharpe(returns: np.ndarray, periods_per_year: float = 365 * 24 * 4) -> float:
    """
    Calculate annualized Sharpe ratio.
    
    Args:
        returns: Array of returns
        periods_per_year: Number of periods per year (default: 15m candles)
    """
    if len(returns) == 0 or np.std(returns) == 0:
        return 0.0
    return np.mean(returns) / np.std(returns) * np.sqrt(periods_per_year)


def calculate_max_drawdown(equity_curve: np.ndarray) -> float:
    """Calculate maximum drawdown."""
    peak = np.maximum.accumulate(equity_curve)
    drawdown = (peak - equity_curve) / (peak + 1e-10)
    return float(np.max(drawdown))


def walk_forward_backtest(df: pd.DataFrame, config: BacktestConfig) -> BacktestResult:
    """
    Perform walk-forward sliding window backtest.
    
    For each window:
    1. Train on train_window
    2. Predict on test_window
    3. Calculate returns
    4. Slide forward by step_size
    
    Args:
        df: DataFrame with features and target
        config: Backtest configuration
    
    Returns:
        BacktestResult with metrics and profit curve
    """
    feature_cols = get_feature_columns(df)
    X = df[feature_cols].values
    y = df["target"].values
    
    n = len(X)
    predictions = []
    returns = []
    equity = 1.0
    equity_curve = [equity]

    window_start = 0
    window_num = 0

    while window_start + config.train_window + config.test_window <= n:
        train_end = window_start + config.train_window
        test_end = train_end + config.test_window

        # Split data
        X_train = X[window_start:train_end]
        y_train = y[window_start:train_end]
        X_test = X[train_end:test_end]
        y_test = y[train_end:test_end]

        # Train model
        model = train_window_model(X_train, y_train)

        # Predict
        y_pred = model.predict(X_test)
        y_proba = model.predict_proba(X_test)

        # Calculate returns for each prediction
        for i in range(len(y_test)):
            pred = y_pred[i]
            actual = y_test[i]
            confidence = y_proba[i, pred]

            # Only trade if confidence above threshold
            if confidence < config.min_confidence:
                continue

            # Calculate return
            # If predicted UP (1) and actual UP (1): profit
            # If predicted DOWN (0) and actual DOWN (0): profit
            correct = pred == actual
            
            # Simplified return: +/- position_size minus costs
            # In reality, return depends on actual price movement
            trade_return = config.position_size * (0.001 if correct else -0.001) - config.transaction_cost

            returns.append(trade_return)
            equity *= (1 + trade_return)
            equity_curve.append(equity)

            predictions.append({
                "window": window_num,
                "index": train_end + i,
                "prediction": int(pred),
                "actual": int(actual),
                "confidence": float(confidence),
                "correct": correct,
                "return": trade_return,
            })

        window_start += config.step_size
        window_num += 1

        if window_num % 10 == 0:
            print(f"Window {window_num}: Equity = {equity:.4f}")

    # Calculate metrics
    returns_array = np.array(returns)
    equity_array = np.array(equity_curve)

    winning = sum(1 for p in predictions if p["correct"])
    losing = len(predictions) - winning

    result = BacktestResult(
        total_trades=len(predictions),
        winning_trades=winning,
        losing_trades=losing,
        win_rate=winning / len(predictions) if predictions else 0,
        total_return=(equity - 1) * 100,
        sharpe_ratio=calculate_sharpe(returns_array),
        max_drawdown=calculate_max_drawdown(equity_array),
        profit_curve=equity_curve,
        predictions=predictions,
    )

    return result


def plot_results(result: BacktestResult, save_path: Path | None = None) -> None:
    """Plot backtest results."""
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    # Equity curve
    ax1 = axes[0, 0]
    ax1.plot(result.profit_curve, linewidth=1, color="blue")
    ax1.axhline(1.0, color="gray", linestyle="--", alpha=0.5)
    ax1.set_title("Equity Curve")
    ax1.set_xlabel("Trade #")
    ax1.set_ylabel("Equity")
    ax1.grid(True, alpha=0.3)

    # Cumulative returns
    ax2 = axes[0, 1]
    returns = [p["return"] for p in result.predictions]
    cumulative = np.cumsum(returns) * 100
    ax2.plot(cumulative, linewidth=1, color="green")
    ax2.axhline(0, color="red", linestyle="--", alpha=0.5)
    ax2.set_title("Cumulative Returns (%)")
    ax2.set_xlabel("Trade #")
    ax2.set_ylabel("Return (%)")
    ax2.grid(True, alpha=0.3)

    # Return distribution
    ax3 = axes[1, 0]
    ax3.hist(returns, bins=50, edgecolor="black", alpha=0.7)
    ax3.axvline(0, color="red", linestyle="--")
    ax3.set_title("Return Distribution")
    ax3.set_xlabel("Return")
    ax3.set_ylabel("Frequency")

    # Rolling win rate
    ax4 = axes[1, 1]
    correct = [1 if p["correct"] else 0 for p in result.predictions]
    window = min(100, len(correct) // 10)
    if window > 0:
        rolling_wr = pd.Series(correct).rolling(window=window).mean()
        ax4.plot(rolling_wr, linewidth=1, color="purple")
        ax4.axhline(0.5, color="red", linestyle="--", alpha=0.5)
    ax4.set_title(f"Rolling Win Rate (window={window})")
    ax4.set_xlabel("Trade #")
    ax4.set_ylabel("Win Rate")
    ax4.set_ylim(0, 1)
    ax4.grid(True, alpha=0.3)

    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150)
        print(f"Plot saved to {save_path}")
    else:
        plt.show()


def print_results(result: BacktestResult) -> None:
    """Print backtest results."""
    print("\n" + "=" * 60)
    print("BACKTEST RESULTS")
    print("=" * 60)
    print(f"\nTrade Statistics:")
    print(f"  Total Trades:   {result.total_trades}")
    print(f"  Winning Trades: {result.winning_trades}")
    print(f"  Losing Trades:  {result.losing_trades}")
    print(f"  Win Rate:       {result.win_rate:.2%}")
    print(f"\nPerformance:")
    print(f"  Total Return:   {result.total_return:.2f}%")
    print(f"  Sharpe Ratio:   {result.sharpe_ratio:.2f}")
    print(f"  Max Drawdown:   {result.max_drawdown:.2%}")
    print("=" * 60)


def main():
    """Run backtest."""
    print("=" * 60)
    print("WALK-FORWARD BACKTEST")
    print("=" * 60)

    # Load and prepare data
    print("\n[1/3] Loading data and building features...")
    raw_df = load_data()
    df = build_features(raw_df, target_horizon=15)
    print(f"Data shape: {df.shape}")

    # Resample to 15m for faster backtesting (optional)
    # df = df.iloc[::15]  # Take every 15th row
    # print(f"Resampled shape: {df.shape}")

    # Run backtest
    print("\n[2/3] Running walk-forward backtest...")
    config = BacktestConfig(
        train_window=60 * 24 * 14,  # 14 days training
        test_window=60 * 24 * 1,    # 1 day testing
        step_size=60 * 24 * 1,      # 1 day step
        min_confidence=0.55,
        transaction_cost=0.001,
    )

    result = walk_forward_backtest(df, config)

    # Print and plot
    print_results(result)

    print("\n[3/3] Plotting results...")
    output_dir = Path(__file__).parent.parent
    plot_results(result, save_path=output_dir / "backtest_results.png")

    print("\nBacktest complete!")


if __name__ == "__main__":
    main()
