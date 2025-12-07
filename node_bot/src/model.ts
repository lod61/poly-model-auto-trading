/**
 * ONNX 模型推理 - 与 Python features.py 完全对齐。
 * 
 * 关键: 特征必须与训练时完全一致!
 */

import * as ort from "onnxruntime-node";
import { readFileSync, existsSync } from "fs";
import { MODEL_PATH, METADATA_PATH } from "./config.js";
import { log } from "./utils.js";

// 15 分钟 OHLCV 数据
export interface Candle15m {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ModelMetadata {
  feature_names: string[];
  n_features: number;
}

let session: ort.InferenceSession | null = null;
let metadata: ModelMetadata | null = null;

/**
 * 加载 ONNX 模型和元数据。
 */
export async function loadModel(): Promise<void> {
  if (!existsSync(MODEL_PATH)) {
    throw new Error(`模型文件不存在: ${MODEL_PATH}`);
  }

  log.info(`[MODEL] 加载模型: ${MODEL_PATH}`);
  session = await ort.InferenceSession.create(MODEL_PATH);

  if (existsSync(METADATA_PATH)) {
    const raw = readFileSync(METADATA_PATH, "utf-8");
    metadata = JSON.parse(raw) as ModelMetadata;
    log.info(`[MODEL] 特征数量: ${metadata.n_features}`);
    log.info(`[MODEL] 特征列表: ${metadata.feature_names.join(", ")}`);
  }

  log.info("[MODEL] 模型加载成功");
}

export function isModelLoaded(): boolean {
  return session !== null;
}

// === 特征计算辅助函数 ===

function rsi(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const change = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (change > 0) gains += change;
    else losses -= change;
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let result = values[0] ?? 0;
  for (let i = 1; i < values.length; i++) {
    result = (values[i] ?? 0) * k + result * (1 - k);
  }
  return result;
}

function sma(values: number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function atr(candles: Candle15m[], period: number): number {
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    if (!curr || !prev) continue;
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trs.push(tr);
  }
  return sma(trs, period);
}

/**
 * 准备特征 - 必须与 Python features.py build_features() 完全一致!
 * 
 * 特征列表 (按顺序):
 * 1. return_1, return_2, return_4, return_8
 * 2. candle_body, candle_upper, candle_lower, is_bullish
 * 3. rsi_7, rsi_14
 * 4. macd, macd_signal, macd_hist
 * 5. bb_position, bb_width
 * 6. volatility_4, volatility_8, atr_7
 * 7. volume_ratio, volume_change
 * 8. momentum_4, roc_4
 * 9. ema_4, ema_8, close_ema_4_ratio, close_ema_8_ratio, ema_cross
 * 10. zscore_8
 * 11. hour_sin, hour_cos, quarter_sin, quarter_cos
 */
export function prepareFeatures(candles: Candle15m[]): Float32Array {
  if (candles.length < 20) {
    throw new Error(`需要至少 20 根 K 线，当前: ${candles.length}`);
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const opens = candles.map((c) => c.open);
  const volumes = candles.map((c) => c.volume);

  const last = candles[candles.length - 1];
  if (!last) throw new Error("无数据");

  const lastClose = last.close;
  const lastOpen = last.open;
  const lastHigh = last.high;
  const lastLow = last.low;
  const lastVolume = last.volume;

  const features: number[] = [];

  // 1. 收益率 (return_1, return_2, return_4, return_8)
  for (const period of [1, 2, 4, 8]) {
    const prevClose = closes[closes.length - 1 - period] ?? lastClose;
    features.push((lastClose - prevClose) / prevClose);
  }

  // 2. K 线形态
  const bodyRange = lastHigh - lastLow + 1e-10;
  features.push((lastClose - lastOpen) / bodyRange);  // candle_body
  features.push((lastHigh - Math.max(lastClose, lastOpen)) / bodyRange);  // candle_upper
  features.push((Math.min(lastClose, lastOpen) - lastLow) / bodyRange);  // candle_lower
  features.push(lastClose >= lastOpen ? 1 : 0);  // is_bullish

  // 3. RSI
  features.push(rsi(closes, 7));
  features.push(rsi(closes, 14));

  // 4. MACD
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12 - ema26;
  const macdSignal = ema([macdLine], 9);  // 简化
  features.push(macdLine);
  features.push(macdSignal);
  features.push(macdLine - macdSignal);  // macd_hist

  // 5. 布林带
  const bbMiddle = sma(closes, 20);
  const bbStd = stdDev(closes.slice(-20));
  const bbUpper = bbMiddle + 2 * bbStd;
  const bbLower = bbMiddle - 2 * bbStd;
  features.push((lastClose - bbLower) / (bbUpper - bbLower + 1e-10));  // bb_position
  features.push((bbUpper - bbLower) / bbMiddle);  // bb_width

  // 6. 波动率
  features.push(stdDev(closes.slice(-4)) / lastClose);  // volatility_4
  features.push(stdDev(closes.slice(-8)) / lastClose);  // volatility_8
  features.push(atr(candles, 7) / lastClose);  // atr_7

  // 7. 成交量
  const volumeSma8 = sma(volumes, 8);
  features.push(lastVolume / (volumeSma8 + 1e-10));  // volume_ratio
  const prevVolume = volumes[volumes.length - 2] ?? lastVolume;
  features.push((lastVolume - prevVolume) / (prevVolume + 1e-10));  // volume_change

  // 8. 动量
  const close4Ago = closes[closes.length - 5] ?? lastClose;
  features.push(lastClose - close4Ago);  // momentum_4
  features.push((lastClose - close4Ago) / (close4Ago + 1e-10));  // roc_4

  // 9. 均线
  const ema4 = ema(closes, 4);
  const ema8 = ema(closes, 8);
  features.push(ema4);
  features.push(ema8);
  features.push(lastClose / ema4);  // close_ema_4_ratio
  features.push(lastClose / ema8);  // close_ema_8_ratio
  features.push(ema4 > ema8 ? 1 : 0);  // ema_cross

  // 10. Z-Score
  const mean8 = sma(closes, 8);
  const std8 = stdDev(closes.slice(-8));
  features.push((lastClose - mean8) / (std8 + 1e-10));  // zscore_8

  // 11. 时间特征 (使用最后一根 K 线的时间)
  const lastTime = new Date(last.timestamp);
  const hour = lastTime.getUTCHours();
  const minute = lastTime.getUTCMinutes();

  features.push(Math.sin((2 * Math.PI * hour) / 24));  // hour_sin
  features.push(Math.cos((2 * Math.PI * hour) / 24));  // hour_cos
  features.push(Math.sin((2 * Math.PI * minute) / 60));  // quarter_sin
  features.push(Math.cos((2 * Math.PI * minute) / 60));  // quarter_cos

  // 验证特征数量
  const expectedFeatures = metadata?.n_features ?? features.length;
  if (features.length !== expectedFeatures) {
    log.warn(`[MODEL] 特征数量不匹配: 生成 ${features.length}, 期望 ${expectedFeatures}`);
  }

  // Pad/truncate
  while (features.length < expectedFeatures) features.push(0);

  log.debug(`[MODEL] 准备了 ${features.length} 个特征`);

  return new Float32Array(features.slice(0, expectedFeatures));
}

/**
 * 运行模型推理，返回 Up 的概率。
 */
export async function runModel(features: Float32Array): Promise<number> {
  if (!session) {
    throw new Error("模型未加载");
  }

  const tensor = new ort.Tensor("float32", features, [1, features.length]);
  const feeds: Record<string, ort.Tensor> = { float_input: tensor };

  const results = await session.run(feeds);

  // skl2onnx 输出: output_label, output_probability
  const probabilities = results["output_probability"];

  if (probabilities) {
    const data = probabilities.data;
    if (data instanceof Float32Array || Array.isArray(data)) {
      // [prob_down, prob_up]
      const probUp = (data[1] ?? 0.5) as number;
      log.debug(`[MODEL] 预测: probUp=${probUp.toFixed(4)}`);
      return probUp;
    }
  }

  // Fallback
  const label = results["output_label"];
  if (label) {
    const predicted = (label.data as BigInt64Array)[0];
    return predicted === 1n ? 0.55 : 0.45;
  }

  log.warn("[MODEL] 无法解析模型输出，返回 0.5");
  return 0.5;
}

/**
 * 完整预测流程。
 */
export async function predict(candles: Candle15m[]): Promise<number> {
  const features = prepareFeatures(candles);
  return runModel(features);
}
