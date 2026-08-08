// ═══════════════════════════════════════════════════════════
// VIRUZ — BOOT PRELOADER + LOADING SCREEN
//
// ── WHY THIS EXISTS ──
// The game streams its art in as it renders: a map video only starts
// downloading when renderWorld() sets #world-video's src, a monster's
// still.gif when the battle stage first paints it, an icon when its row
// scrolls into view. On a slow connection that reads as pop-in in the
// middle of a fight. This module downloads everything up front, behind a
// loading screen, so gameplay runs out of cache instead of the network.
//
// ── HOW THE FILE LIST IS BUILT (there is no hand-written manifest) ──
// A hardcoded list of paths would rot the first time art is added, and
// this codebase is deliberately built so that dropping a file in assets/
// "just works". So the manifest is DISCOVERED at runtime, five ways:
//
//   1. MODULE CRAWL — fetch src/main.js, regex out every literal
//      'assets/…' string, follow its relative imports, repeat. Those
//      files are already in the HTTP cache (the browser just loaded them
//      as modules), so this is nearly free. This is what catches paths
//      hardcoded INSIDE modules — menu-icons.js, battle-hud.js, care.js,
//      dice-fx.js — without any of them having to export anything.
//   2. DATA WALK — deep-walk the data.js and icons.js export namespaces
//      for asset-shaped strings. Covers POTIONS/THROW_* img, EQUIP_ICONS,
//      ATTR + HABIT iconImg, MAPS video/poster, and the UI_ICONS /
//      AILMENT_ICONS / STAT_ICONS / MAP_NODE_ICONS tables. Because
//      galaxy.js and dnd.js push their maps and rosters into those same
//      exported tables at import time, the Galaxy submaps and the
//      Tabletop Realm are already present by the time this runs — new
//      content preloads itself with no edit here.
//   3. SPRITE PATHS — creature art paths are built by template literal,
//      so they never appear as literal strings anywhere and steps 1–2
//      cannot see them. They are regenerated here from the same inputs
//      the renderer uses: spriteV2Path() over ART2_SPECIES × ATTR_KEYS ×
//      mutations for pets, and assets/sprites/<folder>/<anim> for every
//      species carrying a `gif` folder (sprites-gif.js has already
//      stamped those onto the species tables by the time we run).
//   4. CSS CRAWL — regex url(…) out of styles.css. That is where
//      tree_bg_*.jpg, equip_circuit_bg.jpg and the .webp fx live.
//   5. DOM SCAN — <img src> / <video src|poster> already in index.html
//      (city2.mp4, merchant.webp).
//
// ── WHY IT IS TIERED (read this before "just preload everything") ──
// Blocking on literally every file means ~130 MB. The pet art alone is
// 14 species × 5 forms × 4 attributes × 2 formats (~84 MB), and each
// monster still.gif runs up to ~900 KB. Nobody waits for that on mobile
// data, and a loading screen that never ends is worse than pop-in. So:
//
//   • ESSENTIAL (blocks the game) — fonts, UI chrome, icons, fx,
//     potions, equipment, the city video, every map poster, the map you
//     are about to resume into, and stage-1 pet art. A few MB.
//   • BACKGROUND (silent, after boot) — everything else: mutation art,
//     all monster sprites, the other maps' video, battle backdrops. It
//     starts as soon as the game is playable and runs at low
//     concurrency, so it is normally finished long before you walk into
//     that content.
//   • FULL — the loading-screen toggle ("โหลดครบทุกไฟล์") makes the
//     background tier blocking too, for wifi / zero-pop-in runs. It is
//     remembered in localStorage, and it can be flipped mid-load.
//
// ── SAFETY ──
// Nothing here is allowed to stop the game booting. Discovery, every
// individual fetch, and the blocking phase as a whole are separately
// wrapped and time-limited; a 404 is counted and ignored (many icon
// paths in icons.js are intentionally aspirational, and both
// img-fallback.js and iconHtml() already degrade gracefully). Skip is
// always available, and the blocking phase self-aborts after BUDGET_MS,
// handing whatever is left to the background queue. If this module
// throws outright, main.js still calls boot().
//
// Preloaded images are deliberately DETACHED from the DOM: error events
// on a detached image never reach the capture listener in
// img-fallback.js, so probing a missing .gif here can never make the
// real renderer hide anything.
//
// ── DIAGNOSTICS ──
// window.VIRUZ_PRELOAD.missing() lists every path the code asks for that
// is not on disk — a free art-pipeline checklist. .manifest() is the
// whole discovered list, .bytes() what was actually downloaded.
// ═══════════════════════════════════════════════════════════

// ── TUNING ──
const BUDGET_MS = 45000;   // hard cap on the blocking phase
const ASSET_TIMEOUT_MS = 20000;   // per-file cap, so one stalled request can't hang the queue
const IMG_CONCURRENCY = 6;
const MEDIA_CONCURRENCY = 2;      // video is heavy; never more than two in flight
const BG_CONCURRENCY = 2;
const BG_START_DELAY_MS = 3000;   // let the first screen settle before we compete for bandwidth
const MODULE_CRAWL_LIMIT = 120;

const PREF_FULL = 'viruz.preloadAll';

// ── MATCHERS ──
const ASSET_RE = /assets\/[A-Za-z0-9_\-.\/]+?\.(?:png|jpe?g|webp|gif|mp4|webm|mp3|ogg|wav|woff2?|ttf)/gi;
const MODULE_RE = /['"](\.{1,2}\/[A-Za-z0-9_\-.\/]+\.js)['"]/g;
const CSS_URL_RE = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
const IS_IMAGE = /\.(?:png|jpe?g|webp|gif)$/i;
const IS_MEDIA = /\.(?:mp4|webm|mp3|ogg|wav)$/i;
const IS_FONT = /\.(?:woff2?|ttf)$/i;

// Directories whose whole contents are small and needed on the very
// first screens, so they block. Everything else defaults to background.
const ESSENTIAL_DIRS = [
  'assets/fonts/', 'assets/ui/', 'assets/icons/', 'assets/fx/',
  'assets/potions/', 'assets/equipment/', 'assets/video/',
];

// ── STATE ──
const manifest = new Map();   // relative path -> item
const missingPaths = [];
let backlog = [];             // background tier, filled once discovery is done
let bytesLoaded = 0;
let aborted = false;
let abortReason = null;
let backgroundStarted = false;
let ui = null;

// ═══════════════ MANIFEST ═══════════════

function normalize(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let s = raw.trim();
  if (!s || /^data:/i.test(s)) return null;
  const at = s.indexOf('assets/');
  if (at < 0) return null;                 // absolute/external URLs are the browser's problem
  s = s.slice(at).split('#')[0].split('?')[0];
  if (!/\.[a-z0-9]{2,5}$/i.test(s)) return null;
  if (s.includes('..')) return null;
  return s;
}

function kindOf(url) {
  if (IS_FONT.test(url)) return 'font';
  if (IS_MEDIA.test(url)) return 'media';
  if (IS_IMAGE.test(url)) return 'image';
  return null;
}

function defaultTier(url) {
  if (ESSENTIAL_DIRS.some(dir => url.startsWith(dir))) return 1;
  // Map posters are small stills and are what you see while a map video
  // buffers, so they are worth blocking on; the .mp4 files are not.
  if (/^assets\/maps\/[^/]+\.(?:jpe?g|png|webp)$/i.test(url)) return 1;
  return 2;
}

// `alt` is a fallback tried only if the primary 404s — it mirrors the
// runtime fallback chains (.gif → .png in img-fallback.js, .mp4 → .png
// in battle-bg.js) so we download one file per asset, not two.
function add(raw, opts = {}) {
  const url = normalize(raw);
  if (!url) return null;
  const kind = kindOf(url);
  if (!kind) return null;

  let item = manifest.get(url);
  if (!item) {
    item = { url, kind, tier: opts.tier || defaultTier(url), alt: null, started: false, ok: null };
    manifest.set(url, item);
  }
  if (opts.tier && opts.tier < item.tier) item.tier = opts.tier;   // promotions win
  if (opts.alt) {
    const alt = normalize(opts.alt);
    if (alt && alt !== url) item.alt = alt;
  }
  return item;
}

function scanText(text, opts) {
  if (!text) return;
  ASSET_RE.lastIndex = 0;
  let m;
  while ((m = ASSET_RE.exec(text))) add(m[0], opts);
}

// ── 1. MODULE CRAWL ──
async function crawlModules(entry) {
  let root;
  try { root = new URL(entry, document.baseURI).href; } catch (err) { return 0; }

  const queue = [root];
  const seen = new Set(queue);
  let visited = 0;

  while (queue.length && visited < MODULE_CRAWL_LIMIT) {
    const url = queue.shift();
    visited++;
    let src;
    try { src = await fetchText(url); } catch (err) { continue; }

    scanText(src);

    MODULE_RE.lastIndex = 0;
    let m;
    while ((m = MODULE_RE.exec(src))) {
      let next;
      try { next = new URL(m[1], url).href; } catch (err) { continue; }
      if (next.indexOf(location.origin) !== 0) continue;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return visited;
}

// ── 2. DATA WALK + 3. SPRITE PATHS ──
async function crawlData() {
  let DATA = null;
  let ICONS = null;
  // Dynamic, not static: this module must be importable by main.js
  // before data.js is parsed, otherwise the loading screen cannot paint
  // first — which is the whole point of it.
  try { DATA = await import('./data.js'); } catch (err) { console.warn('[preload] data.js unavailable:', err); }
  try { ICONS = await import('./icons.js'); } catch (err) { /* icons are optional */ }

  const seen = new Set();
  walkValues(DATA, 0, seen);
  walkValues(ICONS, 0, seen);

  if (!DATA) return;
  try { addPetSprites(DATA); } catch (err) { console.warn('[preload] pet sprite paths skipped:', err); }
  try { addMonsterSprites(DATA); } catch (err) { console.warn('[preload] monster sprite paths skipped:', err); }
  try { addMapMedia(DATA); } catch (err) { console.warn('[preload] map media skipped:', err); }
}

function walkValues(value, depth, seen) {
  if (value == null || depth > 6) return;
  if (typeof value === 'string') { add(value); return; }
  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  let values;
  try { values = Array.isArray(value) ? value : Object.values(value); } catch (err) { return; }
  for (const v of values) walkValues(v, depth + 1, seen);
}

// Pets: assets/sprites_v2/<species>/<form>_<attr>.png, which
// sprites-gif.js immediately re-points at .gif — so the .gif is the file
// that actually renders and the .png is only its fallback.
function addPetSprites(DATA) {
  const build = typeof DATA.spriteV2Path === 'function' ? DATA.spriteV2Path : null;
  if (!build) return;
  const species = Array.isArray(DATA.ART2_SPECIES) ? DATA.ART2_SPECIES : [];
  const attrs = Array.isArray(DATA.ATTR_KEYS) ? DATA.ATTR_KEYS : Object.keys(DATA.ATTR || {});
  const mutations = Array.isArray(DATA.MUTATION_KEYS) ? DATA.MUTATION_KEYS : Object.keys(DATA.MUTATIONS || {});

  for (const id of species) {
    for (const attr of attrs) {
      addGifFirst(tryCall(() => build(id, attr, null)), 1);      // stage 1 — starter picker + roster
      for (const mut of mutations) addGifFirst(tryCall(() => build(id, attr, mut)), 2);
    }
  }
}

function addGifFirst(pngPath, tier) {
  const png = normalize(pngPath || '');
  if (!png) return;
  add(png.replace(/\.png$/i, '.gif'), { alt: png, tier });
}

// Monsters: assets/sprites/<folder>/<anim>. The folder lives on the
// species entry as `gif` (sprites.js MONSTER_GIF_FOLDERS is not
// exported, but sprites-gif.js has already stamped the same folders onto
// the species objects, and galaxy-monsters.js / dnd.js rosters carry
// theirs too), so every roster present at boot is covered.
function addMonsterSprites(DATA) {
  const folders = new Set();
  collectGifFolders(DATA, folders, 0, new Set());
  for (const folder of folders) {
    add(`assets/sprites/${folder}/still.gif`, { alt: `assets/sprites/${folder}/still.png`, tier: 2 });
    add(`assets/sprites/${folder}/attack.png`, { alt: `assets/sprites/${folder}/attack.gif`, tier: 2 });
  }
}

function collectGifFolders(value, out, depth, seen) {
  if (!value || typeof value !== 'object' || depth > 6 || seen.has(value)) return;
  seen.add(value);
  let values;
  try { values = Array.isArray(value) ? value : Object.values(value); } catch (err) { return; }
  for (const v of values) {
    if (!v || typeof v !== 'object') continue;
    if (typeof v.gif === 'string' && v.gif && !v.gif.includes('/') && !v.gif.includes('.')) out.add(v.gif);
    collectGifFolders(v, out, depth + 1, seen);
  }
}

// Map video/poster plus the per-map fight backdrops battle-bg.js builds
// as assets/battle/<mapId>.mp4 (falling back to .png).
function addMapMedia(DATA) {
  const MAPS = DATA.MAPS;
  if (!MAPS || typeof MAPS !== 'object') return;
  const entries = Array.isArray(MAPS)
    ? MAPS.filter(Boolean).map(m => [m.id, m])
    : Object.entries(MAPS);
  const resume = guessResumeMap();

  for (const [id, entry] of entries) {
    if (!id) continue;
    const tier = id === resume ? 1 : 2;
    if (entry && typeof entry === 'object') {
      for (const key of ['video', 'poster', 'fallbackVideo', 'fallbackPoster']) {
        const path = entry[key];
        if (typeof path !== 'string') continue;
        add(path, { tier: IS_MEDIA.test(normalize(path) || '') ? tier : 1 });
      }
    }
    add(`assets/battle/${id}.mp4`, { alt: `assets/battle/${id}.png`, tier });
  }
}

// boot() has not run yet, so G is still empty and NET has not been
// initialised — the saved profile is the only hint about which map the
// player is about to land on. A cheap regex over localStorage beats
// importing net.js just for this, and a miss only costs us the default.
function guessResumeMap() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const raw = localStorage.getItem(localStorage.key(i));
      if (!raw || raw.length > 4000000) continue;
      const m = /"currentMapId"\s*:\s*"([A-Za-z0-9_]+)"/.exec(raw);
      if (m) return m[1];
    }
  } catch (err) { /* private mode / quota */ }
  return 'forest';
}

// ── 4. CSS CRAWL ──
async function crawlStyles() {
  const hrefs = new Set(['styles.css']);
  document.querySelectorAll('link[rel~="stylesheet"]').forEach(link => {
    const href = link.getAttribute('href') || '';
    // Google Fonts and friends are cross-origin: unreadable here, and
    // already handled by the browser's own font loading.
    if (!href || /^(?:https?:)?\/\//i.test(href)) return;
    hrefs.add(href);
  });

  for (const href of hrefs) {
    let text;
    try { text = await fetchText(new URL(href, document.baseURI).href); } catch (err) { continue; }
    scanText(text);
    CSS_URL_RE.lastIndex = 0;
    let m;
    while ((m = CSS_URL_RE.exec(text))) add(m[1]);
  }
}

// ── 5. DOM SCAN ──
function crawlDom() {
  document.querySelectorAll('img[src], video[src], video[poster], source[src], [style*="url("]').forEach(el => {
    add(el.getAttribute('src'));
    add(el.getAttribute('poster'));
    const style = el.getAttribute('style');
    if (!style) return;
    CSS_URL_RE.lastIndex = 0;
    let m;
    while ((m = CSS_URL_RE.exec(style))) add(m[1], { tier: 1 });
  });
}

async function discover() {
  setPhase('ค้นหาไฟล์ที่ต้องใช้…');
  crawlDom();
  await Promise.all([
    crawlModules('src/main.js').catch(() => 0),
    crawlStyles().catch(() => {}),
    crawlData().catch(() => {}),
  ]);
  // The two fonts are referenced only from an @font-face rule that may
  // be minified or moved; they are tiny and the whole UI is set in them.
  add('assets/fonts/ByteBounce.woff2', { tier: 1 });
}

// ═══════════════ LOADING ═══════════════

function absolute(rel) {
  return new URL(rel, document.baseURI).href;
}

async function fetchText(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(res.status + ' ' + url);
  return res.text();
}

function withTimeout(promise, ms, label) {
  let timer = null;
  return Promise.race([
    promise.then(v => { clearTimeout(timer); return v; },
                 e => { clearTimeout(timer); throw e; }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout ' + label)), ms);
    }),
  ]);
}

function loadImage(rel) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(0);
    img.onerror = () => reject(new Error('failed ' + rel));
    img.src = absolute(rel);   // detached on purpose — see header note
  });
}

async function fetchBytes(rel, priority) {
  const opts = { credentials: 'same-origin' };
  if (priority) opts.priority = priority;   // ignored where unsupported
  const res = await fetch(absolute(rel), opts);
  if (!res.ok) throw new Error(res.status + ' ' + rel);
  const buf = await res.arrayBuffer();
  return buf.byteLength;
}

// Fetching an mp4 fills the HTTP cache, which is what stops the mid-play
// download. For the couple of videos that autoplay immediately we also
// let a real <video> buffer, so the first frame is ready to paint.
function warmVideo(rel) {
  return new Promise(resolve => {
    const vid = document.createElement('video');
    vid.muted = true;
    vid.defaultMuted = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    const done = () => { vid.removeAttribute('src'); try { vid.load(); } catch (err) {} resolve(); };
    vid.onloadeddata = done;
    vid.onerror = done;
    setTimeout(done, 8000);
    vid.src = absolute(rel);
  });
}

async function loadItem(item, opts = {}) {
  item.started = true;
  const attempt = url => (item.kind === 'image' ? loadImage(url) : fetchBytes(url, opts.priority));

  try {
    const n = await withTimeout(attempt(item.url), ASSET_TIMEOUT_MS, item.url);
    bytesLoaded += n || 0;
    item.ok = true;
  } catch (err) {
    if (item.alt) {
      try {
        const n = await withTimeout(attempt(item.alt), ASSET_TIMEOUT_MS, item.alt);
        bytesLoaded += n || 0;
        item.ok = true;
        item.usedAlt = true;
        return;
      } catch (err2) { /* both formats absent — fall through */ }
    }
    item.ok = false;
    missingPaths.push(item.url);
  }
}

function semaphore(max) {
  let active = 0;
  const waiting = [];
  const release = () => { active--; const next = waiting.shift(); if (next) next(); };
  return async fn => {
    if (active >= max) await new Promise(r => waiting.push(r));
    active++;
    try { return await fn(); } finally { release(); }
  };
}

async function runQueue(items, opts = {}) {
  const { concurrency = IMG_CONCURRENCY, onProgress = null, priority = null, stoppable = false } = opts;
  const total = items.length;
  const gate = semaphore(MEDIA_CONCURRENCY);
  let cursor = 0;
  let done = 0;

  async function worker() {
    for (;;) {
      if (stoppable && aborted) return;
      const index = cursor++;
      if (index >= total) return;
      const item = items[index];
      if (item.kind === 'media') await gate(() => loadItem(item, { priority }));
      else await loadItem(item, { priority });
      done++;
      if (onProgress) onProgress(done, total, item);
    }
  }

  const workers = [];
  const width = Math.max(1, concurrency);
  for (let i = 0; i < width; i++) workers.push(worker());
  await Promise.all(workers);
  return { done, total, remaining: items.filter(it => !it.started) };
}

// Fonts and interface chrome first, then creature art, then video: the
// order the player actually perceives the game filling in.
function rank(item) {
  if (item.kind === 'font') return 0;
  if (item.url.startsWith('assets/ui/') || item.url.startsWith('assets/icons/')) return 1;
  if (item.url.startsWith('assets/fx/') || item.url.startsWith('assets/potions/') ||
      item.url.startsWith('assets/equipment/')) return 2;
  if (item.url.startsWith('assets/sprites')) return 3;
  if (item.kind === 'media') return 5;
  return 4;
}

// ═══════════════ LOADING SCREEN ═══════════════

const CSS = `
#viruz-boot{position:fixed;inset:0;z-index:99999;background:#05060f;color:#d8e2ff;
  display:flex;align-items:center;justify-content:center;padding:24px;
  font-family:'Share Tech Mono','ByteBounce',ui-monospace,monospace;
  transition:opacity .28s ease;}
#viruz-boot.vb-out{opacity:0;pointer-events:none;}
#viruz-boot::after{content:'';position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(to bottom,rgba(255,255,255,.035) 0 1px,transparent 1px 3px);}
#viruz-boot .vb-inner{position:relative;z-index:1;width:100%;max-width:460px;text-align:center;}
#viruz-boot .vb-logo{font-family:'Press Start 2P',ui-monospace,monospace;font-size:22px;
  letter-spacing:2px;color:#7cf7d8;text-shadow:0 0 12px rgba(124,247,216,.45);margin-bottom:10px;}
#viruz-boot .vb-sub{font-size:13px;color:#6f7ba8;margin-bottom:22px;}
#viruz-boot .vb-bar{height:14px;border:2px solid #2b3566;background:#0a0d1f;
  box-shadow:inset 0 0 0 2px #05060f;overflow:hidden;}
#viruz-boot .vb-bar i{display:block;height:100%;width:0%;
  background:linear-gradient(90deg,#2ee6a8,#7cf7d8);transition:width .18s linear;}
#viruz-boot .vb-row{display:flex;justify-content:space-between;font-size:12px;
  color:#8f9ac9;margin-top:8px;}
#viruz-boot .vb-phase{margin-top:16px;font-size:13px;color:#c6d2ff;}
#viruz-boot .vb-file{margin-top:4px;font-size:11px;color:#5d688f;height:14px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl;}
#viruz-boot .vb-opt{display:flex;align-items:center;gap:8px;justify-content:center;
  margin-top:22px;font-size:12px;color:#8f9ac9;cursor:pointer;}
#viruz-boot .vb-opt input{accent-color:#2ee6a8;width:16px;height:16px;}
#viruz-boot .vb-skip{margin-top:14px;background:transparent;color:#6f7ba8;
  border:2px solid #2b3566;padding:8px 16px;font:inherit;font-size:12px;cursor:pointer;}
#viruz-boot .vb-skip:hover{color:#d8e2ff;border-color:#4a5799;}
#viruz-boot .vb-tip{margin-top:12px;font-size:11px;color:#464f74;}
@media (max-width:420px){#viruz-boot .vb-logo{font-size:17px}}
`;

function mount() {
  if (ui || typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.id = 'viruz-boot-style';
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  const root = document.createElement('div');
  root.id = 'viruz-boot';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `
    <div class="vb-inner">
      <div class="vb-logo">VIRUZ PET</div>
      <div class="vb-sub">// เตรียมไฟล์ให้ครบก่อนเริ่มเกม //</div>
      <div class="vb-bar"><i id="vb-fill"></i></div>
      <div class="vb-row"><span id="vb-pct">0%</span><span id="vb-count">—</span></div>
      <div class="vb-phase" id="vb-phase">กำลังเริ่มต้น…</div>
      <div class="vb-file" id="vb-file"></div>
      <label class="vb-opt">
        <input type="checkbox" id="vb-full">
        <span>โหลดครบทุกไฟล์ — ไม่มีโหลดกลางเกม (ใช้เน็ตมาก)</span>
      </label>
      <button class="vb-skip" id="vb-skip" type="button">ข้าม → เข้าเกมเลย</button>
      <div class="vb-tip">ไฟล์ที่เหลือจะโหลดต่อเงียบ ๆ ระหว่างเล่น</div>
    </div>`;
  (document.body || document.documentElement).appendChild(root);

  ui = {
    root, style,
    fill: root.querySelector('#vb-fill'),
    pct: root.querySelector('#vb-pct'),
    count: root.querySelector('#vb-count'),
    phase: root.querySelector('#vb-phase'),
    file: root.querySelector('#vb-file'),
    full: root.querySelector('#vb-full'),
    skip: root.querySelector('#vb-skip'),
  };

  ui.full.checked = wantsFull();
  ui.full.addEventListener('change', () => setWantsFull(ui.full.checked));
  ui.skip.addEventListener('click', () => abort('skip'));
}

function setPhase(text) {
  if (ui && ui.phase) ui.phase.textContent = text;
}

function setProgress(done, total, item) {
  if (!ui) return;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  ui.fill.style.width = pct + '%';
  ui.pct.textContent = pct + '%';
  ui.count.textContent = `${done} / ${total} ไฟล์ · ${mb(bytesLoaded)}`;
  if (item) ui.file.textContent = item.url;
}

function mb(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function unmount() {
  if (!ui) return;
  const { root, style } = ui;
  ui = null;
  root.classList.add('vb-out');
  setTimeout(() => { root.remove(); style.remove(); }, 320);
}

function abort(reason) {
  if (aborted) return;
  aborted = true;
  abortReason = reason;
  setPhase(reason === 'skip' ? 'ข้ามการโหลด — เข้าเกม…' : 'ใช้เวลานานเกินไป — เข้าเกมก่อน…');
}

function wantsFull() {
  try { return localStorage.getItem(PREF_FULL) === '1'; } catch (err) { return false; }
}

function setWantsFull(on) {
  try { localStorage.setItem(PREF_FULL, on ? '1' : '0'); } catch (err) { /* private mode */ }
}

function tryCall(fn) {
  try { return fn(); } catch (err) { return null; }
}

function report() {
  const items = [...manifest.values()];
  const loaded = items.filter(i => i.ok === true).length;
  console.info(
    `[preload] ${loaded}/${items.length} assets cached · ${mb(bytesLoaded)}` +
    (missingPaths.length ? ` · ${missingPaths.length} missing (VIRUZ_PRELOAD.missing())` : '') +
    (abortReason ? ` · blocking phase ended early: ${abortReason}` : '')
  );
}

// ═══════════════ PUBLIC API ═══════════════

// Everything the game can reference, downloaded before boot() runs.
// Resolves no matter what goes wrong — main.js boots either way.
export async function runPreload() {
  mount();

  const budget = setTimeout(() => abort('timeout'), BUDGET_MS);
  try {
    await discover();

    const all = [...manifest.values()].sort((a, b) => rank(a) - rank(b));
    const blocking = all.filter(i => i.tier === 1);
    backlog = all.filter(i => i.tier !== 1);

    setPhase(`โหลดไฟล์หลัก… (พบทั้งหมด ${all.length} ไฟล์)`);
    setProgress(0, blocking.length || 1, null);
    await runQueue(blocking, {
      concurrency: IMG_CONCURRENCY,
      stoppable: true,
      onProgress: (done, total, item) => setProgress(done, total, item),
    });

    // The two videos that autoplay the moment a screen paints.
    if (!aborted) {
      setPhase('เตรียมวิดีโอฉากแรก…');
      const warm = ['assets/video/city2.mp4', `assets/maps/${guessResumeMap()}.mp4`]
        .filter(url => { const it = manifest.get(url); return it && it.ok; });
      await Promise.all(warm.map(warmVideo));
    }

    // Checked mid-load counts: the player can opt into the full download
    // while the essentials are still going.
    if (!aborted && wantsFull() && backlog.length) {
      const heavy = backlog;
      backlog = [];
      setPhase('โหลดไฟล์ที่เหลือทั้งหมด… (ปิดได้ที่ปุ่มข้าม)');
      setProgress(0, heavy.length, null);
      const result = await runQueue(heavy, {
        concurrency: IMG_CONCURRENCY,
        stoppable: true,
        onProgress: (done, total, item) => setProgress(done, total, item),
      });
      backlog = result.remaining;   // skipped mid-way — finish it in the background
    }

    setPhase('เข้าสู่เกม…');
  } catch (err) {
    console.warn('[preload] preload skipped:', err);
    setPhase('ข้ามการเตรียมไฟล์ — เข้าเกม…');
  } finally {
    clearTimeout(budget);
  }
}

// Called once boot() has painted, so the first thing the player sees is
// a finished screen rather than one filling in.
export function finishPreload() {
  unmount();
}

// The rest of the library, downloaded quietly while the game is playable.
export function startBackgroundPreload() {
  if (backgroundStarted) return;
  backgroundStarted = true;

  const items = backlog.filter(i => !i.started);
  backlog = [];
  if (!items.length) { report(); return; }

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && conn.saveData) {
    console.info(`[preload] Data Saver on — ${items.length} background assets left on demand`);
    return;
  }

  setTimeout(() => {
    runQueue(items, { concurrency: BG_CONCURRENCY, priority: 'low' })
      .then(report)
      .catch(err => console.warn('[preload] background pass failed:', err));
  }, BG_START_DELAY_MS);
}

if (typeof window !== 'undefined') {
  window.VIRUZ_PRELOAD = {
    manifest: () => [...manifest.values()],
    missing: () => missingPaths.slice(),
    bytes: () => bytesLoaded,
    pending: () => backlog.length,
    preloadAll: wantsFull,
    setPreloadAll: setWantsFull,
    // Force the remaining tier through right now, e.g. from the console
    // before going offline.
    loadRest: () => { backgroundStarted = false; startBackgroundPreload(); },
  };
}

// Paint immediately. This module is imported first by main.js and has no
// static imports of its own, so the loading screen is on screen before
// data.js and the rest of the graph are parsed.
try {
  if (typeof document !== 'undefined') mount();
} catch (err) {
  console.warn('[preload] loading screen unavailable:', err);
}
