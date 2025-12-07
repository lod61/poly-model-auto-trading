#!/usr/bin/env node
/**
 * BTC/USD 数据采集 - 从 Binance 获取历史数据
 * 
 * 功能：
 * - 从 Binance 获取 1 分钟 K 线数据
 * - 重采样为 15 分钟数据
 * - 保存为 CSV 文件（与 Python 版本兼容）
 * - 完整的超时和错误处理，不会卡住
 */

import axios, { AxiosError } from "axios";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置
const REQUEST_TIMEOUT = 30000; // 30秒超时
const MAX_RETRIES = 3; // 最大重试次数
const RETRY_DELAY = 1000; // 重试延迟（毫秒）
const MAX_FAILURES = 5; // 最大连续失败次数
const BATCH_DELAY = 500; // 批次间延迟（毫秒）
const BINANCE_API = "https://api.binance.com/api/v3/klines";

// 数据目录
const DATA_DIR = resolve(__dirname, "../../data");
const CSV_1M = resolve(DATA_DIR, "btc_1m.csv");
const CSV_15M = resolve(DATA_DIR, "btc_15m.csv");

// 确保数据目录存在
mkdirSync(DATA_DIR, { recursive: true });

// Binance API 返回的是数组格式，每个 K 线是一个数组：
// [open_time, open, high, low, close, volume, close_time, quote_volume, trades, taker_buy_base, taker_buy_quote, ignore]
type BinanceKline = [
  number, // open_time
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // close_time
  string, // quote_volume
  number, // trades
  string, // taker_buy_base
  string, // taker_buy_quote
  string  // ignore
];

interface Candle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quote_volume: number;
  trades: number;
}

/**
 * 从 Binance 获取 K 线数据（带超时和重试）
 */
async function fetchBinanceKlines(
  symbol: string = "BTCUSDT",
  interval: string = "1m",
  startTime?: number,
  endTime?: number,
  limit: number = 1000
): Promise<Candle[]> {
  const params: Record<string, string> = {
    symbol,
    interval,
    limit: limit.toString(),
  };

  if (startTime) {
    params.startTime = startTime.toString();
  }
  if (endTime) {
    params.endTime = endTime.toString();
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get<unknown>(BINANCE_API, {
        params,
        timeout: REQUEST_TIMEOUT,
        validateStatus: (status) => status === 200,
      });

      // 检查响应数据
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error(`API 返回格式错误: ${JSON.stringify(response.data).substring(0, 200)}`);
      }

      if (response.data.length === 0) {
        return [];
      }

      const candles: Candle[] = (response.data as BinanceKline[]).map((k) => {
        // Binance 返回的格式是数组：[open_time, open, high, low, close, volume, close_time, quote_volume, trades, ...]
        const timestamp = new Date(k[0]); // open_time 是毫秒时间戳
        if (isNaN(timestamp.getTime())) {
          throw new Error(`无效的时间戳: ${k[0]}`);
        }
        return {
          timestamp,
          open: parseFloat(k[1]),      // open
          high: parseFloat(k[2]),      // high
          low: parseFloat(k[3]),       // low
          close: parseFloat(k[4]),     // close
          volume: parseFloat(k[5]),    // volume
          quote_volume: parseFloat(k[7]), // quote_volume
          trades: k[8],                // trades
        };
      });

      return candles;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.code === "ECONNABORTED" || axiosError.message.includes("timeout")) {
          lastError = new Error(`请求超时（${REQUEST_TIMEOUT}ms）`);
        } else {
          lastError = new Error(`请求失败: ${axiosError.message}`);
        }
      } else {
        lastError = error as Error;
      }

      if (attempt < MAX_RETRIES - 1) {
        const waitTime = RETRY_DELAY * (attempt + 1);
        console.log(`  重试 ${attempt + 1}/${MAX_RETRIES}... (${waitTime}ms后)`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        throw new Error(`${lastError.message}，已重试 ${MAX_RETRIES} 次`);
      }
    }
  }

  throw new Error(`获取数据失败: ${lastError?.message ?? "未知错误"}`);
}

/**
 * 批量获取历史数据
 */
async function fetchBinanceHistorical(
  days: number = 90,
  interval: string = "1m"
): Promise<Candle[]> {
  console.log(`[Binance] 获取 ${days} 天 ${interval} 数据...`);
  console.log(`  超时设置: ${REQUEST_TIMEOUT}ms，最大重试: ${MAX_RETRIES}次`);

  const allData: Candle[] = [];
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

  let currentStart = startTime;
  let consecutiveFailures = 0;
  let batchCount = 0;

  while (currentStart < endTime) {
    batchCount++;
    try {
      const candles = await fetchBinanceKlines(
        "BTCUSDT",
        interval,
        currentStart.getTime(),
        endTime.getTime()
      );

      if (candles.length === 0) {
        console.log(`  批次 ${batchCount}: 未获取到数据，可能已到达最新时间`);
        break;
      }

      allData.push(...candles);
      consecutiveFailures = 0; // 重置失败计数

      // 更新起始时间为最后一根 K 线的下一个分钟
      const lastCandle = candles[candles.length - 1];
      if (lastCandle) {
        currentStart = new Date(lastCandle.timestamp.getTime() + 60 * 1000);
      } else {
        break;
      }

      const progress =
        ((currentStart.getTime() - startTime.getTime()) /
          (endTime.getTime() - startTime.getTime())) *
        100;
      const firstTime = candles[0]?.timestamp.toISOString() ?? "";
      const lastTime = lastCandle?.timestamp.toISOString() ?? "";
      console.log(
        `  批次 ${batchCount}: ${firstTime} - ${lastTime}, 共 ${candles.length} 条 (进度: ${progress.toFixed(1)}%)`
      );
    } catch (error) {
      consecutiveFailures++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(
        `  批次 ${batchCount} 获取失败 (${consecutiveFailures}/${MAX_FAILURES}): ${errorMsg}`
      );

      if (consecutiveFailures >= MAX_FAILURES) {
        console.log(`  ⚠️  连续失败 ${consecutiveFailures} 次，停止获取`);
        break;
      }

      // 失败后等待更长时间
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY * consecutiveFailures)
      );
      continue;
    }

    // 正常请求间的延迟
    await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
  }

  if (allData.length === 0) {
    throw new Error(
      `未获取到任何数据。请检查网络连接或 Binance API 是否可用（超时设置: ${REQUEST_TIMEOUT}ms）`
    );
  }

  // 去重并排序
  const uniqueMap = new Map<number, Candle>();
  for (const candle of allData) {
    const key = candle.timestamp.getTime();
    if (!uniqueMap.has(key) || uniqueMap.get(key)!.timestamp < candle.timestamp) {
      uniqueMap.set(key, candle);
    }
  }

  const sorted = Array.from(uniqueMap.values()).sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  console.log(`✅ 完成！共获取 ${sorted.length} 条数据`);
  return sorted;
}

/**
 * 将 1 分钟数据重采样为 15 分钟数据
 */
function resampleTo15m(candles: Candle[]): Candle[] {
  if (candles.length === 0) {
    return [];
  }

  // 按 15 分钟窗口分组
  const windows = new Map<string, Candle[]>();

  for (const candle of candles) {
    // 对齐到 15 分钟窗口开始（00:00, 00:15, 00:30, 00:45）
    const timestamp = candle.timestamp;
    const minutes = timestamp.getUTCMinutes();
    const alignedMinutes = Math.floor(minutes / 15) * 15;
    const windowStart = new Date(timestamp);
    windowStart.setUTCMinutes(alignedMinutes, 0, 0);

    const key = windowStart.toISOString();
    if (!windows.has(key)) {
      windows.set(key, []);
    }
    windows.get(key)!.push(candle);
  }

  // 聚合每个窗口
  const result: Candle[] = [];

  for (const [windowStartStr, windowCandles] of windows.entries()) {
    if (windowCandles.length === 0) continue;

    const sorted = windowCandles.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const open = sorted[0]!.open;
    const close = sorted[sorted.length - 1]!.close;
    const high = Math.max(...sorted.map((c) => c.high));
    const low = Math.min(...sorted.map((c) => c.low));
    const volume = sorted.reduce((sum, c) => sum + c.volume, 0);
    const quoteVolume = sorted.reduce((sum, c) => sum + c.quote_volume, 0);
    const trades = sorted.reduce((sum, c) => sum + c.trades, 0);

    result.push({
      timestamp: new Date(windowStartStr),
      open,
      high,
      low,
      close,
      volume,
      quote_volume: quoteVolume,
      trades,
    });
  }

  return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * 保存数据为 CSV（与 Python 版本兼容）
 */
function saveData(candles: Candle[], filepath: string): void {
  if (candles.length === 0) {
    throw new Error("没有数据可保存");
  }

  // CSV 头部
  const headers = [
    "timestamp",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "quote_volume",
    "trades",
  ];

  // 生成 CSV 内容
  const lines: string[] = [headers.join(",")];

  for (const candle of candles) {
    const row = [
      candle.timestamp.toISOString(),
      candle.open.toString(),
      candle.high.toString(),
      candle.low.toString(),
      candle.close.toString(),
      candle.volume.toString(),
      candle.quote_volume.toString(),
      candle.trades.toString(),
    ];
    lines.push(row.join(","));
  }

  writeFileSync(filepath, lines.join("\n"), "utf-8");
  console.log(`已保存 ${candles.length} 条数据到 ${filepath}`);
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const days = process.argv[2] ? parseInt(process.argv[2], 10) : 7;

  if (isNaN(days) || days < 1) {
    console.error("错误: days 参数必须是正整数");
    process.exit(1);
  }

  try {
    console.log("=".repeat(60));
    console.log("BTC 数据采集");
    console.log("=".repeat(60));

    // 1. 获取 1 分钟数据
    console.log("\n[1/3] 获取 1 分钟数据...");
    const df1m = await fetchBinanceHistorical(days, "1m");
    saveData(df1m, CSV_1M);

    // 2. 重采样为 15 分钟
    console.log("\n[2/3] 重采样为 15 分钟...");
    const df15m = resampleTo15m(df1m);
    saveData(df15m, CSV_15M);

    // 3. 输出摘要
    console.log("\n[3/3] 数据摘要:");
    console.log(`1 分钟数据: ${df1m.length} 条`);
    if (df1m.length > 0) {
      console.log(
        `  时间范围: ${df1m[0]!.timestamp.toISOString()} ~ ${
          df1m[df1m.length - 1]!.timestamp.toISOString()
        }`
      );
    }
    console.log(`15 分钟数据: ${df15m.length} 条`);
    if (df15m.length > 0) {
      console.log(
        `  时间范围: ${df15m[0]!.timestamp.toISOString()} ~ ${
          df15m[df15m.length - 1]!.timestamp.toISOString()
        }`
      );
    }

    console.log("\n✅ 完成!");
  } catch (error) {
    console.error("\n❌ 错误:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// 如果直接运行此脚本（通过 tsx 或 node）
// 使用更简单可靠的方法：检查是否直接运行
if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '') || 
    process.argv[1]?.includes('collectData')) {
  main().catch((err) => {
    console.error('执行失败:', err);
    process.exit(1);
  });
}

// 导出函数供其他模块使用
export { fetchBinanceHistorical, resampleTo15m, saveData, fetchBinanceKlines };
export type { Candle };

