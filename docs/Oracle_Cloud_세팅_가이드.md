# Oracle Cloud Always Free — 봇 24/7 세팅 가이드

비개발자도 **순서대로만** 따라 하면 Oracle Cloud VM 위에서 봇과 시세 워커를 24시간 돌릴 수 있도록 단계별로 정리한 문서입니다.  
막히는 단계가 있으면 그 단계 화면을 캡처하거나 설명해서 물어보면 됩니다.

---

## 준비물

- **이메일** (Oracle 가입용)
- **신용카드 또는 체크카드** (무료 한도 내에서는 과금되지 않음, 검증용)
- **이 프로젝트 코드가 들어 있는 GitHub 저장소** (없으면 나중에 직접 업로드하는 방법으로 대체 가능)
- **PC에서 터미널(명령 프롬프트 또는 PowerShell) 열기** 가능

---

## 1단계: Oracle Cloud 가입

1. 브라우저에서 **https://www.oracle.com/cloud/free/** 접속
2. **「Start for free」** 클릭
3. 국가/이메일 등 입력 후 이메일 인증
4. 비밀번호 설정, 이름 등 입력
5. **결제 수단(카드)** 등록  
   - 무료 한도만 쓰면 **과금되지 않음** (정책 확인: Always Free 리소스만 사용 시)
6. 가입 완료 후 **로그인** → 대시보드(콘솔)로 들어옴

---

## 2단계: VM 인스턴스 생성 (Always Free)

1. 로그인한 뒤 상단 메뉴에서 **☰ → Compute → Instances** 로 이동
2. **「Create instance」** 클릭
3. **이름** 입력 (예: `alarm-bot`)
4. **Placement**: 리전은 그대로 두거나, 가까운 리전 선택 (예: Tokyo)
5. **Image and shape**  
   - **Edit** 클릭  
   - **Image**: 기본 Oracle Linux  
   - **Shape**: **Change shape** 클릭 → **AMD** 선택 → **VM.Standard.E2.1.Micro** (1 OCPU, 1 GB memory, Always Free 표시) 선택 → **Select shape**
6. **Networking**  
   - **Create new virtual cloud network** 선택해 두거나, 이미 있으면 선택  
   - **Assign a public IPv4 address** 가 **체크**되어 있는지 확인
7. **Add SSH keys**  
   - **Generate a key pair for me** 선택 → **Save Private Key** 눌러서 `.key` 파일을 PC에 저장 (절대 분실하지 말 것)  
   - 또는 **Upload public key** 로 본인이 만든 공개키 업로드
8. **Create** 클릭 → VM이 생성될 때까지 대기 (몇 분)

생성이 끝나면 **Public IP address** 가 보입니다. 이 IP와 앞으로 SSH 접속에 쓸 **사용자명**을 메모해 두세요.  
(Oracle Linux 기본 사용자명은 보통 `ubuntu` 또는 `opc` — 인스턴스 상세 화면에서 확인 가능)

---

## 3단계: 방화벽(보안 목록)에서 포트 열기 (선택)

봇은 **텔레그램이 우리 쪽으로 요청을 보내는(polling)** 방식이라, **외부에서 우리 VM으로 들어오는 포트를 따로 열 필요는 없습니다.**  
나중에 웹훅이나 웹 페이지를 쓰게 되면 그때 80/443 등을 열면 됩니다.  
지금은 **3단계는 건너뛰어도 됩니다.**

---

## 4단계: PC에서 SSH로 VM 접속

1. **Windows**  
   - **PowerShell** 또는 **명령 프롬프트** 실행  
   - `.key` 파일이 있는 폴더로 이동 (예: `cd Downloads`)
   - (선택) 개인키 권한 조정:  
     `icacls your-key.key /inheritance:r /grant:r "%USERNAME%:R"`
   - 접속 명령 (아래에서 `공개IP`와 `사용자명`만 바꿔서 입력):

```bash
ssh -i your-key.key 사용자명@공개IP
```

   - 예: `ssh -i mykey.key opc@123.45.67.89`  
   - 처음 접속 시 "Are you sure you want to continue connecting?" 나오면 `yes` 입력

2. **Mac / Linux**  
   - 터미널에서:

```bash
chmod 400 your-key.key
ssh -i your-key.key 사용자명@공개IP
```

접속에 성공하면 VM 안의 터미널처럼 `[opc@인스턴스이름 ~]$` 같은 프롬프트가 보입니다.

---

## 5단계: VM 안에 Node.js 설치

SSH로 접속한 상태에서 아래 명령을 **순서대로** 복사해 붙여 넣고 Enter 합니다.

```bash
sudo dnf install -y oracle-nodejs20
```

(또는 Node 20이 없으면):

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
```

설치 확인:

```bash
node -v
npm -v
```

버전이 나오면 성공입니다.

---

## 6단계: 프로젝트 코드 가져오기

**방법 A — GitHub에 코드가 있을 때**

```bash
cd ~
git clone https://github.com/본인아이디/저장소이름.git alarm
cd alarm
```

**방법 B — GitHub 없이 직접 올릴 때**  
- PC에서 프로젝트 폴더를 zip으로 압축한 뒤, `scp`로 VM에 복사하는 방법이 있습니다.  
  막히면 "GitHub 없이 코드 올리는 방법"이라고 질문해 주세요.

---

## 7단계: 환경 변수(.env) 설정

VM 안의 프로젝트 폴더(`alarm`)에서:

```bash
nano .env
```

아래 내용을 **본인 값으로 수정**해서 붙여 넣습니다. (이미 PC에서 쓰던 .env 내용을 그대로 써도 됩니다.)

```env
TELEGRAM_BOT_TOKEN=여기에_봇_토큰
SUPABASE_URL=여기에_Supabase_URL
SUPABASE_ANON_KEY=여기에_Supabase_anon_key
KIS_APP_KEY=여기에_KIS_앱키
KIS_APP_SECRET=여기에_KIS_앱시크릿
```

저장: **Ctrl+O** → Enter → **Ctrl+X**

---

## 8단계: 패키지 설치 및 빌드

같은 폴더(`alarm`)에서:

```bash
npm install
npm run build
```

에러 없이 끝나면 다음 단계로 갑니다.

---

## 9단계: PM2로 봇·워커 24시간 실행

**PM2**는 프로세스를 백그라운드에서 돌리고, 꺼지면 다시 켜 주는 도구입니다.

1. PM2 설치:

```bash
sudo npm install -g pm2
```

2. **봇** 실행:

```bash
pm2 start dist/bot/index.js --name bot
```

3. **시세 워커** 실행:

```bash
pm2 start dist/worker/kisPriceWorker.js --name worker-kis
```

4. 상태 확인:

```bash
pm2 status
```

`bot`과 `worker-kis`가 **online**이면 정상입니다.

5. (선택) VM 재부팅 후에도 자동 실행:

```bash
pm2 save
pm2 startup
```

나오는 안내에 나온 `sudo ...` 명령을 그대로 한 번 더 실행해 주세요.

---

## 10단계: 동작 확인

- 텔레그램에서 봇에게 `/목록` 등 명령을 보내 봅니다.  
- 응답이 오면 봇이 서버에서 정상 동작하는 것입니다.  
- 목표가 도달 시 알림이 오는지도 한 번 확인해 보면 좋습니다.

---

## 자주 쓰는 PM2 명령

| 하고 싶은 것 | 명령 |
|-------------|------|
| 상태 보기 | `pm2 status` |
| 로그 보기 (봇) | `pm2 logs bot` |
| 로그 보기 (워커) | `pm2 logs worker-kis` |
| 봇 재시작 | `pm2 restart bot` |
| 워커 재시작 | `pm2 restart worker-kis` |
| 둘 다 중지 | `pm2 stop bot worker-kis` |

---

## 코드 수정 후 다시 배포할 때

1. VM에서 프로젝트 폴더로 이동: `cd ~/alarm`
2. GitHub에서 최신 코드 가져오기: `git pull` (또는 코드를 다시 업로드)
3. 다시 설치·빌드: `npm install && npm run build`
4. PM2 재시작: `pm2 restart bot worker-kis`

---

## 막혔을 때

- **어느 단계에서** 막혔는지 (예: "2단계 VM 생성에서 Change shape를 못 찾겠어요")
- **화면에 나오는 메시지** 또는 **에러 문구**  
를 그대로 알려주면, 다음에 누를 곳·입력할 명령을 구체적으로 안내할 수 있습니다.
