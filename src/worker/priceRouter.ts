import * as dotenv from "dotenv";
import TelegramBot = require("node-telegram-bot-api");
import { supabase } from "../lib/supabaseClient";

dotenv.config();

export type TargetRow = {
  id: string;
  created_by: string;
  symbol: string;
  name: string | null;
  market: string;
  tps: number[];
  next_level: number;
  status: string;
  group_chat_id: string | null;
};

let sendOnlyBot: TelegramBot | null = null;

function getBot(): TelegramBot {
  if (!sendOnlyBot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN 이 필요합니다.");
    sendOnlyBot = new TelegramBot(token, { polling: false });
  }
  return sendOnlyBot;
}

export async function processPriceEvent(
  target: TargetRow,
  currentPrice: number
): Promise<void> {
  if (!supabase || !target.group_chat_id) {
    return;
  }

  const tps = target.tps;
  const nextIndex = target.next_level - 1;

  if (nextIndex < 0 || nextIndex >= tps.length) {
    await supabase
      .from("targets")
      .update({ status: "COMPLETED" })
      .eq("id", target.id)
      .eq("status", "ACTIVE");
    return;
  }

  const targetPrice = tps[nextIndex];
  const PRICE_TOLERANCE = 0.01;
  if (currentPrice < targetPrice - PRICE_TOLERANCE) {
    return;
  }

  const nextLevel = target.next_level + 1;
  const isCompleted = nextLevel > tps.length;

  const { data, error } = await supabase
    .from("targets")
    .update({
      next_level: nextLevel,
      status: isCompleted ? "COMPLETED" : "ACTIVE",
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id)
    .eq("status", "ACTIVE")
    .eq("next_level", target.next_level)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return;
  }

  console.log(`[알림] ${target.symbol} ${target.next_level}차 목표가 도달 (${targetPrice}) → 그룹으로 발송`);
  const currentLevel = target.next_level;
  const nextTpText =
    nextLevel <= tps.length ? String(tps[nextLevel - 1]) : "모든 목표가 도달";
  const displayName = target.name ? `${target.name}(${target.symbol})` : target.symbol;

  const message = [
    "🔔 매도가 도달 알림",
    "",
    `종목: ${displayName}`,
    `목표가: ${currentLevel}차 (${targetPrice})`,
    `현재가: ${currentPrice.toFixed(2)}`,
    "",
    `다음 목표가: ${nextTpText}`,
  ].join("\n");

  try {
    const sent = await getBot().sendMessage(target.group_chat_id, message);
    await supabase.from("alert_logs").insert({
      created_by: target.created_by,
      symbol: target.symbol,
      tp_level: currentLevel,
      price: currentPrice,
      message_id: String(sent.message_id),
    });
  } catch (e) {
    console.error("텔레그램 알림 발송 중 오류:", e);
  }
}

export async function onPrice(
  symbol: string,
  market: string,
  price: number
): Promise<void> {
  if (!supabase) return;

  const { data, error } = await supabase
    .from("targets")
    .select("id, created_by, symbol, name, market, tps, next_level, status, group_chat_id")
    .eq("symbol", symbol)
    .eq("market", market)
    .eq("status", "ACTIVE");

  if (error || !data || data.length === 0) return;

  for (const row of data as unknown as TargetRow[]) {
    if (!Array.isArray(row.tps) || row.tps.length === 0) continue;
    await processPriceEvent(row, price);
  }
}
