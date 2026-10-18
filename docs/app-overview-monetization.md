# SKY ROADSTER — 앱 개요, 수익화·마케팅 방향, 소개 문구

> **결론: 지금은 무료 공개로 플레이 수를 먼저 확인하고, 수익화는 "결제 없는 후원(팁) 링크"부터 검토한다. 먼저 할 일은 로드스터 외형의 상표·디자인 이슈 정리.**
> (아래 판단은 실제 이용자 반응이 아니라 **구현을 보고 내린 판단**이다.)

## 1. 어떤 앱인가

**막힌 도로 위로 로드스터를 띄워, 하늘의 게이트를 연속으로 통과하는 브라우저용 원버튼 비행 게임.**

- 흐름: 랜딩 화면 → 첫 입력으로 교통체증에서 이륙 → 도시당 게이트 15개 통과(약 20초) → 도착 배럴 롤 → 결과 → 다음 도시(6개 도시 순환, 이후 바퀴마다 조금 빨라짐)
- 단계: **배포됨** (https://sky-roadster.vercel.app, Vercel 정적 호스팅). 결제·광고·로그인 **없음**
- 주요 기능: 누르면 상승·떼면 하강하는 120Hz 고정 스텝 물리, 패턴으로 생성되고 도달 가능성이 자동 검증된 게이트(`track.js`, `tools/test_track.mjs`), PERFECT(구멍 중심 ±0.4) 연속 기록, 목숨 3개, 6개 언어, PC·모바일 터치
- 현재 한계
  - 저장: 최고 점수·음소거·언어만 **브라우저 localStorage**(이 기기·이 브라우저에만 저장)에 기록. 계정·서버·순위표 없음
  - three.js를 CDN(jsdelivr)에서 불러옴 → 오프라인·CDN 장애 시 실행 불가(로딩 실패 화면과 재시도는 있음)
  - 소리는 WebAudio 합성음(음악 파일 없음)
  - 실제 휴대폰·저사양 기기 성능은 **확인 필요**(헤드리스 Chrome에서만 검증)

## 2. 어떤 스타일이고, 무엇이 매력인가

- 첫인상: 실사 도시 스카이라인과 정체된 실사 차량 위로 미래형 로드스터가 증기를 뿜으며 뜨는 **시네마틱 + 아케이드** 톤. 딥 블랙 UI, 후미등 레드 포인트
- 계속 하게 되는 이유: 조작은 하나인데 게이트가 0.9~1.4초 간격으로 이어져 **"누르고 떼는 타이밍"에 계속 집중**하게 됨. 한 판 20초라 재도전 부담이 적음. PERFECT 연속 기록이 숙련 목표(구현을 보고 내린 판단)
- 처음 겨냥할 사용자: 짧게 즐기는 캐주얼 게이머, 원버튼 게임을 좋아하는 모바일·PC 사용자, AI로 만든 게임에 관심 있는 개발자 커뮤니티
- 비교하면 이해되는 서비스: **Flappy Bird**의 원버튼 긴장감을 3D 시네마틱 비주얼로 옮긴 것
- 대표 특징(키우자는 제안): **"교통체증 위로 이륙"하는 첫 장면과 도착 배럴 롤**. 공유되는 순간이 이 두 장면이므로 영상·이미지 홍보의 중심으로 삼는다

## 3. 돈은 어떻게 벌면 좋을까

| 상품 | 파는 것 | 어울리는 이유 |
|---|---|---|
| 후원(팁) 링크 — **향후 제안** | 결제 없이 외부 후원 페이지(예: Ko-fi·Buy Me a Coffee)로 연결 | 게임 흐름을 전혀 건드리지 않고, 결제 시스템을 직접 만들 필요가 없음 |
| 외형 꾸미기 일회성 구매 — **향후 제안** | 로드스터 도장색·분사 증기 색 같은 **순수 외형** | 점수·난이도에 영향이 없어 공정함을 해치지 않음 |

- 먼저 검토할 것: **후원 링크**. 결제 처리·환불·구매 복구가 필요 없어 지금 구조(서버 없음)에 바로 붙일 수 있음
- 피해야 할 방식: 목숨 추가·이어하기 판매, 게이트를 넓혀 주는 아이템 등 **유료로 쉬워지는 것**. 이 게임의 재미는 "같은 조건에서 타이밍을 익히는 것"이라 이를 직접 깎음
- 지금 보류: **광고**(20초짜리 판 사이 광고는 리듬을 끊음), **구독**(콘텐츠가 6개 도시라 지속 가치가 부족)
- 결제 도입 시 필요한 기술 사항 (향후 제안)
  - 서버 측 **결제 확인**(결제사 웹훅: 결제 완료를 서버로 알려 주는 알림으로 위·변조 방지)
  - **구매 복구**: 지금은 localStorage뿐이라 기기 변경 시 구매가 사라짐 → 계정 또는 복구 코드 필요
  - 환불 처리, 영수증 보관, 결제사 수수료 반영

## 4. 어떻게 퍼뜨리면 좋을까

- 홍보 문장: **"Fly a roadster over the traffic and thread every sky gate."** (막힌 도로? 위로 가면 됩니다.)
- 처음 만들 짧은 콘텐츠 3개
  1. 교통체증에서 이륙하는 첫 5초 (이미 있음: `promo/sky-roadster-gameplay.mp4`, 실제 플레이 1.6배속 — 저장소에는 포함 안 됨)
  2. PERFECT 연속으로 게이트를 꿰는 10초 클립
  3. 도착 배럴 롤 + 증기 고리 장면
- 채널: X(트위터), 유튜브 쇼츠·틱톡(세로 편집본 필요), 커뮤니티는 Reddit r/WebGames·r/IndieGaming, itch.io(브라우저 게임 등록), 국내 개발자 커뮤니티
- 현재 앱 안의 공유·유입 기능: **없음**(공유 버튼·순위표·분석 도구 없음). 페이지 `<head>`의 `moa-verify` 메타 태그는 외부 플랫폼 소유 확인용으로, 유입 기능이 아님
  - 성과로 계산하면 안 되는 지표: X 포스트 조회수·좋아요, 큐레이션 봇 소개(예: gamesareart 자동 계정 소개 글 조회수 53)는 **실제 플레이 수가 아님**. 플레이 수를 보려면 분석 도구 도입이 먼저(향후 제안, 개인정보 고지 필요)
- 권장 환경: PC 데스크톱 브라우저(키보드 SPACE)가 기본, 모바일은 세로 화면 터치 지원(실기기 확인 필요)

## 5. 돈 받기 전에 확인할 것

- **AI 생성 에셋**: 배경·차량·장애물·지면·게이트 텍스처를 xAI `grok-imagine-image`로 생성(`tools/gen_assets.py`). xAI 이용약관상 생성물의 **상업 이용 조건 확인 필요**
- **레퍼런스 이미지**: 플레이어 차량은 사용자가 제공한 실제 로드스터 사진(`ref/`)을 참조 입력으로 생성 → 원본 사진의 저작권, 그리고 공개 저장소에 원본을 올려도 되는지 **확인 필요**
- **상표·디자인**: 외형이 실제 차량(테슬라 로드스터)을 닮았고 홍보 글에서 Tesla를 언급·태그함 → 유료화 전 **상표·디자인권 검토 필요**. 이름은 일반명사 "Roadster"지만 "fan-made, not affiliated" 표기 권장
- **랜드마크**: 일부 건축물은 이미지 상업 이용에 권리 주장이 있음(예: 에펠탑 야간 조명, 시드니 오페라 하우스) → **확인 필요**
- **폰트·음악**: 폰트는 시스템 폰트만 사용(웹폰트 없음), 음악 파일 없음(효과음은 코드 합성) → 별도 라이선스 이슈는 확인되지 않음
- **외부 서비스**: Vercel(호스팅 요금제·상업 이용 조건 확인 필요), jsdelivr CDN(three.js, MIT 라이선스). 런타임에 AI API를 호출하지 않으므로 플레이에 따른 API 비용은 없음
- **개인정보·결제·데이터**: 현재 수집하는 개인정보·쿠키 없음, 저장은 기기 내 localStorage뿐. 결제·분석 도구를 붙이면 개인정보 처리방침·환불 정책 문서가 새로 필요
- **내부 정책 문서**: 저장소에 개인정보·이용약관·라이선스 문서 **없음**(확인함). 공개 저장소이므로 LICENSE 지정 여부도 결정 필요


## 6. 스토어·소개 페이지용 문구와 태그

- 배포: https://sky-roadster.vercel.app
- 한 줄 소개: **Fly a roadster over the traffic and thread every sky gate.**
  (한국어: 로드스터로 막힌 도로 위를 날아, 하늘의 게이트를 꿰뚫어라.)

### 상세 소개 (English)

**Stuck in traffic? Go up.**

SKY ROADSTER is a one-button flying game that runs right in your browser. Take off from a gridlocked highway in a futuristic roadster and thread a line of sky gates above the traffic.

**How to play**
- Hold SPACE (or touch the screen) to rise, release to dive.
- Fly through the opening in each SKY GATE. Hitting a panel costs one of your 3 lives.
- Pass dead center for a **PERFECT**, and keep the streak going.

**Features**
- 6 cities: Seoul, London, Paris, Dubai, Sydney and New York, each with its own landmark skyline.
- 15 gates per city: about 20 seconds of focused, flowing flight.
- Reach the landmark and celebrate with a steam-trailing barrel roll.
- Photoreal traffic, skylines and roadster, generated with Grok Imagine.
- PC and mobile, 6 languages, no install.

Built with Claude Opus 5.5 + Grok Imagine.

### 상세 소개 (한국어)

**막힌 도로? 위로 가면 됩니다.**

SKY ROADSTER는 브라우저에서 바로 즐기는 원버튼 비행 게임입니다. 꽉 막힌 고속도로에서 로드스터로 이륙해, 정체된 차들 위에 늘어선 하늘의 게이트를 통과하세요.

**조작**
- SPACE(모바일은 화면 터치)를 누르고 있으면 상승, 떼면 하강합니다.
- SKY GATE의 구멍을 통과하세요. 패널에 부딪히면 목숨이 하나 줄어요(총 3개).
- 구멍 정중앙을 지나면 **PERFECT**. 연속 기록에 도전해 보세요.

**특징**
- 서울·런던·파리·두바이·시드니·뉴욕 6개 도시, 도시마다 랜드마크 스카이라인.
- 도시당 게이트 15개, 약 20초 동안 끊김 없이 이어지는 몰입 비행.
- 목적지에 닿으면 분사 증기를 뿜는 배럴 롤 퍼포먼스.
- 실사 차량·스카이라인·로드스터를 Grok Imagine으로 제작.
- PC·모바일, 6개 언어, 설치 없이 바로 플레이.

Claude Opus 5.5 + Grok Imagine으로 제작.

### 태그

- English: `one-button` `arcade` `flying` `roadster` `browser-game` `casual` `reflex` `cities` `landmarks` `mobile` `html5` `threejs` `ai-made` `claude` `grok-imagine`
- 한국어: `원버튼` `아케이드` `비행` `로드스터` `브라우저게임` `캐주얼` `반응속도` `세계도시` `랜드마크` `모바일` `AI제작`
- 개수 제한이 있으면 앞에서부터: `one-button` `arcade` `flying` `roadster` `browser-game`
- 브랜드 오해를 피하려면 `tesla` 태그는 쓰지 않음

### 스크린샷 (공개 URL)

`https://raw.githubusercontent.com/jihye96jeong/sky-roadster/main/media/screenshots/` 아래
`01-landing` `02-liftoff` `03-over-traffic` `04-gate-approach` `05-gate-pass` `06-perfect` `07-finish-ring` `08-barrel-roll` `09-result` (.jpg, 1280×720)

---

이 게임은 "기획부터 3D 게임플레이·다국어·자동 검증 테스트·홍보 영상까지 하루 만에 만든 사례"로 제작자의 **AI 협업 제작 역량을 보여 주는 포트폴리오**가 될 수 있다. 다만 **게임 유입(플레이 수)**과 **제작 문의(외주·협업 연락)**는 다른 성과이므로, 홍보 글의 링크와 문의 경로를 분리해서 각각 측정하는 것을 권장한다.
