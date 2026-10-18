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
  // PERFECT: 안전 이동 범위의 가운데 30% 이되, 절대 ±0.4 를 넘지 않음 → 구멍을 넓혀도 PERFECT 는 정교함 유지
  PERFECT_FRAC: .3, PERFECT_ABS: .4,
};
export const safeHalf = g => g.h / 2 - PHYS.COL_HALF;   // 충돌 중심이 움직일 수 있는 반폭
export const holeTop = g => g.c + g.h / 2;
export const holeBottom = g => g.c - g.h / 2;
export const perfectHalf = g => Math.min(GATE.PERFECT_ABS, GATE.PERFECT_FRAC * safeHalf(g));
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

// ---------------------------------------------------------------- 도달 가능성 검사 (수직 속도 포함)
// 이전 게이트를 '일반 통과 범위의 여러 위치 × 여러 수직 속도(하강/정지/상승)'로 지난 상태에서 출발.
// 반응 지연 동안은 직전 조작을 유지(상승 중이면 계속 누름)하고, 이후 리드 제어로 다음 안전 영역(여유 포함)에 드는지.
const REACT = .18, MARGIN = .6, LEAD = .22, START_VY = [-3, 0, 3];
export function canReach(g0, g1, T) {
  const m0 = safeHalf(g0) * MARGIN, m1 = safeHalf(g1) * MARGIN, h = 1 / 60;
  for (const off of [-m0, 0, m0]) for (const vy0 of START_VY) {
    const s = { y: g0.c + off - PHYS.COL_OFF, vy: vy0 }, prevHold = vy0 > 0;
    for (let t = 0; t < T; t += h) {
      const yc = s.y + PHYS.COL_OFF;
      stepCar(s, t < REACT ? prevHold : (g1.c - yc) - s.vy * LEAD > 0, h);
    }
    if (Math.abs(s.y + PHYS.COL_OFF - g1.c) > m1) return false;
  }
  return true;
}
// 계속 누르기만/떼기만 할 때 실제로 머무는 높이(부드러운 한계에서의 평형점)를 시뮬레이션으로 구한다
export const EXTREME = (() => {
  const hi = { y: GATE.MID, vy: 0 }, lo = { y: GATE.MID, vy: 0 };
  for (let k = 0; k < 600; k++) { stepCar(hi, true); stepCar(lo, false); }
  return { hold: hi.y + PHYS.COL_OFF, release: lo.y + PHYS.COL_OFF }; // 충돌 중심 높이
})();
// 그 높이의 충돌체가 구멍에 들어가면 안 됨 (한계 높이에 붙어서는 생존 불가)
export const extremeFits = g => inHole(g, EXTREME.hold) || inHole(g, EXTREME.release);
// 구멍 높이 h 일 때 허용되는 중심 범위: 양 극단을 여유 .25 이상으로 반드시 막음
export const cRange = h => [EXTREME.release - PHYS.COL_HALF + .25 + h / 2, EXTREME.hold + PHYS.COL_HALF - .25 - h / 2];

// ---------------------------------------------------------------- 부드러운 경로 구간 생성
// 한 구간(약 7~10개) = 목표 대역(낮음/중간/높음)으로 몇 개에 걸쳐 완만히 이동 → 그 높이에서 작은 물결(조금 촘촘하게)
// → 넓고 평평한 회복 게이트 2개 → 다음 구간. 한 번의 높이 차는 작게, 여러 게이트에 걸쳐 크게.
export const WAVES = [
  [0, 1, 1, 0],          // 조금 위 → 유지 → 원래
  [0, -1, -1, 0],        // 조금 아래 → 유지 → 원래
  [0, 1, 0, -1, 0],      // 완만한 물결
  [0, -1, 0, 1, 0],
  [0, 0, 1, 1, 0],       // 같은 높이 2 → 조금 위 2 → 원래
];

export function stageParams(i, lap = 0) {
  const k = clamp((i + lap * 2) / 5, 0, 1.4);   // 0 = 서울 … 1 = 뉴욕. 도시가 바뀌어도 완만하게만 변함
  return {
    speed: 46 + i * 2 + lap * 3,                // 전진 속도는 거의 그대로, 간격은 '통과 시간'으로 정함
    gapOpen: 1.4,                                // 시작 3개
    gapNormal: clamp(1.15 - .12 * k, 1.0, 1.15), // 일반 (서울 1.15 → 뉴욕 1.03)
    gapDense: clamp(.95 - .08 * k, .85, .95),    // 짧은 밀집 (서울 .95 → 뉴욕 .87)
    gapRecover: 1.35,                            // 회복
    holeStart: clamp(5.0 - .3 * k, 4.4, 5.0),    // 이전(4.2)보다 약 20% 넓게 (충돌체 1.04 의 약 4.8배)
    holeEnd: clamp(4.4 - .5 * k, 3.7, 4.4),      // 이전(3.6)보다 약 22% 넓게, 후반 도시도 3.5배 이상
    wideBonus: .5,                               // 회복·도입 게이트
    step: clamp(.7 + .15 * k, .7, .85),          // 게이트 사이 높이 변화 최대 한 칸 (단위: m) — 한 번엔 작게, 여러 개에 걸쳐 크게
    firstAt: 3.2,                                // 도시 진입 후 적응 시간
    count: 20,                                   // 도시당 게이트 수 (같은 밀도 → 도착까지 약 25초)
    duration: 21,                                // 구멍 크기가 시작→끝 값으로 줄어드는 시간 기준
  };
}

function rng(seed) { // mulberry32: 같은 도시는 매번 같은 배치 → 재도전하며 익힘
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function generateTrack(i, lap = 0) {
  const P = stageParams(i, lap), R = rng(1000 + i * 17 + lap * 131);
  const gates = [], log = { adjusted: 0, sections: 0 };
  const prog = () => clamp((t - P.firstAt) / P.duration, 0, 1);
  const holeAt = wide => lerp(P.holeStart, P.holeEnd, prog()) + (wide ? P.wideBonus : 0);
  let t = P.firstAt, prev = null, band = 1, lastWave = -1;
  const push = (cWant, gap, kind, wide) => {
    const h = holeAt(wide), [lo, hi] = cRange(h);
    let c = clamp(cWant, lo, hi);
    if (prev) c = clamp(clamp(c, prev.c - P.step, prev.c + P.step), lo, hi); // 연속 높이 차는 어떤 경우에도 한 칸 이하
    if (prev) {
      gap = Math.max(gap, .8);                 // 어떤 경우에도 0.8초보다 촘촘하지 않게 (시간 기준)
      let tries = 0; const g0 = gap;
      while (!canReach(prev, { c, h }, gap) && tries < 12) { // 불가능하면 간격을 조금 늘리고(최대 +25%), 그다음 높이 차를 줄임
        if (gap < g0 * 1.25) gap *= 1.06; else c = prev.c + (c - prev.c) * .8;
        tries++; log.adjusted++;
      }
      t += gap;
    }
    const g = { idx: gates.length, t, c, h, wide: !!wide, kind };
    gates.push(g); prev = g; return g;
  };
  // 도입: 같은 높이의 넓은 게이트 3개 (모든 도시 공통, 1.4초 간격)
  for (let k = 0; k < 3; k++) push(GATE.MID, P.gapOpen, 'open', true);
  while (true) {
    // 1) 목표 대역: 지금과 다른 대역(낮음 0 / 중간 1 / 높음 2)
    const [lo, hi] = cRange(holeAt(false));
    const bands = [lo + .3, GATE.MID, hi - .3];
    let nb; do nb = Math.floor(R() * 3); while (nb === band || (Math.abs(nb - band) === 2 && R() < .5));
    const goal = bands[nb] + (R() - .5) * .3;
    // 2) 완만한 이동: smoothstep 의 가장 가파른 칸(평균의 1.5배)도 한 칸(step) 이하가 되게 나눔 (계단 X)
    const n = Math.max(2, Math.ceil(1.5 * Math.abs(goal - prev.c) / P.step));
    const wi0 = (lastWave + 1 + Math.floor(R() * (WAVES.length - 1))) % WAVES.length;
    const est = n * P.gapNormal + (WAVES[wi0].length - 1) * P.gapDense + 2 * P.gapRecover;
    if (gates.length + n + WAVES[wi0].length + 1 > P.count) break; // 남은 개수에 안 맞는 구간은 시작하지 않음
    band = nb; log.sections++;
    const from = prev.c;
    for (let k = 1; k <= n; k++) { const e = k / n, s2 = e * e * (3 - 2 * e); push(from + (goal - from) * s2, k === 1 ? P.gapNormal : P.gapNormal * .96, 'move', false); }
    // 3) 그 높이에서 작은 물결 — 가운데는 조금 촘촘하게(집중 구간)
    const wi = wi0; lastWave = wi;
    const w = WAVES[wi], wstep = P.step * .75, base = prev.c;
    w.forEach((v, k) => { if (k === 0) return; push(base + v * wstep + (R() - .5) * .1, k < w.length - 1 ? P.gapDense : P.gapNormal, 'dense', false); });
    // 4) 회복: 넓고 높이 변화가 거의 없는 게이트 2개 (공백이 아니라 '쉬운 게이트'로 쉼)
    for (let k = 0; k < 2; k++) push(prev.c + (R() - .5) * .12, P.gapRecover, 'recover', true);
  }
  // 남은 시간은 중앙 쪽으로 돌아오는 넓은 게이트 + 작은 물결로 채우고 도착 (평평하게만 반복하지 않음)
  for (let k = 0; gates.length < P.count; k++) push(prev.c + (GATE.MID - prev.c) * .35 + (k % 2 ? .3 : -.3), P.gapNormal, 'recover', true);
  const finishT = prev.t + 2.4;
  for (const g of gates) g.d = g.t * P.speed;  // 트랙 거리 (시간 × 속도 → 속도가 바뀌어도 통과 시간 간격 유지)
  return { params: P, gates, finishD: finishT * P.speed, log };
}
