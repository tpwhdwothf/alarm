"use strict";
/**
 * 서버 상태 모니터 - OOM 위험, 메모리 부족 시 관리자에게 DM 경고
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
exports.getServerHealth = getServerHealth;
exports.checkHealth = checkHealth;
exports.runHealthCheckAndAlert = runHealthCheckAndAlert;
const os = __importStar(require("os"));
const MB = 1024 * 1024;
/** 메모리 사용률 경고 임계값 (90%) */
const MEMORY_USAGE_WARNING_THRESHOLD = 0.9;
/** 사용 가능 메모리 경고 임계값 (MB) */
const MEMORY_AVAILABLE_WARNING_MB = 100;
/** 로드 평균 경고 임계값 (1분 평균) - CPU 코어 수의 2배 이상이면 부하 */
const LOAD_AVERAGE_WARNING_MULTIPLIER = 2;
/** 같은 타입 경고 재발송 최소 간격 (ms, 30분) */
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
const lastAlertAt = {};
function getServerHealth() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const loadAvg = os.loadavg();
    const cpuCores = os.cpus().length;
    return {
        totalMemMB: Math.round(total / MB),
        freeMemMB: Math.round(free / MB),
        usedMemMB: Math.round(used / MB),
        usagePercent: total > 0 ? Math.round((used / total) * 100) : 0,
        loadAvg1: loadAvg[0],
        cpuCores,
    };
}
function checkHealth() {
    const h = getServerHealth();
    if (h.usagePercent >= Math.round(MEMORY_USAGE_WARNING_THRESHOLD * 100)) {
        return {
            ok: false,
            alertType: "OOM_RISK",
            message: `⚠️ OOM 위험\n\n메모리 사용률 ${h.usagePercent}% (임계 90%)\n사용: ${h.usedMemMB}MB / ${h.totalMemMB}MB\n남은 여유: ${h.freeMemMB}MB\n\n서버 불안정·SSH 끊김 가능성이 있습니다.`,
        };
    }
    if (h.freeMemMB < MEMORY_AVAILABLE_WARNING_MB) {
        return {
            ok: false,
            alertType: "MEMORY_HIGH",
            message: `⚠️ 메모리 부족 주의\n\n사용 가능 메모리: ${h.freeMemMB}MB (임계 100MB 미만)\n총 ${h.totalMemMB}MB 중 ${h.usagePercent}% 사용 중\n\nOOM 발생 위험이 있습니다.`,
        };
    }
    const loadThreshold = h.cpuCores * LOAD_AVERAGE_WARNING_MULTIPLIER;
    if (h.loadAvg1 >= loadThreshold) {
        return {
            ok: false,
            alertType: "LOAD_HIGH",
            message: `⚠️ 서버 부하 높음\n\n1분 로드 평균: ${h.loadAvg1.toFixed(2)} (임계 ${loadThreshold})\n메모리: ${h.usagePercent}% 사용\n\n시스템이 불안정할 수 있습니다.`,
        };
    }
    return { ok: true };
}
function canSendAlert(alertType) {
    const last = lastAlertAt[alertType];
    if (!last)
        return true;
    return Date.now() - last >= ALERT_COOLDOWN_MS;
}
function markAlertSent(alertType) {
    lastAlertAt[alertType] = Date.now();
}
/**
 * 상태가 위험하면 관리자에게 경고 DM을 보냅니다.
 * @param adminIds 관리자 텔레그램 ID 배열 (DM chatId로 사용)
 * @param sendAlert 실제 DM 전송 함수
 * @returns 경고를 발송했으면 true, 아니면 false
 */
async function runHealthCheckAndAlert(adminIds, sendAlert) {
    if (adminIds.length === 0)
        return false;
    const result = checkHealth();
    if (result.ok)
        return false;
    if (!result.alertType || !result.message)
        return false;
    if (!canSendAlert(result.alertType))
        return false;
    for (const id of adminIds) {
        try {
            await sendAlert(id, result.message);
        }
        catch (e) {
            console.error("[serverHealthMonitor] 관리자 DM 전송 실패:", id, e);
        }
    }
    markAlertSent(result.alertType);
    return true;
}
//# sourceMappingURL=serverHealthMonitor.js.map