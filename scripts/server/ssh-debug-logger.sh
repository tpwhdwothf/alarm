#!/bin/bash
# SSH 끊김 원인 확인용 로그 수집 스크립트
# cron으로 2~3분마다 실행하여, 끊김 직전 시스템 상태를 남깁니다.
#
# 사용법:
#   chmod +x ssh-debug-logger.sh
#   crontab -e  →  */3 * * * * /home/opc/scripts/ssh-debug-logger.sh

LOG_FILE="${SSH_DEBUG_LOG:-$HOME/ssh-debug.log}"
MAX_LINES=2000

log_line() {
  local ts
  ts=$(date '+%Y-%m-%d %H:%M:%S')

  local mem_total mem_free mem_used mem_pct
  if [ -f /proc/meminfo ]; then
    mem_total=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
    mem_free=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
    if [ -z "$mem_free" ]; then
      mem_free=$(awk '/MemFree/ {print int($2/1024)}' /proc/meminfo)
    fi
    mem_used=$((mem_total - mem_free))
    mem_pct=$((mem_total > 0 ? (mem_used * 100 / mem_total) : 0))
  else
    mem_total=0; mem_free=0; mem_used=0; mem_pct=0
  fi

  local load1 load5 load15
  read -r load1 load5 load15 < /proc/loadavg 2>/dev/null || load1=0 load5=0 load15=0

  local ssh_count=0
  if command -v ss &>/dev/null; then
    ssh_count=$(ss -tn state established '( dport = :22 )' 2>/dev/null | tail -n +2 | wc -l)
  elif command -v netstat &>/dev/null; then
    ssh_count=$(netstat -tn 2>/dev/null | grep ':22 ' | grep ESTABLISHED | wc -l)
  fi

  local oom_flag=""
  if dmesg 2>/dev/null | grep -qi "out of memory\|oom-killer\|killed process"; then
    oom_flag=" [OOM_detected]"
  fi

  echo "$ts | mem=${mem_pct}% used=${mem_used}MB free=${mem_free}MB | load=$load1 $load5 $load15 | ssh=$ssh_count$oom_flag" >> "$LOG_FILE"
}

log_line

if [ -f "$LOG_FILE" ]; then
  line_count=$(wc -l < "$LOG_FILE")
  if [ "$line_count" -gt "$MAX_LINES" ]; then
    tail -n "$MAX_LINES" "$LOG_FILE" > "${LOG_FILE}.tmp"
    mv "${LOG_FILE}.tmp" "$LOG_FILE"
  fi
fi
