// 다국어 (en / ko / ja / zh / es / fr) + 접속 국가 기반 자동 언어 라우팅
// 기본 언어는 영어. 우선순위: URL ?lang= → 사용자가 직접 고른 언어 → (AUTO_DETECT 일 때) 시간대(국가) → 브라우저 언어 → 영어
// 정적 사이트라 서버 GeoIP 가 없으므로(외부 API 미사용 원칙) 자동 감지는 시간대를 '국가' 신호로 쓰는 추정이다.
// 서버/CDN 의 국가 헤더(예: CF-IPCountry)를 쓸 수 있게 되면 그 값을 ?lang= 로 넘기거나 AUTO_DETECT 를 켠다.
export const AUTO_DETECT = false;

export const LANGS = [
  { code: 'en', name: 'English', html: 'en' },
  { code: 'ko', name: '한국어', html: 'ko' },
  { code: 'ja', name: '日本語', html: 'ja' },
  { code: 'zh', name: '中文', html: 'zh-Hans' },
  { code: 'es', name: 'Español', html: 'es' },
  { code: 'fr', name: 'Français', html: 'fr' },
];
const CODES = LANGS.map(l => l.code);

// 국가(시간대) → 언어. 지원 언어를 쓰는 주요 국가만, 나머지는 브라우저 언어로 넘어감
const TZ_COUNTRY_LANG = {
  'Asia/Seoul': 'ko', 'Asia/Pyongyang': 'ko',
  'Asia/Tokyo': 'ja',
  'Asia/Shanghai': 'zh', 'Asia/Chongqing': 'zh', 'Asia/Harbin': 'zh', 'Asia/Urumqi': 'zh', 'Asia/Hong_Kong': 'zh', 'Asia/Macau': 'zh', 'Asia/Taipei': 'zh',
  'Europe/Madrid': 'es', 'Atlantic/Canary': 'es', 'Africa/Ceuta': 'es', 'America/Mexico_City': 'es', 'America/Monterrey': 'es', 'America/Cancun': 'es', 'America/Tijuana': 'es',
  'America/Argentina/Buenos_Aires': 'es', 'America/Buenos_Aires': 'es', 'America/Bogota': 'es', 'America/Lima': 'es', 'America/Santiago': 'es', 'America/Caracas': 'es',
  'America/Montevideo': 'es', 'America/Asuncion': 'es', 'America/La_Paz': 'es', 'America/Guayaquil': 'es', 'America/Guatemala': 'es', 'America/Costa_Rica': 'es',
  'America/Panama': 'es', 'America/El_Salvador': 'es', 'America/Tegucigalpa': 'es', 'America/Managua': 'es', 'America/Havana': 'es', 'America/Santo_Domingo': 'es',
  'Europe/Paris': 'fr', 'Europe/Monaco': 'fr', 'Europe/Luxembourg': 'fr', 'America/Montreal': 'fr', 'America/Toronto': null, 'Africa/Dakar': 'fr', 'Africa/Abidjan': 'fr',
  'Africa/Kinshasa': 'fr', 'Africa/Douala': 'fr', 'Indian/Reunion': 'fr', 'Pacific/Tahiti': 'fr', 'America/Martinique': 'fr', 'America/Guadeloupe': 'fr',
  'America/New_York': 'en', 'America/Chicago': 'en', 'America/Denver': 'en', 'America/Los_Angeles': 'en', 'America/Phoenix': 'en', 'America/Anchorage': 'en', 'Pacific/Honolulu': 'en',
  'Europe/London': 'en', 'Europe/Dublin': 'en', 'Australia/Sydney': 'en', 'Australia/Melbourne': 'en', 'Australia/Brisbane': 'en', 'Australia/Perth': 'en', 'Australia/Adelaide': 'en',
  'Pacific/Auckland': 'en', 'America/Vancouver': 'en',
};

const STORE_KEY = 'skyroadster.lang';
const safeGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const norm = c => { c = String(c || '').toLowerCase().slice(0, 2); return CODES.includes(c) ? c : null; };

export function detectLang() {
  const url = norm(new URLSearchParams(location.search).get('lang'));
  if (url) return { lang: url, source: 'url' };
  const saved = norm(safeGet(STORE_KEY));
  if (saved) return { lang: saved, source: 'saved' };
  if (!AUTO_DETECT) return { lang: 'en', source: 'default' };
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  const byCountry = TZ_COUNTRY_LANG[tz];
  if (byCountry) return { lang: byCountry, source: 'country:' + tz };
  for (const l of navigator.languages || [navigator.language]) { const c = norm(l); if (c) return { lang: c, source: 'browser:' + l }; }
  return { lang: 'en', source: 'default' };
}

const D = {
  tagline: { ko: '도로가 막혔다면, 위로.', en: 'Stuck in traffic? Go up.', ja: '道が詰まったら、空へ。', zh: '堵车了？那就往上飞。', es: '¿Atasco? Hacia arriba.', fr: 'Bouchons ? Passez par le haut.' },
  launchDesk: { ko: '{key}를 눌러 이륙', en: 'Press {key} to take off', ja: '{key}を押して離陸', zh: '按 {key} 起飞', es: 'Pulsa {key} para despegar', fr: 'Appuyez sur {key} pour décoller' },
  launchTouch: { ko: '화면을 꾹 눌러 이륙', en: 'Press and hold to take off', ja: '画面を長押しで離陸', zh: '长按屏幕起飞', es: 'Mantén pulsado para despegar', fr: "Maintenez l'écran pour décoller" },
  howto: { ko: '누르면 상승 · 떼면 하강', en: 'Hold to climb · Release to descend', ja: '押すと上昇 · 離すと下降', zh: '按住上升 · 松开下降', es: 'Mantén para subir · Suelta para bajar', fr: 'Maintenez pour monter · Relâchez pour descendre' },
  introDesk: { ko: 'SPACE로 이륙', en: 'SPACE to take off', ja: 'SPACEで離陸', zh: '按 SPACE 起飞', es: 'SPACE para despegar', fr: 'SPACE pour décoller' },
  introTouch: { ko: '화면을 눌러 이륙', en: 'Tap to take off', ja: 'タップで離陸', zh: '点击屏幕起飞', es: 'Toca para despegar', fr: 'Touchez pour décoller' },
  resume: { ko: '계속하기', en: 'Resume', ja: '再開', zh: '继续', es: 'Continuar', fr: 'Reprendre' },
  soundOn: { ko: '소리 켜짐', en: 'Sound on', ja: 'サウンド オン', zh: '声音：开', es: 'Sonido: sí', fr: 'Son : activé' },
  soundOff: { ko: '소리 꺼짐', en: 'Sound off', ja: 'サウンド オフ', zh: '声音：关', es: 'Sonido: no', fr: 'Son : coupé' },
  toTitle: { ko: '타이틀로', en: 'Title screen', ja: 'タイトルへ', zh: '返回标题', es: 'Pantalla de título', fr: 'Écran titre' },
  retry: { ko: '다시 도전', en: 'Try again', ja: 'もう一度', zh: '再试一次', es: 'Reintentar', fr: 'Réessayer' },
  nextCity: { ko: '다음 도시 · {city}', en: 'Next city · {city}', ja: '次の都市 · {city}', zh: '下一座城市 · {city}', es: 'Siguiente ciudad · {city}', fr: 'Ville suivante · {city}' },
  nextLap: { ko: '다음 바퀴 · 더 빠르게', en: 'Next lap · Faster', ja: '次の周回 · さらに速く', zh: '下一圈 · 更快', es: 'Siguiente vuelta · Más rápido', fr: 'Tour suivant · Plus vite' },
  arrivedTitle: { ko: '{city} 도착', en: 'Arrived in {city}', ja: '{city} 到着', zh: '抵达 {city}', es: 'Llegada a {city}', fr: 'Arrivée à {city}' },
  arrivedSub: { ko: '{dest}에 착륙했습니다', en: 'Landed at {dest}', ja: '{dest}に着陸しました', zh: '已降落在{dest}', es: 'Aterrizaste en {dest}', fr: 'Atterrissage à {dest}' },
  overSub: { ko: '{dest}까지 {n}% 남았습니다', en: '{n}% left to {dest}', ja: '{dest}まで残り{n}%', zh: '距离{dest}还剩 {n}%', es: 'Faltaba un {n}% hasta {dest}', fr: 'Encore {n} % jusqu’à {dest}' },
  reached: { ko: '도달', en: 'Reached', ja: '到達', zh: '到达', es: 'Alcanzado', fr: 'Atteint' },
  best: { ko: '최고 기록', en: 'Best', ja: 'ベスト', zh: '最佳', es: 'Mejor', fr: 'Record' },
  prevBest: { ko: '이전 최고', en: 'Previous best', ja: '前回ベスト', zh: '之前最佳', es: 'Mejor anterior', fr: 'Ancien record' },
  bonus: { ko: '도착 보너스', en: 'Arrival bonus', ja: '到着ボーナス', zh: '抵达奖励', es: 'Bono de llegada', fr: 'Bonus d’arrivée' },
  livesLeft: { ko: '남은 목숨', en: 'Lives left', ja: '残りライフ', zh: '剩余生命', es: 'Vidas restantes', fr: 'Vies restantes' },
  hintGo: { ko: '바로 진행', en: 'to continue', ja: 'で続行', zh: '继续', es: 'para continuar', fr: 'pour continuer' },
  pauseAria: { ko: '일시정지 (P)', en: 'Pause (P)', ja: '一時停止 (P)', zh: '暂停 (P)', es: 'Pausa (P)', fr: 'Pause (P)' },
  muteAria: { ko: '소리 끄기 (M)', en: 'Mute (M)', ja: 'ミュート (M)', zh: '静音 (M)', es: 'Silenciar (M)', fr: 'Couper le son (M)' },
  unmuteAria: { ko: '소리 켜기 (M)', en: 'Unmute (M)', ja: 'ミュート解除 (M)', zh: '取消静音 (M)', es: 'Activar sonido (M)', fr: 'Activer le son (M)' },
  livesAria: { ko: '남은 목숨 {n}개', en: '{n} lives left', ja: '残りライフ {n}', zh: '剩余 {n} 条命', es: '{n} vidas restantes', fr: '{n} vies restantes' },
  launchAria: { ko: '이륙하기 (SPACE)', en: 'Take off (SPACE)', ja: '離陸する (SPACE)', zh: '起飞 (SPACE)', es: 'Despegar (SPACE)', fr: 'Décoller (SPACE)' },
  landingAria: { ko: 'SKY ROADSTER 시작 화면', en: 'SKY ROADSTER start screen', ja: 'SKY ROADSTER スタート画面', zh: 'SKY ROADSTER 开始画面', es: 'Pantalla de inicio de SKY ROADSTER', fr: 'Écran d’accueil SKY ROADSTER' },
  routeAria: { ko: '도시 여정: 서울, 런던, 파리, 두바이, 시드니, 뉴욕', en: 'Route: Seoul, London, Paris, Dubai, Sydney, New York', ja: 'ルート: ソウル、ロンドン、パリ、ドバイ、シドニー、ニューヨーク',
    zh: '路线：首尔、伦敦、巴黎、迪拜、悉尼、纽约', es: 'Ruta: Seúl, Londres, París, Dubái, Sídney, Nueva York', fr: 'Itinéraire : Séoul, Londres, Paris, Dubaï, Sydney, New York' },
  retryLoad: { ko: '다시 시도', en: 'Retry', ja: '再試行', zh: '重试', es: 'Reintentar', fr: 'Réessayer' },
  assetFail: { ko: '필수 자산을 불러오지 못했습니다.', en: "Couldn't load required assets.", ja: '必要なアセットを読み込めませんでした。', zh: '无法加载必要资源。', es: 'No se pudieron cargar los recursos.', fr: 'Impossible de charger les ressources.' },
  gatesLbl: { ko: '통과 게이트', en: 'Gates', ja: '通過ゲート', zh: '通过闸门', es: 'Puertas', fr: 'Portes' },
  gateHint: { ko: '게이트 구멍 높이에 맞춰 통과', en: 'Match the height of the gate opening', ja: 'ゲートの開口部の高さに合わせて通過', zh: '对准闸门开口的高度穿过', es: 'Ajusta tu altura a la abertura de la puerta', fr: 'Alignez-vous sur l’ouverture de la porte' },
  langLabel: { ko: '언어', en: 'Language', ja: '言語', zh: '语言', es: 'Idioma', fr: 'Langue' },
};
// 목적지(랜드마크) 이름
const DEST = {
  seoul: { ko: 'N서울타워', en: 'N Seoul Tower', ja: 'Nソウルタワー', zh: 'N首尔塔', es: 'Torre N de Seúl', fr: 'Tour N de Séoul' },
  london: { ko: '빅벤', en: 'Big Ben', ja: 'ビッグ・ベン', zh: '大本钟', es: 'Big Ben', fr: 'Big Ben' },
  paris: { ko: '에펠탑', en: 'Eiffel Tower', ja: 'エッフェル塔', zh: '埃菲尔铁塔', es: 'Torre Eiffel', fr: 'Tour Eiffel' },
  dubai: { ko: '부르즈 할리파', en: 'Burj Khalifa', ja: 'ブルジュ・ハリファ', zh: '哈利法塔', es: 'Burj Khalifa', fr: 'Burj Khalifa' },
  sydney: { ko: '오페라 하우스', en: 'Sydney Opera House', ja: 'シドニー・オペラハウス', zh: '悉尼歌剧院', es: 'Ópera de Sídney', fr: 'Opéra de Sydney' },
  newyork: { ko: '엠파이어 스테이트 빌딩', en: 'Empire State Building', ja: 'エンパイア・ステート・ビル', zh: '帝国大厦', es: 'Empire State Building', fr: 'Empire State Building' },
};

let current = 'en';
export const getLang = () => current;
export function t(key, vars) {
  const e = D[key]; let s = e ? (e[current] ?? e.en) : key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
export const destName = id => (DEST[id] && (DEST[id][current] ?? DEST[id].en)) || id;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 정적 마크업 반영: data-i18n(텍스트) / data-i18n-html(<kbd> 등 포함) / data-i18n-aria(접근성 이름)
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = esc(t(el.dataset.i18nHtml)).replace('{key}', '<kbd>SPACE</kbd>'); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  document.documentElement.lang = LANGS.find(l => l.code === current).html;
}

// 언어 적용. persist=true 면 사용자의 선택으로 저장하고 URL 을 ?lang= 로 맞춘다(공유 가능한 경로)
export function setLang(code, persist) {
  current = norm(code) || 'en';
  if (persist) {
    safeSet(STORE_KEY, current);
    const u = new URL(location.href); u.searchParams.set('lang', current);
    history.replaceState(null, '', u);
  }
  applyStatic();
  return current;
}
