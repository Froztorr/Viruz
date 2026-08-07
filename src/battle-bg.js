// ════════════════════════════════════════════════════════════
// VIRUZ — BATTLE BACKDROPS (looping video)
//
// Gives every map its own animated fight-scene background, the same way
// the world map screens use looping video. An earlier version of this
// file used a CSS background-image, which can never animate — so the
// backdrop is a real <video> layer now.
//
// Finding out WHICH map we are on is the awkward part: the current map
// is not kept in state. G has lastScreen and lastSafe and a bossState
// keyed by map, but no current-map field — the world screen owns that
// in a module-local variable. Rather than guess at a private binding,
// this reads the map straight off the media the world screen is already
// displaying (assets/maps/<id>.mp4 or .jpg), the same src-path approach
// sprites-gif.js and facing.js take.
//
// STACKING: an absolutely positioned video paints ABOVE static siblings,
// which would hide the fighters behind the backdrop. So the unit
// containers get lifted to z-index 1, and the stage is given
// position: relative only if it is currently static (leaving an
// existing absolute/relative rule alone).
//
// Safe to land before the art exists: a missing mp4 falls back to
// assets/battle/<map>.png, and if that is missing too the stage is left
// exactly as it is today.
//
// Expected files — seamless loops, see the prompts that came with this:
//   assets/battle/forest.mp4
//   assets/battle/hell.mp4
//   assets/battle/galaxy_red.mp4
//   assets/battle/galaxy_rings.mp4
//   assets/battle/galaxy_dwarf.mp4
//   assets/battle/galaxy_ship.mp4
// ════════════════════════════════════════════════════════════

const MAP_SRC = /assets\/maps\/([a-z0-9_]+)\.(?:mp4|webm|jpg|jpeg|png)/i;
const BATTLE_DIR = 'assets/battle/';
const LAYER_ID = 'battle-bg-video';

let currentMap = null;

function noteMap(value) {
  const m = value && value.match(MAP_SRC);
  if (m) currentMap = m[1];
}

// The world screen may show the map as a <video>, a <source> inside
// one, an <img> poster, or an inline background-image — check all four.
function sniffMap(node) {
  if (!node || node.nodeType !== 1) return;
  const check = n => {
    if (!n.getAttribute) return;
    noteMap(n.getAttribute('src') || '');
    noteMap(n.getAttribute('poster') || '');
    noteMap(n.getAttribute('style') || '');
  };
  check(node);
  if (!node.querySelectorAll) return;
  node.querySelectorAll('video, source, img, [style*="assets/maps/"]').forEach(check);
}

function stageEl() {
  return document.getElementById('battle-stage');
}

// Creates the video layer once and keeps reusing it.
function ensureLayer(stage) {
  let vid = stage.querySelector('#' + LAYER_ID);
  if (vid) return vid;

  vid = document.createElement('video');
  vid.id = LAYER_ID;
  // All four are required for autoplay to be allowed on mobile.
  vid.muted = true;
  vid.defaultMuted = true;
  vid.loop = true;
  vid.autoplay = true;
  vid.playsInline = true;
  vid.setAttribute('muted', '');
  vid.setAttribute('playsinline', '');
  vid.setAttribute('webkit-playsinline', '');
  vid.setAttribute('aria-hidden', 'true');
  vid.preload = 'auto';
  vid.tabIndex = -1;
  Object.assign(vid.style, {
    position: 'absolute',
    top: '0', left: '0', width: '100%', height: '100%',
    objectFit: 'cover',
    zIndex: '0',
    pointerEvents: 'none',
  });

  // Only claim the positioning context if nothing else has.
  if (getComputedStyle(stage).position === 'static') {
    stage.style.position = 'relative';
  }
  stage.insertBefore(vid, stage.firstChild);
  return vid;
}

// An absolutely positioned element paints above static siblings, so the
// fighters have to be lifted out of the way or the backdrop covers them.
function raiseContents(stage, vid) {
  for (const child of Array.from(stage.children)) {
    if (child === vid) continue;
    if (getComputedStyle(child).position === 'static') {
      child.style.position = 'relative';
    }
    if (!child.style.zIndex) child.style.zIndex = '1';
  }
}

// No mp4 for this map — try a still, and failing that leave the stage
// looking exactly as it did before this module existed.
function fallbackToStill(stage, mapId, vid) {
  vid.removeAttribute('src');
  vid.load();
  vid.style.display = 'none';

  const url = BATTLE_DIR + mapId + '.png';
  const probe = new Image();
  probe.onload = () => {
    if (stage.dataset.bgMap !== mapId) return;
    stage.style.backgroundImage = 'url("' + url + '")';
    stage.style.backgroundSize = 'cover';
    stage.style.backgroundPosition = 'center bottom';
    stage.style.backgroundRepeat = 'no-repeat';
    stage.style.imageRendering = 'pixelated';
    stage.classList.add('has-battle-bg');
  };
  probe.onerror = () => {
    if (stage.dataset.bgMap !== mapId) return;
    stage.style.backgroundImage = '';
    stage.classList.remove('has-battle-bg');
  };
  probe.src = url;
}

function applyBackdrop() {
  const stage = stageEl();
  if (!stage || !currentMap) return;

  if (stage.dataset.bgMap !== currentMap) {
    const wanted = currentMap;
    stage.dataset.bgMap = wanted;

    const vid = ensureLayer(stage);
    vid.style.display = '';
    stage.style.backgroundImage = '';
    stage.classList.add('has-battle-bg');

    vid.onerror = () => {
      if (stage.dataset.bgMap === wanted) fallbackToStill(stage, wanted, vid);
    };
    vid.src = BATTLE_DIR + wanted + '.mp4';
    vid.load();
    const p = vid.play();
    if (p && p.catch) p.catch(() => {}); // autoplay refusal is not fatal
  }

  const vid = stage.querySelector('#' + LAYER_ID);
  if (vid) {
    raiseContents(stage, vid);
    syncPlayback(stage, vid);
  }
}

// Don't decode video while the fight isn't on screen.
function syncPlayback(stage, vid) {
  if (!vid.getAttribute('src')) return;
  const visible = stage.offsetParent !== null && !document.hidden;
  if (visible && vid.paused) {
    const p = vid.play();
    if (p && p.catch) p.catch(() => {});
  } else if (!visible && !vid.paused) {
    vid.pause();
  }
}

function install() {
  sniffMap(document.body);
  applyBackdrop();

  // childList only — the stage is rebuilt on every fight, and watching
  // attributes would re-enter this on our own style writes.
  new MutationObserver(records => {
    for (const r of records) {
      if (!r.addedNodes) continue;
      r.addedNodes.forEach(sniffMap);
    }
    applyBackdrop();
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('visibilitychange', () => {
    const stage = stageEl();
    const vid = stage && stage.querySelector('#' + LAYER_ID);
    if (stage && vid) syncPlayback(stage, vid);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install);
} else {
  install();
}

export { currentMap };
