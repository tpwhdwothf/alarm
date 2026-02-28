#!/bin/bash
# 재부팅 시 봇만 자동 시작, 시세 워커(worker-kis)는 시작하지 않음.
#
# 사용법:
#   chmod +x start-alarm.sh
#   crontab -e  →  @reboot /home/opc/scripts/start-alarm.sh >> /home/opc/start-alarm.log 2>&1
#
# 기존 start-alarm.sh 가 봇+워커 둘 다 켰다면, 이 스크립트로 교체하면 됩니다.

set -e
ALARM_DIR="${ALARM_DIR:-$HOME/alarm}"
cd "$ALARM_DIR"

# 봇만 시작 (프로세스 없으면 start, 있으면 restart)
if npx pm2 describe bot &>/dev/null; then
  npx pm2 restart bot --update-env
else
  npx pm2 start dist/bot/index.js --name bot
fi

# 시세 워커는 재부팅 후에도 자동으로 켜지지 않도록 중지 후 저장
npx pm2 stop worker-kis 2>/dev/null || true
npx pm2 save --force 2>/dev/null || true
