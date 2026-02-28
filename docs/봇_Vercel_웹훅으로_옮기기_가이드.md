# 봇을 Vercel 웹훅으로 옮기기 — 비개발자용 가이드

Oracle 서버에서 봇이 돌아가면 메모리가 부족해 터지는 문제를 줄이기 위해, **봇을 Vercel로 옮기는** 방법을 단계별로 정리한 문서입니다.

---

## 웹훅에서 지원하는 명령어 (2026.02 기준)

| 지원 | 명령어 |
|------|--------|
| ✅ | /start, /명령어, /setgroup, /등록, /목록, /공지방, 새 멤버 인사 |
| ✅ | /edit, /append, /status, /setlevel, /close, /open, /delete, /health (관리자 DM 전용) |

---

## 전체 그림

| 구분 | 현재 | 옮긴 뒤 |
|------|------|---------|
| **봇** | Oracle 서버에서 24시간 실행 | Vercel 서버리스 함수 (메시지 올 때만 실행) |
| **Oracle 서버** | 봇 + (시세 워커) | 봇 없음 → 메모리 여유 |
| **사용자가 하는 일** | 그대로 같은 텔레그램 봇 사용 (/등록, /목록 등) | **변화 없음** |

---

## 할 일 요약

1. 코드를 GitHub에 push (웹훅 API가 이미 추가됨)
2. Vercel에 배포 (또는 기존 Vercel 프로젝트 업데이트)
3. Vercel 환경변수 설정 (Supabase, 봇 토큰 등)
4. 텔레그램에 웹훅 URL 등록
5. Oracle 서버에서 봇 중지

---

# Part 1. 사전 확인

## 1-1. 필요한 것

- **GitHub** 계정 (코드가 올라간 저장소)
- **Vercel** 계정 (https://vercel.com — GitHub로 가입 가능)
- **Supabase** URL, Anon Key, Service Role Key (지금 Oracle 서버 .env 에 있는 값)
- **텔레그램 봇 토큰** (지금 쓰는 것 그대로)
- **텔레그램 관리자 ID** (TELEGRAM_ADMIN_IDS)

---

# Part 2. 코드 push (이미 되어 있으면 건너뛰기)

1. PC에서 프로젝트 폴더 열기  
   (예: `C:\Users\tpwhd\OneDrive\Desktop\코길동\alarm`)
2. 아래 명령 실행 (PowerShell 또는 터미널)

```powershell
git add .
git commit -m "봇 Vercel 웹훅으로 옮기기"
git push origin main
```

> 브랜치가 `master` 면 `git push origin master` 로 실행하세요.

---

# Part 3. Vercel 배포

## 3-1. Vercel에 로그인

1. 브라우저에서 **https://vercel.com** 접속
2. **GitHub로 로그인** (또는 이미 계정이 있으면 로그인)

## 3-2. 프로젝트 가져오기 또는 업데이트

**이미 이 저장소를 Vercel에 연결해 둔 경우**

- Vercel 대시보드 → 해당 프로젝트 클릭  
- **Deployments** 탭에서 최신 커밋 확인  
- 방금 push 한 커밋이 있으면 **Redeploy** 클릭

**처음 Vercel에 올리는 경우**

1. Vercel 대시보드 → **Add New** → **Project**
2. **Import Git Repository** 에서 본인 저장소 선택
3. **Root Directory**: 비워 두거나 `alarm` 이 프로젝트 루트면 그대로
4. **Framework Preset**: Other (또는 아무거나)
5. **Build and Output Settings**:  
   - Build Command: 비워 두거나 `npm run build`  
   - Output Directory: 비워 두기 (API 라우트만 쓰는 경우)
6. **Environment Variables** 에서 아래 변수 입력 (Part 4 참고)
7. **Deploy** 클릭

배포가 끝나면 **https://본인프로젝트.vercel.app** 같은 주소가 생깁니다.

---

# Part 4. Vercel 환경변수 설정

Vercel 프로젝트 → **Settings** → **Environment Variables** 에서 아래를 **모두** 추가하세요.

| 변수 이름 | 값 | 설명 |
|-----------|-----|------|
| `TELEGRAM_BOT_TOKEN` | 봇 토큰 | 텔레그램 봇 토큰 (예: 123456789:ABCdef...) |
| `TELEGRAM_ADMIN_IDS` | 관리자 ID | 텔레그램 숫자 ID (쉼표로 여러 개, 예: 123456789) |
| `SUPABASE_URL` | Supabase URL | https://xxxxx.supabase.co |
| `SUPABASE_ANON_KEY` | Supabase Anon Key | eyJhbGc... |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | eyJhbGc... (RLS 우회용) |

- 값은 **지금 Oracle 서버의 `~/alarm/.env`** 에 있는 값과 **동일**하게 넣으면 됩니다.
- 저장 후 **Redeploy** 한 번 해주세요.

---

# Part 5. 텔레그램 웹훅 URL 등록

텔레그램이 메시지를 **우리 Vercel 주소**로 보내도록 설정합니다.

## 5-1. 웹훅 URL 확인

- Vercel 배포 주소: `https://본인프로젝트.vercel.app`  
- 웹훅 주소: `https://본인프로젝트.vercel.app/api/telegram-webhook`

## 5-2. 웹훅 등록

브라우저 주소창에 아래를 **입력**하고 Enter (본인 값으로 바꾸세요):

```
https://api.telegram.org/bot<여기에_봇토큰>/setWebhook?url=https://본인프로젝트.vercel.app/api/telegram-webhook
```

예시 (토큰이 123:ABC, 프로젝트가 cogildongalarm 이면):

```
https://api.telegram.org/bot123:ABC/setWebhook?url=https://cogildongalarm.vercel.app/api/telegram-webhook
```

- 성공이면 `{"ok":true,"result":true,"description":"Webhook was set"}` 같은 JSON이 보입니다.

## 5-3. 웹훅 확인 (선택)

```
https://api.telegram.org/bot<봇토큰>/getWebhookInfo
```

- `url` 에 방금 등록한 주소가 나오면 정상입니다.

---

# Part 6. Oracle 서버에서 봇 중지

1. SSH로 Oracle 서버 접속  
   (예: `ssh -i alarm-bot.key opc@161.33.212.251`)
2. 봇만 중지

```bash
cd ~/alarm
npx pm2 stop bot
npx pm2 save
```

3. 확인

```bash
npx pm2 status
```

- `bot` 이 **stopped** 이면 성공입니다.
- (시세 워커를 돌리는 경우 `worker-kis` 는 그대로 두면 됩니다.)

---

# Part 7. 동작 확인

1. 텔레그램에서 봇에게 **`/start`** 입력  
   → 인사 메시지가 오면 성공입니다.
2. **`/등록`**, **`/목록`** 등 사용  
   → 이전과 같이 동작하면 옮기기가 잘 된 것입니다.
3. 그룹에서 **새 멤버 입장**  
   → 일반방이면 인사 메시지가 나가는지 확인하세요.

---

# 문제가 생겼을 때

## 봇이 응답하지 않는다

1. Vercel 배포가 정상인지 확인  
   - **Deployments** 탭에서 **Ready** 인지
2. 웹훅이 등록됐는지 확인  
   - `https://api.telegram.org/bot<토큰>/getWebhookInfo` 에서 `url` 확인
3. Vercel **Functions** 로그 확인  
   - 프로젝트 → **Logs** 탭에서 `telegram-webhook` 관련 에러 확인

## "Supabase 오류", "설정이 되어 있지 않아" 메시지

- Vercel **Settings** → **Environment Variables** 에  
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 가 모두 들어갔는지 확인
- 수정 후 **Redeploy** 해야 반영됩니다.

## 처음 요청만 느리다 (1~3초)

- Vercel 무료 플랜에서 **콜드 스타트** 때문일 수 있습니다.  
- 한 번 켜지면 잠시 동안은 빠르고, 한동안 요청이 없으면 다시 느려질 수 있습니다.

---

# 웹훅 해제 (Oracle로 다시 돌릴 때)

Oracle 서버에서 봇을 다시 돌리려면, 먼저 텔레그램 웹훅을 **해제**해야 합니다.

브라우저에서:

```
https://api.telegram.org/bot<봇토큰>/deleteWebhook
```

실행 후 Oracle에서 `npx pm2 start bot` 하면 됩니다.
