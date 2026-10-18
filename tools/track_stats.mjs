// 게이트 배치 통계: node tools/track_stats.mjs  (통과 시간 간격 · 구멍 · 연속 높이 차 · 안전 범위 겹침)
import { PHYS, generateTrack, safeHalf } from '../track.js';
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f = n => n.toFixed(2);
for (let i = 0; i < 6; i++) {
  const { gates: G, finishD, params: P } = generateTrack(i, 0);
  const gaps = G.slice(1).map((g, k) => g.t - G[k].t);
  const dc = G.slice(1).map((g, k) => Math.abs(g.c - G[k].c));
  const ov = G.slice(1).map((g, k) => { const a = G[k], lo = Math.max(a.c - safeHalf(a), g.c - safeHalf(g)), hi = Math.min(a.c + safeHalf(a), g.c + safeHalf(g));
    return Math.max(0, hi - lo) / Math.min(2 * safeHalf(a), 2 * safeHalf(g)); });
  const holes = G.map(g => g.h);
  console.log(`stage ${i}: ${G.length} gates | finish ${f(finishD / P.speed)}s | gap min ${f(Math.min(...gaps))} med ${f(q(gaps, .5))} max ${f(Math.max(...gaps))}s` +
    ` | hole ${f(Math.min(...holes))}–${f(Math.max(...holes))} (×${f(Math.min(...holes) / (2 * PHYS.COL_HALF))}–${f(Math.max(...holes) / (2 * PHYS.COL_HALF))})` +
    ` | Δc med ${f(q(dc, .5))} p90 ${f(q(dc, .9))} max ${f(Math.max(...dc))} | safe overlap min ${(Math.min(...ov) * 100).toFixed(0)}% med ${(q(ov, .5) * 100).toFixed(0)}%`);
}
