// SKY GATE 규칙 자동 검증:  node tools/test_track.mjs
// 도달 가능성 · 통과/충돌 판정 · 중복 보상 방지 · 저프레임 판정 · 극단 입력으로 생존 불가
import { PHYS, GATE, stepCar, generateTrack, canReach, sweepPlanes, inHole, safeHalf, extremeFits } from '../track.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL', msg); } };

// 트랙 전체를 비행: control(state, nextGate, t) → hold. 판정은 게임과 같은 스윕 + 게이트당 1회 해석
function fly(track, control, { frameDt = PHYS.STEP, decide = 0 } = {}) {
  const { gates, params } = track, s = { y: GATE.MID - PHYS.COL_OFF, vy: 0 };
  const res = gates.map(() => ({ resolved: null, events: 0, center: null }));
  let dist = 0, t = 0, hold = false, nextDecide = 0, acc = 0;
  const end = gates[gates.length - 1].d + 40;
  while (dist < end) {
    acc += frameDt;
    while (acc >= PHYS.STEP) {                    // 고정 스텝 (프레임 길이와 무관)
      acc -= PHYS.STEP;
      const next = gates.find((g, k) => !res[k].resolved && -(g.d - dist) < 2);
      if (t >= nextDecide) { hold = control(s, next, t); nextDecide = t + decide; }
      const ycPrev = s.y + PHYS.COL_OFF; stepCar(s, hold); const ycNew = s.y + PHYS.COL_OFF;
      const dz = params.speed * PHYS.STEP;
      for (let k = 0; k < gates.length; k++) {
        const g = gates[k], r = res[k]; if (r.resolved) continue;
        const zPrev = -(g.d - dist), zNew = zPrev + dz;
        for (const e of sweepPlanes(zPrev, zNew, ycPrev, ycNew, g)) {
          r.events++;
          if (!e.ok) { r.resolved = 'hit'; break; }
          if (e.plane === 0) r.center = e.yc - g.c;
          if (e.plane === GATE.CHECK_Z[GATE.CHECK_Z.length - 1]) r.resolved = Math.abs(r.center) <= GATE.PERFECT * safeHalf(g) ? 'perfect' : 'pass';
        }
      }
      dist += dz; t += PHYS.STEP;
    }
  }
  return res;
}
// 사람 같은 조작: 0.1초마다만 판단, 리드 제어
const human = (s, g) => g ? (g.c - (s.y + PHYS.COL_OFF)) - s.vy * .25 > 0 : false;

for (let lap = 0; lap < 3; lap++) for (let i = 0; i < 6; i++) {
  const tr = generateTrack(i, lap), G = tr.gates, P = tr.params;
  const gaps = G.slice(1).map((g, k) => g.t - G[k].t), dc = G.slice(1).map((g, k) => Math.abs(g.c - G[k].c));
  const tag = `stage ${i} lap ${lap}`;
  console.log(`${tag}: ${G.length} gates, last gate ${G[G.length - 1].t.toFixed(1)}s, finish ${(tr.finishD / P.speed).toFixed(1)}s, ` +
    `gap ${Math.min(...gaps).toFixed(2)}–${Math.max(...gaps).toFixed(2)}s, hole ${Math.min(...G.map(g => g.h)).toFixed(2)}–${Math.max(...G.map(g => g.h)).toFixed(2)}, ` +
    `max Δc ${Math.max(...dc).toFixed(2)}, speed ${P.speed}, adjusted ${tr.log.adjusted}`);
  // 1) 모든 연결이 도달 가능
  G.slice(1).forEach((g, k) => ok(canReach(G[k], g, g.t - G[k].t), `${tag} gate ${k}->${k + 1} unreachable`));
  // 2) 구멍은 플레이 범위 안, 한계 높이에 붙어서는 통과 불가
  G.forEach(g => { ok(!extremeFits(g), `${tag} gate ${g.idx} passable at a height limit`);
    ok(g.c - g.h / 2 > GATE.BOTTOM && g.c + g.h / 2 < GATE.TOP, `${tag} gate ${g.idx} hole outside panels`); });
  // 3) 첫 게이트들은 고정 (재도전 시 같은 도입부)
  ok(JSON.stringify(G.slice(0, 4).map(g => g.c.toFixed(2))) === JSON.stringify(generateTrack(i, lap).gates.slice(0, 4).map(g => g.c.toFixed(2))), `${tag} opening not deterministic`);
  // 4) 사람 같은 0.1초 간격 입력으로 전 구간 무피해 완주 가능
  const r = fly(tr, human, { decide: .1 });
  ok(r.every(x => x.resolved === 'pass' || x.resolved === 'perfect'), `${tag} human bot hit ${r.filter(x => x.resolved === 'hit').length} gates`);
  // 5) 계속 누르기 / 계속 떼기 → 대부분 충돌
  const hold = fly(tr, () => true), rel = fly(tr, () => false);
  const hh = hold.filter(x => x.resolved === 'hit').length, rh = rel.filter(x => x.resolved === 'hit').length;
  ok(hh >= G.length * .8 && rh >= G.length * .8, `${tag} extremes survive too much (hold hits ${hh}, release hits ${rh} / ${G.length})`);
  // 6) 게이트당 해석 1회 (중복 보상·피해 없음)
  ok(r.every(x => x.resolved) && r.every(x => x.events <= GATE.CHECK_Z.length), `${tag} duplicate events`);
  // 7) 저프레임(10fps 프레임 길이)에서도 같은 결과
  const low = fly(tr, human, { decide: .1, frameDt: .1 });
  ok(low.every((x, k) => x.resolved === r[k].resolved), `${tag} low-fps result differs`);
  if (i === 0 && lap === 0) console.log(`  seoul: human bot perfects ${r.filter(x => x.resolved === 'perfect').length}/${G.length}; hold-only hits ${hh}, release-only hits ${rh}`);
}

// 8) 스윕: 한 스텝에 게이트가 판정면 3개를 모두 지나가도 하나도 놓치지 않음
{
  const g = { c: 8, h: 3 };
  const e = sweepPlanes(-5, 5, 8.0, 8.0, g); ok(e.length === 3 && e.every(x => x.ok), 'sweep missed planes');
  const e2 = sweepPlanes(-5, 5, 2.0, 14.0, g); ok(e2.some(x => !x.ok), 'sweep did not catch a crossing outside the hole');
  ok(inHole(g, 8) && !inHole(g, 8 + 1.5 - PHYS.COL_HALF + .01), 'inHole edge');
}
console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
