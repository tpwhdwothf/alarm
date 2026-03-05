import * as dotenv from "dotenv";
import TelegramBot = require("node-telegram-bot-api");
import { supabase, supabaseAdmin } from "../lib/supabaseClient";
import { runHealthCheckAndAlert } from "../lib/serverHealthMonitor";

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("환경변수 TELEGRAM_BOT_TOKEN 이 설정되지 않았습니다.");
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const START_MESSAGE = [
  "안녕하세요, 주식 목표가 알림 봇입니다.",
  "",
  "사용 가능한 명령어는 /명령어 를 입력하면 확인할 수 있습니다.",
  "",
  "예) /add AAPL 180 190 200",
].join("\n");

const COMMAND_LIST_MESSAGE = [
  "📌 사용 가능한 명령어",
  "",
  "━━━ DM에서만 사용 (관리자 전용) ━━━",
  "/start 또는 /시작 : 봇 소개",
  "/명령어 : 사용 가능한 명령어 목록 (지금 이 메시지)",
  "/add 또는 /등록 : 목표가 등록·갱신",
  "  - /등록 코길동 무료픽 종목명 종목코드 [매수가] 목표가1 목표가2 ...",
  "  - 매수가: 110000~220000 (선택, 공백 없이 입력해도 표시 시 공백 처리)",
  "/edit 또는 /수정 종목 tp1 tp2 ... : 목표가 수정",
  "/append 또는 /추가 종목 tpN tpN+1 ... : 목표가 뒤에 추가",
   "/setlevel 또는 /목표 종목 레벨 : 다음 알림 단계를 수동으로 조정",
  "/status 또는 /상태 종목 : 해당 종목 상태 확인",
  "/close 또는 /종료 종목 : 매매 종료 (알림 중단)",
  "/open 또는 /재개 종목 : 다시 활성화",
  "/delete 또는 /삭제 종목 : 목록에서 삭제",
  "/health : 시스템 상태 간단 확인",
  "",
  "━━━ 그룹에서만 사용 ━━━",
  "/질문 내용 : 질문을 큐에 등록 (모두 사용 가능)",
  "/답변 : 누적된 질문 목록 보기 (관리자만)",
  "/질문삭제 번호 : 해당 질문 삭제 (관리자만)",
  "",
  "/setgroup : 이 채팅방을 알림 그룹으로 등록",
  "  - /setgroup 공지방 : 공지방 (알림 O, VIP픽 비공개, 새 멤버 인사 X)",
  "  - /setgroup VIP : VIP방 (알림 O, 모두 공개, 새 멤버 인사 X)",
  "  - /setgroup 일반방 : 일반방 (알림 O, VIP픽 비공개, 새 멤버 인사 O, DM 불가)",
  "",
  "━━━ DM·그룹 모두 사용 ━━━",
  "/list 또는 /목록 : 진행 중인 길동픽 목록 보기",
  "/공지방 : 공지방 입장 링크",
  "",
  "예) /등록 코길동 무료픽 LG에너지솔루션 373220 110000~220000 435000 454000 490000 525000 600000 630000",
  "예) /등록 코길동 무료픽 현대차 005380 660000 675000  (매수가 생략 가능)",
  "예) /setgroup 공지방  (공지방에서 실행)",
  "예) /setgroup VIP  (VIP 전용 방에서 실행)",
  "예) /setgroup 일반방  (일반방에서 실행)",
].join("\n");

function getUserId(msg: TelegramBot.Message): string | null {
  if (!msg.from) return null;
  return String(msg.from.id);
}

const ADMIN_ID_LIST =
  (process.env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) || [];

function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  if (ADMIN_ID_LIST.length === 0) {
    return true;
  }
  return ADMIN_ID_LIST.includes(userId);
}

function isPrivateChat(msg: TelegramBot.Message): boolean {
  return msg.chat.type === "private";
}

function isGroupChat(msg: TelegramBot.Message): boolean {
  return msg.chat.type === "group" || msg.chat.type === "supergroup";
}

function detectMarket(symbol: string): "KR" | "US" {
  return /^\d+$/.test(symbol) ? "KR" : "US";
}

async function findTargetByInput(
  userId: string,
  input: string,
  selectColumns: string
) {
  if (!supabase) {
    return { data: null, error: new Error("Supabase not initialized") };
  }

  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  const isNumeric = /^\d+$/.test(trimmed);

  let query = supabase
    .from("targets")
    .select(selectColumns)
    .eq("created_by", userId);

  if (isNumeric) {
    query = query.eq("symbol", upper);
  } else {
    query = query.or(`symbol.eq.${upper},name.eq.${trimmed}`);
  }

  const { data, error } = await query.maybeSingle();
  return { data, error };
}

bot.onText(/^\/start$/, async (msg) => {
  if (!isPrivateChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }
  const userId = getUserId(msg);
  if (!isAdmin(userId)) {
    return;
  }
  bot.sendMessage(msg.chat.id, START_MESSAGE);
});

bot.onText(/^\/명령어$/, async (msg) => {
  if (!isPrivateChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }
  const userId = getUserId(msg);
  if (!isAdmin(userId)) {
    return;
  }
  bot.sendMessage(msg.chat.id, COMMAND_LIST_MESSAGE);
});

bot.onText(/^\/setgroup(?:\s+(.+))?$/, async (msg, match) => {
  if (!supabase) {
    bot.sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /setgroup 을 저장할 수 없습니다.");
    return;
  }

  if (!isGroupChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 그룹 채팅에서만 사용할 수 있습니다. 알림을 받고 싶은 단체방에서 /setgroup 을 실행해주세요.");
    return;
  }

  const userId = getUserId(msg);
  if (!userId) {
    return;
  }

  const labelRaw = match && match[1] ? match[1].trim() : "";
  let role: "NOTICE" | "VIP" | "GENERAL" = "NOTICE";
  if (labelRaw === "VIP") role = "VIP";
  else if (labelRaw === "일반방") role = "GENERAL";

  const chatId = String(msg.chat.id);

  const { error } = await supabase
    .from("user_settings")
    .upsert(
      {
        telegram_user_id: userId,
        default_group_chat_id: chatId,
      },
      {
        onConflict: "telegram_user_id",
      }
    );

  if (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "그룹 설정 중 오류가 발생했어요.");
    return;
  }

  // alert_groups 테이블에 역할(공지방 / VIP방) 정보 저장
  try {
    const { error: groupError } = await supabase
      .from("alert_groups")
      .upsert(
        {
          created_by: userId,
          group_chat_id: chatId,
          role,
        },
        {
          onConflict: "created_by,group_chat_id",
        }
      );

    if (groupError) {
      console.error("alert_groups upsert 중 오류:", groupError);
    }
  } catch (e) {
    console.error("alert_groups upsert 예외:", e);
  }

  const roleMessages: Record<string, string> = {
    VIP: "이 채팅방을 VIP방으로 설정했어요.\n매도가 알림이 전송되며, 무료픽·VIP픽 모두 공개됩니다.\n일반회원은 DM 사용이 불가합니다.",
    GENERAL:
      "이 채팅방을 일반방으로 설정했어요.\n매도가 알림이 전송되며, /목록 시 VIP픽은 비공개입니다.\n/등록·/목록 등 DM 전용 명령은 관리자만 사용할 수 있어요.",
    NOTICE:
      "이 채팅방을 공지방으로 설정했어요.\n매도가 알림이 전송되며, VIP픽은 비공개입니다.\n일반회원은 DM 사용이 불가합니다.",
  };
  bot.sendMessage(msg.chat.id, roleMessages[role]);
});

bot.onText(/^\/(add|등록) (.+)$/, async (msg, match) => {
  if (!supabase) {
    bot.sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /add 를 처리할 수 없습니다.");
    return;
  }

  if (!isPrivateChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }

  const userId = getUserId(msg);
  if (!userId) {
    return;
  }
  if (!isAdmin(userId)) {
    bot.sendMessage(msg.chat.id, "이 명령은 관리자만 사용할 수 있어요.");
    return;
  }

  const text = match && match[2] ? match[2] : "";
  const parts = text.split(/\s+/).filter(Boolean);

  // 입력 형식:
  // /등록 코길동 무료픽 종목명 종목코드 [매수가] 목표가1 목표가2 ...
  // 매수가: 110000~220000 (선택, 공백 없이 입력 가능)
  if (parts.length < 5) {
    bot.sendMessage(
      msg.chat.id,
      [
        "사용법:",
        "/등록 코길동 무료픽 종목명 종목코드 [매수가] 목표가1 목표가2 ...",
        "매수가: 110000~220000 (선택)",
        "",
        "예) /등록 코길동 무료픽 현대차 005380 660000 675000",
        "예) /등록 코길동 무료픽 LG에너지솔루션 373220 110000~220000 435000 454000",
      ].join("\n")
    );
    return;
  }

  const brand = parts[0];
  const pickType = parts[1];
  const nameInput = parts[2];
  const rawSymbol = parts[3];

  // parts[4]가 매수가(110000~220000 또는 110000 ~ 220000)인지 확인
  let buyPriceRange: string | null = null;
  let tpStrings: string[];
  const part4 = parts[4];
  const part5 = parts[5];
  const part6 = parts[6];

  const parseBuyPriceRange = (lowStr: string, highStr: string): string | null => {
    const low = Number(lowStr.replace(/,/g, ""));
    const high = Number(highStr.replace(/,/g, ""));
    if (Number.isNaN(low) || Number.isNaN(high) || low > high) return null;
    return `${lowStr} ~ ${highStr}`;
  };

  if (part4 && part4.includes("~")) {
    const segments = part4.split("~").map((s) => s.trim());
    if (segments.length === 2) {
      buyPriceRange = parseBuyPriceRange(segments[0], segments[1]);
      tpStrings = parts.slice(5);
    }
  } else if (part4 && part5 === "~" && part6) {
    buyPriceRange = parseBuyPriceRange(part4, part6);
    tpStrings = parts.slice(7);
  }

  if ((part4?.includes("~") || part5 === "~") && !buyPriceRange) {
    bot.sendMessage(
      msg.chat.id,
      "매수가 범위 형식이 올바르지 않습니다.\n예) 110000~220000 또는 110000 ~ 220000"
    );
    return;
  }
  if (buyPriceRange === undefined) {
    tpStrings = parts.slice(4);
  }

  if (tpStrings.length === 0) {
    bot.sendMessage(
      msg.chat.id,
      "목표가는 1개 이상 입력해야 합니다.\n예) /등록 코길동 무료픽 현대차 005380 660000 675000"
    );
    return;
  }

  if (brand !== "코길동") {
    bot.sendMessage(
      msg.chat.id,
      "첫 번째 인자는 반드시 '코길동' 이어야 합니다.\n예) /등록 코길동 무료픽 현대차 005380 660000 675000"
    );
    return;
  }

  if (pickType !== "무료픽" && pickType !== "VIP픽") {
    bot.sendMessage(
      msg.chat.id,
      "두 번째 인자는 '무료픽' 또는 'VIP픽' 이어야 합니다.\n예) /등록 코길동 무료픽 현대차 005380 660000 675000"
    );
    return;
  }

  if (!nameInput || !rawSymbol) {
    bot.sendMessage(
      msg.chat.id,
      "종목명과 종목코드를 정확히 입력해주세요.\n예) /등록 코길동 무료픽 현대차 005380 660000 675000"
    );
    return;
  }

  const name: string | null = nameInput;

  const tps = tpStrings
    .map((t) => Number(t.replace(/,/g, "")))
    .filter((n) => !Number.isNaN(n));
  if (tps.length === 0) {
    bot.sendMessage(
      msg.chat.id,
      "목표가는 숫자로 입력해야 합니다.\n예) /등록 코길동 무료픽 현대차 005380 660000 675000"
    );
    return;
  }

  const { data: userSettings, error: userError } = await supabase
    .from("user_settings")
    .select("*")
    .eq("telegram_user_id", userId)
    .maybeSingle();

  if (userError) {
    console.error(userError);
    bot.sendMessage(msg.chat.id, "사용자 설정을 불러오는 중 오류가 발생했어요.");
    return;
  }

  if (!userSettings || !userSettings.default_group_chat_id) {
    bot.sendMessage(
      msg.chat.id,
      "먼저 알림을 받을 그룹 채팅방에서 /setgroup 을 한 번 실행해주세요."
    );
    return;
  }

  const market = detectMarket(rawSymbol);
  const upperSymbol = rawSymbol.toUpperCase();

  const { error } = await supabase.from("targets").upsert(
    {
      created_by: userId,
      symbol: upperSymbol,
      name: name ?? null,
      market,
      tps: tps,
      next_level: 1,
      status: "ACTIVE",
      group_chat_id: userSettings.default_group_chat_id,
      pick_type: pickType,
      buy_price_range: buyPriceRange ?? null,
    },
    {
      onConflict: "created_by,symbol",
    }
  );

  if (error) {
    console.error("[targets upsert]", error);
    const hint = error.code === "42501" ? "\n(Supabase 대시보드 → Table Editor → 해당 테이블 → RLS 정책 확인)" : "";
    bot.sendMessage(
      msg.chat.id,
      `목표가를 저장하는 중 오류가 발생했어요.${hint}\n오류: ${error.message}`
    );
    return;
  }

  const tpText = tps.join(", ");
  let resultMsg = `종목 ${upperSymbol}의 목표가를 등록/갱신했습니다.\n`;
  if (buyPriceRange) {
    resultMsg += `매수가: ${buyPriceRange}\n`;
  }
  resultMsg += `목표가: ${tpText}\n시장: ${market}`;
  bot.sendMessage(msg.chat.id, resultMsg);
});

bot.onText(/^\/(edit|수정) (.+)$/, async (msg, match) => {
  if (!supabase) {
    bot.sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /edit 을 처리할 수 없습니다.");
    return;
  }

  if (!isPrivateChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }

  const userId = getUserId(msg);
  if (!userId) {
    return;
  }
  if (!isAdmin(userId)) {
    bot.sendMessage(msg.chat.id, "이 명령은 관리자만 사용할 수 있어요.");
    return;
  }

  const text = match && match[2] ? match[2] : "";
  const parts = text.split(/\s+/).filter(Boolean);
  const symbol = parts[0];
  const tpStrings = parts.slice(1);

  if (!symbol || tpStrings.length === 0) {
    bot.sendMessage(
      msg.chat.id,
      "사용법: /edit 종목 tp1 tp2 ... 또는 /수정 종목 tp1 tp2 ...\n예) /edit AAPL 185 195 205"
    );
    return;
  }

  const tps = tpStrings.map(Number).filter((n) => !Number.isNaN(n));
  if (tps.length === 0) {
    bot.sendMessage(
      msg.chat.id,
      "목표가는 숫자로 입력해야 합니다. 예) /edit AAPL 185 195 205 또는 /수정 AAPL 185 195 205"
    );
    return;
  }

  const upperSymbol = symbol.toUpperCase();

  const { data: existing, error: fetchError } = await findTargetByInput(
    userId,
    upperSymbol,
    "id, tps, status"
  );

  if (fetchError) {
    console.error(fetchError);
    bot.sendMessage(msg.chat.id, "기존 종목 정보를 불러오는 중 오류가 발생했어요.");
    return;
  }

  if (!existing) {
    bot.sendMessage(
      msg.chat.id,
      `해당 종목이 없습니다: ${upperSymbol}\n먼저 /add 명령으로 종목을 등록한 뒤 /edit 을 사용해주세요.`
    );
    return;
  }

  const newStatus = existing.status === "ACTIVE" ? "ACTIVE" : existing.status;

  const { error: updateError } = await supabase
    .from("targets")
    .update({
      tps,
      next_level: 1,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (updateError) {
    console.error(updateError);
    bot.sendMessage(msg.chat.id, "목표가를 수정하는 중 오류가 발생했어요.");
    return;
  }

  const oldTpsText = Array.isArray(existing.tps) ? existing.tps.join(", ") : JSON.stringify(existing.tps);
  const newTpsText = tps.join(", ");

  bot.sendMessage(
    msg.chat.id,
    `종목 ${upperSymbol}의 목표가를 수정했습니다.\n기존: ${oldTpsText}\n변경: ${newTpsText}\nnext_level 을 1로 초기화했습니다.`
  );
});

bot.onText(/^\/(append|추가) (.+)$/, async (msg, match) => {
  if (!supabase) {
    bot.sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /append 를 처리할 수 없습니다.");
    return;
  }

  if (!isPrivateChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }

  const userId = getUserId(msg);
  if (!userId) {
    return;
  }
  if (!isAdmin(userId)) {
    bot.sendMessage(msg.chat.id, "이 명령은 관리자만 사용할 수 있어요.");
    return;
  }

  const text = match && match[2] ? match[2] : "";
  const parts = text.split(/\s+/).filter(Boolean);
  const symbol = parts[0];
  const tpStrings = parts.slice(1);

  if (!symbol || tpStrings.length === 0) {
    bot.sendMessage(
      msg.chat.id,
      "사용법: /append 종목 tpN tpN+1 ... 또는 /추가 종목 tpN tpN+1 ...\n예) /append AAPL 220 230"
    );
    return;
  }

  const newTps = tpStrings.map(Number).filter((n) => !Number.isNaN(n));
  if (newTps.length === 0) {
    bot.sendMessage(
      msg.chat.id,
      "목표가는 숫자로 입력해야 합니다. 예) /append AAPL 220 230 또는 /추가 AAPL 220 230"
    );
    return;
  }

  const upperSymbol = symbol.toUpperCase();

  const { data: existing, error: fetchError } = await findTargetByInput(
    userId,
    upperSymbol,
    "id, tps, next_level, status"
  );

  if (fetchError) {
    console.error(fetchError);
    bot.sendMessage(msg.chat.id, "기존 종목 정보를 불러오는 중 오류가 발생했어요.");
    return;
  }

  if (!existing) {
    bot.sendMessage(
      msg.chat.id,
      `해당 종목이 없습니다: ${upperSymbol}\n먼저 /add 명령으로 종목을 등록한 뒤 /append 를 사용해주세요.`
    );
    return;
  }

  const baseTps: number[] = Array.isArray(existing.tps)
    ? existing.tps.map((v: any) => Number(v)).filter((n: number) => !Number.isNaN(n))
    : [];

  const combined = [...baseTps, ...newTps];

  let newStatus = existing.status;
  if (existing.status === "COMPLETED" && existing.next_level >= 1 && existing.next_level <= combined.length) {
    newStatus = "ACTIVE";
  }

  const { error: updateError } = await supabase
    .from("targets")
    .update({
      tps: combined,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (updateError) {
    console.error(updateError);
    bot.sendMessage(msg.chat.id, "목표가를 추가하는 중 오류가 발생했어요.");
    return;
  }

  const beforeText = baseTps.length ? baseTps.join(", ") : "(없음)";
  const addedText = newTps.join(", ");
  const afterText = combined.join(", ");

  const statusMessage =
    existing.status === "COMPLETED" && newStatus === "ACTIVE"
      ? "기존에 COMPLETED 였던 종목을 다시 ACTIVE 로 전환했습니다."
      : `현재 next_level=${existing.next_level}, status=${newStatus} 는 그대로 유지됩니다.`;

  bot.sendMessage(
    msg.chat.id,
    [
      `종목 ${upperSymbol}의 목표가를 추가했습니다.`,
      `기존: ${beforeText}`,
      `추가: ${addedText}`,
      `전체: ${afterText}`,
      "",
      statusMessage,
    ].join("\n")
  );
});

bot.onText(/^\/(list|목록)$/, async (msg) => {
  try {
    if (!supabase) {
      bot.sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /list 를 처리할 수 없습니다.");
      return;
    }

    const userId = getUserId(msg);
    if (isPrivateChat(msg) && !isAdmin(userId)) {
      bot.sendMessage(msg.chat.id, "이 명령은 DM에서 관리자만 사용할 수 있어요.");
      return;
    }

    const client = supabaseAdmin ?? supabase;

    let isVipHiddenRoom = false;
    if (isGroupChat(msg)) {
      const { data: groupRow } = await client
        .from("alert_groups")
        .select("role")
        .eq("group_chat_id", String(msg.chat.id))
        .limit(1)
        .maybeSingle();
      const role = groupRow?.role;
      isVipHiddenRoom = role === "NOTICE" || role === "GENERAL";
    }

    const { data, error } = await client
      .from("targets")
      .select("symbol, name, market, tps, next_level, status, pick_type, buy_price_range")
      .eq("status", "ACTIVE")
      .order("symbol");

    if (error) {
      console.error("[목록] Supabase 오류:", error?.message ?? error);
      bot.sendMessage(
        msg.chat.id,
        "목록을 불러오는 중 오류가 발생했어요.\n(Supabase 연결·키·테이블 확인이 필요할 수 있어요. 서버 로그를 확인해 주세요.)"
      );
      return;
    }

    if (!data || data.length === 0) {
      bot.sendMessage(msg.chat.id, "진행 중인 길동픽이 없습니다.");
      return;
    }

    const isDm = isPrivateChat(msg);
    const isAdminDm = isDm && isAdmin(userId);

    const lines = data.map((row: any) => {
      const tpsArray = Array.isArray(row.tps) ? row.tps : [];
      const tpsText = tpsArray.length ? tpsArray.join(", ") : "(없음)";

      const nextIdx = row.next_level - 1;
      const nextTp =
        nextIdx >= 0 && nextIdx < tpsArray.length
          ? String(tpsArray[nextIdx])
          : "모든 목표가 도달";

      const pickType = row.pick_type === "VIP픽" ? "코길동 VIP픽" : "코길동 무료픽";

      if (row.pick_type === "VIP픽" && isVipHiddenRoom && !isAdminDm) {
        return [
          `<b>${pickType}</b>`,
          "종목: 비공개",
          "매수가: 비공개",
          "목표가: 비공개",
          "다음 목표가: 비공개",
          "",
        ].join("\n");
      }

      const header = row.name ? `${row.name}(${row.symbol})` : `${row.symbol}`;
      const buyPriceLine = row.buy_price_range
        ? `매수가: ${row.buy_price_range}`
        : null;

      const parts = [
        `<b>${pickType}</b>`,
        `종목: ${header}`,
        ...(buyPriceLine ? [buyPriceLine] : []),
        `목표가: ${tpsText}`,
        `다음 목표가: ${nextTp}`,
        "",
      ];
      return parts.join("\n");
    });

    const message = ["현재 진행 중인 길동픽 목록", "", ...lines].join("\n");
    bot.sendMessage(msg.chat.id, message, { parse_mode: "HTML" });
  } catch (err) {
    console.error("[목록] 예외:", err);
    bot.sendMessage(msg.chat.id, "목록을 불러오는 중 예기치 않은 오류가 발생했어요.");
  }
});

const NOTICE_GROUP_LINK = "https://t.me/+UJDTas0rW2s0MzY1";

bot.onText(/^\/공지방$/, (msg) => {
  bot.sendMessage(msg.chat.id, `<a href="${NOTICE_GROUP_LINK}">공지방 입장하기</a>`, {
    parse_mode: "HTML",
  });
});

bot.onText(/^\/(status|상태) (.+)$/, async (msg, match) => {
  if (!supabase) {
    bot.sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /status 를 처리할 수 없습니다.");
    return;
  }

  if (!isPrivateChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }

  const userId = getUserId(msg);
  if (!userId) {
    return;
  }
  if (!isAdmin(userId)) {
    bot.sendMessage(msg.chat.id, "이 명령은 관리자만 사용할 수 있어요.");
    return;
  }

  const symbolInput = match && match[2] ? match[2].trim() : "";
  if (!symbolInput) {
    bot.sendMessage(
      msg.chat.id,
      "사용법: /status 종목 또는 /상태 종목\n예) /status AAPL"
    );
    return;
  }

  const symbol = symbolInput.toUpperCase();

  const { data, error } = await findTargetByInput(
    userId,
    symbol,
    "symbol, name, market, tps, next_level, status"
  );

  if (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "상태를 불러오는 중 오류가 발생했어요.");
    return;
  }

  if (!data) {
    bot.sendMessage(msg.chat.id, `해당 종목이 없습니다: ${symbol}`);
    return;
  }

  const tps = Array.isArray(data.tps) ? data.tps : [];
  const tpsText = tps.length ? tps.join(", ") : "(없음)";
  const nextLevel = data.next_level;
  const nextTp =
    Array.isArray(data.tps) && nextLevel >= 1 && nextLevel <= tps.length
      ? String(tps[nextLevel - 1])
      : "모든 목표가 도달 또는 없음";

  const message = [
    `종목: ${data.symbol}${data.name ? " " + data.name : ""} (${data.market})`,
    `상태: ${data.status}`,
    `목표가들: ${tpsText}`,
    `다음 알림 단계: ${nextLevel}`,
    `다음 목표가: ${nextTp}`,
  ].join("\n");

  bot.sendMessage(msg.chat.id, message);
});

bot.onText(/^\/(setlevel|목표) (.+)$/, async (msg, match) => {
  if (!supabase) {
    bot.sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /setlevel 을 처리할 수 없습니다.");
    return;
  }

  if (!isPrivateChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }

  const userId = getUserId(msg);
  if (!userId) {
    return;
  }
  if (!isAdmin(userId)) {
    bot.sendMessage(msg.chat.id, "이 명령은 관리자만 사용할 수 있어요.");
    return;
  }

  const text = match && match[2] ? match[2].trim() : "";
  const parts = text.split(/\s+/).filter(Boolean);
  const symbolInput = parts[0];
  const levelInput = parts[1];

  if (!symbolInput || !levelInput) {
    bot.sendMessage(
      msg.chat.id,
      [
        "사용법: /setlevel 종목 레벨 또는 /목표 종목 레벨",
        "예) /setlevel 005380 2",
      ].join("\n")
    );
    return;
  }

  const symbol = symbolInput.toUpperCase();
  const level = Number(levelInput);

  if (!Number.isInteger(level) || level < 1) {
    bot.sendMessage(msg.chat.id, "레벨은 1 이상의 정수로 입력해야 합니다.\n예) /setlevel 005380 2");
    return;
  }

  const { data, error } = await findTargetByInput(
    userId,
    symbol,
    "id, tps, next_level"
  );

  if (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "종목 정보를 불러오는 중 오류가 발생했어요.");
    return;
  }

  if (!data) {
    bot.sendMessage(msg.chat.id, `해당 종목이 없습니다: ${symbol}\n먼저 /등록 으로 종목을 등록해 주세요.`);
    return;
  }

  const tps = Array.isArray(data.tps)
    ? data.tps.map((v: any) => Number(v)).filter((n: number) => !Number.isNaN(n))
    : [];

  if (tps.length === 0) {
    bot.sendMessage(msg.chat.id, "해당 종목에는 아직 목표가가 없습니다. 먼저 /등록 으로 목표가를 입력해 주세요.");
    return;
  }

  // 레벨이 목표가 개수보다 크면 "마지막 다음"으로 간주
  const clampedLevel = level > tps.length + 1 ? tps.length + 1 : level;

  const { error: updateError } = await supabase
    .from("targets")
    .update({
      next_level: clampedLevel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  if (updateError) {
    console.error(updateError);
    bot.sendMessage(msg.chat.id, "레벨을 변경하는 중 오류가 발생했어요.");
    return;
  }

  const nextIdx = clampedLevel - 1;
  const nextTp =
    nextIdx >= 0 && nextIdx < tps.length
      ? String(tps[nextIdx])
      : "모든 목표가 도달 또는 없음";

  bot.sendMessage(
    msg.chat.id,
    [
      `종목 ${symbol} 의 다음 알림 단계를 ${clampedLevel}차로 변경했습니다.`,
      `다음 목표가: ${nextTp}`,
    ].join("\n")
  );
});

bot.onText(/^\/(close|종료) (.+)$/, async (msg, match) => {
  if (!supabase) {
    bot.sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /close 를 처리할 수 없습니다.");
    return;
  }

  if (!isPrivateChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }

  const userId = getUserId(msg);
  if (!userId) {
    return;
  }
  if (!isAdmin(userId)) {
    bot.sendMessage(msg.chat.id, "이 명령은 관리자만 사용할 수 있어요.");
    return;
  }

  const symbolInput = match && match[2] ? match[2].trim() : "";
  if (!symbolInput) {
    bot.sendMessage(
      msg.chat.id,
      "사용법: /close 종목 또는 /종료 종목\n예) /close AAPL"
    );
    return;
  }

  const symbol = symbolInput.toUpperCase();

  const { data, error } = await findTargetByInput(
    userId,
    symbol,
    "id, symbol, status"
  );

  if (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "종목을 종료하는 중 오류가 발생했어요.");
    return;
  }

  if (!data) {
    bot.sendMessage(
      msg.chat.id,
      `종목이 없거나 이미 CLOSED 상태입니다: ${symbol}\n먼저 /add 로 등록했는지 확인해주세요.`
    );
    return;
  }

  const { error: updateError } = await supabase
    .from("targets")
    .update({ status: "CLOSED", updated_at: new Date().toISOString() })
    .eq("id", data.id)
    .neq("status", "CLOSED")
    .select("symbol, status")
    .maybeSingle();

  if (updateError) {
    console.error(updateError);
    bot.sendMessage(msg.chat.id, "종목을 종료하는 중 오류가 발생했어요.");
    return;
  }

  if (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "종목을 종료하는 중 오류가 발생했어요.");
    return;
  }

  if (!data) {
    bot.sendMessage(
      msg.chat.id,
      `종목이 없거나 이미 CLOSED 상태입니다: ${symbol}\n먼저 /add 로 등록했는지 확인해주세요.`
    );
    return;
  }

  bot.sendMessage(msg.chat.id, `종목 ${symbol} 을(를) CLOSED 상태로 변경했습니다.\n향후 알림이 중단됩니다.`);
});

bot.onText(/^\/(open|재개) (.+)$/, async (msg, match) => {
  if (!supabase) {
    bot.sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /open 을 처리할 수 없습니다.");
    return;
  }

  if (!isPrivateChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }

  const userId = getUserId(msg);
  if (!userId) {
    return;
  }
  if (!isAdmin(userId)) {
    bot.sendMessage(msg.chat.id, "이 명령은 관리자만 사용할 수 있어요.");
    return;
  }

  const symbolInput = match && match[2] ? match[2].trim() : "";
  if (!symbolInput) {
    bot.sendMessage(
      msg.chat.id,
      "사용법: /open 종목 또는 /재개 종목\n예) /open AAPL"
    );
    return;
  }

  const symbol = symbolInput.toUpperCase();

  const { data, error } = await findTargetByInput(
    userId,
    symbol,
    "id, symbol, status, next_level"
  );

  if (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "종목을 다시 활성화하는 중 오류가 발생했어요.");
    return;
  }

  if (!data || data.status !== "CLOSED") {
    bot.sendMessage(
      msg.chat.id,
      `CLOSED 상태인 종목이 없거나 찾을 수 없습니다: ${symbol}\n먼저 /close 로 종료한 종목인지 확인해주세요.`
    );
    return;
  }

  const { data: reopened, error: updateError } = await supabase
    .from("targets")
    .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
    .eq("id", data.id)
    .select("symbol, status, next_level")
    .maybeSingle();

  if (updateError) {
    console.error(updateError);
    bot.sendMessage(msg.chat.id, "종목을 다시 활성화하는 중 오류가 발생했어요.");
    return;
  }

  if (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "종목을 다시 활성화하는 중 오류가 발생했어요.");
    return;
  }

  bot.sendMessage(
    msg.chat.id,
    `종목 ${symbol} 을(를) 다시 ACTIVE 상태로 변경했습니다.\nnext_level=${data.next_level} 부터 알림이 재개됩니다.`
  );
});

bot.onText(/^\/(delete|삭제) (.+)$/, async (msg, match) => {
  if (!supabase) {
    bot.sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /delete 를 처리할 수 없습니다.");
    return;
  }

  if (!isPrivateChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }

  const userId = getUserId(msg);
  if (!userId) {
    return;
  }
  if (!isAdmin(userId)) {
    bot.sendMessage(msg.chat.id, "이 명령은 관리자만 사용할 수 있어요.");
    return;
  }

  const symbolInput = match && match[2] ? match[2].trim() : "";
  if (!symbolInput) {
    bot.sendMessage(
      msg.chat.id,
      "사용법: /delete 종목 또는 /삭제 종목\n예) /delete AAPL"
    );
    return;
  }

  const symbol = symbolInput.toUpperCase();

  const { data, error } = await findTargetByInput(userId, symbol, "id, symbol");

  if (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "종목을 삭제하는 중 오류가 발생했어요.");
    return;
  }

  if (!data) {
    bot.sendMessage(
      msg.chat.id,
      `해당 종목을 찾을 수 없습니다: ${symbol}\n먼저 /add 로 등록했는지 확인해주세요.`
    );
    return;
  }

  const { error: deleteError } = await supabase
    .from("targets")
    .delete()
    .eq("id", data.id);

  if (deleteError) {
    console.error(deleteError);
    bot.sendMessage(msg.chat.id, "종목을 삭제하는 중 오류가 발생했어요.");
    return;
  }

  bot.sendMessage(
    msg.chat.id,
    `종목 ${symbol} 을(를) 목록에서 삭제했습니다.\n더 이상 이 종목에 대해서는 알림이 발생하지 않습니다.`
  );
});

bot.onText(/^\/health$/, async (msg) => {
  if (!isPrivateChat(msg)) {
    bot.sendMessage(
      msg.chat.id,
      "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다."
    );
    return;
  }

  const userId = getUserId(msg);
  if (!userId) {
    return;
  }
  if (!isAdmin(userId)) {
    bot.sendMessage(msg.chat.id, "이 명령은 관리자만 사용할 수 있어요.");
    return;
  }

  const lines: string[] = [];
  lines.push("✅ 봇 상태 점검 결과");

  // Supabase 연결 확인
  if (!supabase) {
    lines.push("- Supabase: ❌ 설정되지 않음");
  } else {
    try {
      const { error } = await supabase.from("targets").select("id").limit(1);
      if (error) {
        lines.push(`- Supabase: ⚠️ 오류 발생 (${error.message})`);
      } else {
        lines.push("- Supabase: ✅ 연결 정상");
      }
    } catch (e: any) {
      lines.push(`- Supabase: ⚠️ 예외 발생 (${e?.message || String(e)})`);
    }
  }

  // 간단 버전 정보
  lines.push(`- Bot 버전: 1.0.0 (Oracle + Vercel 연동)`);

  const now = new Date();
  lines.push(`- 서버 시각: ${now.toISOString()}`);

  bot.sendMessage(msg.chat.id, lines.join("\n"));
});

bot.on("new_chat_members", async (msg) => {
  if (!isGroupChat(msg)) {
    return;
  }

  if (!supabase || !msg.new_chat_members || msg.new_chat_members.length === 0) {
    return;
  }

  const chatId = String(msg.chat.id);

  const { data: groupRow, error } = await supabase
    .from("alert_groups")
    .select("role")
    .eq("group_chat_id", chatId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("alert_groups 조회 중 오류:", error);
    return;
  }

  const role = groupRow?.role;

  if (role === "VIP" || role === "NOTICE") {
    return;
  }

  if (role !== "GENERAL") {
    return;
  }

  for (const member of msg.new_chat_members) {
    if (member.is_bot) continue;

    const nameParts = [member.first_name, member.last_name].filter(Boolean);
    const displayName = nameParts.join(" ") || member.username || "새로운 회원";

    const safeName = displayName
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const mention = `<a href="tg://user?id=${member.id}">${safeName}</a>`;

    const text = [
      `어서오세요, ${mention}님👋`,
      "환영합니다!",
      "",
      "원활한 소통을 위해 아래 이용 안내를 참고해주세요.",
      "• 지나친 친목도모는 자제해주세요",
      "• 종목 추천은 운영자 ‘코길동’만 진행합니다",
      "• 타인을 향한 비방 및 욕설은 엄격히 금지됩니다",
      "• 광고, 홍보 시 안내 없이 강퇴 됩니다",
      "",
      "현재 매매 진행 중인 코길동 픽이 궁금하시면",
      "👉 /목록 을 입력해 주세요!",
      "",
      "코길동 픽을 더 빠르게 확인하고 싶다면",
      '<a href="https://t.me/+UJDTas0rW2s0MzY1">공지방 입장하기</a>',
    ].join("\n");

    bot.sendMessage(msg.chat.id, text, { parse_mode: "HTML" });
  }
});

// 서버 상태 모니터: OOM 위험·메모리 부족 시 관리자 DM 경고 (봇만 돌릴 때는 .env 에 DISABLE_HEALTH_MONITOR=true 로 끄면 메모리 절약)
const HEALTH_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const DISABLE_HEALTH_MONITOR =
  process.env.DISABLE_HEALTH_MONITOR === "true" || process.env.DISABLE_HEALTH_MONITOR === "1";
if (!DISABLE_HEALTH_MONITOR) {
  setInterval(() => {
    if (ADMIN_ID_LIST.length === 0) return;
    runHealthCheckAndAlert(ADMIN_ID_LIST, (chatId, text) =>
      bot.sendMessage(chatId, text).then(() => {})
    ).catch((e) => console.error("[serverHealthMonitor] 오류:", e));
  }, HEALTH_CHECK_INTERVAL_MS);
}

console.log("Telegram 봇이 시작되었습니다.");

