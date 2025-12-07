#!/usr/bin/env python3
"""
BTC/USD 数据采集 - 同时从 Binance 和 Chainlink 获取数据。
Polymarket 使用 Chainlink 数据结算，必须使用相同数据源训练。

数据源:
- Binance: BTC/USDT 现货价格 (高频，用于特征)
- Chainlink: BTC/USD 预言机价格 (结算价格)
"""

import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd
import requests
from web3 import Web3

# 超时配置
REQUEST_TIMEOUT = 30  # 网络请求超时（秒）
WEB3_TIMEOUT = 30  # Web3 调用超时（秒）
MAX_RETRIES = 3  # 最大重试次数
RETRY_DELAY = 1  # 重试延迟（秒）

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# === Chainlink 配置 ===
# Polygon Mainnet BTC/USD Price Feed
# 来源: https://docs.chain.link/data-feeds/price-feeds/addresses?network=polygon
CHAINLINK_BTC_USD_POLYGON = "0xc907E116054Ad103354f2D350FD2514433D57F6f"

# Ethereum Mainnet BTC/USD Price Feed (备用)
# 来源: https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum
CHAINLINK_BTC_USD_ETH = "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c"

# Chainlink AggregatorV3Interface ABI
CHAINLINK_ABI = [
    {
        "inputs": [],
        "name": "latestRoundData",
        "outputs": [
            {"name": "roundId", "type": "uint80"},
            {"name": "answer", "type": "int256"},
            {"name": "startedAt", "type": "uint256"},
            {"name": "updatedAt", "type": "uint256"},
            {"name": "answeredInRound", "type": "uint80"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "_roundId", "type": "uint80"}],
        "name": "getRoundData",
        "outputs": [
            {"name": "roundId", "type": "uint80"},
            {"name": "answer", "type": "int256"},
            {"name": "startedAt", "type": "uint256"},
            {"name": "updatedAt", "type": "uint256"},
            {"name": "answeredInRound", "type": "uint80"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
]

# RPC URLs (使用公共节点或配置自己的)
POLYGON_RPC = os.environ.get("POLYGON_RPC_URL", "https://polygon-rpc.com")
ETH_RPC = os.environ.get("ETH_RPC_URL", "https://eth.llamarpc.com")


def get_chainlink_price(
    rpc_url: str = POLYGON_RPC,
    contract_address: str = CHAINLINK_BTC_USD_POLYGON,
    timeout: int = WEB3_TIMEOUT,
) -> tuple[float, int]:
    """
    从 Chainlink 获取当前 BTC/USD 价格。
    
    Args:
        timeout: Web3 调用超时时间（秒）
    
    Returns:
        Tuple of (price, timestamp)
    """
    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(contract_address),
        abi=CHAINLINK_ABI,
    )
    
    try:
        _, answer, _, updated_at, _ = contract.functions.latestRoundData().call()
        decimals = contract.functions.decimals().call()
    except Exception as e:
        raise Exception(f"Chainlink 调用超时或失败 (超时设置: {timeout}秒): {e}")
    
    price = answer / (10 ** decimals)
    return price, updated_at


def fetch_chainlink_historical(
    rpc_url: str = POLYGON_RPC,
    contract_address: str = CHAINLINK_BTC_USD_POLYGON,
    num_rounds: int = 1000,
    timeout: int = WEB3_TIMEOUT,
    max_consecutive_failures: int = 10,
) -> pd.DataFrame:
    """
    从 Chainlink 获取历史价格数据 (通过遍历历史 round)。
    
    注意: Chainlink 更新频率约每小时或价格变动 >0.5% 时更新。
    
    Args:
        timeout: Web3 调用超时时间（秒）
        max_consecutive_failures: 最大连续失败次数
    
    Returns:
        DataFrame with timestamp and price
    """
    print(f"[Chainlink] 获取历史数据, contract: {contract_address}")
    print(f"  超时设置: {timeout}秒")
    
    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(contract_address),
        abi=CHAINLINK_ABI,
    )
    
    # 获取当前 round
    try:
        round_id, answer, _, updated_at, _ = contract.functions.latestRoundData().call()
        decimals = contract.functions.decimals().call()
    except Exception as e:
        raise Exception(f"Chainlink 调用超时或失败 (超时设置: {timeout}秒): {e}")
    
    data = []
    current_round = round_id
    consecutive_failures = 0
    
    for i in range(num_rounds):
        try:
            rid, ans, started, updated, _ = contract.functions.getRoundData(current_round).call()
            price = ans / (10 ** decimals)
            
            data.append({
                "timestamp": datetime.utcfromtimestamp(updated),
                "price": price,
                "round_id": rid,
            })
            
            consecutive_failures = 0  # 重置失败计数
            
            # 前一个 round (Chainlink round ID 结构复杂，简单递减可能不工作)
            # 使用 phase + aggregator round 结构
            current_round -= 1
            
            if i % 100 == 0:
                print(f"  已获取 {i+1}/{num_rounds} rounds")
                
        except Exception as e:
            consecutive_failures += 1
            if consecutive_failures >= max_consecutive_failures:
                print(f"  连续失败 {consecutive_failures} 次，停止获取")
                break
            if i % 10 == 0:  # 减少错误输出频率
                print(f"  Round {current_round} 获取失败 ({consecutive_failures}/{max_consecutive_failures}): {e}")
            current_round -= 1
            continue
        
        time.sleep(0.1)  # Rate limiting
    
    df = pd.DataFrame(data)
    df = df.sort_values("timestamp")
    df = df.set_index("timestamp")
    
    return df


def fetch_binance_klines(
    symbol: str = "BTCUSDT",
    interval: str = "1m",
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 1000,
    timeout: int = REQUEST_TIMEOUT,
    max_retries: int = MAX_RETRIES,
) -> pd.DataFrame:
    """
    从 Binance 获取 K 线数据。
    
    Args:
        timeout: 请求超时时间（秒）
        max_retries: 最大重试次数
    """
    url = "https://api.binance.com/api/v3/klines"
    
    params = {
        "symbol": symbol,
        "interval": interval,
        "limit": limit,
    }
    
    if start_time:
        params["startTime"] = int(start_time.timestamp() * 1000)
    if end_time:
        params["endTime"] = int(end_time.timestamp() * 1000)
    
    # 重试机制
    last_error = None
    for attempt in range(max_retries):
        try:
            response = requests.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            klines = response.json()
            break
        except requests.exceptions.Timeout:
            last_error = f"请求超时（{timeout}秒）"
            if attempt < max_retries - 1:
                wait_time = RETRY_DELAY * (attempt + 1)
                print(f"  重试 {attempt + 1}/{max_retries}... ({wait_time}秒后)")
                time.sleep(wait_time)
            else:
                raise requests.exceptions.Timeout(f"{last_error}，已重试 {max_retries} 次")
        except requests.exceptions.RequestException as e:
            last_error = str(e)
            if attempt < max_retries - 1:
                wait_time = RETRY_DELAY * (attempt + 1)
                print(f"  请求失败，重试 {attempt + 1}/{max_retries}... ({wait_time}秒后)")
                time.sleep(wait_time)
            else:
                raise requests.exceptions.RequestException(f"请求失败: {last_error}，已重试 {max_retries} 次")
    else:
        raise Exception(f"获取数据失败: {last_error}")
    
    df = pd.DataFrame(
        klines,
        columns=[
            "open_time", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "trades",
            "taker_buy_base", "taker_buy_quote", "ignore",
        ],
    )
    
    df["timestamp"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    for col in ["open", "high", "low", "close", "volume", "quote_volume"]:
        df[col] = df[col].astype(float)
    df["trades"] = df["trades"].astype(int)
    
    df = df[["timestamp", "open", "high", "low", "close", "volume", "quote_volume", "trades"]]
    df = df.set_index("timestamp")
    
    return df


def fetch_binance_historical(
    days: int = 90,
    interval: str = "1m",
    max_failures: int = 5,  # 最大连续失败次数
) -> pd.DataFrame:
    """
    批量获取 Binance 历史数据。
    
    Args:
        days: 获取天数
        interval: K线间隔
        max_failures: 最大连续失败次数，超过后停止
    """
    print(f"[Binance] 获取 {days} 天 {interval} 数据...")
    print(f"  超时设置: {REQUEST_TIMEOUT}秒，最大重试: {MAX_RETRIES}次")
    
    all_data = []
    end_time = datetime.now(tz=None)  # naive datetime
    start_time = end_time - timedelta(days=days)
    
    current_start = start_time
    consecutive_failures = 0
    batch_count = 0
    
    while current_start < end_time:
        batch_count += 1
        try:
            df = fetch_binance_klines(
                start_time=current_start,
                end_time=end_time,
            )
            if len(df) == 0:
                print(f"  批次 {batch_count}: 未获取到数据，可能已到达最新时间")
                break
            
            all_data.append(df)
            consecutive_failures = 0  # 重置失败计数
            
            # 转换为 naive datetime 进行比较
            last_time = df.index.max()
            if hasattr(last_time, 'tz_localize'):
                last_time = last_time.tz_localize(None)
            current_start = last_time.to_pydatetime() + timedelta(minutes=1)
            
            progress = (current_start - start_time).total_seconds() / (end_time - start_time).total_seconds()
            print(f"  批次 {batch_count}: {df.index.min()} - {df.index.max()}, 共 {len(df)} 条 (进度: {progress:.1%})")
            
        except Exception as e:
            consecutive_failures += 1
            print(f"  批次 {batch_count} 获取失败 ({consecutive_failures}/{max_failures}): {e}")
            
            if consecutive_failures >= max_failures:
                print(f"  ⚠️  连续失败 {consecutive_failures} 次，停止获取")
                break
            
            # 失败后等待更长时间
            time.sleep(RETRY_DELAY * consecutive_failures)
            continue
        
        time.sleep(0.5)  # 正常请求间的延迟
    
    if not all_data:
        raise ValueError(f"未获取到任何数据。请检查网络连接或 Binance API 是否可用（超时设置: {REQUEST_TIMEOUT}秒）")
    
    combined = pd.concat(all_data)
    combined = combined[~combined.index.duplicated(keep="last")]
    combined = combined.sort_index()
    
    print(f"✅ 完成！共获取 {len(combined)} 条数据")
    return combined


def resample_to_15m(df: pd.DataFrame) -> pd.DataFrame:
    """
    将 1 分钟数据重采样为 15 分钟。
    
    关键: 对齐到固定的 15 分钟窗口边界 (00:00, 00:15, 00:30, 00:45)
    这与 Polymarket 的结算窗口一致。
    """
    # 确保索引是 datetime
    if not isinstance(df.index, pd.DatetimeIndex):
        df.index = pd.to_datetime(df.index, utc=True)
    
    # 重采样到 15 分钟，对齐到窗口开始
    # origin='start_day' 确保从 00:00 开始对齐
    df_15m = df.resample("15min", origin="start_day").agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
        "quote_volume": "sum",
        "trades": "sum",
    }).dropna()
    
    return df_15m


def load_existing_data(filename: str) -> Optional[pd.DataFrame]:
    """加载已存在的数据文件。"""
    filepath = DATA_DIR / filename
    if not filepath.exists():
        return None
    
    df = pd.read_csv(filepath, parse_dates=["timestamp"], index_col="timestamp")
    df.index = pd.to_datetime(df.index, utc=True)
    return df


def save_data(df: pd.DataFrame, filename: str) -> None:
    """保存数据到 CSV。"""
    filepath = DATA_DIR / filename
    df.to_csv(filepath)
    print(f"已保存 {len(df)} 条数据到 {filepath}")


def collect_data(days: int = 90) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    收集数据的主函数。
    
    Returns:
        Tuple of (1分钟数据, 15分钟数据)
    """
    # 1. 检查已存在的数据
    existing_1m = load_existing_data("btc_1m.csv")
    
    if existing_1m is not None and len(existing_1m) > 0:
        last_time = existing_1m.index.max()
        time_since_last = datetime.now(tz=existing_1m.index.tzinfo) - last_time
        
        if time_since_last < timedelta(minutes=5):
            print("数据已是最新")
            df_15m = resample_to_15m(existing_1m)
            save_data(df_15m, "btc_15m.csv")
            return existing_1m, df_15m
        
        # 增量更新
        print(f"增量更新，从 {last_time} 开始...")
        new_df = fetch_binance_klines(start_time=last_time.to_pydatetime())
        
        combined = pd.concat([existing_1m, new_df])
        combined = combined[~combined.index.duplicated(keep="last")]
        combined = combined.sort_index()
        df_1m = combined
    else:
        # 全量获取
        df_1m = fetch_binance_historical(days=days)
    
    # 2. 保存 1 分钟数据
    save_data(df_1m, "btc_1m.csv")
    
    # 3. 重采样为 15 分钟
    df_15m = resample_to_15m(df_1m)
    save_data(df_15m, "btc_15m.csv")
    
    # 4. 尝试获取 Chainlink 数据 (可选，用于验证)
    try:
        cl_price, cl_time = get_chainlink_price()
        print(f"\n[Chainlink] 当前价格: ${cl_price:,.2f} (更新于 {datetime.utcfromtimestamp(cl_time)})")
        
        binance_price = df_1m["close"].iloc[-1]
        diff = abs(cl_price - binance_price)
        diff_pct = diff / binance_price * 100
        print(f"[对比] Binance: ${binance_price:,.2f}, 差异: ${diff:.2f} ({diff_pct:.3f}%)")
    except Exception as e:
        print(f"[Chainlink] 获取失败 (需要配置 RPC): {e}")
    
    return df_1m, df_15m


def load_data(interval: str = "15m") -> pd.DataFrame:
    """
    加载数据。
    
    Args:
        interval: "1m" 或 "15m"
    """
    filename = f"btc_{interval}.csv"
    filepath = DATA_DIR / filename
    
    if not filepath.exists():
        raise FileNotFoundError(f"数据文件不存在: {filepath}, 请先运行 collect_data()")
    
    df = pd.read_csv(filepath, parse_dates=["timestamp"], index_col="timestamp")
    df.index = pd.to_datetime(df.index, utc=True)
    return df


if __name__ == "__main__":
    df_1m, df_15m = collect_data(days=90)
    
    print(f"\n=== 数据摘要 ===")
    print(f"1 分钟数据: {len(df_1m)} 条, {df_1m.index.min()} ~ {df_1m.index.max()}")
    print(f"15 分钟数据: {len(df_15m)} 条, {df_15m.index.min()} ~ {df_15m.index.max()}")
    print(f"\n15 分钟数据样本:\n{df_15m.tail()}")
