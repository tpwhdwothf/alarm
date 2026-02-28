"use strict";
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
dotenv.config();
/**
 * 국장(한국 주식) 실시간 시세 워커 - 한국투자증권 KIS OpenAPI WebSocket 연동용 스켈레톤
 *
 * 실제 연동을 위해 필요한 것:
 * 1. KIS 개발자 포털(apiportal.koreainvestment.com)에서 앱 키·시크릿 발급
 * 2. REST로 access_token 발급 (OAuth 또는 토큰 API)
 * 3. WebSocket URL (예: 실전 ops.koreainvestment.com:21000, 모의 :31000)
 * 4. 국내주식 체결/호가 구독 메시지 형식에 맞춰 subscribe 후 수신 가격으로 onPrice(symbol, 'KR', price) 호출
 *
 * 환경변수 예시 (연동 시 사용):
 *   KIS_APP_KEY=...
 *   KIS_APP_SECRET=...
 *   KIS_ACCOUNT_NO=...
 *   KIS_WS_URL=wss://... (또는 ws://)
 */
const POLL_FALLBACK_MS = 10000;
if (!supabaseClient_1.supabase) {
    throw new Error("Supabase 설정이 없어 KR Price Worker 를 시작할 수 없습니다.");
}
async function getActiveKrSymbols() {
    const { data, error } = await supabaseClient_1.supabase
        .from("targets")
        .select("symbol")
        .eq("market", "KR")
        .eq("status", "ACTIVE");
    if (error || !data)
        return [];
    return [...new Set(data.map((r) => r.symbol))];
}
async function pollFallback() {
    const symbols = await getActiveKrSymbols();
    if (symbols.length === 0)
        return;
    // KIS WebSocket 연동 전까지는 실시간 가격 수신 없음.
    // 연동 후 여기서 WebSocket 메시지 처리로 대체하고, 필요 시 폴링 제거.
}
console.log("KR Price Worker 시작. (현재 KIS WebSocket 미연동 – 연동 시 국장 ACTIVE 종목 구독)");
const hasKisEnv = process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET;
if (hasKisEnv) {
    console.log("KIS 환경변수 감지됨. WebSocket 연동 코드를 추가하면 실시간 국장 시세를 받을 수 있습니다.");
}
else {
    console.log("KIS_APP_KEY, KIS_APP_SECRET 을 설정하면 KIS 연동을 사용할 수 있습니다.");
}
setInterval(() => {
    pollFallback().catch((e) => console.error("[KR] poll error:", e));
}, POLL_FALLBACK_MS);
// 연동 시: connect(), refreshSubscriptions() 등 US 워커와 유사한 구조로 확장하고
// 수신 가격 이벤트에서 onPrice(symbol, 'KR', price) 호출
//# sourceMappingURL=krKisWorker.js.map