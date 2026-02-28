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
const priceRouter_1 = require("./priceRouter");
dotenv.config();
if (!supabaseClient_1.supabase) {
    throw new Error("Supabase 설정이 없어 Price Worker 를 시작할 수 없습니다.");
}
const POLL_INTERVAL_MS = 3000;
const INITIAL_PRICE_RATIO = 0.9;
const PRICE_STEP_RATIO = 0.02;
const currentPrices = new Map();
function getNextPrice(target) {
    const tps = target.tps;
    const nextIndex = target.next_level - 1;
    const baseTp = tps[Math.max(0, Math.min(nextIndex, tps.length - 1))];
    const prev = currentPrices.get(target.id);
    if (prev === undefined) {
        const initial = baseTp * INITIAL_PRICE_RATIO;
        currentPrices.set(target.id, initial);
        return initial;
    }
    const step = Math.abs(baseTp * PRICE_STEP_RATIO);
    const nextPrice = prev + step;
    const resetThreshold = baseTp * 1.1;
    if (nextPrice > resetThreshold) {
        const reset = baseTp * INITIAL_PRICE_RATIO;
        currentPrices.set(target.id, reset);
        return reset;
    }
    currentPrices.set(target.id, nextPrice);
    return nextPrice;
}
async function pollAndSimulate() {
    const { data, error } = await supabaseClient_1.supabase
        .from("targets")
        .select("id, created_by, symbol, name, market, tps, next_level, status, group_chat_id")
        .eq("status", "ACTIVE");
    if (error || !data || data.length === 0)
        return;
    for (const row of data) {
        if (!Array.isArray(row.tps) || row.tps.length === 0)
            continue;
        const price = getNextPrice(row);
        await (0, priceRouter_1.processPriceEvent)(row, price);
    }
}
console.log("Mock Price Worker가 시작되었습니다. (실제 시세 대신 모의 가격으로 동작)");
setInterval(() => {
    pollAndSimulate().catch((e) => console.error("pollAndSimulate error:", e));
}, POLL_INTERVAL_MS);
//# sourceMappingURL=mockPriceWorker.js.map