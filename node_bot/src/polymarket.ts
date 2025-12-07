/**
 * Polymarket API client - place bets, handle errors, log everything.
 */

import crypto from "crypto";
import { ethers } from "ethers";
import {
  POLYMARKET_API_KEY,
  POLYMARKET_API_SECRET,
  POLYMARKET_PASSPHRASE,
  PRIVATE_KEY,
  POLYMARKET_ENDPOINTS,
  IS_PRODUCTION,
} from "./config.js";
import { log } from "./utils.js";

// BTC 15m prediction market (placeholder - get actual market ID from Polymarket)
let BTC_MARKET_ID = process.env["BTC_MARKET_ID"] ?? "";
let BTC_UP_TOKEN_ID = process.env["BTC_UP_TOKEN_ID"] ?? "";
let BTC_DOWN_TOKEN_ID = process.env["BTC_DOWN_TOKEN_ID"] ?? "";

// Order types
interface OrderRequest {
  tokenID: string;
  price: number;
  size: number;
  side: "BUY" | "SELL";
  feeRateBps?: number;
  nonce?: number;
  expiration?: number;
}

interface OrderResponse {
  orderID: string;
  status: string;
  transactionsHashes?: string[];
  errorMsg?: string;
}

interface MarketInfo {
  id: string;
  question: string;
  tokens: { token_id: string; outcome: string }[];
  outcomePrices: string[];
}

// Stats tracking
let totalOrders = 0;
let successfulOrders = 0;
let failedOrders = 0;
let totalVolume = 0;

/**
 * Generate HMAC signature for Polymarket API.
 */
function generateSignature(
  timestamp: string,
  method: string,
  path: string,
  body: string
): string {
  const message = timestamp + method + path + body;
  return crypto
    .createHmac("sha256", POLYMARKET_API_SECRET)
    .update(message)
    .digest("base64");
}

/**
 * Make authenticated request to Polymarket API.
 */
async function apiRequest<T>(
  method: string,
  endpoint: string,
  body?: object
): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const url = new URL(endpoint);
  const path = url.pathname;
  const bodyStr = body ? JSON.stringify(body) : "";

  const signature = generateSignature(timestamp, method, path, bodyStr);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "POLY_API_KEY": POLYMARKET_API_KEY,
    "POLY_SIGNATURE": signature,
    "POLY_TIMESTAMP": timestamp,
    "POLY_PASSPHRASE": POLYMARKET_PASSPHRASE,
  };

  log.debug(`[POLY] ${method} ${endpoint}`);

  const fetchOptions: RequestInit = {
    method,
    headers,
  };
  if (body) {
    fetchOptions.body = bodyStr;
  }

  const response = await fetch(endpoint, fetchOptions);

  const data = await response.json();

  if (!response.ok) {
    log.error(`[POLY] API error: ${response.status}`, data);
    throw new Error(`Polymarket API error: ${response.status} - ${JSON.stringify(data)}`);
  }

  return data as T;
}

/**
 * Set market IDs for BTC prediction market.
 */
export function setMarketIds(
  marketId: string,
  upTokenId: string,
  downTokenId: string
): void {
  BTC_MARKET_ID = marketId;
  BTC_UP_TOKEN_ID = upTokenId;
  BTC_DOWN_TOKEN_ID = downTokenId;
  log.info(`[POLY] Market IDs set: market=${marketId}, up=${upTokenId}, down=${downTokenId}`);
}

/**
 * Find BTC prediction market and set IDs.
 */
export async function findBTCMarket(): Promise<MarketInfo | null> {
  try {
    log.info("[POLY] Searching for BTC prediction market...");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
    
    try {
      const response = await fetch(`${POLYMARKET_ENDPOINTS.markets}?closed=false`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const markets = (await response.json()) as MarketInfo[];

    // Find BTC 15m prediction market
    const btcMarket = markets.find(
      (m) =>
        m.question.toLowerCase().includes("btc") &&
        (m.question.toLowerCase().includes("15") || m.question.toLowerCase().includes("minute"))
    );

    if (btcMarket) {
      const upToken = btcMarket.tokens.find((t) =>
        t.outcome.toLowerCase().includes("yes") || t.outcome.toLowerCase().includes("up")
      );
      const downToken = btcMarket.tokens.find((t) =>
        t.outcome.toLowerCase().includes("no") || t.outcome.toLowerCase().includes("down")
      );

      if (upToken && downToken) {
        setMarketIds(btcMarket.id, upToken.token_id, downToken.token_id);
        log.info(`[POLY] Found BTC market: ${btcMarket.question}`);
        return btcMarket;
      }
    }

      log.warn("[POLY] No suitable BTC market found");
      return null;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error("请求超时（30秒）");
      }
      throw err;
    }
  } catch (error) {
    log.error("[POLY] Error finding market:", error);
    log.warn("[POLY] 开发模式: 继续运行，市场查找失败不影响模拟交易");
    return null;
  }
}

/**
 * Get current market prices.
 */
export async function getMarketPrices(): Promise<{ upPrice: number; downPrice: number }> {
  try {
    if (!BTC_UP_TOKEN_ID || !BTC_DOWN_TOKEN_ID) {
      return { upPrice: 0.5, downPrice: 0.5 };
    }

    const response = await fetch(
      `${POLYMARKET_ENDPOINTS.prices}?token_ids=${BTC_UP_TOKEN_ID},${BTC_DOWN_TOKEN_ID}`
    );
    const data = (await response.json()) as Record<string, string>;

    return {
      upPrice: parseFloat(data[BTC_UP_TOKEN_ID] ?? "0.5"),
      downPrice: parseFloat(data[BTC_DOWN_TOKEN_ID] ?? "0.5"),
    };
  } catch (error) {
    log.error("[POLY] Error fetching prices:", error);
    return { upPrice: 0.5, downPrice: 0.5 };
  }
}

/**
 * 获取订单簿深度。
 */
interface OrderBookLevel {
  price: string;
  size: string;
}

interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export async function getOrderBook(tokenId: string): Promise<OrderBook | null> {
  try {
    const response = await fetch(
      `${POLYMARKET_ENDPOINTS.orderBook}?token_id=${tokenId}`
    );
    const data = (await response.json()) as OrderBook;
    return data;
  } catch (error) {
    log.error("[POLY] Error fetching order book:", error);
    return null;
  }
}

/**
 * 检查流动性是否充足。
 * 
 * @param tokenId - 代币 ID
 * @param sizeUsd - 下单金额 (USD)
 * @param maxSlippage - 最大滑点容忍度 (默认 1%)
 */
export async function checkLiquidity(
  tokenId: string,
  sizeUsd: number,
  maxSlippage: number = 0.01
): Promise<{ sufficient: boolean; availableSize: number; avgPrice: number }> {
  const orderBook = await getOrderBook(tokenId);
  
  if (!orderBook || !orderBook.asks || orderBook.asks.length === 0) {
    log.warn("[POLY] 无法获取订单簿或无卖单");
    return { sufficient: false, availableSize: 0, avgPrice: 0 };
  }

  // 获取最佳买价作为参考
  const bestAskPrice = parseFloat(orderBook.asks[0]?.price ?? "0.5");
  const maxAcceptablePrice = bestAskPrice * (1 + maxSlippage);

  // 计算可用流动性
  let totalSize = 0;
  let totalValue = 0;

  for (const ask of orderBook.asks) {
    const price = parseFloat(ask.price);
    const size = parseFloat(ask.size);

    if (price > maxAcceptablePrice) break;

    totalSize += size;
    totalValue += price * size;

    // 如果已经足够，停止
    if (totalValue >= sizeUsd) break;
  }

  const avgPrice = totalSize > 0 ? totalValue / totalSize : 0;
  const sufficient = totalValue >= sizeUsd;

  log.info(`[POLY] 流动性检查: 需要 $${sizeUsd.toFixed(2)}, 可用 $${totalValue.toFixed(2)}, 足够: ${sufficient}`);

  return { sufficient, availableSize: totalSize, avgPrice };
}

/**
 * Create and sign order using EIP-712.
 */
async function signOrder(order: OrderRequest): Promise<object> {
  const wallet = new ethers.Wallet(PRIVATE_KEY);

  // Polymarket uses EIP-712 typed data signing
  const domain = {
    name: "Polymarket CTF Exchange",
    version: "1",
    chainId: 137, // Polygon
  };

  const types = {
    Order: [
      { name: "tokenId", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "size", type: "uint256" },
      { name: "side", type: "uint8" },
      { name: "feeRateBps", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "expiration", type: "uint256" },
    ],
  };

  const orderData = {
    tokenId: order.tokenID,
    price: Math.floor(order.price * 1e6), // USDC decimals
    size: Math.floor(order.size * 1e6),
    side: order.side === "BUY" ? 0 : 1,
    feeRateBps: order.feeRateBps ?? 0,
    nonce: order.nonce ?? Date.now(),
    expiration: order.expiration ?? Math.floor(Date.now() / 1000) + 3600,
  };

  const signature = await wallet.signTypedData(domain, types, orderData);

  return {
    ...orderData,
    signature,
    maker: wallet.address,
  };
}

/**
 * Place a BET UP order.
 */
export async function placeBetUp(sizeUsd: number): Promise<OrderResponse | null> {
  if (!BTC_UP_TOKEN_ID) {
    log.error("[POLY] UP token ID not set");
    return null;
  }

  totalOrders++;
  log.info(`[POLY] Placing BET UP: $${sizeUsd.toFixed(2)}`);

  try {
    const { upPrice } = await getMarketPrices();
    
    // Add slippage tolerance (0.5%)
    const priceWithSlippage = Math.min(upPrice * 1.005, 0.99);
    const shares = sizeUsd / priceWithSlippage;

    log.info(`[POLY] UP price: ${upPrice.toFixed(4)}, shares: ${shares.toFixed(4)}`);

    if (!IS_PRODUCTION) {
      log.info("[POLY] DRY RUN - Would place UP bet");
      successfulOrders++;
      totalVolume += sizeUsd;
      return { orderID: `dry-run-${Date.now()}`, status: "simulated" };
    }

    const order: OrderRequest = {
      tokenID: BTC_UP_TOKEN_ID,
      price: priceWithSlippage,
      size: shares,
      side: "BUY",
    };

    const signedOrder = await signOrder(order);

    const response = await apiRequest<OrderResponse>(
      "POST",
      POLYMARKET_ENDPOINTS.orders,
      signedOrder
    );

    if (response.status === "matched" || response.status === "live") {
      successfulOrders++;
      totalVolume += sizeUsd;
      log.info(`[POLY] ✓ UP order placed: ${response.orderID}`);
    } else {
      failedOrders++;
      log.warn(`[POLY] UP order status: ${response.status}`, response);
    }

    return response;
  } catch (error) {
    failedOrders++;
    log.error("[POLY] Failed to place UP bet:", error);
    return null;
  }
}

/**
 * Place a BET DOWN order.
 */
export async function placeBetDown(sizeUsd: number): Promise<OrderResponse | null> {
  if (!BTC_DOWN_TOKEN_ID) {
    log.error("[POLY] DOWN token ID not set");
    return null;
  }

  totalOrders++;
  log.info(`[POLY] Placing BET DOWN: $${sizeUsd.toFixed(2)}`);

  try {
    const { downPrice } = await getMarketPrices();
    
    // Add slippage tolerance (0.5%)
    const priceWithSlippage = Math.min(downPrice * 1.005, 0.99);
    const shares = sizeUsd / priceWithSlippage;

    log.info(`[POLY] DOWN price: ${downPrice.toFixed(4)}, shares: ${shares.toFixed(4)}`);

    if (!IS_PRODUCTION) {
      log.info("[POLY] DRY RUN - Would place DOWN bet");
      successfulOrders++;
      totalVolume += sizeUsd;
      return { orderID: `dry-run-${Date.now()}`, status: "simulated" };
    }

    const order: OrderRequest = {
      tokenID: BTC_DOWN_TOKEN_ID,
      price: priceWithSlippage,
      size: shares,
      side: "BUY",
    };

    const signedOrder = await signOrder(order);

    const response = await apiRequest<OrderResponse>(
      "POST",
      POLYMARKET_ENDPOINTS.orders,
      signedOrder
    );

    if (response.status === "matched" || response.status === "live") {
      successfulOrders++;
      totalVolume += sizeUsd;
      log.info(`[POLY] ✓ DOWN order placed: ${response.orderID}`);
    } else {
      failedOrders++;
      log.warn(`[POLY] DOWN order status: ${response.status}`, response);
    }

    return response;
  } catch (error) {
    failedOrders++;
    log.error("[POLY] Failed to place DOWN bet:", error);
    return null;
  }
}

/**
 * Get trading statistics.
 */
export function getStats(): {
  totalOrders: number;
  successfulOrders: number;
  failedOrders: number;
  totalVolume: number;
  successRate: number;
} {
  return {
    totalOrders,
    successfulOrders,
    failedOrders,
    totalVolume,
    successRate: totalOrders > 0 ? successfulOrders / totalOrders : 0,
  };
}

/**
 * Reset statistics.
 */
export function resetStats(): void {
  totalOrders = 0;
  successfulOrders = 0;
  failedOrders = 0;
  totalVolume = 0;
}
