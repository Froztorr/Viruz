// ════════════════════════════════════════════════════════════
// VIRUZ — BATTLE BACKDROPS (looping video)
//
// Gives every map its own animated fight-scene background, the same way
// the world map screens use looping video.
//
// ── WHAT IT REPLACES ──
// #battle-stage is not an empty box. It already draws a scene:
//
//   #battle-stage
//     └ #stage-cam        ← moves with the battle camera
//         ├ #sky
//         ├ #hills
//         ├ #ground
//         ├ #battle-allies / #battle-enemies
//         └ #fx-layer
//     ├ #plate-ally / #plate-foe / #banner-layer / #swap-menu
//
// Those three scenery layers sit INSIDE the camera rig, which paints
// above this backdrop — so simply adding a video does nothing visible,
// it just loads and hides behind #sky. The backdrop only appears if the
// layers it replaces are hidden, and that is done only once the video
// reports loadeddata, so a missing file can never leave a blank stage.
//
// ── WHICH MAP (this was broken once — read before changing) ──
// G.currentMapId is the primary source. renderWorld() keeps it in sync
// (`currentMapId = G.currentMapId || currentMapId`) and the warp gates
// assign to it, so it names the map directly.
//
// The DOM is the fallback. Do NOT rely on the MutationObserver alone to
// notice a map change: renderWorld() swaps the map with
//
//     vid.setAttribute('src', want)
//
// on the #world-video element that already exists in index.html. That
// is an ATTRIBUTE mutation, and the childList observer below cannot see
// it — which is exactly why this module silently did nothing at first.
// So #world-video is re-read on every pass, plus watched with a
// dedicated attribute observer. That one is loop-safe because this
// module never writes to #world-video.
//
// ── STACKING ──
// An absolutely positioned video paints ABOVE static siblings, which
// would put the backdrop in front of the fighters. So the stage's other
// children are lifted to z-index 1, and the stage claims
// position: relative only if it is currently static.
//
// Safe when art is missing: no mp4 falls back to
// assets/battle/<map>.png, and if that is missing too the original
// sky/hills/ground scene is left exactly as it is today.
// ════════════════════════════════════════════════════════════

import { G } from './state.js';

const MAP_SRC = /assets\/maps\/([a-z0-9_]+)\.(?:mp4|webm|jpg|jpeg|png)/i;
const BATTLE_DIR = 'assets/battle/';
const LAYER_ID = 'battle-bg-video';

// The built-in scenery this backdrop stands in for.
const SCENE_LAYERS = ['sky', 'hills', 'ground'];

let currentMap = null;

function noteMap(value) {
  const m = value && value.match(MAP_SRC);
  if (m) currentMap = m[1];
}

// Re-resolve the map. Cheap enough to run on every pass, and it must
// run on every pass — see the note above about setAttribute.
function refreshMap() {
  const wv = document.getElementById('world-video');
  if (wv) {
    noteMap(wv.getAttribute('src') || '');
    noteMap(wv.getAttribute('poster') || '');
  }
  // Authoritative when present; the DOM read above only supplies a
  // value if the world screen has already painted this map.
  if (G && typeof G.currentMapId === 'string' && G.currentMapId) {
    currentMap = G.currentMapId;
  }
}

function stageEl() {
  return document.getElementById('battle-stage');
}

// Hide or restore the CSS scene. data-bg-hidden records that WE hid it,
// so restoring can never stomp a display value set by anything else.
function setSceneHidden(stage, hidden) {
  for (const id of SCENE_LAYERS) {
    const el = stage.querySelector('#' + id);
    if (!el) continue;
    if (hidden) {
      if (el.dataset.bgHidden) continue;
      el.dataset.bgHidden = '1';
      el.style.display = 'none';
    } else if (el.dataset.bgHidden) {
      el.style.display = '';
      delete el.dataset.bgHidden;
    }
  }
}

function ensureLayer(stage) {
  let vid = stage.querySelector('#' + LAYER_ID);
  if (vid) return vid;

  vid = document.createElement('video');
  vid.id = LAYER_ID;
  // All of these are required for autoplay to be allowed on mobile.
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
// camera rig and the name plates have to be lifted clear of the video.
function raiseContents(stage, vid) {
  for (const child of Array.from(stage.children)) {
    if (child === vid) continue;
    if (getComputedStyle(child).position === 'static') {
      child.style.position = 'relative';
    }
    if (!child.style.zIndex) child.style.zIndex = '1';
  }
}

// No mp4 for this map — try a still, and failing that put the original
// sky/hills/ground scene back exactly as it was.
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
    setSceneHidden(stage, true);
  };
  probe.onerror = () => {
    if (stage.dataset.bgMap !== mapId) return;
    stage.style.backgroundImage = '';
    stage.classList.remove('has-battle-bg');
    setSceneHidden(stage, false); // no art for this map — keep the old scene
  };
  probe.src = url;
}

function applyBackdrop() {
  refreshMap();

  const stage = stageEl();
  if (!stage || !currentMap) return;

  if (stage.dataset.bgMap !== currentMap) {
    const wanted = currentMap;
    stage.dataset.bgMap = wanted;

    const vid = ensureLayer(stage);
    vid.style.display = '';
    stage.style.backgroundImage = '';
    stage.classList.remove('has-battle-bg');
    setSceneHidden(stage, false); // show the old scene until the new one paints

    // Only swap the scenery out once the video can actually paint.
    vid.onloadeddata = () => {
      if (stage.dataset.bgMap !== wanted) return;
      stage.classList.add('has-battle-bg');
      setSceneHidden(stage, true);
    };
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
    // renderBattle() rebuilds the stage contents, which can bring the
    // scenery back — re-hide it whenever a backdrop is live.
    if (stage.classList.contains('has-battle-bg')) setSceneHidden(stage, true);
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
  applyBackdrop();

  // childList only on the document — watching attributes globally would
  // re-enter this on our own style writes.
  new MutationObserver(() => applyBackdrop())
    .observe(document.body, { childList: true, subtree: true });

  // The map swap is an attribute write on this one element, which the
  // observer above cannot see. Loop-safe: we never write to it.
  const wv = document.getElementById('world-video');
  if (wv) {
    new MutationObserver(() => applyBackdrop())
      .observe(wv, { attributes: true, attributeFilter: ['src', 'poster'] });
  }

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
