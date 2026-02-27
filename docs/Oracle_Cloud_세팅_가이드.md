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

> **참고**: 4단계 SSH 접속 시 **Connection timed out** 이 나온다면, 인스턴스 상세 화면의 **Primary VNIC** → **Quick actions** 에서 **"Connect public subnet to internet"** 의 **Connect** 버튼을 눌러 주세요. 인터넷 연결·라우팅·보안 그룹이 자동으로 설정됩니다.

---

## 4단계: PC에서 서버(VM)에 접속하기 (SSH)

> **이 단계가 뭐냐면**  
> 아까 만든 "서버"는 Oracle Cloud 안에 있습니다.  
> 이제 **PC에서 그 서버 안으로 들어가서** 봇을 설치하고 켜는 단계입니다.  
> 들어가는 방법을 **SSH**라고 부릅니다. (비밀번호 대신 `.key` 파일로 들어가는 방식입니다.)

---

### 4-1. 필요한 것

- **공개 IP 주소**: Oracle Cloud 인스턴스 상세 화면에 나와 있는 숫자 (예: `123.45.67.89`)
- **사용자명**: 보통 `opc` (Oracle Linux 8 기준) — 아래에서 확인하는 방법
- **개인 키(.key) 파일**: VM 만들 때 받은 파일 (예: `alarm-bot.key`)

#### 사용자명 확인하는 방법

1. **Oracle Cloud 콘솔**에서 **Compute → Instances** 로 이동
2. 본인 인스턴스(예: alarm-bot) **이름** 클릭 → 상세 화면 진입
3. 아래 두 가지 중 하나로 확인:
   - **Connect** 버튼 클릭 → 나타나는 팝업이나 화면에 **"opc@..."** 같은 예시가 보이면, 그 앞의 `opc`가 사용자명
   - **Image** 항목을 확인:
     - **Oracle Linux** → 사용자명은 `opc`
     - **Ubuntu** → 사용자명은 `ubuntu`

> **요약**: Oracle Linux 8(또는 Oracle Linux 9)을 쓰셨다면 사용자명은 **`opc`** 입니다.  
> Connect 버튼을 눌러 나오는 접속 예시에 사용자명이 함께 표시되는 경우가 많습니다.

---

### 4-2. Windows에서 접속하기

**① 명령 창 열기**

- 키보드에서 **Windows 키 + R** 누르기  
- `powershell` 입력 후 **Enter**  
- 검은 창(PowerShell)이 열리면 됩니다.

**② .key 파일이 있는 폴더로 이동**

- `.key` 파일을 **다운로드** 폴더에 저장했다면, 아래를 입력하고 Enter:

```
cd Downloads
```

- 다른 폴더에 저장했다면, 그 경로로 바꿔서 입력 (예: `cd C:\Users\내이름\Desktop`)

**③ 접속 명령 입력**

- 아래 **한 줄 전체**를 복사해서 붙여 넣고, **세 군데만** 본인 값으로 바꾸세요:
  - `your-key.key` → 본인 `.key` 파일 이름 (예: `alarm-bot.key`)
  - `opc` → 사용자명 (보통 `opc`)
  - `123.45.67.89` → 공개 IP 주소

```
ssh -i your-key.key opc@123.45.67.89
```

- 예시: `ssh -i alarm-bot.key opc@140.238.xxx.xxx`  
- **Enter** 누르기

**④ 처음 접속 시 나오는 질문**

- `Are you sure you want to continue connecting (yes/no)?` 라고 나오면  
- `yes` 라고 입력하고 **Enter**

**⑤ 접속 성공 확인**

- `[opc@alarm-bot ~]$` 처럼 보이면 **성공**입니다.  
- 이제 이 창에서 입력하는 명령은 **서버 안**에서 실행됩니다.

#### 접속이 안 될 때

**① Connection timed out (연결 시간 초과)**  
- 네트워크가 막혀 있을 수 있습니다.
- **Oracle Cloud 콘솔** → **Compute** → **Instances** → 본인 인스턴스 클릭
- 아래로 스크롤해서 **Primary VNIC** 섹션의 **Quick actions** 를 찾습니다.
- **"Connect public subnet to internet"** 아래의 **Connect** 버튼을 클릭합니다.
- 화면 안내대로 설정을 완료한 뒤 1~2분 기다렸다가 다시 SSH 접속을 시도해 보세요.

**② Permission denied + "UNPROTECTED PRIVATE KEY FILE"**  
- `.key` 파일 권한이 너무 열려 있어서 발생합니다.
- **Windows PowerShell**에서 `.key` 파일이 있는 폴더로 이동한 뒤 아래 **두 줄**을 순서대로 실행:

```
icacls alarm-bot.key /inheritance:r
icacls alarm-bot.key /grant:r "$env:USERNAME`:R"
```

- `alarm-bot.key` 를 실제 사용하는 `.key` 파일 이름으로 바꾸세요.
- 두 번째 줄의 **백틱(`)** 은 키보드 왼쪽 위 `~` 와 같은 자리에 있습니다.

**③ 그 외**  
- `.key` 파일 경로가 맞는지, IP 주소가 올바른지 다시 확인해 보세요.

---

### 4-3. Mac에서 접속하기

**① 터미널 열기**  
- Spotlight(검색)에서 `터미널` 검색 후 실행

**② .key 파일이 있는 폴더로 이동**

```
cd Downloads
```

(다른 폴더에 저장했다면 그 경로로 수정)

**③ 키 파일 권한 설정** (한 번만)

```
chmod 400 your-key.key
```

(`your-key.key`를 실제 파일 이름으로 바꾸세요)

**④ 접속 명령**

```
ssh -i your-key.key opc@123.45.67.89
```

(파일 이름, 사용자명, IP 주소를 본인 값으로 바꾸세요)

**⑤** 처음이라면 `yes` 입력 → Enter → 접속 완료

---

## 5단계: 서버에 Node.js 설치하기

> **이 단계가 뭐냐면**  
> **Node.js**는 봇이 돌아가려면 꼭 필요한 프로그램입니다.  
> 서버에 **한 번만** 설치하면 되고, 이후에는 다시 할 필요 없습니다.

---

### 5-1. 시작 전 확인

- **SSH로 서버에 접속된 상태**여야 합니다.
- 화면 맨 왼쪽이 `[opc@alarm-bot ~]$` 처럼 보여야 합니다.
- 아직 접속하지 않았다면 → 4단계를 먼저 진행하세요.

---

### 5-2. Node.js 설치하기

**①** 아래 명령을 **그대로 복사**해서 붙여 넣고 **Enter**:

```
sudo dnf install -y oracle-nodejs20
```

**②** 비밀번호를 물어보면
- 비밀번호 입력 후 **Enter**
- (입력해도 화면에 아무 것도 안 보이는 것은 **정상**입니다. 그냥 입력하고 Enter 누르세요)

**③** 설치가 끝날 때까지 기다립니다 (보통 1~2분)
- `Complete!` 또는 `완료` 같은 문구가 나오면 끝난 겁니다.

---

### 5-3. 위 명령이 안 될 때 (대체 방법)

`oracle-nodejs20` 패키지를 찾을 수 없다는 에러가 나오면, 아래 **두 줄**을 **순서대로** 실행하세요.

**첫 번째 줄** (Enter):

```
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
```

- 여러 줄이 출력되면서 진행됩니다. 끝날 때까지 기다리세요.

**두 번째 줄** (Enter):

```
sudo dnf install -y nodejs
```

---

### 5-4. 설치가 잘 됐는지 확인하기

아래를 입력하고 **Enter**:

```
node -v
```

- `v20.10.0` 처럼 **버전 숫자**가 나오면 **성공**입니다.
- 아무 것도 안 나오거나 "command not found" 같은 말이 나오면 → 5-3 대체 방법을 시도해 보세요.

---

## 6단계: 프로젝트 코드 가져오기

> **이 단계가 뭐냐면**  
> 봇이 돌아가려면 **소스 코드**가 서버 안에 있어야 합니다.  
> 이 단계에서는 PC에 있는 프로젝트 코드를 **서버로 가져오는** 작업을 합니다.

---

### 6-1. 방법 A — GitHub에 코드가 있을 때

GitHub에 이 프로젝트를 올려 둔 상태라면 아래 방법이 가장 쉽습니다.

**①** 아래 **세 줄**을 **한 줄씩** 순서대로 입력하고 Enter:

```
cd ~
git clone https://github.com/본인아이디/저장소이름.git alarm
cd alarm
```

**②** `본인아이디`와 `저장소이름`을 **본인 GitHub 주소에 맞게** 바꾸세요.

- 예: GitHub 주소가 `https://github.com/hong/test-alarm` 이라면  
  → `https://github.com/hong/test-alarm.git alarm` 로 입력
- `alarm` 은 서버에 만들 폴더 이름입니다. 그대로 두어도 됩니다.

**③** 세 번째 `cd alarm` 까지 실행하면, 프로젝트 폴더 안으로 들어간 상태가 됩니다.
- 프롬프트가 `[opc@alarm-bot alarm]$` 처럼 **마지막에 alarm**이 보이면 정상입니다.

---

### 6-2. 방법 B — GitHub 없이 코드 올리기

GitHub를 쓰지 않는다면, PC에서 코드를 압축해서 서버로 옮기는 방법입니다.

**① PC에서**

1. 프로젝트 폴더 전체를 선택 (예: `alarm` 폴더)
2. 오른쪽 클릭 → **압축** (또는 "압축 축소") → `alarm.zip` 같은 이름으로 저장

**② PowerShell을 새로 열고** (SSH 접속 창이 아닌, PC 쪽 창)

프로젝트가 있는 폴더로 이동한 뒤 아래를 실행합니다.
(예: 프로젝트가 `C:\Users\내이름\Desktop\코길동` 에 있다면)

```
cd C:\Users\tpwhd\OneDrive\Desktop\코길동
scp -i alarm-bot.key alarm.zip opc@161.33.212.251:~/
```

- `alarm-bot.key` → 본인 .key 파일 경로
- `161.33.212.251` → 본인 서버 공개 IP
- `alarm.zip` → 본인이 만든 압축 파일 이름

**③ 서버 쪽 SSH 창에서**

```
cd ~
unzip alarm.zip
ls
cd alarm
```

- `ls` 로 압축 해제 후 만들어진 폴더 이름을 확인하세요.
- 폴더 이름이 `alarm` 이 아니면 (예: `alarm-main`) `cd alarm-main` 처럼 해당 이름으로 들어가면 됩니다.

---

## 7단계: 환경 변수(.env) 설정

> **이 단계가 뭐냐면**  
> `.env` 파일은 **봇이 외부 서비스에 접속할 때 필요한 비밀 정보**를 담아 두는 파일입니다.  
> 텔레그램 봇 토큰, Supabase 주소·키, 한국투자증권(KIS) 키 같은 값을 여기에 넣습니다.  
> PC에서 테스트할 때 `.env` 를 만들어 두었다면, 그 내용을 **그대로 복사**해서 쓰면 됩니다.

---

### 7-1. 시작 전 확인

**①** 프로젝트 폴더에 있는지 확인하세요.

- 프롬프트가 `[opc@alarm-bot alarm]$` 처럼 **맨 끝에 alarm**이 보여야 합니다.
- 만약 `[opc@alarm-bot ~]$` 처럼 **alarm이 안 보이면**, 아래를 먼저 실행하세요:

```
cd ~/alarm
```

---

### 7-2. .env 파일 열기 (nano 편집기)

**①** 아래를 입력하고 **Enter**:

```
nano .env
```

**②** 화면이 바뀌면 성공입니다.

- **nano** 는 Linux에서 사용하는 **간단한 텍스트 편집기**입니다.
- 화면 아래쪽에 `^G Get Help`, `^O Write Out` 같은 단축키 설명이 보일 수 있습니다.
- `^` 는 **Ctrl 키**를 의미합니다. (예: `^O` = Ctrl+O)
- 아무 것도 없는 빈 화면이거나, 이미 `.env` 가 있다면 기존 내용이 보일 수 있습니다.

---

### 7-3. 내용 입력하기

**①** 아래 **5줄**을 적어 두고, **각 줄의 `여기에_...` 부분만 본인 실제 값으로 바꾼 뒤** 전체를 복사하세요.

```
TELEGRAM_BOT_TOKEN=여기에_봇_토큰
SUPABASE_URL=여기에_Supabase_URL
SUPABASE_ANON_KEY=여기에_Supabase_anon_key
KIS_APP_KEY=여기에_KIS_앱키
KIS_APP_SECRET=여기에_KIS_앱시크릿
```

**②** 주의사항
- **등호(`=`) 양쪽에 공백을 넣지 마세요.** (예: `TOKEN=abc123` O / `TOKEN = abc123` X)
- **따옴표(`"` 또는 `'`)를 넣지 마세요.** 값만 입력합니다.
- 각 줄은 **한 줄**로, 중간에 줄바꿈 없이 입력합니다.

**③** 각 값은 어디서 구하나요?

| 항목 | 어디서 구하는지 | 예시 형태 |
|------|----------------|-----------|
| TELEGRAM_BOT_TOKEN | 텔레그램에서 @BotFather 에게 `/newbot` 입력 후 봇 생성 → 받은 토큰 | `7123456789:AAH...` |
| SUPABASE_URL | Supabase 사이트 로그인 → Project Settings → API → Project URL | `https://xxxx.supabase.co` |
| SUPABASE_ANON_KEY | Supabase → Project Settings → API → **anon public** 키 | `eyJhbGc...` (긴 문자열) |
| KIS_APP_KEY | 한국투자증권 KIS Developers에서 발급한 App Key | `PSxxxxxx` |
| KIS_APP_SECRET | 한국투자증권 KIS Developers에서 발급한 App Secret | `xxxxxx` (영문·숫자) |

**④** nano 화면에 **붙여 넣기**

- Windows에서 SSH 접속한 경우: nano 안에서는 **마우스 오른쪽 클릭**으로 붙여 넣기가 됩니다.
- 또는 **Shift+Insert** 키를 눌러도 됩니다.

**⑤** 기존 `.env` 가 있었다면
- 기존 내용을 **전부 지우고** 위 5줄을 붙여 넣어도 됩니다.
- 또는 기존 내용 위/아래에 위 5줄을 추가해도 됩니다.

---

### 7-4. 저장하고 나가기 (매우 중요)

nano에서 **저장**하고 **종료**하는 방법을 순서대로 따라 하세요.

**① 저장하기**
1. **Ctrl+O** (영어 O) 키를 동시에 누릅니다.
2. 아래쪽에 `File Name to Write: .env` 가 보이면, 그대로 **Enter** 를 누릅니다.
3. 화면 하단에 `Wrote X lines` 같은 메시지가 보이면 **저장 완료**입니다.

**② 나가기**
1. **Ctrl+X** 키를 동시에 누릅니다.
2. `[opc@alarm-bot alarm]$` 프롬프트가 다시 보이면 nano를 **정상적으로 나온 것**입니다.

> **저장을 안 하고 나가면** 입력한 내용이 모두 사라집니다. 반드시 Ctrl+O → Enter 후 Ctrl+X를 순서대로 하세요.

---

### 7-5. 잘 입력됐는지 확인 (선택)

다시 `.env` 를 열어서 확인할 수 있습니다.

```
nano .env
```

- 방금 입력한 5줄이 보이면 정상입니다.
- 확인 후 **Ctrl+X** 로 나오면 됩니다. (바꾼 게 없으면 저장 여부를 묻지 않고 바로 나옵니다)

---

## 8단계: 패키지 설치 및 빌드

> **이 단계가 뭐냐면**  
> 봇이 사용하는 **라이브러리**를 설치하고, TypeScript 코드를 **실행 가능한 형태**로 만드는 단계입니다.  
> PC에서 `npm install` 과 `npm run build` 를 했던 것과 같은 작업입니다.

---

### 8-1. 필요한 라이브러리 설치

**①** 프로젝트 폴더(`alarm`)에 있는지 확인하세요.  
프롬프트가 `[opc@alarm-bot alarm]$` 처럼 끝나야 합니다.

**②** 아래를 입력하고 **Enter**:

```
npm install
```

- 화면에 여러 줄이 출력되면서 패키지가 설치됩니다.
- 1~2분 정도 걸릴 수 있습니다.
- 끝나면 다시 `[opc@alarm-bot alarm]$` 프롬프트가 보입니다.

---

### 8-2. 빌드하기 (실행 가능한 코드로 만들기)

**①** 아래를 입력하고 **Enter**:

```
npm run build
```

- TypeScript 코드가 JavaScript로 변환되면서 `dist` 폴더가 생깁니다.
- 끝나면 다시 프롬프트가 보입니다.

**②** 에러 메시지가 없이 끝나면 **성공**입니다.

- `error` 나 `Error` 로 시작하는 빨간 글씨가 많이 보이면 → 그 내용을 복사해서 질문해 주세요.

---

## 9단계: 봇과 시세 워커를 24시간 켜 두기 (PM2)

> **이 단계가 뭐냐면**  
> **PM2**는 프로그램을 **백그라운드**에서 계속 돌려 주는 도구입니다.  
> SSH 창을 닫아도, PC를 끄더라도, **봇은 서버에서 계속 돌아갑니다.**  
> 이 단계에서 봇과 시세 워커를 PM2로 켜 둡니다.

---

### 9-1. PM2 설치하기 (서버에 한 번만)

**①** 아래를 입력하고 **Enter**:

```
sudo npm install -g pm2
```

- 비밀번호를 물어보면 입력 후 Enter
- `-g` 는 "전체(global)에서 쓸 수 있게" 설치한다는 뜻입니다.
- 설치가 끝날 때까지 기다리세요.

---

### 9-2. 봇 실행하기

**①** 아래를 입력하고 **Enter**:

```
pm2 start dist/bot/index.js --name bot
```

- `dist/bot/index.js` : 8단계에서 빌드된 봇 실행 파일
- `--name bot` : 이 프로그램 이름을 `bot` 으로 부르겠다는 뜻

**②** `[PM2] Starting...` 같은 메시지가 보이고, 곧 다시 프롬프트가 나오면 정상입니다.

---

### 9-3. 시세 워커 실행하기

**①** 아래를 입력하고 **Enter**:

```
pm2 start dist/worker/kisPriceWorker.js --name worker-kis
```

- `worker-kis` : 국내·해외 주식 시세를 조회해서 목표가 도달 시 알림을 보내는 워커입니다.
- 역시 곧 프롬프트가 나오면 정상입니다.

---

### 9-4. 잘 켜졌는지 확인하기

**①** 아래를 입력하고 **Enter**:

```
pm2 status
```

**②** 화면에 **표**가 보입니다. 아래처럼 되어 있으면 **정상**입니다.

| name       | status | 설명        |
|------------|--------|-------------|
| bot        | online | 봇          |
| worker-kis | online | 시세 워커   |

- `status` 가 **online** 이면 정상 동작 중입니다.
- **stopped** 또는 **errored** 이면 문제가 있는 것이므로, 아래 **자주 쓰는 PM2 명령**에서 `pm2 logs` 로 로그를 확인해 보세요.

---

### 9-5. (선택) 서버 재부팅 후에도 자동 실행되게 하기

서버가 재부팅되어도 봇과 워커가 **자동으로 다시 켜지게** 하려면:

**①** 아래를 **순서대로** 실행:

```
pm2 save
pm2 startup
```

**②** `pm2 startup` 실행 후 화면에 **긴 명령어**가 출력됩니다.

- `[sudo] env PATH=... pm2 startup systemd ...` 처럼 **sudo** 로 시작하는 한 줄이 보입니다.
- 이 명령어를 **전체 선택해서 복사**한 뒤, 그대로 **붙여 넣고 Enter** 하세요.
- 비밀번호를 물어보면 입력 후 Enter
- 이렇게 하면 서버가 꺼졌다 켜져도 봇이 자동으로 다시 실행됩니다.

---

## 10단계: 동작 확인

> **이 단계가 뭐냐면**  
> 이제 봇이 서버에서 실제로 잘 돌아가는지 **텔레그램에서 확인**하는 단계입니다.

---

### 10-1. 봇 동작 확인

**①** 텔레그램을 열고, 이 프로젝트의 **봇**과 대화창을 엽니다.

**②** 아래를 입력하고 전송:

```
/목록
```

**③** 봇이 응답하면 (예: 등록된 목표가 목록, 또는 "등록된 목표가 없습니다" 등) **정상 동작 중**입니다.

**④** 목표가를 하나 등록해 두고, 실제로 목표가에 도달했을 때 **알림이 오는지**도 확인해 보면 좋습니다.

---

### 10-2. 문제가 있을 때

- 봇이 응답하지 않으면
  1. `pm2 status` 로 `bot` 이 **online** 인지 확인
  2. `pm2 logs bot` 으로 로그 확인 → 에러 메시지가 보이면 그 내용을 복사해서 질문
- 목표가 알림이 안 오면
  1. `pm2 status` 로 `worker-kis` 가 **online** 인지 확인
  2. `pm2 logs worker-kis` 로 로그 확인

---

## 자주 쓰는 PM2 명령

서버에 SSH로 접속한 뒤 아래 명령들을 쓸 수 있습니다.

| 하고 싶은 것 | 입력할 명령 |
|-------------|-------------|
| 봇·워커 상태 보기 | `pm2 status` |
| 봇 로그 보기 (실시간) | `pm2 logs bot` |
| 워커 로그 보기 (실시간) | `pm2 logs worker-kis` |
| 봇 재시작 | `pm2 restart bot` |
| 워커 재시작 | `pm2 restart worker-kis` |
| 둘 다 재시작 | `pm2 restart bot worker-kis` |
| 둘 다 중지 | `pm2 stop bot worker-kis` |

- `pm2 logs` 는 로그가 계속 출력됩니다. 끝내려면 **Ctrl+C** 를 누르세요.

---

## 코드 수정 후 다시 배포할 때

로컬(PC)에서 코드를 수정한 뒤, 서버에 반영하려면:

**①** 서버에 SSH로 접속한 뒤 프로젝트 폴더로 이동:

```
cd ~/alarm
```

**②** GitHub 사용 시 — 최신 코드 가져오기:

```
git pull
```

**③** 패키지 설치 및 빌드:

```
npm install && npm run build
```

**④** 봇과 워커 재시작:

```
pm2 restart bot worker-kis
```

- 이렇게 하면 수정된 코드가 서버에 반영되고, 봇과 워커가 새 코드로 다시 실행됩니다.

---

## 막혔을 때

- **어느 단계에서** 막혔는지 알려주세요. (예: "5단계 Node.js 설치에서요", "7단계 .env 입력에서요")
- **화면에 나온 메시지** 또는 **에러 문구**를 그대로 복사해서 보내 주세요.
- 가능하면 **화면 캡처**도 함께 보내 주시면, 다음에 뭘 눌러야 할지·뭘 입력해야 할지 구체적으로 안내해 드릴 수 있습니다.
