import * as dotenv from "dotenv";
import TelegramBot = require("node-telegram-bot-api");
import { supabase } from "../lib/supabaseClient";

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
  "━━━ DM에서만 사용 ━━━",
  "/start 또는 /시작 : 봇 소개",
  "/명령어 : 사용 가능한 명령어 목록 (지금 이 메시지)",
  "/add 또는 /등록 종목 tp1 tp2 ... : 목표가 등록·갱신",
  "/edit 또는 /수정 종목 tp1 tp2 ... : 목표가 수정",
  "/append 또는 /추가 종목 tpN tpN+1 ... : 목표가 뒤에 추가",
  "/status 또는 /상태 종목 : 해당 종목 상태 확인",
  "/close 또는 /종료 종목 : 매매 종료 (알림 중단)",
  "/open 또는 /재개 종목 : 다시 활성화",
  "/delete 또는 /삭제 종목 : 목록에서 삭제",
  "/health : 시스템 상태 간단 확인",
  "",
  "━━━ 그룹에서만 사용 ━━━",
  "/setgroup : 이 채팅방을 알림 그룹으로 등록",
  "",
  "━━━ DM·그룹 모두 사용 ━━━",
  "/list 또는 /목록 : 진행 중인 길동픽 목록 보기",
  "",
  "예) /등록 AAPL 180 190 200",
].join("\n");

function getUserId(msg: TelegramBot.Message): string | null {
  if (!msg.from) return null;
  return String(msg.from.id);
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

bot.onText(/^\/start$/, (msg) => {
  if (!isPrivateChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, START_MESSAGE);
});

bot.onText(/^\/명령어$/, (msg) => {
  if (!isPrivateChat(msg)) {
    bot.sendMessage(msg.chat.id, "이 명령은 봇과의 1:1 대화(DM)에서만 사용할 수 있습니다.");
    return;
  }
  bot.sendMessage(msg.chat.id, COMMAND_LIST_MESSAGE);
});

bot.onText(/^\/setgroup$/, async (msg) => {
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

  bot.sendMessage(
    msg.chat.id,
    "이 채팅방을 기본 알림 그룹으로 설정했어요.\n이제 DM에서 /add 명령으로 종목을 등록하면 이 방으로 알림이 전송됩니다."
  );
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

  const text = match && match[2] ? match[2] : "";
  const parts = text.split(/\s+/).filter(Boolean);
  const rawSymbol = parts[0];
  const maybeNameOrTp = parts[1];
  const rest = parts.slice(2);

  if (!rawSymbol || !maybeNameOrTp) {
    bot.sendMessage(
      msg.chat.id,
      "사용법: /add 종목 tp1 tp2 ... 또는 /등록 종목 tp1 tp2 ...\n예) /add AAPL 180 190 200"
    );
    return;
  }

  let name: string | null = null;
  let tpStrings: string[] = [];

  const firstNumber = Number(maybeNameOrTp.replace(/,/g, ""));
  if (!Number.isNaN(firstNumber)) {
    tpStrings = [maybeNameOrTp, ...rest];
  } else {
    name = maybeNameOrTp;
    tpStrings = rest;
  }

  if (tpStrings.length === 0) {
    bot.sendMessage(
      msg.chat.id,
      "사용법: /add 종목 [종목명] tp1 tp2 ...\n예) /add AAPL 180 190 200 또는 /등록 005930 삼성전자 70000 72000"
    );
    return;
  }

  const tps = tpStrings
    .map((t) => Number(t.replace(/,/g, "")))
    .filter((n) => !Number.isNaN(n));
  if (tps.length === 0) {
    bot.sendMessage(
      msg.chat.id,
      "목표가는 숫자로 입력해야 합니다. 예) /add AAPL 180 190 200 또는 /등록 AAPL 180 190 200"
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
  bot.sendMessage(
    msg.chat.id,
    `종목 ${upperSymbol}의 목표가를 등록/갱신했습니다.\n목표가: ${tpText}\n시장: ${market}`
  );
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

  const { data: existing, error: fetchError } = await supabase
    .from("targets")
    .select("id, tps, status")
    .eq("created_by", userId)
    .eq("symbol", upperSymbol)
    .maybeSingle();

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

  const { data: existing, error: fetchError } = await supabase
    .from("targets")
    .select("id, tps, next_level, status")
    .eq("created_by", userId)
    .eq("symbol", upperSymbol)
    .maybeSingle();

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
  if (!supabase) {
    bot.sendMessage(msg.chat.id, "Supabase 설정이 되어 있지 않아 /list 를 처리할 수 없습니다.");
    return;
  }

  const { data, error } = await supabase
    .from("targets")
    .select("symbol, name, market, tps, next_level, status")
    .order("symbol");

  if (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "목록을 불러오는 중 오류가 발생했어요.");
    return;
  }

  if (!data || data.length === 0) {
    bot.sendMessage(msg.chat.id, "진행 중인 길동픽이 없습니다.");
    return;
  }

  const lines = data.map((row: any) => {
    const tpsArray = Array.isArray(row.tps) ? row.tps : [];
    const tpsText = tpsArray.length ? tpsArray.join(", ") : "(없음)";

    const nextIdx = row.next_level - 1;
    const nextTp =
      nextIdx >= 0 && nextIdx < tpsArray.length
        ? String(tpsArray[nextIdx])
        : "모든 목표가 도달";

    const marketLabel = row.market === "US" ? "미장" : row.market === "KR" ? "국장" : row.market;
    const displayName = row.name || row.symbol;

    return `- ${displayName}(${row.symbol}) ${marketLabel}\n  목표가: ${tpsText}\n  다음 목표가: ${nextTp}`;
  });

  const message = ["현재 진행 중인 길동픽 목록", "", ...lines].join("\n");
  bot.sendMessage(msg.chat.id, message);
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

  const symbolInput = match && match[2] ? match[2].trim() : "";
  if (!symbolInput) {
    bot.sendMessage(
      msg.chat.id,
      "사용법: /status 종목 또는 /상태 종목\n예) /status AAPL"
    );
    return;
  }

  const symbol = symbolInput.toUpperCase();

  const { data, error } = await supabase
    .from("targets")
    .select("symbol, name, market, tps, next_level, status")
    .eq("created_by", userId)
    .eq("symbol", symbol)
    .maybeSingle();

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

  const symbolInput = match && match[2] ? match[2].trim() : "";
  if (!symbolInput) {
    bot.sendMessage(
      msg.chat.id,
      "사용법: /close 종목 또는 /종료 종목\n예) /close AAPL"
    );
    return;
  }

  const symbol = symbolInput.toUpperCase();

  const { data, error } = await supabase
    .from("targets")
    .update({ status: "CLOSED", updated_at: new Date().toISOString() })
    .eq("created_by", userId)
    .eq("symbol", symbol)
    .neq("status", "CLOSED")
    .select("symbol, status")
    .maybeSingle();

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

  const symbolInput = match && match[2] ? match[2].trim() : "";
  if (!symbolInput) {
    bot.sendMessage(
      msg.chat.id,
      "사용법: /open 종목 또는 /재개 종목\n예) /open AAPL"
    );
    return;
  }

  const symbol = symbolInput.toUpperCase();

  const { data, error } = await supabase
    .from("targets")
    .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
    .eq("created_by", userId)
    .eq("symbol", symbol)
    .eq("status", "CLOSED")
    .select("symbol, status, next_level")
    .maybeSingle();

  if (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "종목을 다시 활성화하는 중 오류가 발생했어요.");
    return;
  }

  if (!data) {
    bot.sendMessage(
      msg.chat.id,
      `CLOSED 상태인 종목이 없거나 찾을 수 없습니다: ${symbol}\n먼저 /close 로 종료한 종목인지 확인해주세요.`
    );
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

  const symbolInput = match && match[2] ? match[2].trim() : "";
  if (!symbolInput) {
    bot.sendMessage(
      msg.chat.id,
      "사용법: /delete 종목 또는 /삭제 종목\n예) /delete AAPL"
    );
    return;
  }

  const symbol = symbolInput.toUpperCase();

  const { error } = await supabase
    .from("targets")
    .delete()
    .eq("created_by", userId)
    .eq("symbol", symbol);

  if (error) {
    console.error(error);
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

  const { data, error } = await supabase
    .from("user_settings")
    .select("id")
    .eq("default_group_chat_id", chatId)
    .maybeSingle();

  if (error) {
    console.error("user_settings 조회 중 오류:", error);
    return;
  }

  if (data) {
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
    ].join("\n");

    bot.sendMessage(msg.chat.id, text, { parse_mode: "HTML" });
  }
});

console.log("Telegram 봇이 시작되었습니다.");

