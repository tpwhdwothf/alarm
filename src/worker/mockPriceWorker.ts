import * as dotenv from "dotenv";
import { supabase } from "../lib/supabaseClient";
import { processPriceEvent, type TargetRow } from "./priceRouter";

dotenv.config();

if (!supabase) {
  throw new Error("Supabase 설정이 없어 Price Worker 를 시작할 수 없습니다.");
}

const POLL_INTERVAL_MS = 3_000;
const INITIAL_PRICE_RATIO = 0.9;
const PRICE_STEP_RATIO = 0.02;

const currentPrices = new Map<string, number>();

function getNextPrice(target: TargetRow): number {
  const tps = target.tps;
  const nextIndex = target.next_level - 1;
  const baseTp = tps[Math.max(0, Math.min(nextIndex, tps.length - 1))];

  const prev = currentPrices.get(target.id);
  if (prev === undefined) {
    const initial = baseTp * INITIAL_PRICE_RATIO;
    currentPrices.set(target.id, initial);
    return initial;
  }

  const step = Math.abs(baseTp * PRICE_STEP_RATIO);
  const nextPrice = prev + step;
  const resetThreshold = baseTp * 1.1;

  if (nextPrice > resetThreshold) {
    const reset = baseTp * INITIAL_PRICE_RATIO;
    currentPrices.set(target.id, reset);
    return reset;
  }

  currentPrices.set(target.id, nextPrice);
  return nextPrice;
}

async function pollAndSimulate() {
  const { data, error } = await supabase
    .from("targets")
    .select("id, created_by, symbol, name, market, tps, next_level, status, group_chat_id")
    .eq("status", "ACTIVE");

  if (error || !data || data.length === 0) return;

  for (const row of data as unknown as TargetRow[]) {
    if (!Array.isArray(row.tps) || row.tps.length === 0) continue;
    const price = getNextPrice(row);
    await processPriceEvent(row, price);
  }
}

console.log("Mock Price Worker가 시작되었습니다. (실제 시세 대신 모의 가격으로 동작)");

setInterval(() => {
  pollAndSimulate().catch((e) => console.error("pollAndSimulate error:", e));
}, POLL_INTERVAL_MS);
