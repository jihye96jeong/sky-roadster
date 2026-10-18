// SKY GATE 규칙의 순수 로직 (three.js 의존 없음 → Node 에서 자동 검증 가능)
// - 고정 시간 간격 물리 / 패턴 기반 게이트 생성 / 도달 가능성 검사 / 스윕 통과·충돌 판정

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- 물리 (y = 차량 바닥 높이, 충돌 중심 = y + COL_OFF)
export const PHYS = {
  STEP: 1 / 120,          // 고정 시간 간격 (프레임 속도와 무관)
  UP_ACC: 34,             // 누르는 동안 순 상승 가속
  DOWN_ACC: 24,           // 떼면 낙하 가속
  VY_UP: 7.5, VY_DOWN: -9.5,
  MIN_Y: 3, MAX_Y: 12,    // 부드러운 이동 한계 (닿아도 피해 없음)
  SOFT: .5,               // 한계 밖으로 허용되는 최대 초과량
  COL_OFF: .78,           // 충돌 중심 = 차 바닥 + 0.78
  COL_HALF: .52,          // 충돌체 반높이 (외형 1.58 보다 약간 관대: 1.04)
};
export function stepCar(s, hold, h = PHYS.STEP) {
  s.vy = clamp(s.vy + (hold ? PHYS.UP_ACC : -PHYS.DOWN_ACC) * h, PHYS.VY_DOWN, PHYS.VY_UP);
  s.y += s.vy * h;
  if (s.y < PHYS.MIN_Y) { // 스프링처럼 밀어 올리고 감쇠 (순간 정지 X)
    s.vy += (PHYS.MIN_Y - s.y) * 60 * h; if (s.vy < 0) s.vy *= 1 - 12 * h;
    if (s.y < PHYS.MIN_Y - PHYS.SOFT) { s.y = PHYS.MIN_Y - PHYS.SOFT; s.vy = Math.max(0, s.vy); }
  } else if (s.y > PHYS.MAX_Y) {
    s.vy -= (s.y - PHYS.MAX_Y) * 60 * h; if (s.vy > 0) s.vy *= 1 - 12 * h;
    if (s.y > PHYS.MAX_Y + PHYS.SOFT) { s.y = PHYS.MAX_Y + PHYS.SOFT; s.vy = Math.min(0, s.vy); }
  }
  return s;
}

// ---------------------------------------------------------------- 게이트 치수 (외형 메시와 충돌이 같은 숫자를 쓴다)
export const GATE = {
  HALF_W: 4.6,            // 중앙 경로만 막으면 되므로 도로 전체를 덮지 않음(뒤 게이트 가림 최소화)
  BOTTOM: 2.0,            // 하단 패널 시작 (정체 차량 지붕 위). 최저 비행 충돌체 바닥 ≈ 2.76 보다 아래
  TOP: 15.2,              // 상단 패널 끝. 최고 비행 충돌체 꼭대기 ≈ 13.8 보다 위
  MID: 8.2,               // 레벨 0 의 구멍 중심
  AMP: 3.3,               // 레벨 ±1 의 중심 이동폭
  CHECK_Z: [-1, 0, 1],    // 차량 앞·중앙·뒤 판정면 (게이트가 이 z 를 지나는 순간 검사)
  PERFECT: .3,            // 안전 중심 이동 범위의 가운데 30% (= 반폭의 ±0.3)
};
export const safeHalf = g => g.h / 2 - PHYS.COL_HALF;   // 충돌 중심이 움직일 수 있는 반폭
export const holeTop = g => g.c + g.h / 2;
export const holeBottom = g => g.c - g.h / 2;
export const inHole = (g, yc) => yc - PHYS.COL_HALF >= holeBottom(g) && yc + PHYS.COL_HALF <= holeTop(g);

// 스윕 판정: 게이트가 zPrev → zNew 로 움직이는 동안 지나간 판정면마다, 그 순간의 충돌 중심(ycPrev→ycNew 보간)으로 검사.
// 반환: [{ plane, yc, ok }] (프레임이 길어도 지나간 면을 하나도 놓치지 않는다)
export function sweepPlanes(zPrev, zNew, ycPrev, ycNew, g) {
  const out = [];
  for (const pz of GATE.CHECK_Z) {
    if (zPrev < pz && zNew >= pz) {
      const f = (pz - zPrev) / (zNew - zPrev), yc = ycPrev + (ycNew - ycPrev) * f;
      out.push({ plane: pz, yc, ok: inHole(g, yc) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- 도달 가능성 검사
// 이전 게이트를 '안전 영역 어디서든' 통과한 상태(나쁜 방향의 수직 속도 포함)에서,
// 반응 지연을 둔 현실적인 조작으로 다음 게이트 안전 영역(여유 포함)에 들어갈 수 있는지 시뮬레이션.
const REACT = .2, START_VY = 2.5, MARGIN = .55, LEAD = .22;
export function canReach(g0, g1, T) {
  const m0 = safeHalf(g0) * MARGIN, m1 = safeHalf(g1) * MARGIN;
  const up = g1.c > g0.c;
  for (const off of [-m0, 0, m0]) {
    const s = { y: g0.c + off - PHYS.COL_OFF, vy: up ? -START_VY : START_VY };
    const h = 1 / 60; let t = 0, ok = false;
    while (t < T) {
      const yc = s.y + PHYS.COL_OFF;
      const hold = t < REACT ? !up : (g1.c - yc) - s.vy * LEAD > 0; // 처음엔 반대로 조작 중(최악), 이후 리드 제어
      stepCar(s, hold, h); t += h;
    }
    const yc = s.y + PHYS.COL_OFF;
    if (Math.abs(yc - g1.c) > m1) return false;
    ok = true;
  }
  return true;
}
// 계속 누르기만/떼기만 하는 정지 상태 충돌 중심이 구멍에 들어가면 안 됨 (한계 높이에 붙어 생존 불가)
export const extremeFits = g => inHole(g, PHYS.MAX_Y + PHYS.COL_OFF) || inHole(g, PHYS.MIN_Y + PHYS.COL_OFF);

// ---------------------------------------------------------------- 패턴 기반 생성
// 레벨(-1..1) 배열. 같은 패턴 연속 금지, 어려운 패턴 뒤엔 회복용 넓은 게이트.
export const PATTERNS = [
  { id: 1, lv: a => [a, a], wide: true },                // 같은 높이의 넓은 게이트 2개
  { id: 2, lv: () => [0, .45, 0] },                        // 중간 → 약간 높게 → 중간
  { id: 3, lv: () => [0, -.45, 0] },                       // 중간 → 약간 낮게 → 중간
  { id: 4, lv: () => [-.7, 0, .7], hard: true },           // 낮음 → 중간 → 높음
  { id: 5, lv: () => [.7, 0, -.7], hard: true },           // 높음 → 중간 → 낮음
  { id: 6, lv: () => [-.85, .85, -.85], hard: true, gapMul: 1.25, late: true }, // 후반: 충분한 전환 시간
];
const OPENING = [{ L: 0, wide: true }, { L: 0 }, { L: .3 }, { L: 0 }]; // 모든 도시 공통 고정 도입부

export function stageParams(i, lap = 0) {
  const k = clamp((i + lap * 2) / 5, 0, 1.4);   // 0 = 서울(규칙 익히기) … 1 = 뉴욕, 이후 바퀴는 조금 더
  return {
    speed: 46 + i * 2 + lap * 4,                 // 제한적인 전진 속도 증가
    gapStart: clamp(2.5 - .3 * k, 1.9, 2.5), gapEnd: clamp(2.1 - .5 * k, 1.45, 2.1), // 게이트 도착 간격(초)
    holeStart: clamp(4.2 - .6 * k, 3.3, 4.2), holeEnd: clamp(3.6 - 1.0 * k, 2.4, 3.6), // 구멍 높이 (충돌체 1.04 의 약 4배 → 2.3배)
    amp: clamp(.6 + .4 * k, .6, 1),             // 높이 변화폭
    firstAt: 3.2,                                // 도시 진입 후 적응 시간(초)
    duration: 33,                                // 마지막 게이트까지 목표 시간(초) → 도착까지 약 38~42초
  };
}

function rng(seed) { // mulberry32: 같은 도시는 매번 같은 배치 → 재도전하며 익힘
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function generateTrack(i, lap = 0) {
  const P = stageParams(i, lap), R = rng(1000 + i * 17 + lap * 131);
  const gates = [], log = { adjusted: 0 };
  const toC = L => GATE.MID + L * P.amp * GATE.AMP;
  let t = P.firstAt, prev = null, lastPat = 0, recover = false;
  const push = (L, wide, gapMul = 1) => {
    const p = clamp((t - P.firstAt) / P.duration, 0, 1);
    let h = lerp(P.holeStart, P.holeEnd, p) + (wide ? .6 : 0);
    let c = toC(clamp(L, -1, 1));
    while (extremeFits({ c, h })) c += (GATE.MID - c) * .2; // 한계 높이에 붙어서는 통과 불가하게
    let gap = lerp(P.gapStart, P.gapEnd, p) * gapMul;
    if (prev) {
      // 도달 불가능하면: 먼저 간격을 늘리고(최대 4회), 그래도 안 되면 높이 차를 줄임
      let tries = 0;
      while (!canReach(prev, { c, h }, gap) && tries < 14) {
        if (tries < 4) gap *= 1.08; else c = prev.c + (c - prev.c) * .85;
        tries++; log.adjusted++;
      }
      t += gap;
    }
    const g = { idx: gates.length, t, c, h, wide: !!wide };
    gates.push(g); prev = g;
  };
  for (const o of OPENING) push(o.L, o.wide);
  while (t < P.firstAt + P.duration) {
    const p = (t - P.firstAt) / P.duration;
    if (recover) { push((prev.c - GATE.MID) / (P.amp * GATE.AMP) * .4, true, 1.3); recover = false; continue; }
    const pool = PATTERNS.filter(pt => pt.id !== lastPat && (!pt.hard || p > (i === 0 ? .5 : .2)) && (!pt.late || (i >= 2 && p > .5)));
    const pat = pool[Math.floor(R() * pool.length)];
    const lv = pat.lv((R() - .5) * .6);
    for (const L of lv) push(L + (R() - .5) * .16, pat.wide, pat.gapMul || 1); // 작은 높이 변주
    lastPat = pat.id; if (pat.hard) recover = true;
  }
  const finishT = prev.t + 2.4;
  for (const g of gates) g.d = g.t * P.speed;  // 트랙 거리
  return { params: P, gates, finishD: finishT * P.speed, log };
}
