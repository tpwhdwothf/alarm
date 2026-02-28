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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const ws_1 = __importDefault(require("ws"));
const supabaseClient_1 = require("../lib/supabaseClient");
const priceRouter_1 = require("./priceRouter");
dotenv.config();
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const RECONNECT_DELAY_MS = 3000;
const REFRESH_SYMBOLS_INTERVAL_MS = 60000;
if (!FINNHUB_API_KEY) {
    throw new Error("환경변수 FINNHUB_API_KEY 가 필요합니다.");
}
if (!supabaseClient_1.supabase) {
    throw new Error("Supabase 설정이 없어 US Price Worker 를 시작할 수 없습니다.");
}
const WS_URL = `wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`;
let ws = null;
let subscribedSymbols = new Set();
let refreshTimer = null;
async function getActiveUsSymbols() {
    const { data, error } = await supabaseClient_1.supabase
        .from("targets")
        .select("symbol")
        .eq("market", "US")
        .eq("status", "ACTIVE");
    if (error || !data)
        return [];
    const symbols = [...new Set(data.map((r) => r.symbol.toUpperCase()))];
    return symbols;
}
function connect() {
    if ((ws === null || ws === void 0 ? void 0 : ws.readyState) === ws_1.default.OPEN)
        return;
    ws = new ws_1.default(WS_URL);
    ws.on("open", () => {
        console.log("[Finnhub] WebSocket 연결됨.");
        subscribedSymbols.forEach((sym) => {
            ws === null || ws === void 0 ? void 0 : ws.send(JSON.stringify({ type: "subscribe", symbol: sym }));
        });
    });
    ws.on("message", (raw) => {
        var _a, _b;
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === "ping")
                return;
            if (msg.type === "trade" && Array.isArray(msg.data)) {
                for (const t of msg.data) {
                    const price = (_a = t.p) !== null && _a !== void 0 ? _a : t.pc;
                    const symbol = t.s;
                    if (symbol != null && typeof price === "number") {
                        (0, priceRouter_1.onPrice)(symbol, "US", price).catch((e) => console.error("[Finnhub] onPrice error:", e));
                    }
                }
                return;
            }
            if (msg.data && Array.isArray(msg.data)) {
                for (const t of msg.data) {
                    const price = (_b = t.p) !== null && _b !== void 0 ? _b : t.pc;
                    const symbol = t.s;
                    if (symbol != null && typeof price === "number") {
                        (0, priceRouter_1.onPrice)(symbol, "US", price).catch((e) => console.error("[Finnhub] onPrice error:", e));
                    }
                }
            }
        }
        catch (_) {
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
    if ((ws === null || ws === void 0 ? void 0 : ws.readyState) === ws_1.default.OPEN) {
        toRemove.forEach((sym) => {
            ws === null || ws === void 0 ? void 0 : ws.send(JSON.stringify({ type: "unsubscribe", symbol: sym }));
        });
        toAdd.forEach((sym) => {
            ws === null || ws === void 0 ? void 0 : ws.send(JSON.stringify({ type: "subscribe", symbol: sym }));
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
//# sourceMappingURL=usFinnhubWorker.js.map