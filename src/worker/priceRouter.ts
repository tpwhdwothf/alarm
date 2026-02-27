import * as dotenv from "dotenv";
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

const VERCEL_TELEGRAM_ENDPOINT = process.env.VERCEL_TELEGRAM_ENDPOINT;
const VERCEL_TELEGRAM_SECRET = process.env.VERCEL_TELEGRAM_SECRET;

async function sendTelegramViaVercel(
  chatId: string,
  text: string
): Promise<string | null> {
  if (!VERCEL_TELEGRAM_ENDPOINT || !VERCEL_TELEGRAM_SECRET) {
    console.error(
      "VERCEL_TELEGRAM_ENDPOINT / VERCEL_TELEGRAM_SECRET 환경변수가 설정되지 않아 텔레그램 알림을 건너뜁니다."
    );
    return null;
  }

  const payload = {
    secret: VERCEL_TELEGRAM_SECRET,
    chatId,
    text,
  };

  const maxAttempts = 5;
  let delayMs = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(VERCEL_TELEGRAM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        console.error(
          `[Vercel] 텔레그램 알림 실패 (status=${res.status}, attempt=${attempt}): ${bodyText}`
        );
      } else {
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; messageId?: number | string }
          | null;
        if (json && json.ok && json.messageId != null) {
          return String(json.messageId);
        }
        return null;
      }
    } catch (err) {
      console.error(
        `[Vercel] 텔레그램 알림 전송 중 오류 (attempt=${attempt}):`,
        err
      );
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }

  return null;
}

export async function processPriceEvent(
  target: TargetRow,
  currentPrice: number
): Promise<void> {
  if (!supabase || !target.group_chat_id) {
    return;
  }

  // 중복 알림 방지: 같은 종목/레벨 알림이 최근 60초 이내에 이미 발송된 경우 스킵
  try {
    const { data: recentLogs, error: recentError } = await supabase
      .from("alert_logs")
      .select("created_at")
      .eq("created_by", target.created_by)
      .eq("symbol", target.symbol)
      .eq("tp_level", target.next_level)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!recentError && recentLogs && recentLogs.length > 0) {
      const lastCreatedAt = (recentLogs[0] as { created_at?: string }).created_at;
      if (lastCreatedAt) {
        const last = new Date(lastCreatedAt).getTime();
        const now = Date.now();
        const DIFF_MS = now - last;
        const THRESHOLD_MS = 60 * 1000; // 60초
        if (DIFF_MS < THRESHOLD_MS) {
          console.log(
            `[알림] ${target.symbol} ${target.next_level}차: 최근 ${Math.round(
              DIFF_MS / 1000
            )}초 이내에 이미 알림이 발송되어 스킵합니다.`
          );
          return;
        }
      }
    }
  } catch (e) {
    console.error("중복 알림 여부 확인 중 오류:", e);
    // 오류가 나더라도 알림 자체는 계속 진행
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

  const messageId = await sendTelegramViaVercel(target.group_chat_id, message);

  try {
    await supabase.from("alert_logs").insert({
      created_by: target.created_by,
      symbol: target.symbol,
      tp_level: currentLevel,
      price: currentPrice,
      message_id: messageId,
    });
  } catch (e) {
    console.error("알림 로그 저장 중 오류:", e);
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
