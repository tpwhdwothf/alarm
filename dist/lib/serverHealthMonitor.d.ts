/**
 * 서버 상태 모니터 - OOM 위험, 메모리 부족 시 관리자에게 DM 경고
 */
type AlertType = "OOM_RISK" | "MEMORY_HIGH" | "LOAD_HIGH";
export interface ServerHealth {
    totalMemMB: number;
    freeMemMB: number;
    usedMemMB: number;
    usagePercent: number;
    loadAvg1: number;
    cpuCores: number;
}
export declare function getServerHealth(): ServerHealth;
export interface HealthCheckResult {
    ok: boolean;
    alertType?: AlertType;
    message?: string;
}
export declare function checkHealth(): HealthCheckResult;
export interface SendAlertCallback {
    (chatId: string, text: string): Promise<void>;
}
/**
 * 상태가 위험하면 관리자에게 경고 DM을 보냅니다.
 * @param adminIds 관리자 텔레그램 ID 배열 (DM chatId로 사용)
 * @param sendAlert 실제 DM 전송 함수
 * @returns 경고를 발송했으면 true, 아니면 false
 */
export declare function runHealthCheckAndAlert(adminIds: string[], sendAlert: SendAlertCallback): Promise<boolean>;
export {};
//# sourceMappingURL=serverHealthMonitor.d.ts.map