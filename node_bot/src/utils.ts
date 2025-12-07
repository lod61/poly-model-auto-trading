/**
 * 工具函数 - 日志、Kelly 公式、时间窗口。
 */

import { LOG_LEVEL } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLogLevel = LOG_LEVELS[LOG_LEVEL as LogLevel] ?? LOG_LEVELS.info;

function timestamp(): string {
  return new Date().toISOString();
}

import { mkdirSync, appendFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 确保日志目录存在
const LOG_DIR = resolve(__dirname, "../../../logs");
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}
const LOG_FILE = resolve(LOG_DIR, "bot.log");

function writeLog(level: string, message: string, data?: unknown): void {
  const logEntry = `[${timestamp()}] [${level}] ${message}${data ? " " + JSON.stringify(data) : ""}\n`;
  
  // 同时输出到控制台和文件
  if (level === "ERROR") {
    console.error(logEntry.trim());
  } else if (level === "WARN") {
    console.warn(logEntry.trim());
  } else {
    console.log(logEntry.trim());
  }
  
  // 写入日志文件
  try {
    appendFileSync(LOG_FILE, logEntry);
  } catch (error) {
    // 如果写入失败，只输出到控制台
    console.error("日志写入失败:", error);
  }
}

/**
 * 日志工具。
 */
export const log = {
  debug: (message: string, data?: unknown) => {
    if (currentLogLevel <= LOG_LEVELS.debug) {
      writeLog("DEBUG", message, data);
    }
  },
  info: (message: string, data?: unknown) => {
    if (currentLogLevel <= LOG_LEVELS.info) {
      writeLog("INFO", message, data);
    }
  },
  warn: (message: string, data?: unknown) => {
    if (currentLogLevel <= LOG_LEVELS.warn) {
      writeLog("WARN", message, data);
    }
  },
  error: (message: string, error?: unknown) => {
    if (currentLogLevel <= LOG_LEVELS.error) {
      writeLog("ERROR", message, error);
    }
  },
};

/**
 * 等待指定毫秒。
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Kelly 公式计算最优仓位。
 * 
 * 公式: f* = (b × p - q) / b
 * 其中:
 *   p = 胜率 (模型预测的概率)
 *   q = 1 - p
 *   b = 赔率 = (1 - 市场价格) / 市场价格
 * 
 * 注意: 
 * - 返回的是资金比例 (0-1)
 * - 使用 1/4 Kelly 降低风险
 * 
 * @param probWin - 模型预测的胜率
 * @param marketPrice - 市场价格 (0-1)
 * @param kellyFraction - Kelly 系数 (默认 0.25 = 1/4 Kelly)
 * @param maxFraction - 最大仓位比例
 */
export function kellyBetSize(
  probWin: number,
  marketPrice: number,
  kellyFraction: number = 0.25,  // 1/4 Kelly
  maxFraction: number = 0.10,   // 最大 10% 仓位
): number {
  // 边界检查
  if (probWin <= 0 || probWin >= 1) return 0;
  if (marketPrice <= 0 || marketPrice >= 1) return 0;

  // 计算赔率: 赢了得到 (1 - price) / price
  const b = (1 - marketPrice) / marketPrice;
  const q = 1 - probWin;

  // Kelly 公式
  const fullKelly = (b * probWin - q) / b;

  // 只有正期望时才下注
  if (fullKelly <= 0) return 0;

  // 应用 Kelly 系数
  const adjustedKelly = fullKelly * kellyFraction;

  // 限制最大仓位
  return Math.min(adjustedKelly, maxFraction);
}

/**
 * 计算实际下注金额。
 * 
 * @param bankroll - 总资金
 * @param probWin - 胜率
 * @param marketPrice - 市场价格
 */
export function calculateBetSize(
  bankroll: number,
  probWin: number,
  marketPrice: number,
): number {
  const fraction = kellyBetSize(probWin, marketPrice);
  return bankroll * fraction;
}

/**
 * 获取当前 15 分钟窗口的开始时间 (UTC)。
 * 
 * Polymarket 窗口: 00:00, 00:15, 00:30, 00:45, ...
 */
export function get15MinWindowStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const minutes = d.getUTCMinutes();
  const windowStartMinute = Math.floor(minutes / 15) * 15;
  d.setUTCMinutes(windowStartMinute, 0, 0);
  return d;
}

/**
 * 获取下一个 15 分钟窗口的开始时间。
 */
export function getNext15MinWindowStart(date: Date = new Date()): Date {
  const currentWindow = get15MinWindowStart(date);
  return new Date(currentWindow.getTime() + 15 * 60 * 1000);
}

/**
 * 获取当前 15 分钟窗口的 ID (用于去重)。
 * 格式: YYYYMMDD_HHMM
 */
export function get15MinWindowId(date: Date = new Date()): string {
  const window = get15MinWindowStart(date);
  const year = window.getUTCFullYear();
  const month = String(window.getUTCMonth() + 1).padStart(2, "0");
  const day = String(window.getUTCDate()).padStart(2, "0");
  const hour = String(window.getUTCHours()).padStart(2, "0");
  const minute = String(window.getUTCMinutes()).padStart(2, "0");
  return `${year}${month}${day}_${hour}${minute}`;
}

/**
 * 计算距离下一个窗口开始的毫秒数。
 */
export function msUntilNextWindow(): number {
  const next = getNext15MinWindowStart();
  return next.getTime() - Date.now();
}

/**
 * 检查是否在窗口开始前的最佳下注时间。
 * 建议在窗口开始前 10-60 秒下注。
 */
export function isOptimalBettingTime(): boolean {
  const msUntil = msUntilNextWindow();
  return msUntil > 10000 && msUntil < 60000;  // 10-60 秒前
}

/**
 * 格式化 USD 金额。
 */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * 格式化百分比。
 */
export function formatPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * 带重试的异步函数执行。
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelay * 2 ** attempt;
        log.warn(`重试 ${attempt + 1}/${maxRetries}，等待 ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
