# AI_AI Project

**arcalive-information-for-ai**

아카라이브 게시글의 정보, 본문 순서, 댓글 관계, 표시 상태, 미디어를 가능한 한 충실하게 수집하여 생성형 AI가 게시글을 직접 읽고 분석하기 쉽게 전달하는 Google Chrome 확장 프로그램입니다.

현재 공개 기준 버전은 **v0.3.32**이며 **Chrome Manifest V3**를 기준으로 합니다.

---

## 무엇을 하는 프로그램인가요?

아카라이브 게시글을 연 상태에서 확장 프로그램을 실행하면 게시글의 여러 정보를 수집하고 구조화합니다.

주요 목표는 프로그램이 게시글의 의미를 대신 판단하는 것이 아니라,

> 게시글에 실제로 존재하는 정보와 관계를 가능한 한 그대로 전달하고
> 최종적인 해석은 생성형 AI가 하도록 하는 것

입니다.

기본적인 처리 흐름은 다음과 같습니다.

```text
아카라이브 게시글
        ↓
게시글 정보와 구조 추출
        ↓
AI가 읽기 위한 article.json 생성
        ↓
실제로 확보한 이미지·GIF·영상·음성 등의 파일 수집
        ↓
article.json + media files
        ↓
ZIP Package 생성 및 저장
```

---

## 주요 수집 대상

현재 프로그램은 가능한 범위에서 다음과 같은 정보를 보존합니다.

- 게시글 URL, 채널, 게시글 번호
- 제목, 카테고리, 작성자
- 작성 및 수정 관련 정보
- 추천, 비추천, 댓글 수, 조회수 등의 관찰값
- 본문 텍스트
- 본문 요소의 상대적인 순서
- 링크
- `<hr>` 같은 의미 있는 본문 구조
- 이미지
- GIF
- VIDEO
- audio
- 아카콘
- 댓글과 대댓글
- 댓글의 표시 순서와 계층 관계
- 투표
- 시리즈
- 미리보기 이미지
- `defaultImage`
- spoiler
- hidden / collapsed / blur 등의 표시 상태
- 아직 명확하게 분류하지 못한 unknown observation
- 표시용 이미지와 원본 이미지의 관계
- 실제 미디어 파일
- MIME type
- 파일 signature
- 파일 byte 크기
- 이미지 크기
- 미디어를 확보하지 못한 기술적인 이유

예를 들어 서버의 `429 Too Many Requests`, timeout, 파일 크기 제한 등으로 원본 미디어를 가져오지 못한 경우에도 이를 단순히 숨기지 않고 가능한 범위에서 누락 이유를 기록합니다.

---

## 결과물

기본 결과물은 **ZIP Package**입니다.

ZIP에는 생성형 AI가 게시글을 읽기 위한 `article.json`과 실제로 확보한 미디어 파일들이 함께 들어갑니다.

`article.json`에는 단순히 텍스트만 넣는 것이 아니라 본문, 댓글, 미디어, 순서, 관계와 함께 어떤 미디어가 Package 안의 실제 파일과 연결되는지도 가능한 범위에서 기록합니다.

반대로 생성형 AI의 게시글 분석에 필요하지 않은 로컬 컴퓨터 경로와 개발용 실행환경 정보는 최종 AI용 결과에서 최소화합니다.

---

## 설치 방법

현재 Chrome Web Store 배포판이 아니라 **압축 해제된 확장 프로그램으로 직접 로드하는 방식**입니다.

### 1. 저장소 받기

GitHub에서 이 저장소를 다운로드하거나 Git으로 clone합니다.

GitHub에서 직접 받을 경우:

1. 저장소 페이지의 **Code** 버튼을 누릅니다.
2. **Download ZIP**을 선택합니다.
3. 받은 ZIP을 원하는 위치에 압축 해제합니다.

### 2. Chrome 확장 프로그램 관리 페이지 열기

Chrome 주소창에 다음을 입력합니다.

```text
chrome://extensions
```

### 3. 개발자 모드 켜기

확장 프로그램 관리 화면 오른쪽 위의 **개발자 모드**를 켭니다.

### 4. 확장 프로그램 로드

**압축해제된 확장 프로그램을 로드합니다**를 누릅니다.

그다음 저장소 안의 `AI_AI_Chrome` 폴더를 선택합니다.

정상적으로 로드되면 **AI_AI Project** 확장 프로그램이 목록에 나타납니다.

---

## 사용 방법

### 1. 아카라이브 게시글 열기

예:

```text
https://arca.live/b/채널이름/게시글번호
```

형태의 실제 게시글을 엽니다.

### 2. AI_AI 실행

Chrome 도구 모음에서 **AI_AI Project 확장 프로그램 아이콘**을 누릅니다.

프로그램이 현재 게시글을 읽고 필요한 미디어를 수집합니다.

게시글의 이미지나 미디어 수가 많거나 서버 응답이 느린 경우 시간이 더 걸릴 수 있습니다.

### 3. 결과 저장

정상적으로 처리가 끝나면 생성된 ZIP Package가 저장됩니다.

기본 설정에서는 Chrome의 기본 다운로드 위치를 사용합니다.

---

## 저장 위치 설정

기본적으로 Chrome의 기존 다운로드 위치를 사용하므로 별도 설정 없이 사용할 수 있습니다.

원한다면 Package를 저장할 폴더를 직접 선택할 수도 있습니다.

Chrome의 AI_AI Project 확장 프로그램 설정 화면에서 다음 기능을 사용할 수 있습니다.

- **사용자 지정 폴더 선택**
- **권한 다시 허용**
- **기본 다운로드 위치 사용**

사용자 지정 폴더를 사용할 수 없거나 저장 과정에서 문제가 발생하면 프로그램은 가능한 경우 Chrome 기본 다운로드 방식으로 돌아갑니다.

---

## 사이트 접근 범위

현재 확장 프로그램은 동작을 위해 다음 아카라이브 관련 주소에 접근합니다.

```text
https://arca.live/*
https://ac.arca.live/*
https://ac-o.arca.live/*
```

게시글을 읽는 content script는 다음 게시글 경로에서 동작합니다.

```text
https://arca.live/b/*
```

과거 개발 과정에서 시험했던 localhost 기반 Remote Delivery / Relay 기능은 현재 공개용 production 확장 프로그램에 포함되지 않습니다.

---

## 기술적 한계

아카라이브 사이트 구조가 변경되면 일부 추출 기능은 수정이 필요할 수 있습니다.

또한 미디어 서버 상황에 따라 다음과 같은 일이 발생할 수 있습니다.

- HTTP 429
- timeout
- 원본 파일 요청 실패
- 파일 크기 제한
- 전체 Package 크기 제한
- 예상한 역할과 실제 MIME type의 차이

이러한 경우 프로그램 전체 결과를 임의로 실패시키기보다 가능한 정보는 계속 보존하고, 확보하지 못한 부분에는 기술적인 실패 이유를 남기는 것을 우선합니다.

`unknown`으로 수집된 요소도 단순히 오류라고 판단하거나 임의의 의미로 강제 분류하지 않습니다.

---

## 자동 테스트

프로그램 사용 자체에는 Node.js가 필요하지 않습니다.

소스 코드를 수정하거나 자동 검증을 실행하려는 경우에만 Node.js가 필요합니다.

저장소 루트에서 다음 테스트를 실행할 수 있습니다.

```powershell
node --test `
  ".\tests\content-script-regressions.test.js" `
  ".\tests\save-location-regressions.test.js"
```

v0.3.32 공개 준비 기준 검증 결과:

```text
tests 55
pass 55
fail 0
```

---

## 저장소 구조

```text
arcalive-information-for-ai
│
├─ AI_AI_Chrome
│  ├─ content-script.js
│  ├─ manifest.json
│  ├─ options.html
│  ├─ options.js
│  ├─ save-bridge.html
│  ├─ save-bridge.js
│  ├─ save-location-db.js
│  └─ service-worker.js
│
├─ tests
│  ├─ content-script-regressions.test.js
│  └─ save-location-regressions.test.js
│
├─ README.md
├─ LICENSE
└─ .gitignore
```

`AI_AI_Chrome`이 실제 Chrome 확장 프로그램입니다.

`tests`는 개발 및 회귀 검증용 파일이므로 일반 사용자가 확장 프로그램을 설치할 때 직접 실행할 필요는 없습니다.

---

## 프로젝트의 기본 원칙

AI_AI Project는 게시글의 의미, 의도, 진위 여부를 대신 결정하는 것을 목표로 하지 않습니다.

가능한 한 다음을 보존합니다.

```text
원래 정보
+
원래 순서
+
원래 관계
+
표시 상태
+
실제 미디어
+
전달하지 못한 부분의 기술적 이유
```

그리고 최종 해석은 결과를 읽는 생성형 AI가 수행하도록 합니다.

---

## Author

**arch715**

---

## License

MIT License. 자세한 내용은 `LICENSE` 파일을 확인하세요.

---

## 현재 버전

**AI_AI Project Chrome MV3 v0.3.32**
