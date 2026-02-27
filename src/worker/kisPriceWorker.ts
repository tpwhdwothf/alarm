/**
 * KIS 통합 시세 워커 — 국장(KR) + 미장(US) 모두 한국투자증권 OpenAPI 하나로 조회
 * REST 현재가 API 폴링으로 목표가 도달 시 priceRouter.onPrice 호출
 */

import * as dotenv from "dotenv";
import { supabase } from "../lib/supabaseClient";
import { onPrice } from "./priceRouter";

dotenv.config();

const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;
const KIS_ACCOUNT_NO = process.env.KIS_ACCOUNT_NO;
const KIS_REAL = process.env.KIS_REAL !== "false";

const POLL_INTERVAL_MS = 5_000;
const TOKEN_REFRESH_BEFORE_MS = 60 * 60 * 1000;

const BASE_URL_REAL = "https://openapi.koreainvestment.com:9443";
const BASE_URL_VIRTUAL = "https://openapivts.koreainvestment.com:29443";

const DOMESTIC_TR_ID = "FHKST01010100";
const OVERSEAS_TR_ID = "HHDFS76200100";

type Market = "KR" | "US";

let accessToken: string | null = null;
let tokenExpiresAt = 0;

function getBaseUrl(): string {
  return KIS_REAL ? BASE_URL_REAL : BASE_URL_VIRTUAL;
}

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt - TOKEN_REFRESH_BEFORE_MS) {
    return accessToken;
  }
  const base = getBaseUrl();
  const res = await fetch(`${base}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KIS token failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    access_token_token_expired: string;
  };
  accessToken = json.access_token;
  const expired = json.access_token_token_expired;
  tokenExpiresAt = expired ? new Date(expired).getTime() : Date.now() + 24 * 60 * 60 * 1000;
  console.log("[KIS] 토큰 갱신 완료.");
  return accessToken;
}

async function fetchDomesticPrice(symbol: string): Promise<number | null> {
  const token = await getAccessToken();
  const base = getBaseUrl();
  const url = new URL(`${base}/uapi/domestic-stock/v1/quotations/inquire-price`);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", symbol);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
      appkey: KIS_APP_KEY!,
      appsecret: KIS_APP_SECRET!,
      tr_id: DOMESTIC_TR_ID,
      custtype: "P",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { rt_cd?: string; output?: { stck_prpr?: string } };
  if (data.rt_cd !== "0" || !data.output?.stck_prpr) return null;
  const price = Number(data.output.stck_prpr.replace(/,/g, ""));
  return Number.isNaN(price) ? null : price;
}

function getUsExchangeCode(symbol: string): string {
  return "NAS";
}

async function fetchOverseasPrice(symbol: string): Promise<number | null> {
  const token = await getAccessToken();
  const base = getBaseUrl();
  const url = new URL(`${base}/uapi/overseas-price/v1/quotations/inquire-asking-price`);
  url.searchParams.set("EXCD", getUsExchangeCode(symbol));
  url.searchParams.set("SYMB", symbol);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
      appkey: KIS_APP_KEY!,
      appsecret: KIS_APP_SECRET!,
      tr_id: OVERSEAS_TR_ID,
      custtype: "P",
    },
  });

  const data = (await res.json()) as {
    rt_cd?: string;
    msg_cd?: string;
    msg1?: string;
    output1?: { last?: string; [k: string]: unknown } | Array<{ last?: string; [k: string]: unknown }>;
    output2?: unknown;
    output3?: unknown;
  };

  if (!res.ok) {
    console.warn("[KIS] 해외 시세 API HTTP", res.status, symbol, JSON.stringify(data).slice(0, 200));
    return null;
  }
  if (data.rt_cd !== "0") {
    console.warn("[KIS] 해외 시세 API 응답 오류", symbol, data.msg_cd, data.msg1);
    return null;
  }
  const out1 = data.output1;
  if (!out1) {
    console.warn("[KIS] 해외 시세 output1 없음", symbol, "keys:", data ? Object.keys(data) : []);
    return null;
  }
  const row = Array.isArray(out1) ? out1[0] : out1;
  const lastStr = row?.last;
  if (lastStr == null) {
    console.warn("[KIS] 해외 시세 last 없음", symbol, "output1 샘플:", JSON.stringify(row).slice(0, 150));
    return null;
  }
  const price = Number(String(lastStr).replace(/,/g, ""));
  if (Number.isNaN(price)) {
    console.warn("[KIS] 해외 시세 last 숫자 아님", symbol, lastStr);
    return null;
  }
  return price;
}

async function getActiveTargetsByMarket(): Promise<{ KR: string[]; US: string[] }> {
  const { data, error } = await supabase
    .from("targets")
    .select("symbol, market")
    .eq("status", "ACTIVE");

  if (error || !data) return { KR: [], US: [] };

  const kr = [...new Set((data as { symbol: string; market: string }[]).filter((r) => r.market === "KR").map((r) => r.symbol))];
  const us = [...new Set((data as { symbol: string; market: string }[]).filter((r) => r.market === "US").map((r) => r.symbol.toUpperCase()))];
  return { KR: kr, US: us };
}

const RATE_LIMIT_DELAY_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollPrices(): Promise<void> {
  const { KR, US } = await getActiveTargetsByMarket();
  for (const symbol of KR) {
    try {
      const price = await fetchDomesticPrice(symbol);
      if (price != null) {
        onPrice(symbol, "KR", price);
      } else {
        console.warn("[KIS] 국내 시세 없음:", symbol);
      }
    } catch (e) {
      console.error("[KIS] 국내", symbol, e);
    }
    await delay(RATE_LIMIT_DELAY_MS);
  }
  for (const symbol of US) {
    try {
      const price = await fetchOverseasPrice(symbol);
      if (price != null) {
        onPrice(symbol, "US", price);
      } else {
        console.warn("[KIS] 해외 시세 없음:", symbol);
      }
    } catch (e) {
      console.error("[KIS] 해외", symbol, e);
    }
    await delay(RATE_LIMIT_DELAY_MS);
  }
}

function run(): void {
  if (!KIS_APP_KEY || !KIS_APP_SECRET) {
    throw new Error("환경변수 KIS_APP_KEY, KIS_APP_SECRET 이 필요합니다.");
  }
  if (!supabase) {
    throw new Error("Supabase 설정이 없어 KIS Price Worker 를 시작할 수 없습니다.");
  }

  console.log("[KIS] 통합 시세 워커 시작 (국장 + 미장). 환경:", KIS_REAL ? "실전" : "모의");
  if (KIS_ACCOUNT_NO) console.log("[KIS] 계좌번호 설정됨 (주문/WebSocket 확장 시 사용).");

  setInterval(() => {
    pollPrices().catch((e) => console.error("[KIS] poll error:", e));
  }, POLL_INTERVAL_MS);

  pollPrices().catch((e) => console.error("[KIS] initial poll error:", e));
}

run();
