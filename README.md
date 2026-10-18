# Sky Roadster

교통 체증 → 이륙 → 6개 도시(서울·런던·파리·두바이·시드니·뉴욕) 상공을 날아 랜드마크까지 가는 가벼운 3D 미니 게임.

## 실행
```bash
python tools/serve.py
```
→ http://localhost:8765  (`.env`, `tools/` 는 서빙되지 않음)

## 에셋 다시 만들기 (xAI grok-imagine)
`.env` 에 `XAI_API_KEY=...`
```bash
python tools/gen_assets.py              # 없는 것만 생성
python tools/gen_assets.py seoul car_suv   # 지정한 것만 재생성
```
- 도시 배경(16:9) / 도시 항공사진 지면 / 실사 차량·장애물 스프라이트(그린스크린 → 투명 WebP)
- 플레이어 로드스터는 `ref/2.png` 레퍼런스 사진을 넣어 같은 디자인으로 생성

## 언어 (i18n)
English(기본) · 한국어 · 日本語 · 中文 · Español · Français — `i18n.js`
- 기본 언어는 영어. URL `?lang=ko|ja|zh|es|fr|en` 으로 바로 지정(공유 가능한 경로), 랜딩/일시정지의 언어 선택은 저장됨
- 자동 감지(시간대 → 국가 → 언어, 그다음 브라우저 언어)는 `i18n.js` 의 `AUTO_DETECT` 로 켤 수 있음.
  정적 사이트라 IP 기반 국가 판별은 하지 않음 — 호스팅에서 국가 헤더(예: CF-IPCountry)를 쓸 수 있으면 그 값으로 `?lang=` 리다이렉트 권장

## 게임 규칙 (SKY GATE)
- 조작 하나: 누르고 있으면 상승, 떼면 낙하. 전진 자동, 좌우 이동 없음
- 장애물은 SKY GATE 하나뿐: 상·하단 패널이 막고 가운데 가로 구멍만 안전. 배경 차량은 충돌 없음
- 점수: 통과 +100, PERFECT(구멍 중심 30% 이내) +150, PERFECT 연속은 표시·소리만 강화
- 목숨 3, 피격 시 1초 무적, 같은 게이트 중복 피해/보상 없음
- 로직: `track.js` (고정 120Hz 물리, 패턴 생성 + 도달 가능성 검사, 스윕 판정)
- 자동 검증: `node tools/test_track.mjs`
- 디버그 표시: URL `?debug` 또는 `` ` `` 키 (구멍·차량 충돌체·판정면·도달 범위)
