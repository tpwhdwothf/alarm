"use strict";
/**
 * KIS 통합 시세 워커 — 국장(KR) + 미장(US) 모두 한국투자증권 OpenAPI 하나로 조회
 * REST 현재가 API 폴링으로 목표가 도달 시 priceRouter.onPrice 호출
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const supabaseClient_1 = require("../lib/supabaseClient");
const priceRouter_1 = require("./priceRouter");
dotenv.config();
const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;
const KIS_ACCOUNT_NO = process.env.KIS_ACCOUNT_NO;
const KIS_REAL = process.env.KIS_REAL !== "false";
const POLL_INTERVAL_MS = 5000;
const TOKEN_REFRESH_BEFORE_MS = 60 * 60 * 1000;
const BASE_URL_REAL = "https://openapi.koreainvestment.com:9443";
const BASE_URL_VIRTUAL = "https://openapivts.koreainvestment.com:29443";
const DOMESTIC_TR_ID = "FHKST01010100";
const OVERSEAS_TR_ID = "HHDFS76200100";
let accessToken = null;
let tokenExpiresAt = 0;
function getBaseUrl() {
    return KIS_REAL ? BASE_URL_REAL : BASE_URL_VIRTUAL;
}
async function getAccessToken() {
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
    const json = (await res.json());
    accessToken = json.access_token;
    const expired = json.access_token_token_expired;
    tokenExpiresAt = expired ? new Date(expired).getTime() : Date.now() + 24 * 60 * 60 * 1000;
    console.log("[KIS] 토큰 갱신 완료.");
    return accessToken;
}
async function fetchDomesticPrice(symbol) {
    var _a;
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
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET,
            tr_id: DOMESTIC_TR_ID,
            custtype: "P",
        },
    });
    if (!res.ok)
        return null;
    const data = (await res.json());
    if (data.rt_cd !== "0" || !((_a = data.output) === null || _a === void 0 ? void 0 : _a.stck_prpr))
        return null;
    const price = Number(data.output.stck_prpr.replace(/,/g, ""));
    return Number.isNaN(price) ? null : price;
}
/** KIS 해외주식 API 거래소 코드: NAS=NASDAQ, NYS=NYSE, AMS=AMEX */
const US_EXCHANGES = ["NAS", "NYS", "AMS"];
async function fetchOverseasPrice(symbol) {
    const token = await getAccessToken();
    const base = getBaseUrl();
    for (const excd of US_EXCHANGES) {
        const url = new URL(`${base}/uapi/overseas-price/v1/quotations/inquire-asking-price`);
        url.searchParams.set("EXCD", excd);
        url.searchParams.set("SYMB", symbol);
        const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                authorization: `Bearer ${token}`,
                appkey: KIS_APP_KEY,
                appsecret: KIS_APP_SECRET,
                tr_id: OVERSEAS_TR_ID,
                custtype: "P",
            },
        });
        const data = (await res.json());
        if (!res.ok || data.rt_cd !== "0") {
            await delay(RATE_LIMIT_DELAY_MS);
            continue;
        }
        const out1 = data.output1;
        if (!out1) {
            await delay(RATE_LIMIT_DELAY_MS);
            continue;
        }
        const row = Array.isArray(out1) ? out1[0] : out1;
        const lastStr = row === null || row === void 0 ? void 0 : row.last;
        if (lastStr == null) {
            await delay(RATE_LIMIT_DELAY_MS);
            continue;
        }
        const price = Number(String(lastStr).replace(/,/g, ""));
        if (!Number.isNaN(price))
            return price;
        await delay(RATE_LIMIT_DELAY_MS);
    }
    console.warn("[KIS] 해외 시세 조회 실패 (NAS/NYS/AMS 모두 시도)", symbol);
    return null;
}
async function getActiveTargetsByMarket() {
    const { data, error } = await supabaseClient_1.supabase
        .from("targets")
        .select("symbol, market")
        .eq("status", "ACTIVE");
    if (error || !data)
        return { KR: [], US: [] };
    const kr = [...new Set(data.filter((r) => r.market === "KR").map((r) => r.symbol))];
    const us = [...new Set(data.filter((r) => r.market === "US").map((r) => r.symbol.toUpperCase()))];
    return { KR: kr, US: us };
}
const RATE_LIMIT_DELAY_MS = 150;
function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function pollPrices() {
    const { KR, US } = await getActiveTargetsByMarket();
    for (const symbol of KR) {
        try {
            const price = await fetchDomesticPrice(symbol);
            if (price != null) {
                (0, priceRouter_1.onPrice)(symbol, "KR", price);
            }
            else {
                console.warn("[KIS] 국내 시세 없음:", symbol);
            }
        }
        catch (e) {
            console.error("[KIS] 국내", symbol, e);
        }
        await delay(RATE_LIMIT_DELAY_MS);
    }
    for (const symbol of US) {
        try {
            const price = await fetchOverseasPrice(symbol);
            if (price != null) {
                (0, priceRouter_1.onPrice)(symbol, "US", price);
            }
            else {
                console.warn("[KIS] 해외 시세 없음:", symbol);
            }
        }
        catch (e) {
            console.error("[KIS] 해외", symbol, e);
        }
        await delay(RATE_LIMIT_DELAY_MS);
    }
}
function run() {
    if (!KIS_APP_KEY || !KIS_APP_SECRET) {
        throw new Error("환경변수 KIS_APP_KEY, KIS_APP_SECRET 이 필요합니다.");
    }
    if (!supabaseClient_1.supabase) {
        throw new Error("Supabase 설정이 없어 KIS Price Worker 를 시작할 수 없습니다.");
    }
    console.log("[KIS] 통합 시세 워커 시작 (국장 + 미장). 환경:", KIS_REAL ? "실전" : "모의");
    if (KIS_ACCOUNT_NO)
        console.log("[KIS] 계좌번호 설정됨 (주문/WebSocket 확장 시 사용).");
    setInterval(() => {
        pollPrices().catch((e) => console.error("[KIS] poll error:", e));
    }, POLL_INTERVAL_MS);
    pollPrices().catch((e) => console.error("[KIS] initial poll error:", e));
}
run();
//# sourceMappingURL=kisPriceWorker.js.map