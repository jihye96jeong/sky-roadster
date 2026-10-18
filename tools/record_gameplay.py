"""실제 플레이 녹화: 로컬 서버(python tools/serve.py) 실행 후
  python tools/record_gameplay.py <프레임폴더> 1280 720 gpu 99999 1.6
  ffmpeg -framerate 30 -i <프레임폴더>/%05d.jpg -c:v libx264 -crf 18 -pix_fmt yuv420p promo/sky-roadster-gameplay.mp4
게임을 1프레임씩 결정적으로 진행(빨리 감기 배속 지정)해 끊김 없는 30fps 영상을 만든다."""
# 실제 플레이 한 판을 끊김 없이: 랜딩 → 이륙 → 서울 15게이트 → 도착 롤 → 결과 화면 (건너뛰기·자막 없음)
import sys, os, time
from playwright.sync_api import sync_playwright
OUT, W_, H_, GPU, LIMIT = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4] == 'gpu', int(sys.argv[5]) if len(sys.argv) > 5 else 99999
SPEED = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0   # 빨리 감기 배속: 영상 1프레임 = 게임 SPEED/30초
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
HELPERS = """
window.__vt = () => { for (const a of document.getAnimations()) { if (a._v === undefined) a._v = Math.max(0, a.currentTime || 0); a.pause(); a._v += 1000 * SPEED / 30; try { a.currentTime = a._v; } catch (e) {} } };
window.__bot = { nd: 0, t: 0, seed: 23 };
window.__frame = () => { // 사람처럼: 0.08~0.16초마다 판단, 목표 높이에 약간의 오차
  const B = window.__bot;
  if (__G.state === 'fly' && B.t >= B.nd) {
    const rnd = () => (B.seed = (B.seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const yc = __dbg.car.position.y + .78, g = __G.gates.find(x => !x.resolved && __G.dist - x.d < 2);
    __dbg.hold(((g ? g.c + (rnd() - .5) * .45 : 8.2) - yc) - __G.vy * .25 > 0); B.nd = B.t + .08 + rnd() * .08;
  }
  if (__G.state !== 'fly') __dbg.hold(false);
  for (let k = 0; k < 2; k++) __dbg.step(SPEED / 60); B.t += SPEED / 30; __vt();
  return [__G.state, !document.getElementById('result').hidden];
};
"""
args = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] if GPU else ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True, args=args)
    pg = b.new_page(viewport={"width": W_, "height": H_}); pg.set_default_timeout(180000)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8765/?lang=en")
    pg.evaluate("localStorage.clear(); localStorage.setItem('skyroadster.tutorial','true'); localStorage.setItem('skyroadster.tutorial2','true')")
    pg.goto("http://localhost:8765/?lang=en"); pg.wait_for_function("document.body.dataset.ui==='title'"); time.sleep(1.5)
    print("renderer:", pg.evaluate("(() => { const g = document.createElement('canvas').getContext('webgl'); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()"), flush=True)
    pg.add_script_tag(content=f"window.SPEED = {SPEED};" + HELPERS); pg.evaluate("__dbg.freeze(true)")
    n, t0, pressed, after = 0, time.time(), False, 0
    while n < LIMIT:
        if n == int(60 / SPEED) and not pressed: pg.keyboard.press("Space"); pressed = True   # 2초 랜딩 후 첫 입력 = 이륙
        state, res = pg.evaluate("__frame()")
        pg.screenshot(path=os.path.join(OUT, f"{n:05d}.jpg"), type="jpeg", quality=90); n += 1
        if n % 150 == 0: print(n, state, round(time.time() - t0, 1), "s", flush=True)
        if res: after += 1
        if after > int(60 / SPEED): break                                   # 결과 화면 2초 보여주고 끝
    print("frames", n, "time", round(time.time() - t0, 1), "s, per frame", round((time.time() - t0) / n, 3), "errors", errs, flush=True)
    b.close()
