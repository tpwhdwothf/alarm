## 텔레그램 주식 목표가 알림 시스템 (MVP)

이 프로젝트는 텔레그램 봇으로 종목과 목표가들을 등록해두면, 실시간 시세를 감시해서 **목표가 최초 도달 시 1회만 알림**을 보내는 시스템의 코드입니다.

**👉 비개발자도 따라 할 수 있는 단계별 안내:** [docs/시작하기_내가_할_일.md](docs/시작하기_내가_할_일.md)

### 1. 준비 사항

- Node.js 설치 완료
- 텔레그램 BotFather 로부터 발급받은 `TELEGRAM_BOT_TOKEN`
- Supabase 프로젝트 및 API 정보 (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)

### 2. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 만들고, `.env.example` 내용을 복사한 뒤 값을 채워주세요:

`.env` 내용 예시:

```bash
TELEGRAM_BOT_TOKEN=1234567890:ABCDEF...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
```

### 3. Supabase 스키마 적용

Supabase 대시보드에서 `SQL` → `New query` 를 열고, `supabase-schema.sql` 파일 내용을 복사해 붙여넣은 뒤 실행합니다.

이렇게 하면 `user_settings`, `targets`, `alert_logs` 테이블이 생성됩니다.

### 4. 개발 서버 실행

터미널에서 다음 명령을 실행하면 봇이 시작됩니다.

```bash
npm run dev
```

성공하면 터미널에 `Telegram 봇이 시작되었습니다.` 라는 로그가 보입니다.

### 5. 시세 워커 (선택)

- **모의 시세 (테스트용)**  
  `npm run worker:mock`  
  실제 API 없이 가짜 가격으로 목표가 도달 알림 동작을 확인할 때 사용합니다.

- **KIS 통합 (국장 + 미장)** ⭐ 권장  
  `npm run worker:kis`  
  한국투자증권 KIS OpenAPI **하나**로 국내·미국 주식 현재가를 조회합니다.  
  `.env`에 `KIS_APP_KEY`, `KIS_APP_SECRET` 설정 후 실행하세요.  
  **키 발급·설정 방법**: [docs/국장_KIS_연동_가이드.md](docs/국장_KIS_연동_가이드.md) 참고.

- **미장만 (Finnhub)**  
  `.env`에 `FINNHUB_API_KEY`를 넣은 뒤 `npm run worker:us`  
  [Finnhub](https://finnhub.io) 무료 API로 미장만 별도 사용할 때 선택합니다.

- **국장만 (KIS 스켈레톤)**  
  `npm run worker:kr`  
  국장만 KIS로 쓰는 레거시 스켈레톤입니다. 보통은 **worker:kis** 사용을 권장합니다.

### 6. 텔레그램 명령 사용법 (MVP)

- `/setgroup` : 현재 그룹 채팅방을 기본 알림 그룹으로 설정
- `/add 종목 tp1 tp2 ...` : 목표가 등록 또는 갱신 (예: `/add AAPL 180 190 200`)
- `/list` : 내가 등록한 종목 목록 조회

