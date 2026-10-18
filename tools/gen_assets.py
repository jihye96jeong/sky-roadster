"""xAI(grok-imagine) 로 게임 배경/타이틀 이미지를 생성하고 가볍게 압축한다.

사용법:  python tools/gen_assets.py            (없는 것만 생성)
         python tools/gen_assets.py seoul dubai (지정한 것만 재생성)
API 키는 프로젝트 루트의 .env (XAI_API_KEY=...) 에서 읽는다. 키는 게임 클라이언트에 절대 포함되지 않는다.
"""
import base64, io, json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets")
MODEL = "grok-imagine-image"

STYLE = (" Ultra wide cinematic panorama, photorealistic, the city skyline sits along the lower third, "
         "large open sky fills the upper half, no text, no watermark, no people, no cars in foreground.")

ASSETS = {
    "title": "A futuristic white wedge-shaped electric hypercar with sharp angular body and a thin red LED light bar, "
             "hovering above a congested highway traffic jam at night, four bright blue-white rocket thruster jets "
             "under the car blasting smoke, city lights in background, dramatic cinematic studio lighting, photorealistic, no text.",
    "seoul": "Seoul, South Korea skyline at golden sunset: N Seoul Tower on Namsan mountain, Lotte World Tower skyscraper, "
             "Han River with bridges, mountains behind." + STYLE,
    "london": "London skyline on an overcast blue-grey afternoon: Big Ben and the Houses of Parliament, the London Eye, "
              "the Shard, River Thames." + STYLE,
    "sydney": "Sydney skyline on a bright sunny day with clear blue sky: Sydney Opera House and Sydney Harbour Bridge, "
              "sparkling harbour water." + STYLE,
    "dubai": "Dubai skyline in hazy desert morning light: Burj Khalifa towering over the city, Burj Al Arab sail hotel, "
             "warm sandy sky." + STYLE,
    "paris": "Paris skyline at pink dusk: the Eiffel Tower, Arc de Triomphe, Haussmann rooftops, River Seine." + STYLE,
    "newyork": "New York City Manhattan skyline at night: Empire State Building lit up, One World Trade Center, "
               "Statue of Liberty in the harbor, starry deep blue sky." + STYLE,
}

# 도시별 항공 사진 (비행 중 지면 텍스처, 미러 반복으로 이음새 숨김)
AERIAL = (" Top-down aerial drone photo looking straight down, dense city blocks, streets, rooftops, trees, "
          "no horizon, no sky, no text, uniform lighting, photorealistic.")
for _c, _d in {"seoul": "Seoul apartment blocks and roads at golden sunset light",
               "london": "London Victorian terraced houses and streets, overcast light",
               "paris": "Paris Haussmann buildings with zinc roofs and boulevards at pink dusk",
               "dubai": "Dubai modern towers, villas and sandy lots in hazy desert light",
               "sydney": "Sydney red-roofed suburbs and green parks in bright sunlight",
               "newyork": "Manhattan grid streets and rooftops at night with glowing street lights"}.items():
    ASSETS["ground_" + _c] = _d + "." + AERIAL

# SKY GATE 금속 표면 (타일링 텍스처, 텍스트·UI 없음 — 구멍 치수/형태는 코드가 결정)
ASSETS["tex_gate_metal"] = ("Seamless tileable texture, dark gunmetal brushed metal panel with fine horizontal vent slots, "
                            "subtle panel seams and tiny bolts, flat even studio lighting, orthographic straight-on view, "
                            "no perspective, no text, no logos, photorealistic material sample.")


GREEN = (" Photorealistic studio product photo, entire vehicle visible and centered with margin, "
         "isolated on a flat solid pure green (#00FF00) chroma key background, no text, no people, no smoke.")
REAR = "Rear view directly from behind and slightly above, "

# 차량 스프라이트: 그린스크린으로 생성 → 배경 제거 → 투명 WebP. (name: (prompt, 레퍼런스 이미지 or None))
CARS = {
    # 플레이어: ref/5.webp(실제 후면) 기반, 수평·좌우대칭·윙 없음. 생성 후 라이트바 기울기를 재서 자동 수평 보정
    "car_player": ("Same exact car, perfectly straight-on rear view, camera exactly centered on the car's centerline at tail-light height, "
                   "level horizon, perfectly symmetrical, the full-width red LED light bar is a straight horizontal line, "
                   "no rear wing, no spoiler, low wide sleek body, four round exhaust nozzles in the black diffuser, license plate reads ROSTR, "
                   "telephoto lens with no perspective distortion, no smoke." + GREEN, "ref/5.webp"),
    "car_sedan":  (REAR + "a silver mid-size sedan (Hyundai Sonata style) stuck in traffic with bright red brake lights on." + GREEN, None),
    "car_suv":    (REAR + "a black luxury SUV with bright red brake lights on." + GREEN, None),
    "car_hatch":  (REAR + "a white compact hatchback with bright red brake lights on." + GREEN, None),
    "car_red":    (REAR + "a dark red sports sedan with bright red brake lights on." + GREEN, None),
    "car_pickup": (REAR + "a dark blue pickup truck with bright red brake lights on." + GREEN, None),
    "car_taxi":   (REAR + "a yellow New York City taxi cab with bright red brake lights on." + GREEN, None),
    "car_cab":    (REAR + "a black London hackney cab (TX taxi) with bright red brake lights on." + GREEN, None),
    "car_van":    (REAR + "a white delivery van with bright red brake lights on." + GREEN, None),
    # 하늘 장애물 (정면에서 날아오는 모습)
    "obs_bird":    ("A single seagull flying straight toward the camera, wings fully spread, front view." + GREEN.replace("vehicle", "bird"), None),
    "obs_pigeon":  ("A single dark grey pigeon flying straight toward the camera, wings spread wide, front view." + GREEN.replace("vehicle", "bird"), None),
    "obs_drone":   ("A black quadcopter delivery drone with four spinning propellers and a small package, front view, slightly from below." + GREEN.replace("vehicle", "drone"), None),
    "obs_balloon": ("A colorful striped hot air balloon with a wicker basket, full balloon visible, front view." + GREEN.replace("vehicle", "balloon"), None),
    "obs_balloon2": ("A red and yellow hot air balloon with a wicker basket, full balloon visible, front view." + GREEN.replace("vehicle", "balloon"), None),
}


def chroma_key(img, max_w=384, glass=True):
    """초록 배경 제거 + 녹색 번짐(despill) 제거 + 여백 자르기"""
    img = img.convert("RGBA"); px = img.load(); w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            m = max(r, b)
            if g > m * 1.18 + 12:           # 녹색이 지배적 → 배경
                px[x, y] = (0, 0, 0, 0)
            elif g > m:                     # 가장자리 녹색 번짐 → 줄이고 반투명
                a = int(255 * max(0, 1 - (g - m) / (m * .18 + 12)))
                px[x, y] = (r, m, b, a)
    img = img.crop(img.getbbox())
    img.thumbnail((max_w, max_w))
    return fill_glass(img) if glass else img  # 열기구 밧줄 사이 등은 채우면 안 됨


def fill_glass(img):
    """창문 유리가 초록을 반사해 뚫린 구멍 → 바깥과 연결되지 않은 투명 영역을 어두운 유리색으로 채움"""
    w, h = img.size; px = img.load()
    outside = bytearray(w * h); stack = []
    for x in range(w): stack += [(x, 0), (x, h - 1)]
    for y in range(h): stack += [(0, y), (w - 1, y)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or outside[y * w + x] or px[x, y][3] > 200: continue
        outside[y * w + x] = 1
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 255 and not outside[y * w + x]:
                k = a / 255  # 유리색(짙은 회청색) 위에 합성
                px[x, y] = (int(r * k + 38 * (1 - k)), int(g * k + 42 * (1 - k)), int(b * k + 50 * (1 - k)), 255)
    return img


def level_by_lightbar(img):
    """빨간 라이트바 좌/우 높이 차로 기울기를 재서 수평으로 돌림"""
    import math
    w, h = img.size; px = img.load()
    def bar_y(x0, x1):
        ys = [y for x in range(x0, x1) for y in range(h // 2) if px[x, y][0] > 150 and px[x, y][1] < 90 and px[x, y][3] > 200]
        return sum(ys) / len(ys) if ys else None
    L, R = bar_y(int(w * .1), int(w * .25)), bar_y(int(w * .75), int(w * .9))
    if L is None or R is None: return img
    ang = math.degrees(math.atan2(R - L, w * .65))
    if abs(ang) > .15:
        img = img.rotate(ang, resample=Image.BICUBIC, expand=True); img = img.crop(img.getbbox())
    return img


def load_key():
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
        for line in f:
            if line.strip().startswith("XAI_API_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("XAI_API_KEY not found in .env")


def generate(key, prompt, ref=None, aspect="16:9"):
    payload = {"model": MODEL, "prompt": prompt, "n": 1, "response_format": "b64_json"}
    url = "https://api.x.ai/v1/images/generations"
    if ref:  # 레퍼런스 이미지 기반 편집 (같은 차 디자인 유지)
        b = io.BytesIO(); Image.open(os.path.join(ROOT, ref)).convert("RGB").save(b, "JPEG", quality=85)
        payload["image"] = {"url": "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode(), "type": "image_url"}
        url = "https://api.x.ai/v1/images/edits"
    else:
        payload["aspect_ratio"] = aspect
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "roadster-game"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.load(r)["data"][0]
    if data.get("b64_json"):
        return base64.b64decode(data["b64_json"])
    with urllib.request.urlopen(data["url"], timeout=120) as r:
        return r.read()


def make(key, name):
    try:
        if name in CARS:
            prompt, ref = CARS[name]
            raw = Image.open(io.BytesIO(generate(key, prompt, ref, "4:3")))
            if name == "car_player":
                img = level_by_lightbar(chroma_key(raw, max_w=512))
            else:
                img = chroma_key(raw, glass=name.startswith("car_"))
            path = os.path.join(OUT, f"{name}.webp"); img.save(path, "WEBP", quality=86, method=6)
        else:
            ground = name.startswith(("ground_", "tex_"))
            img = Image.open(io.BytesIO(generate(key, ASSETS[name], aspect="1:1" if ground else "16:9"))).convert("RGB")
            img.thumbnail((512, 512) if ground else (1280, 1280))  # 가볍게: 최대 1280px, JPEG q72
            path = os.path.join(OUT, f"{name}.jpg"); img.save(path, "JPEG", quality=72, optimize=True, progressive=True)
        print(f"  saved {name} {img.size} {os.path.getsize(path)//1024}KB", flush=True)
    except Exception as e:  # 한 장 실패해도 나머지는 계속
        print(f"  {name} failed: {e}", flush=True)


def main():
    if sys.argv[1:] == ["--refill"]:  # 이미 만든 차량 스프라이트에 창문 채우기만 다시 적용
        for n in [n for n in CARS if n.startswith("car_")]:
            p = os.path.join(OUT, n + ".webp"); fill_glass(Image.open(p).convert("RGBA")).save(p, "WEBP", quality=82, method=6)
        return
    key = load_key()
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or [*ASSETS, *CARS]
    if not sys.argv[1:]:
        names = [n for n in names if not os.path.exists(os.path.join(OUT, n + (".webp" if n in CARS else ".jpg")))]
    print("generating:", ", ".join(names) or "(nothing)", flush=True)
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(lambda n: make(key, n), names))


if __name__ == "__main__":
    main()
