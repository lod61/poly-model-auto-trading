#!/usr/bin/env node
/**
 * 查看机器人状态和预测情况
 */

import { readFileSync, existsSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_FILE = resolve(__dirname, "../../logs/bot.log");
const DATA_FILE = resolve(__dirname, "../../data/btc_15m.csv");

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  if (minutes > 0) return `${minutes}分钟`;
  return `${seconds}秒`;
}

function getLogStats() {
  if (!existsSync(LOG_FILE)) {
    return null;
  }

  const log = readFileSync(LOG_FILE, "utf-8");
  const lines = log.split("\n").reverse().slice(0, 1000); // 最后 1000 行

  let predictions = 0;
  let upPredictions = 0;
  let downPredictions = 0;
  let orders = 0;
  let lastPrediction = null;
  let lastPrice = null;
  let errors = 0;
  let lastUpdate = null;

  for (const line of lines) {
    // 提取预测信息
    if (line.includes("预测概率") || line.includes("Prediction")) {
      predictions++;
      if (line.includes("Up") || line.includes("上涨")) {
        upPredictions++;
      }
      if (line.includes("Down") || line.includes("下跌")) {
        downPredictions++;
      }
      
      // 提取最新预测
      if (!lastPrediction) {
        const match = line.match(/概率[：:]\s*([\d.]+)%/);
        if (match) {
          lastPrediction = {
            probability: parseFloat(match[1]),
            direction: line.includes("Up") || line.includes("上涨") ? "Up" : "Down",
            time: line.match(/\[([\d-]+T[\d:]+)/)?.[1] || "未知",
          };
        }
      }
    }

    // 提取订单信息
    if (line.includes("下注") || line.includes("Order") || line.includes("订单")) {
      orders++;
    }

    // 提取价格信息
    if (line.includes("价格") || line.includes("Price") || line.includes("BTC")) {
      const priceMatch = line.match(/\$?([\d,]+\.?\d*)/);
      if (priceMatch) {
        lastPrice = priceMatch[1].replace(/,/g, "");
      }
    }

    // 统计错误
    if (line.includes("ERROR") || line.includes("错误")) {
      errors++;
    }

    // 提取最后更新时间
    const timeMatch = line.match(/\[([\d-]+T[\d:]+)/);
    if (timeMatch && !lastUpdate) {
      lastUpdate = timeMatch[1];
    }
  }

  const stats = statSync(LOG_FILE);
  const fileAge = Date.now() - stats.mtimeMs;

  return {
    predictions,
    upPredictions,
    downPredictions,
    orders,
    lastPrediction,
    lastPrice,
    errors,
    lastUpdate,
    fileAge,
    isActive: fileAge < 5 * 60 * 1000, // 5 分钟内更新认为是活跃的
  };
}

function getDataInfo() {
  if (!existsSync(DATA_FILE)) {
    return null;
  }

  const content = readFileSync(DATA_FILE, "utf-8");
  const lines = content.trim().split("\n");
  const lastLine = lines[lines.length - 1];
  const parts = lastLine.split(",");
  
  if (parts.length >= 5) {
    return {
      totalRows: lines.length - 1,
      lastTimestamp: parts[0],
      lastPrice: parseFloat(parts[4]),
    };
  }

  return {
    totalRows: lines.length - 1,
  };
}

function printStatus() {
  console.log("═".repeat(60));
  console.log("🤖 BTC 交易机器人 - 状态报告");
  console.log("═".repeat(60));
  console.log();

  // 日志状态
  const logStats = getLogStats();
  if (logStats) {
    console.log("📊 运行统计:");
    console.log(`   预测次数: ${logStats.predictions}`);
    console.log(`   - 预测上涨: ${logStats.upPredictions}`);
    console.log(`   - 预测下跌: ${logStats.downPredictions}`);
    console.log(`   下注次数: ${logStats.orders}`);
    console.log(`   错误次数: ${logStats.errors}`);
    console.log();

    if (logStats.lastPrediction) {
      console.log("📈 最新预测:");
      console.log(`   方向: ${logStats.lastPrediction.direction === "Up" ? "📈 上涨" : "📉 下跌"}`);
      console.log(`   概率: ${logStats.lastPrediction.probability.toFixed(2)}%`);
      console.log(`   时间: ${logStats.lastPrediction.time}`);
      console.log();
    }

    if (logStats.lastPrice) {
      console.log("💰 最新价格:");
      console.log(`   BTC/USDT: $${parseFloat(logStats.lastPrice).toLocaleString()}`);
      console.log();
    }

    console.log("🔄 状态:");
    const status = logStats.isActive ? "🟢 运行中" : "🔴 可能已停止";
    console.log(`   ${status}`);
    if (logStats.lastUpdate) {
      console.log(`   最后更新: ${logStats.lastUpdate}`);
      console.log(`   ${formatTime(logStats.fileAge)}前`);
    }
    console.log();
  } else {
    console.log("⚠️  日志文件不存在，机器人可能还未启动");
    console.log();
  }

  // 数据文件状态
  const dataInfo = getDataInfo();
  if (dataInfo) {
    console.log("📁 数据文件:");
    console.log(`   总行数: ${dataInfo.totalRows}`);
    if (dataInfo.lastPrice) {
      console.log(`   最新价格: $${dataInfo.lastPrice.toLocaleString()}`);
    }
    if (dataInfo.lastTimestamp) {
      console.log(`   最新时间: ${dataInfo.lastTimestamp}`);
    }
    console.log();
  }

  console.log("💡 提示:");
  console.log("   - 查看实时日志: npm run logs");
  console.log("   - 查看完整日志: tail -f ../logs/bot.log");
  console.log("   - 如果使用 PM2: pm2 logs btc-bot");
  console.log();
  console.log("═".repeat(60));
}

printStatus();

