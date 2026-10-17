// SKY ROADSTER — 가벼운 3D 미니 게임 (three.js 하나만 사용, 모델은 전부 코드로 생성)
import * as THREE from 'three';

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
const SPAWN_Z = -260, BOUND_X = 10, MIN_Y = 3, MAX_Y = 12, LIFT_Y = 4.2;

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

function buildRoadster() {
  const car = new THREE.Group();
  const photo = photoMesh('car_player', 2.6); // 레퍼런스 사진 기반으로 생성한 로드스터 후면
  car.add(photo);
  const sh = groundShadow(3.2, 5); car.add(sh); car.userData.shadow = sh;
  // 증기 분사 4개: 레퍼런스처럼 네 바퀴 위치 아래로 수직 분사 (뒤 2개는 사진 앞, 앞 2개는 사진 뒤)
  car.userData.jets = [];
  for (const [x, z] of [[-1.02, .2], [1.02, .2], [-.5, .1], [.5, .1]]) { // 후면 카메라에서 4줄기가 모두 보이도록 차체 바로 아래(사진 앞)에 배치
    const j = new THREE.Group(); j.position.set(x, .38, z);
    j.add(new THREE.Mesh(JET.outerGeo, JET.outer), new THREE.Mesh(JET.coreGeo, JET.core));
    const glow = new THREE.Sprite(JET.glowMat); glow.scale.setScalar(.7); j.add(glow);
    j.visible = false; car.add(j); car.userData.jets.push(j);
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
const pPos = new Float32Array(PN * 3), pSize = new Float32Array(PN), pAlpha = new Float32Array(PN);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
pGeo.setAttribute('alpha', new THREE.BufferAttribute(pAlpha, 1));
const pMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: softTex }, scale: { value: 400 } },
  vertexShader: `attribute float size; attribute float alpha; varying float vA; uniform float scale;
    void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform sampler2D map; varying float vA;
    void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vec3(.92,.94,1.), c.a * vA); }`,
  transparent: true, depthWrite: false,
});
const smoke = new THREE.Points(pGeo, pMat); smoke.frustumCulled = false; scene.add(smoke);
const parts = Array.from({ length: PN }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1 }));
let pNext = 0;
function emit(x, y, z, vx, vy, vz, size, life) {
  const i = pNext = (pNext + 1) % PN, p = parts[i];
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  Object.assign(p, { life, max: life, vx, vy, vz, s0: size });
}
function updateParticles(dt, worldSpeed) {
  for (let i = 0; i < PN; i++) {
    const p = parts[i];
    if (p.life <= 0) { pAlpha[i] = 0; continue; }
    p.life -= dt; const k = 1 - p.life / p.max;
    p.vx *= .95; p.vy *= .95; p.vz *= .95;
    pPos[i * 3] += p.vx * dt; pPos[i * 3 + 1] += p.vy * dt; pPos[i * 3 + 2] += (p.vz + worldSpeed) * dt;
    pSize[i] = p.s0 * (1 + k * 3); pAlpha[i] = (1 - k) * (1 - k) * .5;
  }
  pGeo.attributes.position.needsUpdate = pGeo.attributes.size.needsUpdate = pGeo.attributes.alpha.needsUpdate = true;
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
  const vx = rand(-4, 4);
  return { kind: 'bird', g, boxes, tick(dt, t) {
    g.position.x += vx * dt; g.position.y += Math.sin(t * 2) * dt;
    for (const b of birds) { const c = texCache[b.userData.photo]; const f = Math.sin(t * 12 + b.userData.ph); // 날갯짓: 세로로 살짝 찌그러뜨려 흉내
      b.scale.set(1.9 * (1 - Math.abs(f) * .12), 1.9 * (c.aspect || .4) * (1 + f * .35), 1); b.rotation.z = f * .05; }
  } };
}
function makeDrone(x, y) {
  const g = new THREE.Group(); g.position.set(x, y, SPAWN_Z);
  const d = photoMesh('obs_drone', 2.8, true); g.add(d);
  const x0 = x, ph = rand(0, 6), amp = rand(1.5, 4);
  return { kind: 'drone', g, boxes: [[0, 0, 0, 1.4, .5, .8]], tick(dt, t) {
    g.position.x = x0 + Math.sin(t * 1.6 + ph) * amp; g.position.y += Math.cos(t * 3 + ph) * dt * 1.5;
    d.rotation.z = Math.cos(t * 1.6 + ph) * .12; // 좌우로 움직일 때 기울기
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
  // 40% 확률로 현재 플레이어 위치를 노림 → 피하는 맛
  const aim = Math.random() < .4;
  const x = aim ? car.position.x + rand(-2, 2) : rand(-BOUND_X, BOUND_X);
  const y = aim ? car.position.y + rand(-1.5, 1.5) : rand(MIN_Y, MAX_Y);
  let o;
  if (kind === 'sign') o = makeSign(clamp(x, -7, 7), clamp(y, MIN_Y + .5, MAX_Y - 2), stage.signs[(Math.random() * stage.signs.length) | 0]);
  else if (kind === 'bird') o = makeBirds(x, y);
  else if (kind === 'drone') o = makeDrone(x, y);
  else o = makeBalloon(x, clamp(y, MIN_Y + 2, MAX_Y));
  addObs(o);
  if (Math.random() < .45) addObs(makeRing(rand(-BOUND_X + 2, BOUND_X - 2), rand(MIN_Y + 1, MAX_Y - 1)), rand(8, 14));
}
function addObs(o, dz = 0) { o.g.position.z += dz; scene.add(o.g); obstacles.push(o); }

// ---------------------------------------------------------------- 사운드 (WebAudio 합성, 파일 없음)
const Sfx = {
  ctx: null, muted: false, eng: null,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 55; f.type = 'lowpass'; f.frequency.value = 380; g.gain.value = 0;
    o.connect(f).connect(g).connect(this.ctx.destination); o.start(); this.eng = { o, g };
  },
  engine(level, speed) {
    if (!this.eng) return; const t = this.ctx.currentTime;
    this.eng.g.gain.setTargetAtTime(this.muted ? 0 : level * .05, t, .1);
    this.eng.o.frequency.setTargetAtTime(45 + speed * .7, t, .2);
  },
  tone(f1, f2, dur, type = 'sine', vol = .15, delay = 0) {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur);
  },
  noise(dur, vol = .3) {
    if (!this.ctx || this.muted) return;
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); g.gain.value = vol;
    s.buffer = b; s.connect(g).connect(this.ctx.destination); s.start();
  },
};

// ---------------------------------------------------------------- 게임 상태
const bgEl = $('#bg'), hud = $('#hud'), hint = $('#hint'), banner = $('#banner');
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
    if (G.stage === s && G.state !== 'title') applyFog(s);
  };
}
function applyFog(s) { const c = hzColors[s.id]; if (c) { scene.fog.color.copy(c.fog); document.body.style.backgroundColor = c.ground; } }

const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const G = {
  state: 'title', stageIdx: 0, lap: 0, stage: STAGES[0], score: 0, stageStartScore: 0, lives: 3,
  dist: 0, len: 1500, speed: 0, targetSpeed: 50, gap: 30, nextSpawn: 0, gateSpawned: false,
  t: 0, stateT: 0, inv: 0, shake: 0, camBlend: 0, combo: 0, best: store.get('skyroadster.best', 0),
};
const target = new THREE.Vector2(0, 6);
const keys = new Set();

function setStage(i, keepScore = true) {
  G.stageIdx = i; G.stage = STAGES[i];
  const lapBoost = G.lap * 10;
  G.targetSpeed = 48 + i * 6 + lapBoost; G.len = 1500 + i * 200; G.gap = Math.max(12, 30 - i * 3 - G.lap * 3);
  G.dist = 0; G.speed = 0; G.nextSpawn = 60; G.gateSpawned = false; G.lives = 3; G.inv = 0; G.combo = 0; G.camBlend = 0;
  if (!keepScore) G.score = 0;
  G.stageStartScore = G.score;
  clearObstacles();
  bgEl.style.backgroundImage = bgImgs[G.stage.id].complete && bgImgs[G.stage.id].naturalWidth ? `url(assets/${G.stage.id}.jpg)` : '';
  applyFog(G.stage);
  // 교통 체증 위에서 시작
  ground.material.map = groundTex[G.stage.id]; ground.material.needsUpdate = true;
  car.position.set(0, 0, 0); car.rotation.set(0, 0, 0); target.set(0, LIFT_Y);
  setJets(0, 0, 0);
  $('#hudStage').textContent = `STAGE ${i + 1}${G.lap ? ' · LAP ' + (G.lap + 1) : ''}`;
  $('#hudCity').textContent = G.stage.name; $('#hudDest').textContent = '목적지 · ' + G.stage.dest;
  setState('intro');
}
function setState(s) {
  G.state = s; G.stateT = 0;
  hint.classList.toggle('hidden', s !== 'intro');
  hud.classList.toggle('hidden', s === 'title');
  if (s === 'intro') {
    hint.textContent = innerWidth < 700 ? '탭해서 이륙! 🚀' : 'SPACE / 클릭으로 이륙! 🚀';
    showBanner(`${G.stage.name}<small>꽉 막힌 도로… 하늘로 가자</small>`, 2.2);
  }
}
let bannerTimer = 0;
function showBanner(html, sec) { banner.innerHTML = html; banner.classList.remove('hidden'); bannerTimer = sec; }

function liftoff() {
  if (G.state !== 'intro') return;
  Sfx.init(); Sfx.tone(80, 400, 1.6, 'sawtooth', .08); Sfx.noise(1.2, .15);
  setState('liftoff');
}
function hit() {
  G.lives--; G.inv = 1.6; G.shake = .6; G.combo = 0;
  Sfx.noise(.35, .4); Sfx.tone(220, 60, .4, 'square', .12);
  for (let i = 0; i < 18; i++) emit(car.position.x, car.position.y + .6, 0, rand(-8, 8), rand(-5, 8), rand(-8, 8), 1.2, .8);
  if (G.lives <= 0) gameOver();
}
function stageClear() {
  setState('clear');
  const bonus = 500 + G.lives * 200; G.score += bonus;
  Sfx.tone(523, 523, .15, 'triangle', .15); Sfx.tone(659, 659, .15, 'triangle', .15, .15); Sfx.tone(784, 784, .15, 'triangle', .15, .3); Sfx.tone(1046, 1046, .4, 'triangle', .15, .45);
  showBanner(`WELCOME TO<br>${G.stage.name}<small>${G.stage.dest} 도착!</small>`, 2);
  saveBest();
  setTimeout(() => {
    const last = G.stageIdx === STAGES.length - 1;
    showResult(last ? 'WORLD TOUR!' : 'STAGE CLEAR',
      `${G.stage.dest} 도착 · 보너스 +${bonus}<br>점수 <b>${Math.floor(G.score).toLocaleString()}</b>`,
      last ? '다음 바퀴 (더 빠르게) ▶' : `NEXT: ${STAGES[G.stageIdx + 1].name} ▶`,
      () => { if (last) { G.lap++; setStage(0); } else setStage(G.stageIdx + 1); });
  }, 1800);
}
function gameOver() {
  setState('over'); saveBest();
  showBanner('CRASH!', 1.2);
  setTimeout(() => showResult('GAME OVER', `${G.stage.name} · ${Math.round(G.dist / G.len * 100)}% 지점<br>점수 <b>${Math.floor(G.score).toLocaleString()}</b> · 최고 ${Math.floor(G.best).toLocaleString()}`,
    '이 스테이지 다시 ▶', () => { G.score = G.stageStartScore; setStage(G.stageIdx); }), 1300);
}
function saveBest() { if (G.score > G.best) { G.best = G.score; store.set('skyroadster.best', G.best); } }
function showResult(title, text, btn, onNext) {
  $('#resTitle').textContent = title; $('#resText').innerHTML = text; $('#resBtn').textContent = btn;
  $('#result').classList.remove('hidden');
  $('#resBtn').onclick = () => { $('#result').classList.add('hidden'); onNext(); };
}
function toTitle() {
  $('#result').classList.add('hidden'); $('#title').classList.remove('hidden'); hint.classList.add('hidden');
  G.state = 'title'; hud.classList.add('hidden'); renderTitle();
}
function renderTitle() {
  $('#cities').innerHTML = STAGES.map(s => `<span>${s.name}</span>`).join('');
  $('#best').textContent = G.best ? `최고 점수 ${Math.floor(G.best).toLocaleString()}` : '';
}
let paused = false;
function togglePause(force) {
  if (!['fly', 'liftoff', 'intro'].includes(G.state) && !paused) return;
  paused = force ?? !paused;
  if (paused) showBanner('PAUSED<small>P 키 또는 탭으로 계속</small>', 1e9); else banner.classList.add('hidden');
}

// ---------------------------------------------------------------- 입력
addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'Space') { e.preventDefault(); if (paused) togglePause(false); else liftoff(); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') toggleMute();
});
addEventListener('keyup', e => keys.delete(e.code));
let drag = null;
canvas.addEventListener('pointerdown', e => {
  Sfx.init();
  if (paused) { togglePause(false); return; }
  if (G.state === 'intro') liftoff();
  drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  target.x += (e.clientX - drag.x) / innerWidth * 30; target.y -= (e.clientY - drag.y) / innerHeight * 20;
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });
function toggleMute() { Sfx.muted = !Sfx.muted; $('#muteBtn').textContent = Sfx.muted ? '🔇' : '🔊'; }
$('#muteBtn').onclick = toggleMute;
$('#startBtn').onclick = () => { Sfx.init(); $('#title').classList.add('hidden'); G.lap = 0; setStage(0, false); };
$('#resBtn2').onclick = toTitle;

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

const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function update(dt) {
  G.t += dt; G.stateT += dt; const t = G.t;

  if (G.state === 'intro') {
    car.position.y = Math.sin(t * 9) * .01; // 공회전 떨림
    G.speed = 0;
  } else if (G.state === 'liftoff') {
    const k = Math.min(1, G.stateT / 2.4);
    car.position.y = ease(k) * LIFT_Y;
    G.speed = G.targetSpeed * k * k;
    G.camBlend = ease(k);
    setJets(Math.min(1, G.stateT * 3), k * .35, t);
    // 이륙 순간: 노면에 부딪힌 증기가 옆으로 크게 퍼짐 (레퍼런스의 바닥 연기)
    if (car.position.y < 2.5) for (const j of car.userData.jets) {
      if (Math.random() < .55) { _tip.set(0, 0, 0); j.localToWorld(_tip); emit(_tip.x, .3, _tip.z, rand(-10, 10), rand(.3, 2), rand(-7, 4), 1.8, 1.6); }
    } else jetSteam(.6, 1.1, 1.1, 2);
    if (k >= 1) { setState('fly'); showBanner(`GO!<small>${G.stage.dest}까지 날아가자</small>`, 1.3); }
  } else if (G.state === 'fly') {
    // 입력
    const ix = (keys.has('ArrowRight') || keys.has('KeyD')) - (keys.has('ArrowLeft') || keys.has('KeyA'));
    const iy = (keys.has('ArrowUp') || keys.has('KeyW')) - (keys.has('ArrowDown') || keys.has('KeyS'));
    target.x = clamp(target.x + ix * 22 * dt, -BOUND_X, BOUND_X); target.y = clamp(target.y + iy * 16 * dt, MIN_Y, MAX_Y);
    G.speed += (G.targetSpeed - G.speed) * Math.min(1, dt * 2);
    G.dist += G.speed * dt; G.score += Math.round(G.speed * dt * .2 * 10) / 10;
    // 스폰
    if (!G.gateSpawned && G.dist >= G.nextSpawn && G.dist < G.len + SPAWN_Z - 40) { spawnWave(G.stage); G.nextSpawn = G.dist + G.gap * rand(.7, 1.3); }
    if (!G.gateSpawned && G.dist >= G.len + SPAWN_Z) { G.gateSpawned = true; addObs(makeGate(G.stage.dest)); }
    G.inv = Math.max(0, G.inv - dt);
  } else if (G.state === 'clear') {
    G.speed *= 1 - dt * .8; target.y = Math.min(MAX_Y + 4, target.y + dt * 4);
  } else if (G.state === 'over') {
    G.speed *= 1 - dt * 2; target.y -= dt * 3; car.rotation.z += dt * 3;
  }

  // 차량 이동 / 기울기
  if (G.state === 'fly' || G.state === 'clear' || G.state === 'over') {
    const px = car.position.x, py = car.position.y, f = Math.min(1, dt * 6);
    car.position.x += (target.x - px) * f; car.position.y += (target.y - py) * f;
    const vx = (car.position.x - px) / dt, vy = (car.position.y - py) / dt;
    if (G.state !== 'over') { car.rotation.z += (-vx * .035 - car.rotation.z) * f; car.rotation.x += (vy * .02 - car.rotation.x) * f; car.rotation.y = -vx * .01; }
    if (G.state !== 'over') { setJets(1, .35 + G.speed / 400, t); jetSteam(.5, 1, 1, 1.5); } else setJets(Math.max(0, 1 - G.stateT), .3, t);
    car.visible = G.inv <= 0 || (t * 12 | 0) % 2 === 0;
  }
  car.userData.shadow.visible = car.position.y < 2;

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
          if (G.combo > 1) showBanner(`<small>RING x${G.combo}</small>`, .6);
        } else if (o.g.position.z > 1.4) { o.got = true; G.combo = 0; }
      } else if (o.kind === 'gate' && o.g.position.z > 0) { stageClear(); }
      else if (G.inv <= 0 && o.boxes.length && Math.abs(o.g.position.z) < 12 && collides(o)) hit();
    }
    if (o.g.position.z > 25) { scene.remove(o.g); obstacles.splice(i, 1); }
  }

  // 카메라: 인트로(도로 위 낮게) ↔ 비행(뒤에서 따라감) 블렌드
  tmpA.set(0, 2.4, 8.5); tmpB.set(car.position.x * .55, car.position.y + 2.8, 11.5);
  camPos.lerpVectors(tmpA, tmpB, G.camBlend);
  tmpA.set(0, 1.2, -15); tmpB.set(car.position.x * .8, car.position.y + .5, -25);
  camLook.lerpVectors(tmpA, tmpB, G.camBlend);
  if (G.shake > 0) { G.shake -= dt; camPos.x += rand(-.4, .4) * G.shake; camPos.y += rand(-.4, .4) * G.shake; }
  camera.position.copy(camPos); camera.lookAt(camLook);

  // 배경 사진: 사진의 지면선을 3D 지평선에 고정 + 목적지에 가까워질수록 확대 (공짜 원근감)
  const prog = clamp(G.dist / G.len, 0, 1);
  layoutBg(1 + prog * .35);

  // HUD
  $('#progFill').style.width = (prog * 100) + '%'; $('#progCar').style.left = (prog * 100) + '%';
  $('#hudScore').textContent = Math.floor(G.score).toLocaleString();
  $('#hudLives').textContent = '❤'.repeat(Math.max(0, G.lives)) + '♡'.repeat(Math.max(0, 3 - G.lives));
  Sfx.engine(G.state === 'fly' || G.state === 'liftoff' ? 1 : G.state === 'intro' ? .3 : 0, G.speed);
  if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) banner.classList.add('hidden');
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
  if (G.state === 'title') return; // 타이틀에서는 렌더링도 쉬어서 가볍게
  if (!paused) update(dt);
  renderer.render(scene, camera);
}
renderTitle();
requestAnimationFrame(loop);
// 디버그용: 콘솔에서 __dbg.step(초) 로 프레임 수동 진행
window.__G = G;
window.__dbg = { step(sec, dt = 1 / 30) { for (let i = 0; i < sec / dt; i++) update(dt); renderer.render(scene, camera); }, target, car };
