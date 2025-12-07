/**
 * Configuration - API keys and Polymarket URLs loaded from environment.
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

// Load .env file
dotenvConfig({ path: resolve(import.meta.dirname, "../.env") });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

// === API Keys ===
export const POLYMARKET_API_KEY = requireEnv("POLYMARKET_API_KEY");
export const POLYMARKET_API_SECRET = requireEnv("POLYMARKET_API_SECRET");
export const POLYMARKET_PASSPHRASE = requireEnv("POLYMARKET_PASSPHRASE");
export const PRIVATE_KEY = requireEnv("PRIVATE_KEY");
export const WALLET_ADDRESS = requireEnv("WALLET_ADDRESS");

// === Chainlink / RPC ===
export const RPC_URL = optionalEnv(
  "RPC_URL",
  "https://polygon-mainnet.g.alchemy.com/v2/demo"
);
export const CHAINLINK_BTC_USD_FEED = optionalEnv(
  "CHAINLINK_BTC_USD_FEED",
  "0xc907E116054Ad103354f2D350FD2514433D57F6f" // Polygon mainnet BTC/USD
);

// === Polymarket API URLs ===
export const POLYMARKET_API_BASE = optionalEnv(
  "POLYMARKET_API_BASE",
  "https://clob.polymarket.com"
);
export const POLYMARKET_GAMMA_URL = optionalEnv(
  "POLYMARKET_GAMMA_URL",
  "https://gamma-api.polymarket.com"
);

// Polymarket endpoints
export const POLYMARKET_ENDPOINTS = {
  orders: `${POLYMARKET_API_BASE}/orders`,
  orderBook: `${POLYMARKET_API_BASE}/book`,
  markets: `${POLYMARKET_GAMMA_URL}/markets`,
  prices: `${POLYMARKET_API_BASE}/prices`,
  positions: `${POLYMARKET_API_BASE}/positions`,
} as const;

// === BTC Market Token IDs ===
export const BTC_MARKET_ID = optionalEnv("BTC_MARKET_ID", "");
export const BTC_UP_TOKEN_ID = optionalEnv("BTC_UP_TOKEN_ID", "");
export const BTC_DOWN_TOKEN_ID = optionalEnv("BTC_DOWN_TOKEN_ID", "");

// === Trading Config ===
export const POSITION_SIZE_USD = parseFloat(optionalEnv("POSITION_SIZE_USD", "10"));
export const MIN_CONFIDENCE_UP = parseFloat(optionalEnv("MIN_CONFIDENCE_UP", "0.55"));
export const MIN_CONFIDENCE_DOWN = parseFloat(optionalEnv("MIN_CONFIDENCE_DOWN", "0.45"));
export const MAX_KELLY_FRACTION = parseFloat(optionalEnv("MAX_KELLY_FRACTION", "0.25"));
export const BANKROLL = parseFloat(optionalEnv("BANKROLL", "1000"));

// === Model Config ===
export const MODEL_PATH = resolve(import.meta.dirname, "../../model/model.onnx");
export const METADATA_PATH = resolve(import.meta.dirname, "../../model/metadata.json");

// === Price Feed Config ===
export const BINANCE_WS_URL = optionalEnv(
  "BINANCE_WS_URL",
  "wss://stream.binance.com:9443/ws/btcusdt@kline_1m"
);
export const PRICE_POLL_INTERVAL_MS = parseInt(optionalEnv("PRICE_POLL_INTERVAL_MS", "5000"));

// === Safety Config ===
export const TRADE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
export const MAX_API_ERRORS = 3;
export const API_ERROR_RESET_MS = 60 * 60 * 1000; // 1 hour

// === Logging ===
export const LOG_LEVEL = optionalEnv("LOG_LEVEL", "info");
export const NODE_ENV = optionalEnv("NODE_ENV", "development");
export const IS_PRODUCTION = NODE_ENV === "production";

// Log loaded config (redact secrets)
console.log("[CONFIG] Loaded configuration:");
console.log(`  POLYMARKET_API_BASE: ${POLYMARKET_API_BASE}`);
console.log(`  RPC_URL: ${RPC_URL.slice(0, 40)}...`);
console.log(`  MODEL_PATH: ${MODEL_PATH}`);
console.log(`  POSITION_SIZE_USD: ${POSITION_SIZE_USD}`);
console.log(`  MIN_CONFIDENCE_UP: ${MIN_CONFIDENCE_UP}`);
console.log(`  MIN_CONFIDENCE_DOWN: ${MIN_CONFIDENCE_DOWN}`);
console.log(`  MAX_KELLY_FRACTION: ${MAX_KELLY_FRACTION}`);
console.log(`  IS_PRODUCTION: ${IS_PRODUCTION}`);
