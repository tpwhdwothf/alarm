/**
 * 서버 상태 모니터 - OOM 위험, 메모리 부족 시 관리자에게 DM 경고
 */

import * as os from "os";

const MB = 1024 * 1024;

/** 메모리 사용률 경고 임계값 (90%) */
const MEMORY_USAGE_WARNING_THRESHOLD = 0.9;

/** 사용 가능 메모리 경고 임계값 (MB) */
const MEMORY_AVAILABLE_WARNING_MB = 100;

/** 로드 평균 경고 임계값 (1분 평균) - CPU 코어 수의 2배 이상이면 부하 */
const LOAD_AVERAGE_WARNING_MULTIPLIER = 2;

/** 같은 타입 경고 재발송 최소 간격 (ms, 30분) */
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

type AlertType = "OOM_RISK" | "MEMORY_HIGH" | "LOAD_HIGH";

const lastAlertAt: Partial<Record<AlertType, number>> = {};

export interface ServerHealth {
  totalMemMB: number;
  freeMemMB: number;
  usedMemMB: number;
  usagePercent: number;
  loadAvg1: number;
  cpuCores: number;
}

export function getServerHealth(): ServerHealth {
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

export interface HealthCheckResult {
  ok: boolean;
  alertType?: AlertType;
  message?: string;
}

export function checkHealth(): HealthCheckResult {
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

function canSendAlert(alertType: AlertType): boolean {
  const last = lastAlertAt[alertType];
  if (!last) return true;
  return Date.now() - last >= ALERT_COOLDOWN_MS;
}

function markAlertSent(alertType: AlertType): void {
  lastAlertAt[alertType] = Date.now();
}

export interface SendAlertCallback {
  (chatId: string, text: string): Promise<void>;
}

/**
 * 상태가 위험하면 관리자에게 경고 DM을 보냅니다.
 * @param adminIds 관리자 텔레그램 ID 배열 (DM chatId로 사용)
 * @param sendAlert 실제 DM 전송 함수
 * @returns 경고를 발송했으면 true, 아니면 false
 */
export async function runHealthCheckAndAlert(
  adminIds: string[],
  sendAlert: SendAlertCallback
): Promise<boolean> {
  if (adminIds.length === 0) return false;

  const result = checkHealth();
  if (result.ok) return false;
  if (!result.alertType || !result.message) return false;
  if (!canSendAlert(result.alertType)) return false;

  for (const id of adminIds) {
    try {
      await sendAlert(id, result.message);
    } catch (e) {
      console.error("[serverHealthMonitor] 관리자 DM 전송 실패:", id, e);
    }
  }

  markAlertSent(result.alertType);
  return true;
}
