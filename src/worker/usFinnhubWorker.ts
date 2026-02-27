import * as dotenv from "dotenv";
import WebSocket from "ws";
import { supabase } from "../lib/supabaseClient";
import { onPrice } from "./priceRouter";

dotenv.config();

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const RECONNECT_DELAY_MS = 3_000;
const REFRESH_SYMBOLS_INTERVAL_MS = 60_000;

if (!FINNHUB_API_KEY) {
  throw new Error("환경변수 FINNHUB_API_KEY 가 필요합니다.");
}

if (!supabase) {
  throw new Error("Supabase 설정이 없어 US Price Worker 를 시작할 수 없습니다.");
}

const WS_URL = `wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`;
let ws: WebSocket | null = null;
let subscribedSymbols = new Set<string>();
let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function getActiveUsSymbols(): Promise<string[]> {
  const { data, error } = await supabase
    .from("targets")
    .select("symbol")
    .eq("market", "US")
    .eq("status", "ACTIVE");

  if (error || !data) return [];
  const symbols = [...new Set((data as { symbol: string }[]).map((r) => r.symbol.toUpperCase()))];
  return symbols;
}

function connect() {
  if (ws?.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    console.log("[Finnhub] WebSocket 연결됨.");
    subscribedSymbols.forEach((sym) => {
      ws?.send(JSON.stringify({ type: "subscribe", symbol: sym }));
    });
  });

  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        type?: string;
        data?: Array<{ p?: number; s?: string; pc?: number }>;
      };
      if (msg.type === "ping") return;
      if (msg.type === "trade" && Array.isArray(msg.data)) {
        for (const t of msg.data) {
          const price = t.p ?? t.pc;
          const symbol = t.s;
          if (symbol != null && typeof price === "number") {
            onPrice(symbol, "US", price).catch((e) =>
              console.error("[Finnhub] onPrice error:", e)
            );
          }
        }
        return;
      }
      if (msg.data && Array.isArray(msg.data)) {
        for (const t of msg.data) {
          const price = (t as { p?: number }).p ?? (t as { pc?: number }).pc;
          const symbol = (t as { s?: string }).s;
          if (symbol != null && typeof price === "number") {
            onPrice(symbol, "US", price).catch((e) =>
              console.error("[Finnhub] onPrice error:", e)
            );
          }
        }
      }
    } catch (_) {
      // ignore parse errors
    }
  });

  ws.on("close", () => {
    ws = null;
    console.log("[Finnhub] 연결 종료. 재연결 시도:", RECONNECT_DELAY_MS, "ms 후");
    setTimeout(connect, RECONNECT_DELAY_MS);
  });

  ws.on("error", (err) => {
    console.error("[Finnhub] WebSocket error:", err.message);
  });
}

async function refreshSubscriptions() {
  const symbols = await getActiveUsSymbols();
  const newSet = new Set(symbols);
  const toAdd = symbols.filter((s) => !subscribedSymbols.has(s));
  const toRemove = [...subscribedSymbols].filter((s) => !newSet.has(s));

  if (ws?.readyState === WebSocket.OPEN) {
    toRemove.forEach((sym) => {
      ws?.send(JSON.stringify({ type: "unsubscribe", symbol: sym }));
    });
    toAdd.forEach((sym) => {
      ws?.send(JSON.stringify({ type: "subscribe", symbol: sym }));
    });
  }

  subscribedSymbols = newSet;
}

async function start() {
  const symbols = await getActiveUsSymbols();
  symbols.forEach((s) => subscribedSymbols.add(s));
  connect();

  refreshTimer = setInterval(() => {
    refreshSubscriptions().catch((e) => console.error("[Finnhub] refresh error:", e));
  }, REFRESH_SYMBOLS_INTERVAL_MS);
}

console.log("US Price Worker (Finnhub) 시작. 미장 ACTIVE 종목을 구독합니다.");
start();
