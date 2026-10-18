// SKY GATE 규칙 자동 검증:  node tools/test_track.mjs
// 도달 가능성(수직 속도 포함) · 통과/충돌 판정 · 중복 보상 방지 · 저프레임 판정 · 극단 입력 생존 불가
// · 촘촘한 배치의 시간 간격/높이 차/안전 범위 겹침 · 피격 직후 회복 · 초보형(노이즈) 조작 생존
import { PHYS, GATE, stepCar, generateTrack, canReach, sweepPlanes, inHole, safeHalf, perfectHalf, extremeFits } from '../track.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL', msg); } };
const INV = .5; // main.js 와 같은 피격 무적 시간

// 트랙 전체 비행. control(state, nextGate, t, ctx) → hold. 판정은 게임과 같은 스윕 + 게이트당 1회 해석 + 무적
function fly(track, control, { frameDt = PHYS.STEP, decide = 0, decideJitter = 0, rnd = Math.random } = {}) {
  const { gates, params } = track, s = { y: GATE.MID - PHYS.COL_OFF, vy: 0 };
  const res = gates.map(() => ({ resolved: null, events: 0, center: null }));
  let dist = 0, t = 0, hold = false, nextDecide = 0, acc = 0, inv = 0;
  const end = gates[gates.length - 1].d + 40;
  while (dist < end) {
    acc += frameDt;
    while (acc >= PHYS.STEP) {
      acc -= PHYS.STEP;
      const ni = gates.findIndex((g, k) => !res[k].resolved && -(g.d - dist) < 2);
      if (t >= nextDecide) { hold = control(s, gates[ni], t, { ni, res }); nextDecide = t + decide + decideJitter * rnd(); }
      const ycPrev = s.y + PHYS.COL_OFF; stepCar(s, hold); const ycNew = s.y + PHYS.COL_OFF;
      const dz = params.speed * PHYS.STEP;
      for (let k = 0; k < gates.length; k++) {
        const g = gates[k], r = res[k]; if (r.resolved) continue;
        const zPrev = -(g.d - dist);
        for (const e of sweepPlanes(zPrev, zPrev + dz, ycPrev, ycNew, g)) {
          r.events++;
          if (!e.ok) { r.resolved = inv > 0 ? 'ghost' : 'hit';
            if (r.resolved === 'hit') { inv = INV; s.vy = e.yc > g.c ? Math.min(s.vy, -1.5) : Math.max(s.vy, 1.5); } break; } // main.js 와 같은 피격 처리
          if (e.plane === 0) r.center = e.yc - g.c;
          if (e.plane === GATE.CHECK_Z[GATE.CHECK_Z.length - 1]) r.resolved = Math.abs(r.center) <= perfectHalf(g) ? 'perfect' : 'pass';
        }
      }
      inv = Math.max(0, inv - PHYS.STEP); dist += dz; t += PHYS.STEP;
    }
  }
  return res;
}
const lead = (s, c, k = .25) => (c - (s.y + PHYS.COL_OFF)) - s.vy * k > 0;
const human = (s, g) => g ? lead(s, g.c) : false;
function rngSeed(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const count = (r, v) => r.filter(x => x.resolved === v).length;

for (let lap = 0; lap < 3; lap++) for (let i = 0; i < 6; i++) {
  const tr = generateTrack(i, lap), G = tr.gates, P = tr.params, tag = `stage ${i} lap ${lap}`;
  const gaps = G.slice(1).map((g, k) => g.t - G[k].t), dc = G.slice(1).map((g, k) => Math.abs(g.c - G[k].c));
  // 1) 시간 간격: 시작 3개 ~1.4s, 어디서도 0.8s 미만 없음, 대부분 0.85~1.5s
  ok(Math.min(...gaps) >= .8 - 1e-9, `${tag} gap below 0.8s`);
  ok(gaps.filter(x => x >= .84 && x <= 1.55).length / gaps.length > .95, `${tag} gaps outside 0.85–1.5s`);
  ok(Math.abs(G[1].t - G[0].t - 1.4) < .05 && Math.abs(G[2].t - G[1].t - 1.4) < .05, `${tag} opening gaps not 1.4s`);
  // 2) 연속 높이 차 작고, 안전 범위가 충분히 겹침(≥60%)
  ok(Math.max(...dc) <= 1.0, `${tag} height step too large ${Math.max(...dc).toFixed(2)}`);
  G.slice(1).forEach((g, k) => { const a = G[k], lo = Math.max(a.c - safeHalf(a), g.c - safeHalf(g)), hi = Math.min(a.c + safeHalf(a), g.c + safeHalf(g));
    ok((hi - lo) / Math.min(2 * safeHalf(a), 2 * safeHalf(g)) >= .6, `${tag} gate ${k}->${k + 1} safe overlap < 60%`); });
  // 3) 수직 속도를 포함한 도달 가능성
  G.slice(1).forEach((g, k) => ok(canReach(G[k], g, g.t - G[k].t), `${tag} gate ${k}->${k + 1} unreachable`));
  // 4) 한계 높이에 붙어 생존 불가 / 구멍은 패널 안
  G.forEach(g => { ok(!extremeFits(g), `${tag} gate ${g.idx} passable at a height limit`);
    ok(g.c - g.h / 2 > GATE.BOTTOM && g.c + g.h / 2 < GATE.TOP, `${tag} gate ${g.idx} hole outside panels`); });
  // 5) 같은 도시는 같은 배치(재도전 시 익힘), 도시 길이 유지(38~43초)
  ok(JSON.stringify(G.map(g => g.c.toFixed(3))) === JSON.stringify(generateTrack(i, lap).gates.map(g => g.c.toFixed(3))), `${tag} not deterministic`);
  ok(G.length === 20, `${tag} gate count ${G.length}`);
  const fin = tr.finishD / P.speed; ok(fin > 20 && fin < 32, `${tag} stage length ${fin.toFixed(1)}s`);
  // 6) 사람 수준(0.1s 판단) 무피해 완주 · 저프레임 동일 · 중복 이벤트 없음
  const r = fly(tr, human, { decide: .1 });
  ok(count(r, 'hit') === 0, `${tag} human bot hit ${count(r, 'hit')}`);
  ok(r.every(x => x.resolved && x.events <= 3), `${tag} duplicate/missing events`);
  const low = fly(tr, human, { decide: .1, frameDt: .1 });
  ok(low.every((x, k) => x.resolved === r[k].resolved), `${tag} low-fps result differs`);
  // 7) 계속 누르기 / 계속 떼기 → 거의 전부 충돌
  const hh = count(fly(tr, () => true), 'hit') + count(fly(tr, () => true), 'ghost') * 0, rh = count(fly(tr, () => false), 'hit');
  ok(hh >= G.length * .4 && rh >= G.length * .4, `${tag} extremes survive too much (hold hits ${hh}, release hits ${rh} / ${G.length})`);
  // 8) 초보형 조작(판단 0.1~0.22s 랜덤, 목표 높이 ±0.5 오차) 20회: 평균 피격 적어야
  let noisyHits = 0, noisyPerf = 0;
  for (let sd = 0; sd < 20; sd++) {
    const rnd = rngSeed(sd * 7 + i * 31 + lap * 101 + 1);
    const res = fly(tr, (s, g) => g ? lead(s, g.c + (rnd() - .5), .18 + rnd() * .1) : false, { decide: .1, decideJitter: .12, rnd });
    noisyHits += count(res, 'hit'); noisyPerf += count(res, 'perfect');
  }
  // 9) 피격 직후 회복: k 번째 게이트에서 일부러 아래 패널에 부딪힌 뒤 정상 조작 → 다음 2개 게이트는 통과
  let recOK = 0, recN = 0;
  for (let k = 3; k < G.length - 3; k += 1) {
    const res = fly(tr, (s, g, t, ctx) => g ? (ctx.ni === k ? false : lead(s, g.c)) : false, { decide: .1 });
    if (res[k].resolved !== 'hit') continue; recN++;
    if (['pass', 'perfect'].includes(res[k + 1].resolved) && ['pass', 'perfect'].includes(res[k + 2].resolved)) recOK++;
  }
  ok(recN === 0 || recOK / recN >= .85, `${tag} recovery after hit ${recOK}/${recN}`);
  // 10) 가운데 높이에 머물기만 해서는 계속 통과 불가(경로를 따라가야 함)
  const midHits = count(fly(tr, s => lead(s, GATE.MID), { decide: .1 }), 'hit');
  ok(midHits >= G.length * .15, `${tag} staying at mid height passes too many gates (${midHits} hits / ${G.length})`);
  if (lap === 0) console.log(`${tag}: ${G.length} gates, ${fin.toFixed(1)}s | precise bot perfect ${count(r, 'perfect')}/${G.length} | ` +
    `novice bot avg hits ${(noisyHits / 20).toFixed(2)}, perfect ${(noisyPerf / 20 / G.length * 100).toFixed(0)}% | hold-only hits ${hh}, release-only ${rh} | ` +
    `stay-mid hits ${midHits} | recovery ${recOK}/${recN} | adjusted ${tr.log.adjusted}`);
  ok(noisyHits / 20 <= (i === 0 ? .5 : 1.5), `${tag} novice bot hits too often (${(noisyHits / 20).toFixed(2)})`);
}

// 11) 스윕: 한 스텝에 판정면 3개를 모두 지나가도 놓치지 않음
{
  const g = { c: 8, h: 3 };
  const e = sweepPlanes(-5, 5, 8.0, 8.0, g); ok(e.length === 3 && e.every(x => x.ok), 'sweep missed planes');
  const e2 = sweepPlanes(-5, 5, 2.0, 14.0, g); ok(e2.some(x => !x.ok), 'sweep did not catch a crossing outside the hole');
  ok(inHole(g, 8) && !inHole(g, 8 + 1.5 - PHYS.COL_HALF + .01), 'inHole edge');
  ok(perfectHalf({ c: 8, h: 6 }) === GATE.PERFECT_ABS, 'perfect window must not scale with wide holes');
}
console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
