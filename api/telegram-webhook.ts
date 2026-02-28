import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase, supabaseAdmin } from "../src/lib/supabaseClient";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID_LIST = (process.env.TELEGRAM_ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
  "/setgroup : 이 채팅방을 알림 그룹으로 등록 (매도가 알림 수신처 설정)",
  "  - 알림을 받고 싶은 그룹에서 직접 입력",
  "  - /setgroup 공지방 : 공지방 (알림 O, VIP픽 비공개, 새 멤버 인사 X)",
  "  - /setgroup VIP : VIP방 (알림 O, 모두 공개, 새 멤버 인사 X)",
  "  - /setgroup 일반방 : 일반방 (알림 X, VIP픽 비공개, 새 멤버 인사 O, DM 불가)",
  "",
  "━━━ 채널에서만 사용 ━━━",
  "/setchannel : 이 채널을 알림 수신처로 등록 (매도가 알림 수신처 설정)",
  "  - 봇을 채널 관리자로 추가한 뒤, 알림 받을 채널에서 직접 입력",
  "  - /setchannel 공지방 : 공지채널 (알림 O, VIP픽 비공개)",
  "  - /setchannel VIP : VIP채널 (알림 O, 모두 공개)",
  "  - /setchannel 일반방 : 일반채널 (알림 X)",
  "",
  "━━━ DM·그룹 모두 사용 ━━━",
  "/list 또는 /목록 : 진행 중인 길동픽 목록 보기",
  "/공지방 : 공지방 입장 링크",
  "",
  "━━━ 그룹·채널 권한 확인 ━━━",
  "/권한확인 : 봇이 이 채팅방/채널에 메시지를 보낼 권한이 있는지 확인",
  "",
  "예) /등록 코길동 무료픽 LG에너지솔루션 373220 110000~220000 435000 454000 490000 525000 600000 630000",
  "예) /등록 코길동 무료픽 현대차 005380 660000 675000  (매수가 생략 가능)",
  "예) /setgroup 공지방  (공지방에서 실행)",
  "예) /setgroup VIP  (VIP 전용 방에서 실행)",
  "예) /setgroup 일반방  (일반방에서 실행)",
  "예) /setchannel 공지방  /setchannel VIP  /setchannel 일반방  (채널에서 실행)",
].join("\n");

const roleMessages: Record<string, string> = {
  VIP:
    "이 채팅방을 VIP방으로 설정했어요.\n매도가 알림이 전송되며, 무료픽·VIP픽 모두 공개됩니다.\n일반회원은 DM 사용이 불가합니다.",
  GENERAL:
    "이 채팅방을 일반방으로 설정했어요.\n매도가 알림은 전송되지 않고, /목록 시 VIP픽은 비공개입니다.\n/등록·/목록 등 DM 전용 명령은 관리자만 사용할 수 있어요.",
  NOTICE:
    "이 채팅방을 공지방으로 설정했어요.\n매도가 알림이 전송되며, VIP픽은 비공개입니다.\n일반회원은 DM 사용이 불가합니다.",
};

const channelRoleMessages: Record<string, string> = {
  VIP:
    "이 채널을 VIP채널로 설정했어요.\n매도가 알림이 전송되며, 무료픽·VIP픽 모두 공개됩니다.",
  GENERAL:
    "이 채널을 일반채널로 설정했어요.\n매도가 알림은 전송되지 않습니다.",
  NOTICE:
    "이 채널을 공지채널로 설정했어요.\n매도가 알림이 전송되며, VIP픽은 비공개입니다.",
};

const NOTICE_GROUP_LINK = "https://t.me/+UJDTas0rW2s0MzY1";

// Minimal Telegram types for webhook payload
interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  new_chat_members?: TgUser[];
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  channel_post?: TgMessage;
}

function getUserId(msg: TgMessage): string | null {
  return msg.from ? String(msg.from.id) : null;
}

function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  if (ADMIN_ID_LIST.length === 0) return true;
  return ADMIN_ID_LIST.includes(userId);
}

function isPrivateChat(msg: TgMessage): boolean {
  return msg.chat.type === "private";
}

function isGroupChat(msg: TgMessage): boolean {
  return msg.chat.type === "group" || msg.chat.type === "supergroup";
}

function isChannelChat(msg: TgMessage): boolean {
  return msg.chat.type === "channel";
}

function detectMarket(symbol: string): "KR" | "US" {
  return /^\d+$/.test(symbol) ? "KR" : "US";
}

async function findTargetByInput(
  userId: string,
  input: string,
  selectColumns: string
) {
  if (!supabase) return { data: null, error: new Error("Supabase not initialized") };
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  const isNumeric = /^\d+$/.test(trimmed);
  let query = supabase.from("targets").select(selectColumns).eq("created_by", userId);
  if (isNumeric) {
    query = query.eq("symbol", upper);
  } else {
    query = query.or(`symbol.eq.${upper},name.eq.${trimmed}`);
  }
  return query.maybeSingle();
}

async function sendMessage(
  chatId: number,
  text: string,
  parseMode?: "HTML"
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (parseMode) body.parse_mode = parseMode;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 채널/그룹 전송 실패 시 DM으로 대체 전송 (채널 권한 부족 시 사용자에게 안내) */
async function sendMessageWithDmFallback(
  msg: TgMessage,
  text: string,
  parseMode?: "HTML"
): Promise<void> {
  const result = await trySendMessage(msg.chat.id, text, parseMode);
  if (result.ok) return;
  if (msg.from?.id && msg.chat.id !== msg.from.id) {
    const fallback = [
      text,
      "",
      "⚠️ 위 내용을 채널에 올리지 못했습니다.",
      result.error ? `(오류: ${result.error})` : null,
      "봇을 채널 관리자로 추가하고 'Post messages' 권한을 부여해주세요.",
    ]
      .filter(Boolean)
      .join("\n");
    await sendMessage(msg.from.id, fallback);
  } else {
    console.error("[setchannel] 채널 전송 실패, DM 불가:", result.error);
  }
}

/** 채널 포스트에서 발신자 정보가 없을 때, 관리자 목록에서 ADMIN_ID_LIST에 있는 사용자 조회 */
async function getChannelAdminUserId(chatId: number): Promise<string | null> {
  if (!TELEGRAM_BOT_TOKEN) return null;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChatAdministrators?chat_id=${chatId}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    ok: boolean;
    result?: Array<{ user: { id: number } }>;
  };
  if (!data.ok || !data.result?.length) return null;
  const adminIds = data.result.map((a) => String(a.user.id));
  if (ADMIN_ID_LIST.length === 0) return adminIds[0] ?? null;
  return adminIds.find((id) => ADMIN_ID_LIST.includes(id)) ?? null;
}

/** API 응답을 확인해 성공/실패를 반환 (권한 확인용) */
async function trySendMessage(
  chatId: number,
  text: string,
  parseMode?: "HTML"
): Promise<{ ok: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) return { ok: false, error: "봇 토큰 없음" };
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (parseMode) body.parse_mode = parseMode;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (data.ok) return { ok: true };
  return { ok: false, error: data.description ?? "알 수 없는 오류" };
}

async function handleStart(msg: TgMessage): Promise<void> {
  if (!isPrivateChat(msg)) {
    await sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }
  const userId = getUserId(msg);
  if (!isAdmin(userId)) return;
  await sendMessage(msg.chat.id, START_MESSAGE);
}

async function handleCommandList(msg: TgMessage): Promise<void> {
  if (!isPrivateChat(msg)) {
    await sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }
  const userId = getUserId(msg);
  if (!isAdmin(userId)) return;
  await sendMessage(msg.chat.id, COMMAND_LIST_MESSAGE);
}

async function handleSetGroup(msg: TgMessage): Promise<void> {
  if (!supabase) {
    await sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /setgroup 을 저장할 수 없습니다.");
    return;
  }
  if (!isGroupChat(msg)) {
    await sendMessage(
      msg.chat.id,
      "이 명령은 그룹 채팅에서만 사용할 수 있습니다. 알림을 받고 싶은 단체방에서 /setgroup 을 실행해주세요."
    );
    return;
  }
  const userId = getUserId(msg);
  if (!userId) return;
  if (!isAdmin(userId)) return;

  const text = (msg.text || "").trim();
  const match = text.match(/^\/setgroup(?:\s+(.+))?$/);
  const labelRaw = match && match[1] ? match[1].trim() : "";
  let role: "NOTICE" | "VIP" | "GENERAL" = "NOTICE";
  if (labelRaw === "VIP") role = "VIP";
  else if (labelRaw === "일반방") role = "GENERAL";

  const chatId = String(msg.chat.id);

  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { telegram_user_id: userId, default_group_chat_id: chatId },
      { onConflict: "telegram_user_id" }
    );

  if (error) {
    console.error(error);
    await sendMessage(msg.chat.id, "그룹 설정 중 오류가 발생했어요.");
    return;
  }

  try {
    const { error: groupError } = await supabase
      .from("alert_groups")
      .upsert(
        { created_by: userId, group_chat_id: chatId, role },
        { onConflict: "created_by,group_chat_id" }
      );
    if (groupError) console.error("alert_groups upsert 중 오류:", groupError);
  } catch (e) {
    console.error("alert_groups upsert 예외:", e);
  }

  await sendMessage(msg.chat.id, roleMessages[role]);
}

async function handleSetChannel(msg: TgMessage): Promise<void> {
  const reply = (text: string) => sendMessageWithDmFallback(msg, text);

  if (!supabase) {
    await reply("Supabase 설정이 되어 있지 않아 /setchannel 을 저장할 수 없습니다.");
    return;
  }
  if (!isChannelChat(msg)) {
    await reply(
      "이 명령은 채널에서만 사용할 수 있습니다.\n\n1. 봇을 채널 관리자로 추가 (Post messages 권한)\n2. 채널에 /setchannel 입력"
    );
    return;
  }
  let userId = getUserId(msg);
  if (!userId) {
    userId = await getChannelAdminUserId(msg.chat.id);
    if (!userId) {
      await reply(
        "채널 관리자 정보를 확인할 수 없어요.\nTELEGRAM_ADMIN_IDS에 본인 ID가 포함되어 있는지 확인해주세요. (또는 채널에서 메시지에 서명을 남기도록 설정해보세요.)"
      );
      return;
    }
  }
  if (!isAdmin(userId)) {
    await reply("채널 등록은 관리자만 할 수 있어요.");
    return;
  }

  const text = (msg.text || "").trim();
  const match = text.match(/^\/setchannel(?:\s+(.+))?$/);
  const labelRaw = match && match[1] ? match[1].trim() : "";
  let role: "NOTICE" | "VIP" | "GENERAL" = "NOTICE";
  if (labelRaw === "VIP") role = "VIP";
  else if (labelRaw === "일반방" || labelRaw === "일반") role = "GENERAL";
  else if (labelRaw === "공지방" || labelRaw === "공지") role = "NOTICE";

  const chatId = String(msg.chat.id);

  try {
    const { error } = await supabase
      .from("alert_groups")
      .upsert(
        { created_by: userId, group_chat_id: chatId, role },
        { onConflict: "created_by,group_chat_id" }
      );
    if (error) {
      console.error("alert_groups 채널 등록 오류:", error);
      await reply("채널 등록 중 오류가 발생했어요.");
      return;
    }
    await reply(channelRoleMessages[role]);
  } catch (e) {
    console.error("handleSetChannel 예외:", e);
    await reply("채널 등록 중 오류가 발생했어요.");
  }
}

async function handleRegister(msg: TgMessage): Promise<void> {
  if (!supabase) {
    await sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /add 를 처리할 수 없습니다.");
    return;
  }
  if (!isPrivateChat(msg)) {
    await sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }
  const userId = getUserId(msg);
  if (!userId) return;
  if (!isAdmin(userId)) {
    await sendMessage(msg.chat.id, "이 명령은 관리자만 사용할 수 있어요.");
    return;
  }

  const text = (msg.text || "").replace(/^\/(add|등록)\s+/, "").trim();
  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length < 5) {
    await sendMessage(
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

  let buyPriceRange: string | null = null;
  let tpStrings: string[] | undefined;
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
    await sendMessage(
      msg.chat.id,
      "매수가 범위 형식이 올바르지 않습니다.\n예) 110000~220000 또는 110000 ~ 220000"
    );
    return;
  }
  if (tpStrings === undefined) tpStrings = parts.slice(4);

  if (tpStrings.length === 0) {
    await sendMessage(
      msg.chat.id,
      "목표가는 1개 이상 입력해야 합니다.\n예) /등록 코길동 무료픽 현대차 005380 660000 675000"
    );
    return;
  }

  if (brand !== "코길동") {
    await sendMessage(
      msg.chat.id,
      "첫 번째 인자는 반드시 '코길동' 이어야 합니다.\n예) /등록 코길동 무료픽 현대차 005380 660000 675000"
    );
    return;
  }

  if (pickType !== "무료픽" && pickType !== "VIP픽") {
    await sendMessage(
      msg.chat.id,
      "두 번째 인자는 '무료픽' 또는 'VIP픽' 이어야 합니다.\n예) /등록 코길동 무료픽 현대차 005380 660000 675000"
    );
    return;
  }

  const tps = tpStrings.map((t) => Number(t.replace(/,/g, ""))).filter((n) => !Number.isNaN(n));
  if (tps.length === 0) {
    await sendMessage(
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
    await sendMessage(msg.chat.id, "사용자 설정을 불러오는 중 오류가 발생했어요.");
    return;
  }

  if (!userSettings || !userSettings.default_group_chat_id) {
    await sendMessage(
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
      name: nameInput ?? null,
      market,
      tps,
      next_level: 1,
      status: "ACTIVE",
      group_chat_id: userSettings.default_group_chat_id,
      pick_type: pickType,
      buy_price_range: buyPriceRange ?? null,
    },
    { onConflict: "created_by,symbol" }
  );

  if (error) {
    console.error("[targets upsert]", error);
    const hint = error.code === "42501" ? "\n(Supabase 대시보드 → Table Editor → 해당 테이블 → RLS 정책 확인)" : "";
    await sendMessage(msg.chat.id, `목표가를 저장하는 중 오류가 발생했어요.${hint}\n오류: ${error.message}`);
    return;
  }

  const tpText = tps.join(", ");
  let resultMsg = `종목 ${upperSymbol}의 목표가를 등록/갱신했습니다.\n`;
  if (buyPriceRange) resultMsg += `매수가: ${buyPriceRange}\n`;
  resultMsg += `목표가: ${tpText}\n시장: ${market}`;
  await sendMessage(msg.chat.id, resultMsg);
}

async function handleList(msg: TgMessage): Promise<void> {
  try {
    if (!supabase) {
      await sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /list 를 처리할 수 없습니다.");
      return;
    }

    const userId = getUserId(msg);
    if (isPrivateChat(msg) && !isAdmin(userId)) {
      await sendMessage(msg.chat.id, "이 명령은 DM에서 관리자만 사용할 수 있어요.");
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
      isVipHiddenRoom = groupRow?.role === "NOTICE" || groupRow?.role === "GENERAL";
    }

    const { data, error } = await client
      .from("targets")
      .select("symbol, name, market, tps, next_level, status, pick_type, buy_price_range")
      .eq("status", "ACTIVE")
      .order("symbol");

    if (error) {
      console.error("[목록] Supabase 오류:", error?.message ?? error);
      await sendMessage(
        msg.chat.id,
        "목록을 불러오는 중 오류가 발생했어요.\n(Supabase 연결·키·테이블 확인이 필요할 수 있어요. 서버 로그를 확인해 주세요.)"
      );
      return;
    }

    if (!data || data.length === 0) {
      await sendMessage(msg.chat.id, "진행 중인 길동픽이 없습니다.");
      return;
    }

    const isDm = isPrivateChat(msg);
    const isAdminDm = isDm && isAdmin(userId);

    const lines = data.map((row: Record<string, unknown>) => {
      const tpsArray = Array.isArray(row.tps) ? row.tps : [];
      const tpsText = tpsArray.length ? tpsArray.join(", ") : "(없음)";
      const nextIdx = (Number(row.next_level) || 1) - 1;
      const nextTp =
        nextIdx >= 0 && nextIdx < tpsArray.length ? String(tpsArray[nextIdx]) : "모든 목표가 도달";
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
      const buyPriceLine = row.buy_price_range ? `매수가: ${row.buy_price_range}` : null;
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
    await sendMessage(msg.chat.id, message, "HTML");
  } catch (err) {
    console.error("[목록] 예외:", err);
    await sendMessage(msg.chat.id, "목록을 불러오는 중 예기치 않은 오류가 발생했어요.");
  }
}

async function handleNoticeGroup(msg: TgMessage): Promise<void> {
  await sendMessage(
    msg.chat.id,
    `<a href="${NOTICE_GROUP_LINK}">공지방 입장하기</a>`,
    "HTML"
  );
}

async function requireDmAdmin(msg: TgMessage): Promise<string | null> {
  if (!isPrivateChat(msg)) {
    await sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return null;
  }
  const userId = getUserId(msg);
  if (!userId) return null;
  if (!isAdmin(userId)) {
    await sendMessage(msg.chat.id, "이 명령은 관리자만 사용할 수 있어요.");
    return null;
  }
  return userId;
}

async function handleEdit(msg: TgMessage): Promise<void> {
  const userId = await requireDmAdmin(msg);
  if (!userId || !supabase) return;
  const text = (msg.text || "").trim();
  const match = text.match(/^\/(edit|수정)\s+(.+)$/);
  const rest = match ? match[2] : "";
  const parts = rest.split(/\s+/).filter(Boolean);
  const symbol = parts[0];
  const tpStrings = parts.slice(1);
  if (!symbol || tpStrings.length === 0) {
    await sendMessage(msg.chat.id, "사용법: /edit 종목 tp1 tp2 ... 또는 /수정 종목 tp1 tp2 ...\n예) /edit AAPL 185 195 205");
    return;
  }
  const tps = tpStrings.map(Number).filter((n) => !Number.isNaN(n));
  if (tps.length === 0) {
    await sendMessage(msg.chat.id, "목표가는 숫자로 입력해야 합니다. 예) /edit AAPL 185 195 205 또는 /수정 AAPL 185 195 205");
    return;
  }
  const upperSymbol = symbol.toUpperCase();
  const { data: existing, error: fetchError } = await findTargetByInput(userId, upperSymbol, "id, tps, status");
  if (fetchError || !existing) {
    await sendMessage(msg.chat.id, existing ? "기존 종목 정보를 불러오는 중 오류가 발생했어요." : `해당 종목이 없습니다: ${upperSymbol}\n먼저 /add 명령으로 종목을 등록한 뒤 /edit 을 사용해주세요.`);
    return;
  }
  const newStatus = (existing as { status?: string }).status === "ACTIVE" ? "ACTIVE" : (existing as { status?: string }).status;
  const { error: updateError } = await supabase
    .from("targets")
    .update({ tps, next_level: 1, status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", (existing as { id: string }).id);
  if (updateError) {
    await sendMessage(msg.chat.id, "목표가를 수정하는 중 오류가 발생했어요.");
    return;
  }
  const oldTps = Array.isArray((existing as { tps?: unknown }).tps) ? (existing as { tps: number[] }).tps.join(", ") : "없음";
  await sendMessage(msg.chat.id, `종목 ${upperSymbol}의 목표가를 수정했습니다.\n기존: ${oldTps}\n변경: ${tps.join(", ")}\nnext_level 을 1로 초기화했습니다.`);
}

async function handleAppend(msg: TgMessage): Promise<void> {
  const userId = await requireDmAdmin(msg);
  if (!userId || !supabase) return;
  const text = (msg.text || "").trim();
  const match = text.match(/^\/(append|추가)\s+(.+)$/);
  const rest = match ? match[2] : "";
  const parts = rest.split(/\s+/).filter(Boolean);
  const symbol = parts[0];
  const tpStrings = parts.slice(1);
  if (!symbol || tpStrings.length === 0) {
    await sendMessage(msg.chat.id, "사용법: /append 종목 tpN tpN+1 ... 또는 /추가 종목 tpN tpN+1 ...\n예) /append AAPL 220 230");
    return;
  }
  const newTps = tpStrings.map(Number).filter((n) => !Number.isNaN(n));
  if (newTps.length === 0) {
    await sendMessage(msg.chat.id, "목표가는 숫자로 입력해야 합니다. 예) /append AAPL 220 230 또는 /추가 AAPL 220 230");
    return;
  }
  const upperSymbol = symbol.toUpperCase();
  const { data: existing, error: fetchError } = await findTargetByInput(userId, upperSymbol, "id, tps, next_level, status");
  if (fetchError || !existing) {
    await sendMessage(msg.chat.id, `해당 종목이 없습니다: ${upperSymbol}\n먼저 /add 명령으로 종목을 등록한 뒤 /append 를 사용해주세요.`);
    return;
  }
  const ex = existing as { tps?: unknown[]; status?: string; next_level?: number };
  const baseTps: number[] = Array.isArray(ex.tps) ? ex.tps.map((v) => Number(v)).filter((n) => !Number.isNaN(n)) : [];
  const combined = [...baseTps, ...newTps];
  let newStatus = ex.status;
  if (ex.status === "COMPLETED" && ex.next_level != null && ex.next_level >= 1 && ex.next_level <= combined.length) {
    newStatus = "ACTIVE";
  }
  const { error: updateError } = await supabase
    .from("targets")
    .update({ tps: combined, status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", (existing as { id: string }).id);
  if (updateError) {
    await sendMessage(msg.chat.id, "목표가를 추가하는 중 오류가 발생했어요.");
    return;
  }
  const statusMsg = ex.status === "COMPLETED" && newStatus === "ACTIVE"
    ? "기존에 COMPLETED 였던 종목을 다시 ACTIVE 로 전환했습니다."
    : `현재 next_level=${ex.next_level}, status=${newStatus} 는 그대로 유지됩니다.`;
  await sendMessage(msg.chat.id, [`종목 ${upperSymbol}의 목표가를 추가했습니다.`, `기존: ${baseTps.length ? baseTps.join(", ") : "(없음)"}`, `추가: ${newTps.join(", ")}`, `전체: ${combined.join(", ")}`, "", statusMsg].join("\n"));
}

async function handleStatus(msg: TgMessage): Promise<void> {
  const userId = await requireDmAdmin(msg);
  if (!userId || !supabase) return;
  const text = (msg.text || "").trim();
  const match = text.match(/^\/(status|상태)\s+(.+)$/);
  const symbolInput = match ? match[2].trim() : "";
  if (!symbolInput) {
    await sendMessage(msg.chat.id, "사용법: /status 종목 또는 /상태 종목\n예) /status AAPL");
    return;
  }
  const symbol = symbolInput.toUpperCase();
  const { data, error } = await findTargetByInput(userId, symbol, "symbol, name, market, tps, next_level, status");
  if (error || !data) {
    await sendMessage(msg.chat.id, data ? "상태를 불러오는 중 오류가 발생했어요." : `해당 종목이 없습니다: ${symbol}`);
    return;
  }
  const d = data as { symbol: string; name?: string; market: string; tps?: unknown[]; next_level?: number; status: string };
  const tps = Array.isArray(d.tps) ? d.tps : [];
  const tpsText = tps.length ? tps.join(", ") : "(없음)";
  const nextLevel = d.next_level ?? 1;
  const nextTp = Array.isArray(d.tps) && nextLevel >= 1 && nextLevel <= d.tps.length ? String(d.tps[nextLevel - 1]) : "모든 목표가 도달 또는 없음";
  await sendMessage(msg.chat.id, [`종목: ${d.symbol}${d.name ? " " + d.name : ""} (${d.market})`, `상태: ${d.status}`, `목표가들: ${tpsText}`, `다음 알림 단계: ${nextLevel}`, `다음 목표가: ${nextTp}`].join("\n"));
}

async function handleSetLevel(msg: TgMessage): Promise<void> {
  const userId = await requireDmAdmin(msg);
  if (!userId || !supabase) return;
  const text = (msg.text || "").trim();
  const match = text.match(/^\/(setlevel|목표)\s+(.+)$/);
  const rest = match ? match[2] : "";
  const parts = rest.split(/\s+/).filter(Boolean);
  const symbolInput = parts[0];
  const levelInput = parts[1];
  if (!symbolInput || !levelInput) {
    await sendMessage(msg.chat.id, "사용법: /setlevel 종목 레벨 또는 /목표 종목 레벨\n예) /setlevel 005380 2");
    return;
  }
  const symbol = symbolInput.toUpperCase();
  const level = Number(levelInput);
  if (!Number.isInteger(level) || level < 1) {
    await sendMessage(msg.chat.id, "레벨은 1 이상의 정수로 입력해야 합니다.\n예) /setlevel 005380 2");
    return;
  }
  const { data, error } = await findTargetByInput(userId, symbol, "id, tps, next_level");
  if (error || !data) {
    await sendMessage(msg.chat.id, data ? "종목 정보를 불러오는 중 오류가 발생했어요." : `해당 종목이 없습니다: ${symbol}\n먼저 /등록 으로 종목을 등록해 주세요.`);
    return;
  }
  const d = data as { id: string; tps?: unknown[]; next_level?: number };
  const tps = Array.isArray(d.tps) ? d.tps : [];
  if (tps.length === 0) {
    await sendMessage(msg.chat.id, "해당 종목에는 아직 목표가가 없습니다. 먼저 /등록 으로 목표가를 입력해 주세요.");
    return;
  }
  const clampedLevel = level > tps.length + 1 ? tps.length + 1 : level;
  const { error: updateError } = await supabase.from("targets").update({ next_level: clampedLevel, updated_at: new Date().toISOString() }).eq("id", d.id);
  if (updateError) {
    await sendMessage(msg.chat.id, "레벨을 변경하는 중 오류가 발생했어요.");
    return;
  }
  const nextIdx = clampedLevel - 1;
  const nextTp = nextIdx >= 0 && nextIdx < tps.length ? String(tps[nextIdx]) : "모든 목표가 도달 또는 없음";
  await sendMessage(msg.chat.id, `종목 ${symbol} 의 다음 알림 단계를 ${clampedLevel}차로 변경했습니다.\n다음 목표가: ${nextTp}`);
}

async function handleClose(msg: TgMessage): Promise<void> {
  const userId = await requireDmAdmin(msg);
  if (!userId || !supabase) return;
  const text = (msg.text || "").trim();
  const match = text.match(/^\/(close|종료)\s+(.+)$/);
  const symbolInput = match ? match[2].trim() : "";
  if (!symbolInput) {
    await sendMessage(msg.chat.id, "사용법: /close 종목 또는 /종료 종목\n예) /close AAPL");
    return;
  }
  const symbol = symbolInput.toUpperCase();
  const { data, error } = await findTargetByInput(userId, symbol, "id, symbol, status");
  if (error || !data) {
    await sendMessage(msg.chat.id, `종목이 없거나 이미 CLOSED 상태입니다: ${symbol}\n먼저 /add 로 등록했는지 확인해주세요.`);
    return;
  }
  const row = data as { id: string; status?: string };
  if (row.status === "CLOSED") {
    await sendMessage(msg.chat.id, `종목 ${symbol} 은(는) 이미 CLOSED 상태입니다.`);
    return;
  }
  const { error: updateError } = await supabase.from("targets").update({ status: "CLOSED", updated_at: new Date().toISOString() }).eq("id", row.id);
  if (updateError) {
    await sendMessage(msg.chat.id, "종목을 종료하는 중 오류가 발생했어요.");
    return;
  }
  await sendMessage(msg.chat.id, `종목 ${symbol} 을(를) CLOSED 상태로 변경했습니다.\n향후 알림이 중단됩니다.`);
}

async function handleOpen(msg: TgMessage): Promise<void> {
  const userId = await requireDmAdmin(msg);
  if (!userId || !supabase) return;
  const text = (msg.text || "").trim();
  const match = text.match(/^\/(open|재개)\s+(.+)$/);
  const symbolInput = match ? match[2].trim() : "";
  if (!symbolInput) {
    await sendMessage(msg.chat.id, "사용법: /open 종목 또는 /재개 종목\n예) /open AAPL");
    return;
  }
  const symbol = symbolInput.toUpperCase();
  const { data, error } = await findTargetByInput(userId, symbol, "id, symbol, status, next_level");
  if (error || !data) {
    await sendMessage(msg.chat.id, `CLOSED 상태인 종목이 없거나 찾을 수 없습니다: ${symbol}\n먼저 /close 로 종료한 종목인지 확인해주세요.`);
    return;
  }
  const d = data as { id: string; status?: string; next_level?: number };
  if (d.status !== "CLOSED") {
    await sendMessage(msg.chat.id, `CLOSED 상태인 종목이 없거나 찾을 수 없습니다: ${symbol}\n먼저 /close 로 종료한 종목인지 확인해주세요.`);
    return;
  }
  const { error: updateError } = await supabase.from("targets").update({ status: "ACTIVE", updated_at: new Date().toISOString() }).eq("id", d.id);
  if (updateError) {
    await sendMessage(msg.chat.id, "종목을 다시 활성화하는 중 오류가 발생했어요.");
    return;
  }
  await sendMessage(msg.chat.id, `종목 ${symbol} 을(를) 다시 ACTIVE 상태로 변경했습니다.\nnext_level=${d.next_level} 부터 알림이 재개됩니다.`);
}

async function handleDelete(msg: TgMessage): Promise<void> {
  const userId = await requireDmAdmin(msg);
  if (!userId || !supabase) return;
  const text = (msg.text || "").trim();
  const match = text.match(/^\/(delete|삭제)\s+(.+)$/);
  const symbolInput = match ? match[2].trim() : "";
  if (!symbolInput) {
    await sendMessage(msg.chat.id, "사용법: /delete 종목 또는 /삭제 종목\n예) /delete AAPL");
    return;
  }
  const symbol = symbolInput.toUpperCase();
  const { data, error } = await findTargetByInput(userId, symbol, "id, symbol");
  if (error || !data) {
    await sendMessage(msg.chat.id, `해당 종목을 찾을 수 없습니다: ${symbol}\n먼저 /add 로 등록했는지 확인해주세요.`);
    return;
  }
  const { error: deleteError } = await supabase.from("targets").delete().eq("id", (data as { id: string }).id);
  if (deleteError) {
    await sendMessage(msg.chat.id, "종목을 삭제하는 중 오류가 발생했어요.");
    return;
  }
  await sendMessage(msg.chat.id, `종목 ${symbol} 을(를) 목록에서 삭제했습니다.\n더 이상 이 종목에 대해서는 알림이 발생하지 않습니다.`);
}

async function handleHealth(msg: TgMessage): Promise<void> {
  const userId = await requireDmAdmin(msg);
  if (!userId) return;
  const lines: string[] = ["✅ 봇 상태 점검 결과"];
  if (!supabase) {
    lines.push("- Supabase: ❌ 설정되지 않음");
  } else {
    try {
      const { error } = await supabase.from("targets").select("id").limit(1);
      lines.push(error ? `- Supabase: ⚠️ 오류 발생 (${error.message})` : "- Supabase: ✅ 연결 정상");
    } catch (e: unknown) {
      lines.push(`- Supabase: ⚠️ 예외 발생 (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  lines.push("- Bot 버전: 1.0.0 (Vercel 웹훅)");
  lines.push(`- 서버 시각: ${new Date().toISOString()}`);
  await sendMessage(msg.chat.id, lines.join("\n"));
}

async function handleCheckPerms(msg: TgMessage): Promise<void> {
  if (isGroupChat(msg)) {
    if (!isAdmin(getUserId(msg))) return;
  } else if (isChannelChat(msg)) {
    const uid = getUserId(msg) ?? (await getChannelAdminUserId(msg.chat.id));
    if (!uid || !isAdmin(uid)) return;
  }

  const chatType = msg.chat.type;
  const isChannel = chatType === "channel";
  const placeName = isChannel ? "채널" : "채팅방";

  const result = await trySendMessage(msg.chat.id, `✅ 이 ${placeName}에 메시지를 보낼 권한이 있습니다.`);
  if (result.ok) return;

  const errorMsg = [
    `❌ 이 ${placeName}에 메시지를 보낼 권한이 없습니다.`,
    "",
    "봇을 관리자로 추가하고 'Post messages' 권한을 부여해주세요.",
    result.error ? `(오류: ${result.error})` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (msg.from?.id && msg.chat.id !== msg.from.id) {
    const dmResult = await trySendMessage(msg.from.id, errorMsg);
    if (!dmResult.ok) {
      console.error("[checkperms] DM 전송 실패:", dmResult.error);
    }
  } else {
    console.error("[checkperms] 권한 없음, DM 전달 불가:", result.error);
  }
}

async function handleNewChatMembers(msg: TgMessage): Promise<void> {
  if (!isGroupChat(msg) || !msg.new_chat_members?.length || !supabase) return;

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
  if (role !== "GENERAL") return;

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
      "• 종목 추천은 운영자 '코길동'만 진행합니다",
      "• 타인을 향한 비방 및 욕설은 엄격히 금지됩니다",
      "• 광고, 홍보 시 안내 없이 강퇴 됩니다",
      "",
      "현재 매매 진행 중인 코길동 픽이 궁금하시면",
      "👉 /목록 을 입력해 주세요!",
      "",
      "코길동 픽을 더 빠르게 확인하고 싶다면",
      `<a href="${NOTICE_GROUP_LINK}">공지방 입장하기</a>`,
    ].join("\n");

    await sendMessage(msg.chat.id, text, "HTML");
  }
}

async function processUpdate(update: TgUpdate): Promise<void> {
  const msg = update.message ?? update.channel_post;
  if (!msg) return;

  if (msg.new_chat_members?.length) {
    await handleNewChatMembers(msg);
    return;
  }

  const text = (msg.text || "").trim();

  if (/^\/start$/.test(text)) {
    await handleStart(msg);
    return;
  }
  if (/^\/명령어$/.test(text)) {
    await handleCommandList(msg);
    return;
  }
  if (/^\/setgroup(?:\s|$)/.test(text)) {
    await handleSetGroup(msg);
    return;
  }
  if (/^\/setchannel(?:\s|$)/.test(text)) {
    await handleSetChannel(msg);
    return;
  }
  if (/^\/(add|등록)\s+/.test(text)) {
    await handleRegister(msg);
    return;
  }
  if (/^\/(list|목록)$/.test(text)) {
    await handleList(msg);
    return;
  }
  if (/^\/공지방$/.test(text)) {
    await handleNoticeGroup(msg);
    return;
  }
  if (/^\/(edit|수정)\s+/.test(text)) {
    await handleEdit(msg);
    return;
  }
  if (/^\/(append|추가)\s+/.test(text)) {
    await handleAppend(msg);
    return;
  }
  if (/^\/(status|상태)\s+/.test(text)) {
    await handleStatus(msg);
    return;
  }
  if (/^\/(setlevel|목표)\s+/.test(text)) {
    await handleSetLevel(msg);
    return;
  }
  if (/^\/(close|종료)\s+/.test(text)) {
    await handleClose(msg);
    return;
  }
  if (/^\/(open|재개)\s+/.test(text)) {
    await handleOpen(msg);
    return;
  }
  if (/^\/(delete|삭제)\s+/.test(text)) {
    await handleDelete(msg);
    return;
  }
  if (/^\/health$/.test(text)) {
    await handleHealth(msg);
    return;
  }
  if (/^\/(권한확인|checkperms)$/.test(text)) {
    await handleCheckPerms(msg);
    return;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  const update = req.body as TgUpdate;
  if (!update || typeof update.update_id !== "number") {
    res.status(400).json({ ok: false, error: "Invalid update payload" });
    return;
  }

  // Process update before returning (Telegram expects 200 within 60s)
  try {
    await processUpdate(update);
  } catch (err) {
    console.error("[telegram-webhook] processUpdate error:", err);
  }
  res.status(200).json({ ok: true });
}
