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

이 단계에서 **텔레그램이 사용자 메시지를 Vercel로 보내도록** 설정합니다.  
설정 전에는 텔레그램이 Oracle 서버를 바라보고 있었고, 이제 Vercel 주소로 바꿔 주는 과정입니다.

---

## 5-1. 필요한 값 준비하기

웹훅 등록 전에 아래 **두 가지**를 미리 적어 두세요.

| 필요한 것 | 어디서 확인? | 예시 |
|----------|-------------|------|
| **봇 토큰** | Vercel Environment Variables의 `TELEGRAM_BOT_TOKEN` 값 복사 | `123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw` |
| **Vercel 프로젝트 주소** | Vercel 대시보드 → 프로젝트 → **Deployments** 탭 → 도메인 확인 | `alarm-bot.vercel.app` |

> ⚠️ 봇 토큰은 절대 다른 사람에게 공유하지 마세요.

---

## 5-2. 웹훅 URL 만들기

아래 문장을 **본인 값으로 채워서** 한 줄로 만드세요. (대괄호 안 내용을 실제 값으로 바꾸고, **대괄호·공백 없이** 붙여야 합니다.)

```
https://api.telegram.org/bot[봇토큰]/setWebhook?url=https://[Vercel주소]/api/telegram-webhook
```

**채우는 방법**

1. `[봇토큰]` → Vercel에 저장한 `TELEGRAM_BOT_TOKEN` 값을 그대로 붙여넣기 (공백·줄바꿈 없음)
2. `[Vercel주소]` → `본인프로젝트.vercel.app` 형태 (예: `alarm-bot.vercel.app`). `https://` 는 **url=** 뒤에 자동으로 들어가 있으니, 여기에는 프로젝트 주소만 넣음

**완성 예시**

- 봇 토큰: `123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`
- Vercel 주소: `alarm-bot.vercel.app`

→ 최종 URL:

```
https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/setWebhook?url=https://alarm-bot.vercel.app/api/telegram-webhook
```

---

## 5-3. 웹훅 등록 실행하기

1. **크롬, 엣지 등** 웹 브라우저를 연다.
2. **주소창**에 5-2에서 만든 URL 전체를 붙여넣는다.
3. **Enter**를 누른다.
4. 페이지에 아래와 비슷한 JSON이 보이면 **성공**이다.

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

| 결과 | 의미 |
|------|------|
| `"ok":true` | 웹훅 등록 성공 |
| `"ok":false` | 오류 발생 → 오류 메시지 확인 후, 토큰·URL·https 여부 점검 |

---

## 5-4. 웹훅 등록 확인하기 (선택)

제대로 등록됐는지 확인하려면, 아래 URL을 브라우저 주소창에 입력하세요.  
`[봇토큰]` 자리에는 본인 봇 토큰을 넣습니다.

```
https://api.telegram.org/bot[봇토큰]/getWebhookInfo
```

예시:

```
https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/getWebhookInfo
```

응답 JSON 안의 `"url"` 에 방금 등록한 Vercel 주소(`https://...vercel.app/api/telegram-webhook`)가 보이면 정상입니다.

---

## 5-5. 자주 틀리는 부분

| 상황 | 해결 방법 |
|------|----------|
| `"ok":false` 나온다 | URL에 공백·줄바꿈이 들어갔는지 확인. `bot` 과 토큰 사이에 공백 없어야 함. |
| 404, 연결 오류 | Vercel 주소가 맞는지, `https://` 로 시작하는지 확인. |
| 봇이 응답 안 한다 | Part 4 환경변수 저장 후 **Redeploy** 했는지 확인. |

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
