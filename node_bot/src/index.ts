/**
 * 主交易机器人 - Polymarket BTC 15 分钟涨跌预测。
 * 
 * 核心逻辑:
 * 1. 对齐到 15 分钟窗口边界
 * 2. 在窗口开始前 10-60 秒下注
 * 3. 使用 1/4 Kelly 仓位管理
 * 
 * 安全措施:
 * - 同一窗口不重复下注
 * - API 错误计数熔断
 * - 波动率过滤
 */

import {
  startPriceFeed,
  stopPriceFeed,
  get15MinCandles,
  getCurrentPrice,
  isPriceFeedHealthy,
  fetchHistorical15mCandles,
} from "./priceFeed.js";
import { loadModel, isModelLoaded, predict } from "./model.js";
import {
  placeBetUp,
  placeBetDown,
  getMarketPrices,
  findBTCMarket,
  getStats as getPolyStats,
  checkLiquidity,
} from "./polymarket.js";
import {
  MIN_CONFIDENCE_UP,
  MIN_CONFIDENCE_DOWN,
  BANKROLL,
  MAX_API_ERRORS,
  IS_PRODUCTION,
  BTC_UP_TOKEN_ID,
  BTC_DOWN_TOKEN_ID,
} from "./config.js";
import {
  log,
  sleep,
  calculateBetSize,
  formatUsd,
  formatPct,
  get15MinWindowId,
  msUntilNextWindow,
  isOptimalBettingTime,
  getNext15MinWindowStart,
  formatETTime,
} from "./utils.js";

// === 状态 ===
let isRunning = false;
let lastTradedWindowId = "";
let apiErrorCount = 0;
let totalPredictions = 0;
let upBets = 0;
let downBets = 0;
let skippedBets = 0;

/**
 * 检查是否可以交易。
 */
function canTrade(): { allowed: boolean; reason?: string } {
  // API 错误阈值
  if (apiErrorCount >= MAX_API_ERRORS) {
    return { allowed: false, reason: "API 错误过多，已停止" };
  }

  // 同一窗口不重复
  const currentWindowId = get15MinWindowId();
  if (currentWindowId === lastTradedWindowId) {
    return { allowed: false, reason: `窗口 ${currentWindowId} 已交易` };
  }

  // 价格源健康
  if (!isPriceFeedHealthy()) {
    return { allowed: false, reason: "价格源异常" };
  }

  return { allowed: true };
}

/**
 * 记录成功交易。
 */
function recordTrade(): void {
  lastTradedWindowId = get15MinWindowId();
}

/**
 * 记录 API 错误。
 */
function recordApiError(): void {
  apiErrorCount++;
  log.warn(`[MAIN] API 错误计数: ${apiErrorCount}/${MAX_API_ERRORS}`);
}

/**
 * 主交易逻辑 - 在窗口开始前执行。
 */
async function executeTrade(): Promise<void> {
  totalPredictions++;

  // 1. 检查是否可以交易
  const tradeCheck = canTrade();
  if (!tradeCheck.allowed) {
    log.info(`[MAIN] 跳过: ${tradeCheck.reason}`);
    skippedBets++;
    return;
  }

  // 2. 获取 15 分钟 K 线数据
  const candles = get15MinCandles();
  const currentPrice = getCurrentPrice();

  if (candles.length < 20) {
    log.warn(`[MAIN] K 线不足: ${candles.length}/20`);
    skippedBets++;
    return;
  }

  const nextWindow = getNext15MinWindowStart();
  const currentWindow = get15MinWindowStart();
  
  log.info(`[MAIN] ═══════════════════════════════════════`);
  log.info(`[MAIN] 预测 #${totalPredictions}`);
  log.info(`[MAIN] 当前窗口: ${formatETTime(currentWindow)} (${currentWindow.toISOString()} UTC)`);
  log.info(`[MAIN] 目标窗口: ${formatETTime(nextWindow)} (${nextWindow.toISOString()} UTC)`);
  log.info(`[MAIN] 当前价格: ${formatUsd(currentPrice)}`);

  // 3. 运行模型
  let probUp: number;
  try {
    probUp = await predict(candles);
  } catch (error) {
    log.error("[MAIN] 预测失败:", error);
    skippedBets++;
    return;
  }

  const probDown = 1 - probUp;
  log.info(`[MAIN] 📊 预测结果: Up=${formatPct(probUp)} | Down=${formatPct(probDown)}`);
  
  // 记录预测详情（用于状态查看）
  const predictionInfo = {
    prediction: totalPredictions,
    timestamp: new Date().toISOString(),
    probUp: probUp,
    probDown: probDown,
    currentPrice: currentPrice,
    direction: probUp > 0.5 ? "Up" : "Down",
    confidence: probUp > 0.5 ? probUp : probDown,
  };
  log.info(`[PREDICTION] ${JSON.stringify(predictionInfo)}`);

  // 4. 获取市场价格
  const { upPrice, downPrice } = await getMarketPrices();
  log.info(`[MAIN] 市场价格: Up=${upPrice.toFixed(4)} | Down=${downPrice.toFixed(4)}`);

  // 5. 计算期望值
  // Edge = 模型概率 - 市场价格
  const upEdge = probUp - upPrice;
  const downEdge = probDown - downPrice;
  log.info(`[MAIN] 边际优势: Up=${formatPct(upEdge)} | Down=${formatPct(downEdge)}`);

  // 6. 波动率过滤
  const lastCandle = candles[candles.length - 1];
  if (lastCandle) {
    const candleRange = (lastCandle.high - lastCandle.low) / lastCandle.close;
    if (candleRange < 0.001) {
      // 波动率低于 0.1%，跳过
      log.info(`[MAIN] → 不交易 | 波动率过低: ${formatPct(candleRange)}`);
      skippedBets++;
      return;
    }
  }

  // 7. 决策
  if (probUp > MIN_CONFIDENCE_UP && upEdge > 0.02) {
    // 下注 Up
    upBets++;
    const betSize = calculateBetSize(BANKROLL, probUp, upPrice);

    if (betSize < 1) {
      log.info(`[MAIN] Kelly 仓位过小: ${formatUsd(betSize)}`);
      return;
    }

    // 流动性检查 (如果配置了 token ID)
    const liquidity = await checkLiquidity(BTC_UP_TOKEN_ID, betSize);
    if (!liquidity.sufficient) {
      log.warn(`[MAIN] 流动性不足，跳过`);
      skippedBets++;
      return;
    }

    log.info(`[MAIN] 💰 下注 UP | 金额: ${formatUsd(betSize)}`);
    log.info(`[ORDER] ${JSON.stringify({ type: "UP", amount: betSize, prob: probUp, price: currentPrice })}`);

    try {
      const result = await placeBetUp(betSize);
      if (result) {
        recordTrade();
        log.info(`[MAIN] ✅ UP 下注成功`);
        log.info(`[ORDER_SUCCESS] ${JSON.stringify({ type: "UP", amount: betSize, result })}`);
      } else {
        recordApiError();
        log.info(`[ORDER_FAILED] ${JSON.stringify({ type: "UP", amount: betSize })}`);
      }
    } catch (error) {
      log.error("[MAIN] UP 下注失败:", error);
      recordApiError();
      log.info(`[ORDER_ERROR] ${JSON.stringify({ type: "UP", amount: betSize, error: String(error) })}`);
    }
  } else if (probUp < MIN_CONFIDENCE_DOWN && downEdge > 0.02) {
    // 下注 Down
    downBets++;
    const betSize = calculateBetSize(BANKROLL, probDown, downPrice);

    if (betSize < 1) {
      log.info(`[MAIN] Kelly 仓位过小: ${formatUsd(betSize)}`);
      return;
    }

    // 流动性检查 (如果配置了 token ID)
    const liquidity = await checkLiquidity(BTC_DOWN_TOKEN_ID, betSize);
    if (!liquidity.sufficient) {
      log.warn(`[MAIN] 流动性不足，跳过`);
      skippedBets++;
      return;
    }

    log.info(`[MAIN] 💰 下注 DOWN | 金额: ${formatUsd(betSize)}`);
    log.info(`[ORDER] ${JSON.stringify({ type: "DOWN", amount: betSize, prob: probDown, price: currentPrice })}`);

    try {
      const result = await placeBetDown(betSize);
      if (result) {
        recordTrade();
        log.info(`[MAIN] ✅ DOWN 下注成功`);
        log.info(`[ORDER_SUCCESS] ${JSON.stringify({ type: "DOWN", amount: betSize, result })}`);
      } else {
        recordApiError();
        log.info(`[ORDER_FAILED] ${JSON.stringify({ type: "DOWN", amount: betSize })}`);
      }
    } catch (error) {
      log.error("[MAIN] DOWN 下注失败:", error);
      recordApiError();
      log.info(`[ORDER_ERROR] ${JSON.stringify({ type: "DOWN", amount: betSize, error: String(error) })}`);
    }
  } else {
    // 不交易
    skippedBets++;
    log.info(`[MAIN] ⏭️  不交易 | 置信度或边际不足`);
    log.info(`[SKIP] ${JSON.stringify({ reason: "confidence_or_edge_insufficient", probUp, probDown, upEdge, downEdge })}`);
  }
}

/**
 * 打印统计信息。
 */
function logStats(): void {
  const polyStats = getPolyStats();

  log.info(`[STATS] ═══════════════════════════════════════`);
  log.info(`[STATS] 总预测: ${totalPredictions} (Up: ${upBets}, Down: ${downBets}, 跳过: ${skippedBets})`);
  log.info(`[STATS] 订单: ${polyStats.totalOrders} (成功: ${polyStats.successfulOrders}, 失败: ${polyStats.failedOrders})`);
  log.info(`[STATS] 总金额: ${formatUsd(polyStats.totalVolume)}`);
  log.info(`[STATS] API 错误: ${apiErrorCount}/${MAX_API_ERRORS}`);
  log.info(`[STATS] ═══════════════════════════════════════`);
}

/**
 * 初始化。
 */
async function initialize(): Promise<void> {
  log.info("[MAIN] ═══════════════════════════════════════");
  log.info("[MAIN] BTC 15 分钟预测机器人");
  log.info("[MAIN] ═══════════════════════════════════════");
  log.info(`[MAIN] 模式: ${IS_PRODUCTION ? "🔴 生产环境" : "🟢 开发环境 (模拟)"}`);
  log.info(`[MAIN] 资金: ${formatUsd(BANKROLL)}`);
  log.info(`[MAIN] 置信度阈值: Up>${formatPct(MIN_CONFIDENCE_UP)} | Down<${formatPct(MIN_CONFIDENCE_DOWN)}`);
  log.info("[MAIN] ═══════════════════════════════════════");

  // 1. 加载模型
  log.info("[MAIN] 加载 ONNX 模型...");
  await loadModel();

  if (!isModelLoaded()) {
    throw new Error("模型加载失败");
  }

  // 2. 获取历史 K 线
  log.info("[MAIN] 获取历史 15 分钟 K 线...");
  await fetchHistorical15mCandles(50);

  // 3. 启动价格源
  log.info("[MAIN] 启动价格源...");
  await startPriceFeed();

  // 4. 查找 BTC 市场
  log.info("[MAIN] 查找 Polymarket BTC 市场...");
  await findBTCMarket();

  log.info("[MAIN] 初始化完成 ✓");
}

/**
 * 主循环 - 对齐到 15 分钟窗口。
 */
async function mainLoop(): Promise<void> {
  log.info("[MAIN] 启动主循环...");

  while (isRunning) {
    try {
      // 检查是否在最佳下注时间 (窗口前 10-60 秒)
      if (isOptimalBettingTime()) {
        const nextWindow = getNext15MinWindowStart();
        const msUntil = msUntilNextWindow();
        log.info(`[MAIN] ═══════════════════════════════════════`);
        log.info(`[MAIN] 🎯 进入最佳下注时间`);
        log.info(`[MAIN] 目标窗口: ${formatETTime(nextWindow)} (${nextWindow.toISOString()} UTC)`);
        log.info(`[MAIN] 距离窗口开始: ${Math.round(msUntil / 1000)} 秒`);
        log.info(`[MAIN] ═══════════════════════════════════════`);
        await executeTrade();
        
        // 等待到窗口开始后再继续
        const waitTime = msUntilNextWindow() + 5000;  // 窗口开始后 5 秒
        log.info(`[MAIN] 等待 ${Math.round(waitTime / 1000)} 秒到下一个周期`);
        await sleep(waitTime);
      }

      // 每 10 秒检查一次
      await sleep(10000);

      // 定期打印统计 (每 15 分钟)
      if (totalPredictions > 0 && totalPredictions % 4 === 0) {
        logStats();
      }

      // 检查是否应该停止
      if (apiErrorCount >= MAX_API_ERRORS) {
        log.error("[MAIN] 🛑 API 错误过多，停止运行");
        break;
      }
    } catch (error) {
      log.error("[MAIN] 循环错误:", error);
      await sleep(60000);  // 出错后等待 1 分钟
    }
  }

  log.info("[MAIN] 主循环结束");
}

/**
 * 优雅关闭。
 */
async function shutdown(): Promise<void> {
  log.info("[MAIN] 正在关闭...");
  isRunning = false;
  stopPriceFeed();
  logStats();
  log.info("[MAIN] 关闭完成");
}

/**
 * 入口点。
 */
async function main(): Promise<void> {
  // 信号处理
  process.on("SIGINT", async () => {
    await shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await shutdown();
    process.exit(0);
  });

  try {
    await initialize();
    isRunning = true;
    await mainLoop();
  } catch (error) {
    log.error("[MAIN] 致命错误:", error);
    await shutdown();
    process.exit(1);
  }
}

main();
