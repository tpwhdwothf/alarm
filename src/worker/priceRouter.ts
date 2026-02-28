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
  // 선택: '무료픽' | 'VIP픽' 저장용 (없으면 무료픽으로 간주)
  pick_type?: string | null;
  // 매수가 범위 (예: "110000 ~ 220000")
  buy_price_range?: string | null;
};

type AlertGroupRow = {
  group_chat_id: string;
  role: string | null;
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
  if (!supabase) {
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

  console.log(
    `[알림] ${target.symbol} ${target.next_level}차 목표가 도달 (${targetPrice}) → 그룹으로 발송`
  );

  const currentLevel = target.next_level;
  const nextTpText =
    nextLevel <= tps.length ? String(tps[nextLevel - 1]) : "모든 목표가 도달";
  const displayName = target.name ? `${target.name}(${target.symbol})` : target.symbol;
  const pickTypeLabel =
    target.pick_type === "VIP픽" ? "코길동 VIP픽" : "코길동 무료픽";
  const isVipPick = target.pick_type === "VIP픽";

  // alert_groups 테이블에서 이 유저가 등록한 알림 그룹 목록 조회
  let alertGroups: AlertGroupRow[] | null = null;
  try {
    const { data: groups, error: groupsError } = await supabase
      .from("alert_groups")
      .select("group_chat_id, role")
      .eq("created_by", target.created_by);

    if (!groupsError && groups && groups.length > 0) {
      alertGroups = groups as AlertGroupRow[];
    }
  } catch (e) {
    console.error("alert_groups 조회 중 오류:", e);
  }

  // 1) alert_groups 가 없으면 기존 방식(단일 group_chat_id)으로 발송
  let lastMessageId: string | null = null;
  if (!alertGroups || alertGroups.length === 0) {
    if (!target.group_chat_id) {
      return;
    }

    const nextTargetTextLegacy =
      isVipPick
        ? "비공개"
        : nextLevel <= tps.length
        ? `${nextTpText}(${nextLevel}차)`
        : nextTpText;

    const legacyMessage = [
      "🔔 매도가 도달 알림",
      "",
      `${pickTypeLabel}`,
      "",
      `도달: ${targetPrice}(${currentLevel}차)`,
      "",
      `다음 목표가: ${nextTargetTextLegacy}`,
      "",
      "🎉 수익을 축하드립니다!",
    ].join("\n");

    lastMessageId = await sendTelegramViaVercel(target.group_chat_id, legacyMessage);
  } else {
    // 2) alert_groups 에 등록된 각 그룹으로 역할에 따라 분기 발송 (GENERAL은 매도가 알림 제외)
    for (const group of alertGroups) {
      if (group.role === "GENERAL") continue;

      const role = group.role === "VIP" ? "VIP" : "NOTICE";
      const isVipRoom = role === "VIP";

      if (isVipPick && !isVipRoom) {
        // VIP 픽 + 공지방(일반 방) → 요청된 템플릿 사용
        const message = [
          "🔔 VIP 매도가 도달 알림",
          "",
          `${pickTypeLabel}`,
          "",
          `${displayName}`,
          `도달: ${targetPrice}(${currentLevel}차)`,
          "",
          "다음 목표가: VIP 공개",
          "",
          "🎉 수익을 축하드립니다!",
        ].join("\n");

        lastMessageId = await sendTelegramViaVercel(group.group_chat_id, message);
      } else {
        // 무료픽이거나, VIP 픽 + VIP 방 → 전체 정보 공개 버전
        const nextTargetText =
          nextLevel <= tps.length
            ? `${nextTpText}(${nextLevel}차)`
            : nextTpText;

        const message = [
          "🔔 매도가 도달 알림",
          "",
          `${pickTypeLabel}`,
          "",
          `${displayName}`,
          `도달: ${targetPrice}(${currentLevel}차)`,
          "",
          `다음 목표가: ${nextTargetText}`,
          "",
          "🎉 수익을 축하드립니다!",
        ].join("\n");

        lastMessageId = await sendTelegramViaVercel(group.group_chat_id, message);
      }
    }
  }

  try {
    await supabase.from("alert_logs").insert({
      created_by: target.created_by,
      symbol: target.symbol,
      tp_level: currentLevel,
      price: currentPrice,
      message_id: lastMessageId,
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
    .select(
      "id, created_by, symbol, name, market, tps, next_level, status, group_chat_id, pick_type"
    )
    .eq("symbol", symbol)
    .eq("market", market)
    .eq("status", "ACTIVE");

  if (error || !data || data.length === 0) return;

  for (const row of data as unknown as TargetRow[]) {
    if (!Array.isArray(row.tps) || row.tps.length === 0) continue;
    await processPriceEvent(row, price);
  }
}
