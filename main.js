// SKY ROADSTER — 가벼운 3D 원버튼 게임 (three.js 하나만 사용, 실사 스프라이트는 xAI로 미리 생성한 자산)
import * as THREE from 'three';

// ---------------------------------------------------------------- 로딩 추적 (깨진 차량/빈 배경을 보여주지 않기 위해)
// TextureLoader 는 DefaultLoadingManager 를 쓰므로, 텍스처 로드를 시작하기 전에 훅을 단다
const LOAD = { tex: false, bg: false, failed: [] };
THREE.DefaultLoadingManager.onProgress = (url, n, total) => setLoadProgress(n / Math.max(1, total));
THREE.DefaultLoadingManager.onLoad = () => { LOAD.tex = true; bootIfReady(); };
THREE.DefaultLoadingManager.onError = url => { LOAD.failed.push(url); };
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches; // 장식용 카메라 이동/흔들림 축소

// ---------------------------------------------------------------- 스테이지 데이터
// hz: 배경 사진에서 도시가 땅/물과 만나는 높이 비율 → 3D 지평선에 맞춘다
const STAGES = [
  { id: 'seoul',   name: 'SEOUL',    dest: 'N서울타워',          hz: .86, signs: ['강남 Gangnam', '여의도 Yeouido', '종로 Jongno', '한남대교'],              mix: { sign: 4, bird: 3, drone: 1, balloon: 0 } },
  { id: 'london',  name: 'LONDON',   dest: '빅벤 Big Ben',       hz: .885, signs: ['Westminster', 'Tower Bridge', 'Camden Town', 'A4 Piccadilly'],       mix: { sign: 3, bird: 3, drone: 2, balloon: 1 } },
  { id: 'paris',   name: 'PARIS',    dest: '에펠탑 Tour Eiffel', hz: .9, signs: ['Champs-Élysées', 'Montmartre', 'Louvre', 'Périphérique'],          mix: { sign: 2, bird: 4, drone: 1, balloon: 3 } },
  { id: 'dubai',   name: 'DUBAI',    dest: '부르즈 할리파',       hz: .97, signs: ['Sheikh Zayed Rd', 'Downtown', 'Palm Jumeirah', 'Dubai Marina'],     mix: { sign: 3, bird: 2, drone: 4, balloon: 1 } },
  { id: 'sydney',  name: 'SYDNEY',   dest: '오페라 하우스',       hz: .775, signs: ['Harbour Bridge', 'Bondi Beach', 'Circular Quay', 'Darling Harbour'], mix: { sign: 2, bird: 4, drone: 2, balloon: 2 } },
  { id: 'newyork', name: 'NEW YORK', dest: '엠파이어 스테이트',   hz: .955, signs: ['Broadway', 'Times Sq', 'Brooklyn Br', '5th Ave'],                     mix: { sign: 3, bird: 3, drone: 3, balloon: 2 } },
];
// 비행 고도: 정체된 차 지붕(~2.3m) 바로 위를 낮게 난다
const SPAWN_Z = -260, MIN_Y = 3, MAX_Y = 12, LIFT_Y = 5, THRUST = 26, FALL = 17;

const $ = s => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t * t * (3 - 2 * t);

// ---------------------------------------------------------------- 렌더러 / 씬
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setClearColor(0x000000, 0); // 배경은 CSS 이미지 → 3D 는 투명 캔버스 위에
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8899aa, 70, 250);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x403830, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-4, 10, 6);
scene.add(sun);

// 작은 캔버스 텍스처 헬퍼
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const softTex = canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const cloudTex = canvasTex(128, 64, g => {
  for (let i = 0; i < 9; i++) {
    const x = 20 + Math.random() * 88, y = 28 + Math.random() * 14, r = 14 + Math.random() * 14;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 64);
  }
});

// ---------------------------------------------------------------- 로드스터 모델 (웨지 실루엣 압출)
const M = {
  rim: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: .8, roughness: .3 }),
  ledR: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
};

// ---------------------------------------------------------------- 실사 스프라이트 (xAI 생성 → 배경 제거된 WebP)
// 차량/장애물은 사진 한 장짜리 평면 → 폴리곤 모델보다 훨씬 가볍고 훨씬 사실적
const texLoader = new THREE.TextureLoader();
const texCache = {};
function photoTex(name) {
  if (!texCache[name]) {
    const t = texLoader.load(`assets/${name}.webp`, tex => { texCache[name].aspect = tex.image.height / tex.image.width; texCache[name].users.forEach(fitPhoto); });
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    texCache[name] = { t, aspect: 0, users: [], mat: new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: .1 }) };
  }
  return texCache[name];
}
const unitPlane = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);       // 아래-중앙 기준
const unitPlaneC = new THREE.PlaneGeometry(1, 1);                           // 중앙 기준
function fitPhoto(m) { const c = texCache[m.userData.photo]; if (c.aspect) m.scale.set(m.userData.w, m.userData.w * c.aspect, 1); }
function photoMesh(name, width, centered = false) {
  const c = photoTex(name);
  const m = new THREE.Mesh(centered ? unitPlaneC : unitPlane, c.mat);
  m.userData.photo = name; m.userData.w = width; m.scale.set(width, width * .75, 1);
  c.users.push(m); fitPhoto(m);
  return m;
}
const shadowMat = new THREE.MeshBasicMaterial({ map: softTex, color: 0x000000, transparent: true, opacity: .55, depthWrite: false });
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function groundShadow(w, d) { const s = new THREE.Mesh(shadowGeo, shadowMat); s.scale.set(w, 1, d); s.position.y = .03; return s; }

// ---------------------------------------------------------------- 증기 분사 셰이더 (스크롤 노이즈 + 가장자리/길이 감쇠)
const JET_LEN = 3.8;
function jetMaterial(color, strength, additive) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime, uPower, uStrength; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float along = 1. - vUv.y;                                  // 0 = 노즐, 1 = 끝
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); // 원기둥 가장자리는 투명
        float t = n(vec2(vUv.x * 9., along * 5. - uTime * 7.)) * .6 + n(vec2(vUv.x * 23., along * 13. - uTime * 13.)) * .4;
        float a = edge * smoothstep(1., .1, along) * smoothstep(0., .03, along) * (.45 + .9 * t) * uPower * uStrength;
        gl_FragColor = vec4(uColor * (1. + (1. - along) * .8), a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}
const JET = {
  outerGeo: new THREE.CylinderGeometry(.17, .6, JET_LEN, 18, 1, true).translate(0, -JET_LEN / 2, 0), // 아래로 퍼지는 증기
  coreGeo: new THREE.CylinderGeometry(.07, .2, JET_LEN * .6, 12, 1, true).translate(0, -JET_LEN * .275, 0), // 밝은 심
  outer: jetMaterial(0xe8f3ff, .75, false),
  core: jetMaterial(0xa9dcff, 1.3, true),
  glowMat: new THREE.SpriteMaterial({ map: softTex, color: 0xcfeeff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
};
const _tip = new THREE.Vector3();
// power 0~1, sweep: 전진 속도에 따라 증기가 뒤로 휨
function setJets(power, sweep, t) {
  JET.outer.uniforms.uTime.value = JET.core.uniforms.uTime.value = t;
  JET.outer.uniforms.uPower.value = JET.core.uniforms.uPower.value = power;
  JET.glowMat.opacity = power;
  const flick = 1 + Math.sin(t * 40) * .03 + Math.random() * .04;
  for (const j of car.userData.jets) {
    j.visible = power > .01;
    j.scale.set(.85 + power * .15, (.35 + power * .65) * flick, .85 + power * .15);
    j.rotation.x = -sweep;
  }
}
// 분사 끝에서 하얀 증기 뭉게뭉게 (월드 좌표)
function jetSteam(prob, size, life, spread) {
  car.updateMatrixWorld();
  for (const j of car.userData.jets) {
    if (Math.random() > prob) continue;
    _tip.set(rand(-.3, .3), -JET_LEN * .8 * j.scale.y, 0); j.localToWorld(_tip);
    emit(_tip.x, _tip.y, _tip.z, rand(-spread, spread), rand(-2.5, -.5), rand(-spread, spread) * .6 + 2, size, life);
  }
}

const tailTex = canvasTex(256, 32, (g, w, h) => { // 후미등 빛 번짐(가로로 긴 부드러운 띠)
  const gx = g.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(.12, 'rgba(255,255,255,1)'); gx.addColorStop(.88, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(.5, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy; g.fillRect(0, 0, w, h);
});
function buildRoadster() {
  const car = new THREE.Group();          // 논리 위치(충돌 판정 기준)
  const vis = new THREE.Group(); car.add(vis); car.userData.vis = vis; // 장식용 진동·자세는 여기에만
  const photo = photoMesh('car_player', 2.6); // 레퍼런스 사진 기반으로 생성한 로드스터 후면
  vis.add(photo);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.5, .34), new THREE.MeshBasicMaterial({
    map: tailTex, color: 0xff2a1a, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.z = .03; vis.add(glow); car.userData.tail = glow;
  const sh = groundShadow(3.2, 5); car.add(sh); car.userData.shadow = sh;
  // 증기 분사 4개: 후면 카메라에서 4줄기가 모두 보이도록 차체 바로 아래(사진 앞)에 배치
  car.userData.jets = [];
  for (const [x, z] of [[-1.02, .2], [1.02, .2], [-.5, .1], [.5, .1]]) {
    const j = new THREE.Group(); j.position.set(x, .38, z);
    j.add(new THREE.Mesh(JET.outerGeo, JET.outer), new THREE.Mesh(JET.coreGeo, JET.core));
    const glowS = new THREE.Sprite(JET.glowMat); glowS.scale.setScalar(.7); j.add(glowS);
    j.visible = false; vis.add(j); car.userData.jets.push(j);
  }
  return car;
}
const car = buildRoadster();
scene.add(car);

// ---------------------------------------------------------------- 끝없는 교통 체증 고가도로
// 차는 차종별 InstancedMesh(사진 1장 = draw call 1번) → 200대여도 가볍다. 줄은 무한 순환.
const road = new THREE.Group();
scene.add(road);
const LANES = [-8, -4, 0, 4, 8], ROW_GAP = 5.6, ROWS = 40, SPAN = ROW_GAP * ROWS; // 차 길이 ~4.6m → 범퍼 간격 ~1m
const DASH_GAP = 8.4;
let dashes;
{
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(24, 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b2e34, roughness: 1 }));
  asphalt.position.z = -270; road.add(asphalt);
  const dashGeo = new THREE.PlaneGeometry(.18, 3).rotateX(-Math.PI / 2);
  dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshBasicMaterial({ color: 0xd8d8d8 }), 4 * 70);
  const m = new THREE.Matrix4(); let k = 0;
  for (const x of [-6, -2, 2, 6]) for (let i = 0; i < 70; i++) { m.makeTranslation(x, .02, 20 - i * DASH_GAP); dashes.setMatrixAt(k++, m); }
  road.add(dashes);
  // 고가도로 콘크리트 방호벽 + 측면 (아래로 도시가 내려다보임)
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8d8f93, roughness: .9 });
  for (const x of [-12.3, 12.3]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(.6, 1.1, 600), concrete); w.position.set(x, .55, -270); road.add(w);
    const side = new THREE.Mesh(new THREE.BoxGeometry(.4, 2.2, 600), new THREE.MeshStandardMaterial({ color: 0x5d5f63, roughness: 1 }));
    side.position.set(x, -1.1, -270); road.add(side);
  }
}
const CAR_KINDS = [['car_sedan', 2.0], ['car_suv', 2.15], ['car_hatch', 1.9], ['car_red', 2.0], ['car_pickup', 2.2], ['car_taxi', 2.0], ['car_cab', 1.95], ['car_van', 2.1]];
const traffic = [];
for (let row = -2; row < ROWS - 2; row++) for (const lane of LANES) {
  if (lane === 0 && row <= 0) continue; // 플레이어 자리 + 카메라 앞을 가리지 않게
  if (Math.random() < .04) continue;
  traffic.push({ k: (Math.random() * CAR_KINDS.length) | 0, x: lane + rand(-.25, .25), z: -row * ROW_GAP + rand(-.4, .4) });
}
const trafficIM = CAR_KINDS.map(([name], i) => {
  const im = new THREE.InstancedMesh(unitPlane, photoTex(name).mat, traffic.filter(t => t.k === i).length);
  im.frustumCulled = false; road.add(im); return im;
});
const trafficShadow = new THREE.InstancedMesh(shadowGeo, shadowMat, traffic.length);
trafficShadow.frustumCulled = false; road.add(trafficShadow);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function updateTraffic(dz) {
  const idx = CAR_KINDS.map(() => 0);
  traffic.forEach((t, i) => {
    t.z += dz; if (t.z > 14) t.z -= SPAN;
    const [name, w] = CAR_KINDS[t.k], aspect = texCache[name].aspect || .8;
    // 사진이 카메라 쪽을 보도록 Y축만 살짝 회전
    _q.setFromAxisAngle(_up, Math.atan2(camera.position.x - t.x, camera.position.z - t.z) * .6);
    _m.compose(_p.set(t.x, 0, t.z), _q, _s.set(w, w * aspect, 1)); trafficIM[t.k].setMatrixAt(idx[t.k]++, _m);
    _m.compose(_p.set(t.x, .03, t.z - 1), _q.identity(), _s.set(w * 1.15, 1, 4.6)); trafficShadow.setMatrixAt(i, _m);
  });
  trafficIM.forEach(im => im.instanceMatrix.needsUpdate = true); trafficShadow.instanceMatrix.needsUpdate = true;
  dashes.position.z = (dashes.position.z + dz) % DASH_GAP;
}

// 지면: 도시별 항공 사진(xAI) 미러 반복 → 고가도로 아래 15m, 텍스처 스크롤로 이동감 (메쉬 1개)
const GROUND_TILE = 90, GROUND_Y = -15;
const groundTex = {};
for (const st of STAGES) {
  const t = texLoader.load(`assets/ground_${st.id}.jpg`);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
  t.repeat.set(900 / GROUND_TILE, 900 / GROUND_TILE); t.anisotropy = 8; groundTex[st.id] = t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
ground.position.set(0, GROUND_Y, -300); scene.add(ground);

// ---------------------------------------------------------------- 구름 / 속도선 / 연기 파티클
const clouds = [];
{
  const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: .55, depthWrite: false });
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(mat); placeCloud(s, rand(SPAWN_Z, 0)); scene.add(s); clouds.push(s);
  }
}
function placeCloud(s, z) {
  const x = (Math.random() < .5 ? -1 : 1) * rand(32, 80); // 시야 중앙은 비워둠
  const sc = rand(14, 28); s.scale.set(sc * 2, sc, 1); s.position.set(x, rand(-6, 26), z);
}
const STREAKS = 40;
const streakGeo = new THREE.BufferGeometry();
streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3));
const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .28, fog: false }));
streaks.frustumCulled = false; scene.add(streaks);
const streakData = Array.from({ length: STREAKS }, () => ({ x: 0, y: 0, z: rand(-150, 10) }));
streakData.forEach(resetStreak);
function resetStreak(s) { const a = rand(0, Math.PI * 2), r = rand(9, 30); s.x = Math.cos(a) * r; s.y = 8 + Math.sin(a) * r * .6; s.z = rand(-160, -120); }

const PN = 420;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PN * 3), pSize = new Float32Array(PN), pAlpha = new Float32Array(PN), pTint = new Float32Array(PN * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
pGeo.setAttribute('alpha', new THREE.BufferAttribute(pAlpha, 1));
pGeo.setAttribute('tint', new THREE.BufferAttribute(pTint, 3));
const pMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: softTex }, scale: { value: 400 } },
  vertexShader: `attribute float size; attribute float alpha; attribute vec3 tint; varying float vA; varying vec3 vT; uniform float scale;
    void main(){ vA = alpha; vT = tint; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vT;
    void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vT, c.a * vA); }`,
  transparent: true, depthWrite: false,
});
const smoke = new THREE.Points(pGeo, pMat); smoke.frustumCulled = false; scene.add(smoke);
const parts = Array.from({ length: PN }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, a: .5 }));
const STEAM = [.92, .94, 1], SOOT = [.1, .1, .11], FIRE = [1, .55, .15];
let pNext = 0;
function emit(x, y, z, vx, vy, vz, size, life, tint = STEAM, a = .5) {
  const i = pNext = (pNext + 1) % PN, p = parts[i];
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z; pTint.set(tint, i * 3);
  Object.assign(p, { life, max: life, vx, vy, vz, s0: size, a });
}
function updateParticles(dt, worldSpeed) {
  for (let i = 0; i < PN; i++) {
    const p = parts[i];
    if (p.life <= 0) { pAlpha[i] = 0; continue; }
    p.life -= dt; const k = 1 - p.life / p.max;
    p.vx *= .95; p.vy *= .95; p.vz *= .95;
    pPos[i * 3] += p.vx * dt; pPos[i * 3 + 1] += p.vy * dt; pPos[i * 3 + 2] += (p.vz + worldSpeed) * dt;
    pSize[i] = p.s0 * (1 + k * 3); pAlpha[i] = (1 - k) * (1 - k) * p.a;
  }
  pGeo.attributes.position.needsUpdate = pGeo.attributes.size.needsUpdate = pGeo.attributes.alpha.needsUpdate = pGeo.attributes.tint.needsUpdate = true;
}

// ---------------------------------------------------------------- 장애물 / 링
const OG = { // 공유 지오메트리·재질
  pole: new THREE.CylinderGeometry(.18, .18, 1, 6), poleM: new THREE.MeshStandardMaterial({ color: 0x8b9097, metalness: .6 }),
  board: new THREE.BoxGeometry(8, 2.8, .25),
  ring: new THREE.TorusGeometry(2.2, .2, 8, 28), ringM: new THREE.MeshBasicMaterial({ color: 0xffd23a }),
  gate: new THREE.TorusGeometry(9, .55, 8, 48), gateM: new THREE.MeshBasicMaterial({ color: 0x7fe3ff }),
};
const signMats = {};
function signMat(text) {
  if (!signMats[text]) signMats[text] = [OG.poleM, OG.poleM, OG.poleM, OG.poleM, new THREE.MeshStandardMaterial({
    roughness: .6, map: canvasTex(512, 180, (g, w, h) => {
      g.fillStyle = '#0d6b3a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 64px "Malgun Gothic", system-ui, sans-serif'; g.fillText(text, w / 2, h / 2 - 8, w - 50);
      g.font = 'bold 34px system-ui'; g.fillText('↑', w - 48, h / 2 + 50);
    }),
  }), OG.poleM];
  return signMats[text];
}

let obstacles = [];
// 각 장애물: { g: Group, boxes: [[cx,cy,cz,hx,hy,hz]...], tick(dt,t), kind }
function makeSign(x, y, text) {
  const g = new THREE.Group(); g.position.set(x, y, SPAWN_Z);
  const b = new THREE.Mesh(OG.board, signMat(text)); g.add(b);
  const side = x > 0 ? 3.6 : -3.6;
  const p = new THREE.Mesh(OG.pole, OG.poleM); p.scale.y = 70; p.position.set(side, -35, 0); g.add(p);
  return { kind: 'sign', g, boxes: [[0, 0, 0, 4, 1.4, .4], [side, -35, 0, .25, 35, .25]] };
}
function makeBirds(x, y) {
  const g = new THREE.Group(); g.position.set(x, y, SPAWN_Z);
  const n = 3 + (Math.random() * 4 | 0), boxes = [], birds = [];
  const kind = Math.random() < .5 ? 'obs_bird' : 'obs_pigeon';
  for (let i = 0; i < n; i++) {
    const ox = (i - n / 2) * 2 + rand(-.4, .4), oy = rand(-1.2, 1.2), oz = Math.abs(i - n / 2) * 1.6;
    const b = photoMesh(kind, 1.9, true); b.position.set(ox, oy, oz); b.userData.ph = rand(0, 6);
    g.add(b); birds.push(b); boxes.push([ox, oy, oz, .8, .35, .5]);
  }
  return { kind: 'bird', g, boxes, tick(dt, t) {
    g.position.y += Math.sin(t * 2) * dt;
    for (const b of birds) { const c = texCache[b.userData.photo]; const f = Math.sin(t * 12 + b.userData.ph); // 날갯짓: 세로로 살짝 찌그러뜨려 흉내
      b.scale.set(1.9 * (1 - Math.abs(f) * .12), 1.9 * (c.aspect || .4) * (1 + f * .35), 1); b.rotation.z = f * .05; }
  } };
}
function makeDrone(x, y) {
  const g = new THREE.Group(); g.position.set(x, y, SPAWN_Z);
  const d = photoMesh('obs_drone', 2.8, true); g.add(d);
  const y0 = y, ph = rand(0, 6), amp = rand(.8, 1.8);
  return { kind: 'drone', g, boxes: [[0, 0, 0, 1.4, .5, .8]], tick(dt, t) {
    g.position.y = y0 + Math.sin(t * 1.6 + ph) * amp; // 위아래로 천천히 오르내림
    d.rotation.z = Math.sin(t * 3 + ph) * .05;
  } };
}
function makeBalloon(x, y) {
  const g = new THREE.Group(); g.position.set(x, y, SPAWN_Z);
  g.add(photoMesh(Math.random() < .5 ? 'obs_balloon' : 'obs_balloon2', 6.5, true));
  const vy = rand(-.6, .8);
  return { kind: 'balloon', g, boxes: [[0, 1, 0, 2.9, 3.2, 2.5], [0, -3.9, 0, .5, .5, .5]], tick(dt) { g.position.y += vy * dt; } };
}
['obs_bird', 'obs_pigeon', 'obs_drone', 'obs_balloon', 'obs_balloon2'].forEach(photoTex); // 미리 로드

function makeRing(x, y) {
  const g = new THREE.Group(); g.position.set(x, y, SPAWN_Z);
  g.add(new THREE.Mesh(OG.ring, OG.ringM));
  return { kind: 'ring', g, boxes: [], tick(dt, t) { g.children[0].rotation.z = t * 2; } };
}
function makeGate(label) {
  const g = new THREE.Group(); g.position.set(0, 8.5, SPAWN_Z);
  g.add(new THREE.Mesh(OG.gate, OG.gateM));
  const tex = canvasTex(512, 96, (c, w, h) => {
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, 0, w, h); c.fillStyle = '#7fe3ff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 46px "Malgun Gothic", system-ui'; c.fillText('🏁 ' + label, w / 2, h / 2, w - 30);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true })); sp.scale.set(14, 2.6, 1); sp.position.y = 11; g.add(sp);
  return { kind: 'gate', g, boxes: [], tick(dt, t) { g.children[0].rotation.z = t * .5; } };
}

function clearObstacles() { for (const o of obstacles) scene.remove(o.g); obstacles = []; }

function spawnWave(stage) {
  const mix = stage.mix, total = mix.sign + mix.bird + mix.drone + mix.balloon;
  let r = Math.random() * total, kind = 'sign';
  for (const k of ['sign', 'bird', 'drone', 'balloon']) { if ((r -= mix[k]) < 0) { kind = k; break; } }
  // 원버튼 게임: 장애물은 모두 비행 경로(x≈0) 위에, 높이만 달라서 위/아래로 피한다
  // 40% 확률로 현재 높이를 노림 → 높이 조절하는 맛
  const x = rand(-.8, .8);
  const y = Math.random() < .4 ? car.position.y + rand(-1, 1) : rand(MIN_Y, MAX_Y);
  let o;
  if (kind === 'sign') o = makeSign(x, clamp(y, MIN_Y + 1, MAX_Y - 1.5), stage.signs[(Math.random() * stage.signs.length) | 0]);
  else if (kind === 'bird') o = makeBirds(x, clamp(y, MIN_Y + .5, MAX_Y));
  else if (kind === 'drone') o = makeDrone(x, clamp(y, MIN_Y + .5, MAX_Y));
  else o = makeBalloon(x, Math.random() < .5 ? rand(5.8, 6.4) : rand(10.8, 11.6)); // 낮은 풍선은 위로, 높은 풍선은 아래로 통과 (항상 길이 남게)
  addObs(o);
  // 링은 장애물 반대쪽 높이에 → 피하면서 먹는 동선
  if (Math.random() < .5) addObs(makeRing(0, clamp(y > (MIN_Y + MAX_Y) / 2 ? y - rand(4, 6) : y + rand(4, 6), MIN_Y + .8, MAX_Y - .5)), rand(10, 16));
}
function addObs(o, dz = 0) { o.g.position.z += dz; scene.add(o.g); obstacles.push(o); }

// ---------------------------------------------------------------- 사운드 (WebAudio 합성, 파일 없음)
// 모든 소리는 master 를 거친다 → 음소거/일시정지가 지속음(엔진·분사)에도 즉시 적용
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const Sfx = {
  ctx: null, master: null, eng: null, jet: null, muted: store.get('skyroadster.muted', false), paused: false, lastIgnite: 0,
  init() { // 브라우저 자동재생 제한: 첫 사용자 입력에서만 생성/재개
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination); this.applyGain(true);
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = 55; f.type = 'lowpass'; f.frequency.value = 380; g.gain.value = 0;
    o.connect(f).connect(g).connect(this.master); o.start(); this.eng = { o, g };
    // 분사음: 루프 노이즈 → 밴드패스 (누르는 동안만 커진다)
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = .8;
    const jg = c.createGain(); jg.gain.value = 0;
    src.connect(bp).connect(jg).connect(this.master); src.start(); this.jet = { bp, g: jg };
  },
  applyGain(now) {
    if (!this.master) return;
    const v = this.muted || this.paused ? 0 : 1;
    if (now) this.master.gain.value = v; else this.master.gain.setTargetAtTime(v, this.ctx.currentTime, .03);
  },
  setMuted(m) { this.muted = m; store.set('skyroadster.muted', m); this.applyGain(); },
  setPaused(p) { this.paused = p; this.applyGain(); },
  engine(level, speed) {
    if (!this.eng) return; const t = this.ctx.currentTime;
    this.eng.g.gain.setTargetAtTime(level * .045, t, .1);
    this.eng.o.frequency.setTargetAtTime(45 + speed * .7, t, .2);
  },
  jetLevel(p) {
    if (!this.jet) return; const t = this.ctx.currentTime;
    this.jet.g.gain.setTargetAtTime(p * .16, t, p > .5 ? .02 : .06);
    this.jet.bp.frequency.setTargetAtTime(450 + p * 900, t, .05);
  },
  ignite() { // 누르는 순간의 점화음 (연타해도 과하지 않게 제한)
    if (!this.ctx || this.ctx.currentTime - this.lastIgnite < .12) return;
    this.lastIgnite = this.ctx.currentTime; this.tone(160, 70, .16, 'triangle', .07); this.noise(.12, .07);
  },
  tone(f1, f2, dur, type = 'sine', vol = .15, delay = 0) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur);
  },
  noise(dur, vol = .3) {
    if (!this.ctx) return;
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); g.gain.value = vol;
    s.buffer = b; s.connect(g).connect(this.master); s.start();
  },
};

// ---------------------------------------------------------------- 배경 사진 (도시별) + 지평선 색
const bgEl = $('#bg');
const bgImgs = {}; const hzColors = {};
for (const s of STAGES) { // 미리 로드 + 지평선 색 추출(안개 색으로 사용)
  const img = new Image(); img.src = `assets/${s.id}.jpg`; bgImgs[s.id] = img;
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 64; const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 32, 64);
    const avg = row => { const d = g.getImageData(0, row, 32, 1).data; let r = 0, gg = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } return [r / 32 | 0, gg / 32 | 0, b / 32 | 0]; };
    const fog = avg(Math.floor((s.hz - .03) * 63)), ground = avg(63);
    hzColors[s.id] = { fog: new THREE.Color(`rgb(${fog})`), ground: `rgb(${ground})` };
    if (G.stage === s) applyFog(s);
    if (s.id === STAGES[0].id) { LOAD.bg = true; bootIfReady(); }
  };
  img.onerror = () => { if (s.id === STAGES[0].id) { LOAD.failed.push(img.src); LOAD.bg = true; bootIfReady(); } };
}
function applyFog(s) { const c = hzColors[s.id]; if (c) { scene.fog.color.copy(c.fog); document.body.style.backgroundColor = c.ground; } }

// ---------------------------------------------------------------- 게임 상태
// state: loading → title(랜딩, 같은 장면) → liftoff → fly → clear/over ; 재도전·다음 도시는 intro(도로 위 대기)
const G = {
  state: 'loading', stageIdx: 0, lap: 0, stage: STAGES[0], score: 0, stageStartScore: 0, lives: 3,
  dist: 0, len: 1500, speed: 0, targetSpeed: 50, gap: 30, nextSpawn: 0, gateSpawned: false,
  t: 0, stateT: 0, inv: 0, shake: 0, camBlend: 0, combo: 0, vy: 0, jet: 0, fromTitle: true,
  best: store.get('skyroadster.best', 0), tutorialDone: store.get('skyroadster.tutorial', false),
};
const target = new THREE.Vector2(0, 6);
const ui = id => document.getElementById(id);
const UI = {
  body: document.body, hudStage: ui('hudStage'), hudCity: ui('hudCity'), hudScore: ui('hudScore'), lives: ui('hudLives'),
  progFill: ui('progFill'), progMarker: ui('progMarker'), progPct: ui('progPct'), progDest: ui('progDest'), combo: ui('combo'),
  stageTitle: ui('stageTitle'), tutorial: ui('tutorial'), popups: [...ui('popups').children], vignette: ui('vignette'),
  pause: ui('pause'), result: ui('result'), muteBtn: ui('muteBtn'), pauseMuteBtn: ui('pauseMuteBtn'),
};
function setUI(mode) { UI.body.dataset.ui = mode; }
const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;

// 게임 시간 기반 타이머 (일시정지 중 멈추고, 상태 전환 시 한 번에 정리 → 겹침/누적 방지)
let timers = [];
function later(sec, fn, tag) { if (tag) cancel(tag); timers.push({ at: G.t + sec, fn, tag }); }
function cancel(tag) { timers = timers.filter(x => x.tag !== tag); }
function runTimers() { const due = timers.filter(x => x.at <= G.t); if (!due.length) return; timers = timers.filter(x => x.at > G.t); due.forEach(x => x.fn()); }

// ---------------------------------------------------------------- 상황 메시지 (용도별 위치, 같은 채널은 교체)
function showStageTitle(kicker, big, sub, sec = 2.6) {
  UI.stageTitle.innerHTML = `<span>${kicker}</span><strong>${big}</strong><em>${sub}</em>`;
  UI.stageTitle.classList.add('show'); later(sec, () => UI.stageTitle.classList.remove('show'), 'stageTitle');
}
function showTutorial(text) { UI.tutorial.textContent = text; UI.tutorial.classList.add('show'); }
function hideTutorial() { UI.tutorial.classList.remove('show'); }
function showCombo(n) { UI.combo.textContent = `RING ×${n}`; UI.combo.classList.add('show'); later(1.4, () => UI.combo.classList.remove('show'), 'combo'); }
let popIdx = 0;
const _scr = new THREE.Vector3();
function popupAtCar(text) { // 링 점수: 차 위에 작게 떠올랐다 사라짐 (3개 풀 재사용)
  const el = UI.popups[popIdx = (popIdx + 1) % UI.popups.length];
  car.userData.vis.getWorldPosition(_scr); _scr.y += 2.2; _scr.project(camera);
  el.textContent = text; el.style.left = ((_scr.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - _scr.y) / 2 * innerHeight) + 'px';
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
}
function clearMessages() {
  ['stageTitle', 'combo'].forEach(cancel);
  UI.stageTitle.classList.remove('show'); UI.combo.classList.remove('show'); hideTutorial();
  UI.popups.forEach(el => el.classList.remove('go'));
}

// ---------------------------------------------------------------- HUD
let shownScore = -1, shownLives = 3;
function renderLives(lost) {
  [...UI.lives.children].forEach((el, i) => {
    el.classList.toggle('on', i < G.lives);
    if (lost && i === G.lives) { el.classList.remove('lost'); void el.offsetWidth; el.classList.add('lost'); }
    if (!lost) el.classList.remove('lost');
  });
  UI.lives.setAttribute('aria-label', `남은 목숨 ${Math.max(0, G.lives)}개`);
  shownLives = G.lives;
}
function updateHUD(prog) {
  UI.progFill.style.transform = `scaleX(${prog.toFixed(4)})`;
  UI.progMarker.style.left = (prog * 100).toFixed(2) + '%';
  UI.progPct.textContent = Math.floor(prog * 100) + '%';
  const sc = Math.floor(G.score);
  if (sc !== shownScore) { shownScore = sc; UI.hudScore.textContent = sc.toLocaleString(); }
}

// ---------------------------------------------------------------- 스테이지 / 상태 전환
function setStage(i, keepScore = true, mode = 'intro') {
  G.stageIdx = i; G.stage = STAGES[i];
  const lapBoost = G.lap * 10;
  G.targetSpeed = 48 + i * 6 + lapBoost; G.len = 1500 + i * 200; G.gap = Math.max(12, 30 - i * 3 - G.lap * 3);
  G.dist = 0; G.speed = 0; G.nextSpawn = 60; G.gateSpawned = false; G.lives = 3; G.inv = 0; G.combo = 0; G.camBlend = 0;
  G.vy = 0; G.jet = 0; G.fromTitle = mode === 'title'; G.flyInput = false;
  if (!keepScore) G.score = 0;
  G.stageStartScore = G.score;
  clearObstacles(); timers = []; clearMessages();
  for (const pt of parts) pt.life = 0; // 이전 추락의 연기·불이 남지 않게
  bgEl.style.backgroundImage = bgImgs[G.stage.id].complete && bgImgs[G.stage.id].naturalWidth ? `url(assets/${G.stage.id}.jpg)` : '';
  applyFog(G.stage);
  ground.material.map = groundTex[G.stage.id]; ground.material.needsUpdate = true;
  car.position.set(0, 0, 0); car.rotation.set(0, 0, 0); car.userData.vis.rotation.set(0, 0, 0); car.userData.vis.position.set(0, 0, 0);
  car.visible = true; target.set(0, LIFT_Y);
  setJets(0, 0, 0);
  UI.hudStage.textContent = `STAGE ${String(i + 1).padStart(2, '0')} / ${String(STAGES.length).padStart(2, '0')}${G.lap ? ' · LAP ' + (G.lap + 1) : ''}`;
  UI.hudCity.textContent = G.stage.name; UI.progDest.textContent = G.stage.dest;
  renderLives(false); shownScore = -1; updateHUD(0);
  snapCam = true;
  setState(mode);
  if (mode === 'intro') { // 재도전·다음 도시: 도로 위에서 짧게 대기
    setUI('play');
    showStageTitle(`STAGE ${String(i + 1).padStart(2, '0')}`, G.stage.name, G.stage.dest);
    showTutorial(isTouch ? '화면을 눌러 이륙' : 'SPACE로 이륙');
  }
}
function setState(s) { G.state = s; G.stateT = 0; }

function launchFromTitle() { // 랜딩의 첫 입력 = 실제 이륙 (별도 START 단계 없음)
  if (G.state !== 'title') return;
  setUI('launch');
  liftoff();
}
function liftoff() {
  if (G.state !== 'intro' && G.state !== 'title') return;
  Sfx.init(); Sfx.tone(80, 400, 1.6, 'sawtooth', .08); Sfx.noise(1.2, .15);
  hideTutorial();
  if (G.fromTitle) later(.5, () => showStageTitle('STAGE 01', G.stage.name, G.stage.dest, 2.4), 'stageTitle');
  setState('liftoff');
}
const GRAVITY = 24;
function crashDust() { // 노면 충돌: 먼지 + 불꽃 파편
  for (let i = 0; i < 26; i++) emit(car.position.x + rand(-1.2, 1.2), .3, rand(-2, 2), rand(-9, 9), rand(.5, 3), rand(-6, 6), 1.6, 1.4);
  for (let i = 0; i < 22; i++) emit(car.position.x + rand(-.8, .8), .4, rand(-1, 1), rand(-12, 12), rand(3, 10), rand(-8, 8), .35, .6, FIRE, .95);
}
function wreckSmoke(rate) { // 잔해에서 피어오르는 검은 연기 + 불
  if (Math.random() < rate) emit(car.position.x + rand(-.8, .8), car.position.y + rand(-.3, .5), rand(-1.5, .5), rand(-.6, .6), rand(2.5, 4), rand(-.5, .5), 1.4, 2.2, SOOT, .7);
  if (Math.random() < rate * .7) emit(car.position.x + rand(-.7, .7), car.position.y * .5 + .3, rand(-1, .5), rand(-.3, .3), rand(1, 2.5), 0, .7, .45, FIRE, .9);
}
const carH = () => 2.6 * (texCache.car_player.aspect || .6); // 뒤집혔을 때 지붕이 노면에 닿는 높이
function hit() {
  G.lives--; G.inv = 1.6; G.shake = .6; G.combo = 0;
  Sfx.noise(.35, .4); Sfx.tone(220, 60, .4, 'square', .12);
  for (let i = 0; i < 18; i++) emit(car.position.x, car.position.y + .6, 0, rand(-8, 8), rand(-5, 8), rand(-8, 8), 1.2, .8);
  UI.vignette.classList.remove('hit'); void UI.vignette.offsetWidth; UI.vignette.classList.add('hit');
  UI.combo.classList.remove('show');
  renderLives(true);
  if (G.lives <= 0) gameOver();
}
// 신기록 표시는 '기존 기록을 넘었을 때'만 (첫 판은 기록 저장만)
function saveBest() { const beat = G.score > G.best; const isNew = beat && G.best > 0; if (beat) { G.best = G.score; store.set('skyroadster.best', G.best); } return isNew; }
function stageClear() {
  setState('clear');
  const bonus = 500 + G.lives * 200; G.score += bonus;
  Sfx.tone(523, 523, .15, 'triangle', .15); Sfx.tone(659, 659, .15, 'triangle', .15, .15); Sfx.tone(784, 784, .15, 'triangle', .15, .3); Sfx.tone(1046, 1046, .4, 'triangle', .15, .45);
  hideTutorial(); UI.combo.classList.remove('show');
  showStageTitle('ARRIVED', G.stage.name, G.stage.dest, 1.6);
  const prevBest = G.best, isNew = saveBest();
  later(1.5, () => {
    const last = G.stageIdx === STAGES.length - 1;
    openResult({
      kicker: last ? 'WORLD TOUR COMPLETE' : `STAGE ${String(G.stageIdx + 1).padStart(2, '0')} CLEAR`,
      title: `${G.stage.name} 도착`, sub: `${G.stage.dest}에 착륙했습니다`,
      score: G.score, isNew,
      meta: [['도착 보너스', '+' + bonus.toLocaleString()], ['남은 목숨', `${G.lives} / 3`], isNew ? ['이전 최고', Math.floor(prevBest).toLocaleString()] : ['최고 기록', Math.floor(G.best).toLocaleString()]],
      primary: last ? '다음 바퀴 · 더 빠르게' : `다음 도시 · ${STAGES[G.stageIdx + 1].name}`,
      onPrimary: () => { if (last) { G.lap++; setStage(0); } else setStage(G.stageIdx + 1); },
    });
  }, 'result');
}
function gameOver() {
  setState('over');
  const prevBest = G.best, isNew = saveBest();
  // 추락: 튕겨 오른 뒤 1.5바퀴 구르며 떨어져 '뒤집힌 채' 노면에 처박힘. 착지 지점의 정체 차량은 비켜둠
  G.vy = 5; G.landed = false; G.bounces = 0;
  const dir = Math.random() < .5 ? -1 : 1;
  const fallT = (G.vy + Math.sqrt(G.vy * G.vy + 2 * GRAVITY * Math.max(0, car.position.y - carH()))) / GRAVITY;
  car.rotation.set(0, 0, 0); car.userData.vis.rotation.set(0, 0, 0); car.userData.vis.position.set(0, 0, 0);
  G.spinTo = dir * Math.PI * 3; G.spin = G.spinTo / fallT; G.vx = dir * 1.2;
  G.inv = 0; car.visible = true; // 깜빡임 중이어도 추락 장면은 항상 보이게
  for (const tr of traffic) if (Math.abs(tr.x - car.position.x) < 2.8 && tr.z > -16 && tr.z < 13) tr.z -= SPAN * .5;
  hideTutorial(); cancel('stageTitle'); UI.stageTitle.classList.remove('show'); UI.combo.classList.remove('show');
  const pct = Math.round(clamp(G.dist / G.len, 0, 1) * 100);
  later(2.0, () => openResult({ // 추락 장면을 본 뒤 결과
    kicker: `CRASHED · ${G.stage.name}`, title: 'GAME OVER', sub: `${G.stage.dest}까지 ${100 - pct}% 남았습니다`,
    score: G.score, isNew,
    meta: [['도달', `${G.stage.name} ${pct}%`], isNew ? ['이전 최고', Math.floor(prevBest).toLocaleString()] : ['최고 기록', Math.floor(G.best).toLocaleString()]],
    primary: '다시 도전',
    onPrimary: () => { G.score = G.stageStartScore; setStage(G.stageIdx); },
  }), 'result');
}

// ---------------------------------------------------------------- 결과 / 일시정지 / 타이틀
let resultAction = null;
function openResult(r) {
  clearInput(true);
  ui('resKicker').textContent = r.kicker; ui('resTitle').textContent = r.title; ui('resSub').textContent = r.sub;
  ui('resScore').textContent = Math.floor(r.score).toLocaleString(); ui('resNew').hidden = !r.isNew;
  ui('resMeta').innerHTML = r.meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  ui('resPrimary').textContent = r.primary; resultAction = r.onPrimary;
  UI.result.hidden = false; setUI('result');
  ui('resPrimary').focus({ preventScroll: true });
}
function closeResult() { UI.result.hidden = true; resultAction = null; document.activeElement?.blur?.(); }
ui('resPrimary').addEventListener('click', () => { const fn = resultAction; if (!fn) return; closeResult(); fn(); });
ui('resSecondary').addEventListener('click', () => { closeResult(); toTitle(); });

let paused = false;
const PAUSABLE = new Set(['intro', 'liftoff', 'fly']);
function pause() {
  if (paused || !PAUSABLE.has(G.state) || UI.body.dataset.ui !== 'play') return;
  paused = true; clearInput(true); Sfx.setPaused(true);
  UI.pause.hidden = false; syncMuteUI(); ui('resumeBtn').focus({ preventScroll: true });
}
function resume() {
  if (!paused) return;
  paused = false; UI.pause.hidden = true; Sfx.setPaused(false);
  last = performance.now(); // 멈춘 시간만큼 튀지 않게
  document.activeElement?.blur?.();
}
ui('resumeBtn').addEventListener('click', resume);
ui('pauseBtn').addEventListener('click', pause);
ui('pauseTitleBtn').addEventListener('click', () => { paused = false; UI.pause.hidden = true; Sfx.setPaused(false); toTitle(); });

function toTitle() {
  closeResult(); paused = false; UI.pause.hidden = true; Sfx.setPaused(false);
  G.lap = 0; G.score = 0;
  setStage(0, false, 'title'); setUI('title'); renderLanding();
  ui('launchBtn').focus({ preventScroll: true });
}
function renderLanding() {
  ui('bestLine').innerHTML = G.best > 0 ? `BEST<b>${Math.floor(G.best).toLocaleString()}</b>` : '';
}

function syncMuteUI() {
  UI.muteBtn.setAttribute('aria-pressed', String(Sfx.muted));
  UI.muteBtn.setAttribute('aria-label', Sfx.muted ? '소리 켜기 (M)' : '소리 끄기 (M)');
  UI.pauseMuteBtn.setAttribute('aria-pressed', String(Sfx.muted));
  UI.pauseMuteBtn.textContent = Sfx.muted ? '소리 꺼짐' : '소리 켜짐';
}
function toggleMute() { Sfx.init(); Sfx.setMuted(!Sfx.muted); syncMuteUI(); }
UI.muteBtn.addEventListener('click', toggleMute);
UI.pauseMuteBtn.addEventListener('click', toggleMute);

// ---------------------------------------------------------------- 입력 (키보드·마우스·터치 통합)
// 누르고 있는 동안 = SPACE 가 눌려 있거나 화면에 닿은 포인터가 하나라도 있을 때
let spaceDown = false, spaceBlocked = false, testHold = false;
const pointers = new Set();
const isHolding = () => spaceDown || pointers.size > 0 || testHold;
const INPUT_STATES = new Set(['title', 'intro', 'liftoff', 'fly']);
function clearInput(blockHeldSpace) {
  if (blockHeldSpace && spaceDown) spaceBlocked = true; // 사망·정지 전부터 누르던 키는 뗀 뒤에야 새 입력으로 인정
  spaceDown = false; pointers.clear();
}
function onPress() {
  Sfx.init();
  if (G.state === 'title') launchFromTitle();
  else if (G.state === 'intro') liftoff();
  else if (G.state === 'fly') Sfx.ignite();
}
function overlayKey() { // 결과·일시정지 화면에서 SPACE: 포커스된 버튼, 없으면 주 버튼
  const layer = !UI.result.hidden ? UI.result : !UI.pause.hidden ? UI.pause : null;
  if (!layer) return false;
  const f = document.activeElement;
  if (f && f.tagName === 'BUTTON' && layer.contains(f)) f.click();
  else (layer === UI.result ? ui('resPrimary') : ui('resumeBtn')).click();
  return true;
}
addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault(); // 페이지 스크롤·버튼 기본 동작 방지 (동작은 아래에서 직접 처리)
    if (e.repeat || spaceBlocked) return;
    if (overlayKey()) { spaceBlocked = true; return; }
    if (!INPUT_STATES.has(G.state) || paused || UI.body.dataset.ui === 'result') return;
    spaceDown = true; onPress();
  } else if (e.code === 'KeyP' || e.code === 'Escape') { if (paused) resume(); else pause(); }
  else if (e.code === 'KeyM' && !e.repeat) toggleMute();
});
addEventListener('keyup', e => { if (e.code === 'Space') { e.preventDefault(); spaceDown = false; spaceBlocked = false; } });
function pointerDown(e) {
  if (e.button > 0 || paused || !INPUT_STATES.has(G.state)) return;
  e.preventDefault();
  pointers.add(e.pointerId); onPress();
}
canvas.addEventListener('pointerdown', pointerDown);
ui('landing').addEventListener('pointerdown', e => { if (e.target.closest('button') && e.target.closest('button').id !== 'launchBtn') return; pointerDown(e); });
ui('launchBtn').addEventListener('click', () => { Sfx.init(); launchFromTitle(); }); // 키보드 Enter 등 (포인터로 이미 이륙했으면 무시됨)
const pointerUp = e => pointers.delete(e.pointerId);
addEventListener('pointerup', pointerUp); addEventListener('pointercancel', pointerUp);
for (const el of [canvas, ui('landing')]) el.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('blur', () => clearInput(false));
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(false); pause(); } });

// ---------------------------------------------------------------- 업데이트
const carBox = [0, 0, 0, .85, .45, 2.0];
function collides(o) {
  const cx = car.position.x, cy = car.position.y + .65, sc = o.g.scale.x;
  for (const b of o.boxes) {
    const bx = o.g.position.x + b[0] * sc, by = o.g.position.y + b[1] * sc, bz = o.g.position.z + b[2] * sc;
    if (Math.abs(cx - bx) < carBox[3] + b[3] * sc * .9 && Math.abs(cy - by) < carBox[4] + b[4] * sc * .9 && Math.abs(bz) < carBox[5] + b[5] * sc) return true;
  }
  return false;
}

// 카메라: 목표 자세를 계산한 뒤 부드럽게 따라감(상승·하강이 느껴지는 지연). 흔들림은 마지막에만 더함
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camSm = new THREE.Vector3(), lookSm = new THREE.Vector3();
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
let snapCam = true;
function titlePose(out, look) { // 랜딩: 차량 후면을 크게. 아주 느린 접근 (reduced-motion 이면 고정)
  const portrait = innerHeight > innerWidth;
  const k = RM ? .5 : (1 - Math.cos(G.t * Math.PI * 2 / 30)) / 2;
  if (portrait) { out.set(0, 1.5, 5.5 - k * .45); look.set(0, .92, -8); }
  else { out.set(0, 1.3, 4.9 - k * .45); look.set(0, .92, -8); }
}
function titleViewOffset() { // 텍스트가 차량을 가리지 않게 화면 안에서 차량 위치만 옮김(회전 없음)
  const W = innerWidth, H = innerHeight;
  if (H > W) return [0, -.1 * H];
  return [-(H < 520 ? .17 : .14) * W, -.02 * H];
}

function update(dt) {
  G.t += dt; G.stateT += dt; const t = G.t;
  runTimers();
  const vis = car.userData.vis;
  const holding = isHolding();

  if (G.state === 'title' || G.state === 'intro') {
    G.speed = 0;
    // 공회전: 아주 미세한 차체 진동 + 노즐 주변 가벼운 증기 (논리 위치는 그대로)
    vis.position.y = RM ? 0 : Math.sin(t * 31) * .006 + Math.sin(t * 2.1) * .01;
    vis.rotation.z = RM ? 0 : Math.sin(t * 1.3) * .006;
    setJets(0, 0, t);
    if (Math.random() < .35) { const j = car.userData.jets[(Math.random() * 4) | 0]; car.updateMatrixWorld(); _tip.set(0, -.1, 0); j.localToWorld(_tip);
      emit(_tip.x + rand(-.1, .1), _tip.y, _tip.z, rand(-.3, .3), rand(.2, .7), rand(-.3, .3), .35, 1.4, STEAM, .22); }
  } else if (G.state === 'liftoff') {
    const k = Math.min(1, G.stateT / 2.4);
    car.position.y = ease(k) * LIFT_Y;
    G.speed = G.targetSpeed * k * k;
    G.camBlend = ease(k);
    G.jet = Math.min(1, G.jet + dt * 8); // 자동 이륙 시퀀스는 최대 분사 유지
    setJets(G.jet, k * .35, t);
    vis.position.y *= .9; vis.rotation.x += (.06 * (1 - k) - vis.rotation.x) * Math.min(1, dt * 6);
    // 이륙 순간: 노면에 부딪힌 증기가 옆으로 크게 퍼짐
    if (car.position.y < 2.5) for (const j of car.userData.jets) {
      if (Math.random() < .55) { _tip.set(0, 0, 0); j.localToWorld(_tip); emit(_tip.x, .3, _tip.z, rand(-10, 10), rand(.3, 2), rand(-7, 4), 1.8, 1.6); }
    } else jetSteam(.6, 1.1, 1.1, 2);
    if (k > .7 && UI.body.dataset.ui === 'launch') setUI('play'); // 랜딩 → HUD 로 자연스럽게
    if (k >= 1) {
      setState('fly'); G.prevHold = holding;
      if (!G.tutorialDone) showTutorial('누르면 상승 · 떼면 하강');
    }
  } else if (G.state === 'fly') {
    // 누르고 있으면 추력 > 중력 → 상승, 떼면 하강 (물리는 기존 그대로)
    G.vy = clamp(G.vy + (holding ? THRUST : -FALL) * dt, -9, 8);
    car.position.y += G.vy * dt;
    if (car.position.y < MIN_Y) { car.position.y = MIN_Y; G.vy = Math.max(0, G.vy); }   // 차 지붕 위 최저 고도
    if (car.position.y > MAX_Y) { car.position.y = MAX_Y; G.vy = Math.min(0, G.vy); }
    target.y = car.position.y;
    G.speed += (G.targetSpeed - G.speed) * Math.min(1, dt * 2);
    G.dist += G.speed * dt; G.score += Math.round(G.speed * dt * .2 * 10) / 10;
    if (!G.gateSpawned && G.dist >= G.nextSpawn && G.dist < G.len + SPAWN_Z - 40) { spawnWave(G.stage); G.nextSpawn = G.dist + G.gap * rand(.7, 1.3); }
    if (!G.gateSpawned && G.dist >= G.len + SPAWN_Z) { G.gateSpawned = true; addObs(makeGate(G.stage.dest)); }
    G.inv = Math.max(0, G.inv - dt);
    // 분사: 누르는 즉시 점화, 떼면 중심부가 빠르게 줄어듦 (이미 나온 증기는 파티클로 흩어짐)
    const jt = holding ? 1 : 0;
    G.jet += (jt - G.jet) * Math.min(1, dt * (jt > G.jet ? 30 : 9));
    setJets(G.jet, .35 + G.speed / 400, t);
    jetSteam(.55 * G.jet, 1, 1, 1.5);
    // 자세: 실제 수직 속도로 기수 들림/숙임 (평면 자산이 종이처럼 보이지 않게 작은 각도만)
    vis.rotation.x += (clamp(G.vy * .011, -.08, .08) - vis.rotation.x) * Math.min(1, dt * 8);
    vis.rotation.z = RM ? 0 : Math.sin(t * 1.7) * .012;
    vis.position.y = RM ? 0 : Math.sin(t * 2.3) * .03;
    car.visible = G.inv <= 0 || (t * 12 | 0) % 2 === 0;
    // 튜토리얼: 조작을 시작(누름/뗌 변화)하면 사라지고 다시는 안 나옴
    if (!G.tutorialDone && holding !== G.prevHold) { G.tutorialDone = true; store.set('skyroadster.tutorial', true); hideTutorial(); }
    G.prevHold = holding;
  } else if (G.state === 'clear') {
    G.speed *= 1 - dt * .8; target.y = Math.min(MAX_Y + 4, target.y + dt * 4);
    car.position.y += (target.y - car.position.y) * Math.min(1, dt * 6);
    G.jet += (.8 - G.jet) * Math.min(1, dt * 6); setJets(G.jet, .4, t); jetSteam(.4, 1, 1, 1.5);
    vis.rotation.x += (.05 - vis.rotation.x) * Math.min(1, dt * 4);
  } else if (G.state === 'over') {
    G.speed *= 1 - Math.min(1, dt * 6); // 세상이 빠르게 멈춤
    G.jet = Math.max(0, G.jet - dt * 3); setJets(G.jet, .3, t);
    const done = Math.abs(car.rotation.z) >= Math.abs(G.spinTo);
    const floor = carH() * (1 - Math.cos(car.rotation.z)) / 2; // 회전각에 따라 노면에 닿는 높이(뒤집히면 차 높이만큼)
    if (!G.landed) {
      G.vy -= GRAVITY * dt; car.position.y += G.vy * dt; car.position.x += G.vx * dt;
      if (!done) car.rotation.z += G.spin * dt; else car.rotation.z = G.spinTo;
      car.rotation.x = Math.sin(G.stateT * 11) * .18; // 구르면서 요동
      wreckSmoke(.9);
      if (car.position.y <= floor) { // 노면 충돌 → 쾅, 튕김
        car.position.y = floor; G.vx *= .4;
        if (G.vy < -4 && G.bounces < 2) { G.vy *= -.32; G.bounces++; G.shake = .8; Sfx.noise(.45, .45); Sfx.tone(140, 40, .5, 'square', .14); crashDust(); }
        else { G.vy = 0; G.landed = true; car.rotation.z = G.spinTo; }
      }
    } else { // 뒤집힌 채 멈춰서 흔들리다 정지, 연기·불
      car.rotation.x *= 1 - Math.min(1, dt * 5);
      car.rotation.z = G.spinTo + Math.sin(G.stateT * 14) * .05 * Math.max(0, 1.5 - G.stateT);
      car.position.y = carH() * (1 - Math.cos(car.rotation.z)) / 2;
      wreckSmoke(.8);
    }
  }
  car.userData.shadow.visible = car.position.y < 2;
  // 후미등: 대기 중에는 은은하게 숨쉬고, 비행 중에는 일정
  const tail = car.userData.tail;
  tail.position.y = carH() * .71;
  tail.material.opacity = G.state === 'title' || G.state === 'intro' ? .38 + Math.sin(t * 1.6) * .14 : G.state === 'over' ? .15 : .5;
  if (G.state === 'title') sun.intensity = 1.6 + Math.sin(t * .35) * .12; // 배경 조명의 절제된 변화

  // 월드 스크롤 (차는 z=0 에 고정, 세상이 +z 로 흐름)
  const dz = G.speed * dt;
  updateTraffic(dz);
  if (ground.material.map) ground.material.map.offset.y += dz / GROUND_TILE;
  for (const c of clouds) { c.position.z += dz * .9; if (c.position.z > 20) placeCloud(c, SPAWN_Z - 20); }
  const sp = streakGeo.attributes.position.array, len = G.speed * .06;
  streaks.visible = G.state === 'fly';
  streakData.forEach((s, i) => { s.z += dz * 1.4; if (s.z > 12) resetStreak(s); sp.set([s.x, s.y, s.z, s.x, s.y, s.z - len], i * 6); });
  streakGeo.attributes.position.needsUpdate = true;
  updateParticles(dt, G.speed * .5);

  // 장애물
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.g.position.z += dz; o.tick?.(dt, t);
    if (G.state === 'fly') {
      if (o.kind === 'ring' && !o.got && Math.abs(o.g.position.z) < 1.5) {
        if (Math.hypot(o.g.position.x - car.position.x, o.g.position.y - car.position.y - .6) < 2.4) {
          o.got = true; G.combo++; G.score += 100 * G.combo; o.g.visible = false;
          Sfx.tone(660, 1320, .18, 'sine', .15);
          popupAtCar('+' + 100 * G.combo);
          if (G.combo > 1) showCombo(G.combo);
        } else if (o.g.position.z > 1.4) { o.got = true; G.combo = 0; }
      } else if (o.kind === 'gate' && o.g.position.z > 0) { stageClear(); }
      else if (G.inv <= 0 && o.boxes.length && Math.abs(o.g.position.z) < 12 && collides(o)) hit();
    }
    if (o.g.position.z > 25) { scene.remove(o.g); obstacles.splice(i, 1); }
  }

  // 카메라 목표: 지상(랜딩 or 도로 대기) ↔ 비행 추적 블렌드
  if (G.fromTitle) titlePose(tmpA, tmpB); else { tmpA.set(0, 2.4, 8.5); tmpB.set(0, 1.2, -15); }
  camPos.copy(tmpA).lerp(_p.set(car.position.x * .55, car.position.y + 2.8, 11.5), G.camBlend);
  camLook.copy(tmpB).lerp(_s.set(car.position.x * .8, car.position.y + .5, -25), G.camBlend);
  if (G.state === 'over') { // 추락 카메라: 옆으로 빠지며 뒤집힌 잔해를 내려다봄
    const k = ease(Math.min(1, G.stateT * 1.5));
    camPos.lerp(tmpA.set(car.position.x + 2.4, 3.6, 7), k); camLook.lerp(tmpB.set(car.position.x, 1, -1), k);
  }
  if (snapCam) { camSm.copy(camPos); lookSm.copy(camLook); snapCam = false; }
  else { camSm.lerp(camPos, 1 - Math.exp(-dt * 5)); lookSm.lerp(camLook, 1 - Math.exp(-dt * 7)); }
  camera.position.copy(camSm);
  if (G.shake > 0) { G.shake -= dt; const a = (RM ? .08 : .4) * G.shake; camera.position.x += rand(-a, a); camera.position.y += rand(-a, a); }
  camera.lookAt(lookSm);
  // 랜딩 구도(view offset)는 이륙하며 0으로 풀린다
  const off = G.fromTitle ? 1 - G.camBlend : 0;
  if (off > .001) { const [ox, oy] = titleViewOffset(); camera.setViewOffset(innerWidth, innerHeight, ox * off, oy * off, innerWidth, innerHeight); }
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();

  // 배경 사진: 사진의 지면선을 3D 지평선에 고정 + 목적지에 가까워질수록 확대
  const prog = clamp(G.dist / G.len, 0, 1);
  layoutBg(1 + prog * .35);
  if (G.state !== 'title') updateHUD(prog);
  const flying = G.state === 'fly' || G.state === 'liftoff';
  Sfx.engine(flying ? 1 : G.state === 'intro' ? .3 : G.state === 'clear' ? .6 : 0, G.speed);
  Sfx.jetLevel(G.state === 'over' ? 0 : G.jet);
}

const horizonV = new THREE.Vector3();
function layoutBg(zoom) {
  const W = innerWidth, H = innerHeight;
  horizonV.set(camera.position.x, camera.position.y, camera.position.z - 2000).project(camera);
  const hy = (1 - horizonV.y) / 2 * H, hz = G.stage.hz;
  // 지평선 위는 반드시 덮고, 아래는 너무 크게 키우지 않음(남는 곳은 바닥색으로 채움)
  const h = Math.max(W * 9 / 16, hy / hz, Math.min((H - hy) / (1 - hz), hy / hz * 1.6)) * zoom;
  const w = h * 16 / 9;
  bgEl.style.transform = `translate(${((W - w) / 2).toFixed(1)}px, ${(hy - hz * h).toFixed(1)}px)`;
  bgEl.style.width = w.toFixed(0) + 'px'; bgEl.style.height = h.toFixed(0) + 'px';
}

// ---------------------------------------------------------------- 로딩 / 부팅
function setLoadProgress(f) { const el = document.getElementById('loadFill'); if (el) el.style.transform = `scaleX(${f.toFixed(3)})`; }
let booted = false;
function bootIfReady() {
  if (booted || !LOAD.tex || !LOAD.bg) return;
  const critical = ['car_player', `${STAGES[0].id}.jpg`, `ground_${STAGES[0].id}`];
  if (LOAD.failed.some(u => critical.some(c => u.includes(c)))) {
    ui('loadMsg').textContent = '필수 자산을 불러오지 못했습니다.';
    const b = ui('retryBtn'); b.hidden = false; b.onclick = () => location.reload();
    return;
  }
  booted = true;
  setStage(0, false, 'title'); setUI('title'); renderLanding();
  update(0); renderer.render(scene, camera);
}

// ---------------------------------------------------------------- 루프
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w < h ? 75 : 60; // 세로 화면이면 시야를 넓혀 장애물이 보이게
  camera.updateProjectionMatrix();
  pMat.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}
addEventListener('resize', resize); resize();
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (!booted) return;
  if (!paused) update(dt);
  renderer.render(scene, camera);
}
syncMuteUI();
requestAnimationFrame(loop);
window.__srBooted = true;
// 디버그/테스트용 훅
window.__G = G;
window.__dbg = { car, hold: v => { testHold = v; }, crash: () => gameOver(), clear: () => stageClear() };
