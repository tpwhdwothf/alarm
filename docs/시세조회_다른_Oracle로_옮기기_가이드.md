# 시세 조회를 다른 Oracle 계정으로 옮기기 — 할 일 정리

**비개발자도 순서대로만 하면 됩니다.**  
지금 쓰는 서버에는 **봇만** 두고, **시세 조회(워커)** 만 새 Oracle 계정의 서버에서 돌리도록 나누는 방법입니다.

---

## 전체 그림 (이해만 하면 됨)

| 서버 | 하는 일 | 사용자가 하는 일 |
|------|---------|------------------|
| **지금 서버** (현재 Oracle 계정) | 텔레그램 봇만 동작 (/등록, /목록 등) | 그대로 같은 봇에게 /등록, /목록 사용 |
| **새 서버** (새 Oracle 계정) | 시세 조회만 동작 (종목 시세 확인 → 목표가 도달 시 알림) | 별도로 할 일 없음. 같은 봇이 알림 보냄 |

- **같은 텔레그램 봇**을 그대로 씁니다.  
- **/등록** 하면 지금 서버의 봇이 DB에 저장하고, **새 서버의 워커**가 그 DB를 보고 시세를 조회해서 알림을 보냅니다.

---

## 할 일 요약

1. **지금 서버**에서 시세 워커 끄고, 재부팅 시에도 워커가 안 켜지게 설정
2. **새 Oracle 계정**으로 가입 후 VM 하나 만들기
3. **새 서버**에 코드 올리고, 필요한 설정(.env) 넣고, **워커만** 켜기
4. 끝. 같은 봇으로 /등록·알림 확인

---

# Part A. 지금 서버(현재 Oracle 계정)에서 할 일

**목표:** 봇만 켜 두고, 시세 조회(워커)는 끄고, 재부팅해도 워커가 자동으로 안 켜지게 하기.

---

## A-1. 시세 워커 끄기

1. PC에서 **PowerShell** 열기
2. 지금 쓰는 서버로 SSH 접속  
   (예: `ssh -i alarm-bot.key opc@161.33.212.251` — 본인 키·IP로 바꾸기)
3. 아래 명령을 **한 줄씩** 입력하고 Enter

```bash
cd ~/alarm
npx pm2 stop worker-kis
npx pm2 save
```

4. 확인

```bash
npx pm2 status
```

- **bot** = online, **worker-kis** = stopped 이면 성공입니다.

---

## A-2. 재부팅 시에도 워커가 안 켜지게 하기

1. 같은 서버(SSH 접속된 상태)에서 아래 실행

```bash
cp ~/alarm/scripts/server/start-alarm.sh ~/scripts/
chmod +x ~/scripts/start-alarm.sh
```

2. cron 편집

```bash
crontab -e
```

3. 편집기에서 **@reboot** 로 시작하는 줄이 있으면, 그 줄을 아래 **한 줄**로 바꿉니다. (없으면 새 줄로 추가)

```text
@reboot /home/opc/scripts/start-alarm.sh >> /home/opc/start-alarm.log 2>&1
```

- `pm2 start all` 이나 워커를 켜는 줄이 있으면 **삭제**하세요.
- 저장: `Esc` → `:wq` → Enter

4. 완료  
   이제 재부팅해도 **봇만** 켜지고, 시세 워커는 켜지지 않습니다.

---

## A-3. (나중에) 새 서버에서 워커를 켜기 전까지

- **봇**은 그대로 동작합니다. /등록, /목록, /setgroup 등 모두 사용 가능합니다.
- **시세 조회·알림**은 새 서버에 워커를 올리고 켜기 전까지는 **오지 않습니다**.  
  새 서버 설정을 다 끝내면 알림이 다시 옵니다.

---

# Part B. 새 Oracle 계정에서 할 일

**목표:** 새 Oracle 계정으로 VM을 만들고, 그 위에서 **시세 조회 워커만** 24시간 돌리기.

---

## B-1. 새 Oracle Cloud 계정 만들기

1. **다른 이메일**로 Oracle Cloud 가입  
   - https://www.oracle.com/cloud/free/  
   - **Start for free** → 이메일·비밀번호·결제 수단 등록 (무료 한도만 쓰면 과금 없음)
2. 가입 후 로그인해서 **대시보드(콘솔)**에 들어갈 수 있으면 됩니다.

자세한 단계는 **`docs/Oracle_Cloud_세팅_가이드.md`** 의 **1단계~2단계**를 참고하세요.

---

## B-2. 새 계정에서 VM(인스턴스) 하나 만들기

1. Oracle Cloud 콘솔에서 **☰ → Compute → Instances** 이동
2. **Create instance** 클릭
3. 아래만 맞추면 됩니다.  
   - **이름**: 예) `alarm-worker`  
   - **Image**: Oracle Linux (기본)  
   - **Shape**: **Change shape** → **AMD** → **VM.Standard.E2.1.Micro** (1 OCPU, 1 GB, Always Free) 선택  
   - **Assign a public IPv4 address**: 체크  
   - **Add SSH keys**: **Generate a key pair for me** → **Save Private Key** 로 새 `.key` 파일을 PC에 저장 (예: `alarm-worker.key`)
4. **Create** 클릭 후 생성 완료될 때까지 대기
5. 생성된 인스턴스의 **Public IP**와 **사용자명(보통 opc)** 을 메모해 두세요.

자세한 단계는 **`docs/Oracle_Cloud_세팅_가이드.md`** 의 **2단계**를 참고하세요.

---

## B-3. 새 서버에 접속해서 코드·환경 준비

1. **PC PowerShell**에서 새 서버로 SSH 접속  
   (예: `ssh -i alarm-worker.key opc@새서버공개IP`)

2. 프로젝트 받기 (ZIP 방식 예시)

```bash
cd ~
wget https://github.com/본인아이디/alarm/archive/refs/heads/main.zip -O alarm-latest.zip
unzip -o alarm-latest.zip
rm -rf alarm
mv alarm-main alarm
cd ~/alarm
```

- `본인아이디`를 실제 GitHub 사용자명으로 바꾸세요.

3. Node.js 설치 (없을 때)  
   - Oracle Linux라면 보통 `node` 가 없을 수 있습니다.  
   - **`docs/Oracle_Cloud_세팅_가이드.md`** 의 **Node 설치** 부분을 보고 따라 하거나,  
   - 아래만 실행해 보세요:

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
node -v
```

- `v20.x.x` 같이 나오면 OK입니다.

4. 의존성 설치·빌드

```bash
cd ~/alarm
npm install
npm run build
```

---

## B-4. 새 서버에 .env 만들기 (가장 중요)

**새 서버에서는 “시세 조회 워커”만 켤 거라서, 아래 값들만 있으면 됩니다.**  
**지금 서버**의 `~/alarm/.env` 에서 **복사**해 오면 됩니다.

1. **지금 서버**에서 .env 내용 확인

```bash
# 지금 서버(봇이 도는 서버)에 SSH 접속한 뒤
cat ~/alarm/.env
```

2. 아래 **변수들**을 메모하거나 복사해 두세요. (새 서버에 그대로 넣을 겁니다.)

| 변수 이름 | 용도 | 새 서버에 필요 여부 |
|-----------|------|---------------------|
| `SUPABASE_URL` | DB 주소 (봇·워커가 같은 DB 사용) | ✅ **필수** |
| `SUPABASE_SERVICE_ROLE_KEY` 또는 `SUPABASE_ANON_KEY` | DB 접근 키 | ✅ **필수** |
| `KIS_APP_KEY` | 한국투자증권 API 키 | ✅ **필수** |
| `KIS_APP_SECRET` | 한국투자증권 API 시크릿 | ✅ **필수** |
| `VERCEL_TELEGRAM_ENDPOINT` | 목표가 도달 시 알림 보내는 주소 | ✅ **필수** |
| `VERCEL_TELEGRAM_SECRET` | 위 엔드포인트용 비밀값 | ✅ **필수** |
| `TELEGRAM_BOT_TOKEN` | 봇 토큰 | ❌ 새 서버에서는 불필요 (워커만 있음) |
| `TELEGRAM_ADMIN_IDS` | 관리자 ID | ❌ 새 서버에서는 불필요 |

3. **새 서버**에 .env 파일 만들기

```bash
# 새 서버 SSH 접속 상태에서
cd ~/alarm
nano .env
```

4. 아래 **형식**에 맞춰, 아까 복사한 **실제 값**을 붙여 넣습니다. (비밀값은 예시가 아니라 본인 값으로.)

```text
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...본인키값...
KIS_APP_KEY=본인키
KIS_APP_SECRET=본인시크릿
VERCEL_TELEGRAM_ENDPOINT=https://본인프로젝트.vercel.app/api/telegram-send
VERCEL_TELEGRAM_SECRET=본인비밀값
```

- 저장: `Ctrl + O` → Enter  
- 종료: `Ctrl + X`

---

## B-5. 새 서버에서 시세 워커만 켜기

1. 워커만 실행 (PM2로 24시간 돌리기)

```bash
cd ~/alarm
npx pm2 start dist/worker/kisPriceWorker.js --name worker-kis
npx pm2 save
```

2. 재부팅 후에도 자동으로 켜지게 하기

```bash
npx pm2 startup
```

- 화면에 나오는 **`sudo env PATH=... pm2 startup ...`** 로 시작하는 **한 줄 전체**를 복사해서 그대로 실행하세요.

3. 확인

```bash
npx pm2 status
```

- **worker-kis** 가 **online** 이면 성공입니다.

4. 로그로 확인 (선택)

```bash
npx pm2 logs worker-kis
```

- `[KIS] 통합 시세 워커 시작` 같은 메시지가 보이면 정상입니다.  
- `Ctrl + C` 로 로그 보기 종료.

---

## B-6. 동작 확인

1. **지금 서버의 봇**으로 텔레그램에서 `/등록` 으로 종목 하나 등록
2. **새 서버**에서 `npx pm2 logs worker-kis` 로그에 해당 종목 시세 조회 로그가 나오는지 확인
3. 목표가에 도달했을 때 **같은 텔레그램 봇**으로 알림이 오는지 확인

---

# 완료 후 정리

| 구분 | 지금 서버 (현재 Oracle) | 새 서버 (새 Oracle) |
|------|-------------------------|---------------------|
| **실행 중인 것** | 봇만 | 시세 워커만 |
| **사용자가 하는 일** | 같은 텔레그램 봇으로 /등록, /목록 사용 | 없음 (자동으로 시세 조회·알림) |
| **재부팅 시** | 봇만 자동 시작 (start-alarm.sh) | 워커만 자동 시작 (pm2 startup) |

---

# 문제가 생겼을 때

- **알림이 안 온다**  
  - 새 서버에서 `npx pm2 status` → worker-kis 가 online 인지  
  - `npx pm2 logs worker-kis` 에서 에러 메시지 확인  
  - .env 에 SUPABASE, KIS, VERCEL_TELEGRAM_... 값이 지금 서버와 같게 들어갔는지 확인

- **새 서버 접속이 안 된다**  
  - Oracle Cloud 콘솔에서 인스턴스 Public IP, 보안 목록(방화벽) 확인  
  - `docs/Oracle_Cloud_세팅_가이드.md` 3~4단계 참고

- **지금 서버에서 봇이 안 된다**  
  - `npx pm2 status` → bot 이 online 인지  
  - `npx pm2 logs bot` 에서 에러 확인

자세한 배포·설정은 **`docs/실서버_배포_가이드.md`**, **`docs/Oracle_Cloud_세팅_가이드.md`** 를 참고하세요.
