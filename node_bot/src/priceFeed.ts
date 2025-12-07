/**
 * 价格源 - Binance WebSocket + 15 分钟 K 线聚合。
 * 
 * 关键: 聚合为与 Polymarket 对齐的 15 分钟 K 线。
 */

import WebSocket from "ws";
import { ethers } from "ethers";
import {
  BINANCE_WS_URL,
  RPC_URL,
  CHAINLINK_BTC_USD_FEED,
  PRICE_POLL_INTERVAL_MS,
} from "./config.js";
import { log, get15MinWindowStart } from "./utils.js";
import type { Candle15m } from "./model.js";

// Chainlink ABI
const AGGREGATOR_ABI = [
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)",
];

// === 状态 ===
let latestPrice: number = 0;
let lastUpdateTime: number = 0;
let candles15m: Candle15m[] = [];
let currentCandle: Partial<Candle15m> | null = null;
let ws: WebSocket | null = null;
let chainlinkProvider: ethers.JsonRpcProvider | null = null;
let chainlinkFeed: ethers.Contract | null = null;
let pollInterval: NodeJS.Timeout | null = null;

/**
 * 检查 RPC URL 是否有效。
 */
function isValidRpcUrl(url: string): boolean {
  // 跳过占位符和演示 URL
  if (!url || 
      url.includes("YOUR_API_KEY") || 
      url.includes("/demo") ||
      url.includes("/demo-key") ||
      url === "" ||
      url === "demo") {
    return false;
  }
  return true;
}

/**
 * 初始化 Chainlink。
 */
function initChainlink(): void {
  // 检查 RPC URL 是否有效
  if (!isValidRpcUrl(RPC_URL)) {
    log.warn("[PRICE] RPC_URL 未配置或无效，跳过 Chainlink（将仅使用 Binance 数据）");
    log.warn("[PRICE] 提示: 在 .env 中设置有效的 RPC_URL 以启用 Chainlink");
    return;
  }

  try {
    // 创建 provider，不自动检测网络（避免无限重试）
    // 注意：ethers v6 的 JsonRpcProvider 会自动检测网络，但我们会在失败时禁用
    chainlinkProvider = new ethers.JsonRpcProvider(RPC_URL);
    
    chainlinkFeed = new ethers.Contract(
      CHAINLINK_BTC_USD_FEED,
      AGGREGATOR_ABI,
      chainlinkProvider
    );
    log.info("[PRICE] Chainlink 已初始化");
  } catch (error) {
    log.warn("[PRICE] Chainlink 初始化失败，将仅使用 Binance 数据:", error);
    chainlinkProvider = null;
    chainlinkFeed = null;
  }
}

let chainlinkFailureCount = 0;
const MAX_CHAINLINK_FAILURES = 3; // 连续失败 3 次后禁用 Chainlink

/**
 * 从 Chainlink 获取价格。
 */
async function fetchChainlinkPrice(): Promise<number | null> {
  // 如果已禁用或不存在，直接返回
  if (!chainlinkFeed || chainlinkFailureCount >= MAX_CHAINLINK_FAILURES) {
    return null;
  }

  try {
    const feed = chainlinkFeed; // 类型收窄
    if (!feed.latestRoundData || !feed.decimals) return null;
    
    // 设置超时，避免长时间等待
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Chainlink 请求超时")), 5000);
    });
    
    const [, answer, , updatedAt] = await Promise.race([
      feed.latestRoundData(),
      timeoutPromise,
    ]);
    const decimals = await feed.decimals();
    const price = Number(answer) / 10 ** Number(decimals);

    // 成功时重置失败计数
    chainlinkFailureCount = 0;
    log.debug(`[PRICE] Chainlink: $${price.toFixed(2)}`);
    return price;
  } catch (error) {
    chainlinkFailureCount++;
    
    // 只在第一次失败时记录详细错误，后续静默处理
    if (chainlinkFailureCount === 1) {
      log.warn("[PRICE] Chainlink 获取失败，将仅使用 Binance 数据");
    }
    
    // 达到失败上限时禁用 Chainlink
    if (chainlinkFailureCount >= MAX_CHAINLINK_FAILURES) {
      log.warn(`[PRICE] Chainlink 连续失败 ${MAX_CHAINLINK_FAILURES} 次，已禁用（请检查 RPC_URL 配置）`);
      chainlinkProvider = null;
      chainlinkFeed = null;
    }
    
    return null;
  }
}

/**
 * 聚合 1 分钟数据到 15 分钟 K 线。
 */
function aggregateTo15Min(
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number
): void {
  const windowStart = get15MinWindowStart(new Date(timestamp));
  const windowTs = windowStart.getTime();

  if (!currentCandle || currentCandle.timestamp !== windowTs) {
    // 新窗口，保存旧 K 线
    if (currentCandle && currentCandle.timestamp) {
      candles15m.push(currentCandle as Candle15m);
      
      // 保留最近 100 根
      if (candles15m.length > 100) {
        candles15m.shift();
      }
      
      log.debug(`[PRICE] 新 15m K 线: ${new Date(currentCandle.timestamp).toISOString()}, close=${currentCandle.close}`);
    }

    // 开始新 K 线
    currentCandle = {
      timestamp: windowTs,
      open,
      high,
      low,
      close,
      volume,
    };
  } else {
    // 更新当前 K 线
    currentCandle.high = Math.max(currentCandle.high ?? high, high);
    currentCandle.low = Math.min(currentCandle.low ?? low, low);
    currentCandle.close = close;
    currentCandle.volume = (currentCandle.volume ?? 0) + volume;
  }
}

/**
 * 连接 Binance WebSocket (1 分钟 K 线)。
 */
function connectBinanceWS(): Promise<void> {
  return new Promise((resolve, reject) => {
    log.info("[PRICE] 连接 Binance WebSocket...");

    // 设置连接超时（10秒）
    const connectTimeout = setTimeout(() => {
      if (ws && ws.readyState !== WebSocket.OPEN) {
        ws.close();
        reject(new Error("WebSocket 连接超时（10秒）"));
      }
    }, 10000);

    ws = new WebSocket(BINANCE_WS_URL);

    ws.on("open", () => {
      clearTimeout(connectTimeout);
      log.info("[PRICE] Binance WebSocket 已连接");
      resolve();
    });

    ws.on("message", (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.e === "kline") {
          const k = msg.k;
          const price = parseFloat(k.c);

          latestPrice = price;
          lastUpdateTime = Date.now();

          // 聚合到 15 分钟
          aggregateTo15Min(
            k.t,
            parseFloat(k.o),
            parseFloat(k.h),
            parseFloat(k.l),
            parseFloat(k.c),
            parseFloat(k.v)
          );
        }
      } catch (error) {
        log.error("[PRICE] WebSocket 消息解析错误:", error);
      }
    });

    ws.on("close", () => {
      log.warn("[PRICE] WebSocket 断开，5 秒后重连...");
      setTimeout(() => connectBinanceWS(), 5000);
    });

    ws.on("error", (error) => {
      clearTimeout(connectTimeout);
      log.error("[PRICE] WebSocket 错误:", error);
      reject(error);
    });
  });
}

/**
 * 启动价格源。
 */
export async function startPriceFeed(): Promise<void> {
  log.info("[PRICE] 启动价格源...");

  initChainlink();
  
  // 尝试连接 WebSocket，失败时使用轮询作为备用
  try {
    await Promise.race([
      connectBinanceWS(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("WebSocket 连接超时")), 15000)
      )
    ]) as Promise<void>;
  } catch (error) {
    log.warn("[PRICE] WebSocket 连接失败，将使用轮询模式:", error);
    // 继续运行，使用 Chainlink 轮询作为备用
  }

  // 定期轮询 Chainlink 作为备份（仅在启用时）
  if (chainlinkFeed) {
    pollInterval = setInterval(async () => {
      await fetchChainlinkPrice();
    }, PRICE_POLL_INTERVAL_MS);
    log.info("[PRICE] Chainlink 轮询已启动");
  } else {
    log.info("[PRICE] Chainlink 未启用，仅使用 Binance 数据");
  }

  log.info("[PRICE] 价格源已启动");
}

/**
 * 停止价格源。
 */
export function stopPriceFeed(): void {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  log.info("[PRICE] 价格源已停止");
}

/**
 * 获取当前价格。
 */
export function getCurrentPrice(): number {
  return latestPrice;
}

/**
 * 获取最后更新时间。
 */
export function getLastUpdateTime(): number {
  return lastUpdateTime;
}

/**
 * 获取 15 分钟 K 线历史。
 */
export function get15MinCandles(): Candle15m[] {
  return [...candles15m];
}

/**
 * 检查价格源是否健康 (60 秒内有更新)。
 */
export function isPriceFeedHealthy(): boolean {
  return Date.now() - lastUpdateTime < 60000 && latestPrice > 0;
}

/**
 * 从 Binance REST API 获取历史 15 分钟 K 线。
 */
export async function fetchHistorical15mCandles(limit: number = 50): Promise<Candle15m[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
    
    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=${limit}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = (await response.json()) as unknown[][];

    const candles: Candle15m[] = data.map((k) => ({
      timestamp: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));

    // 初始化历史
    candles15m = candles;

    if (candles.length > 0) {
      const last = candles[candles.length - 1];
      if (last) {
        latestPrice = last.close;
        lastUpdateTime = Date.now();
      }
    }

      log.info(`[PRICE] 加载了 ${candles.length} 根历史 15m K 线`);
      return candles;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error("请求超时（30秒）");
      }
      throw err;
    }
  } catch (error) {
    log.error("[PRICE] 获取历史 K 线失败:", error);
    log.warn("[PRICE] 继续运行，将使用空的历史数据");
    return [];
  }
}
