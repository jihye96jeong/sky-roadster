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
