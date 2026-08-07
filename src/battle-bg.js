// ════════════════════════════════════════════════════════════
// VIRUZ — BATTLE BACKDROPS
//
// Gives every map its own fight-scene background instead of one shared
// look, by dropping assets/battle/<mapId>.png in behind #battle-stage.
//
// Finding out WHICH map we are on is the awkward part: the current map
// is not kept in state. G has lastScreen and lastSafe and a bossState
// keyed by map, but no current-map field — the world screen owns that
// in a module-local variable. Rather than guess at a private binding,
// this reads the map straight off the media the world screen is already
// displaying (assets/maps/<id>.mp4 or .jpg), which is the same
// src-path approach sprites-gif.js and facing.js take and needs no
// knowledge of data.js at all.
//
// Landing this before the art exists is harmless: each backdrop is
// probed with an Image() and only applied once it actually loads, so a
// missing PNG leaves the stage exactly as it is today. Upload the art
// later and it simply starts working.
//
// Expected files (16:9, pixel art, see the prompts that came with this):
//   assets/battle/forest.png
//   assets/battle/hell.png
//   assets/battle/galaxy_red.png
//   assets/battle/galaxy_rings.png
//   assets/battle/galaxy_dwarf.png
//   assets/battle/galaxy_ship.png
// ════════════════════════════════════════════════════════════

const MAP_SRC = /assets\/maps\/([a-z0-9_]+)\.(?:mp4|webm|jpg|jpeg|png)/i;
const BATTLE_DIR = 'assets/battle/';

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

function applyBackdrop() {
  const stage = document.getElementById('battle-stage');
  if (!stage || !currentMap) return;
  if (stage.dataset.bgMap === currentMap) return; // already settled
  stage.dataset.bgMap = currentMap;

  const wanted = currentMap;
  const url = BATTLE_DIR + wanted + '.png';

  // Probe before applying. If the art is not in the repo yet, or the
  // map has no backdrop of its own, leave the stage untouched.
  const probe = new Image();
  probe.onload = () => {
    if (stage.dataset.bgMap !== wanted) return; // map changed mid-probe
    stage.style.backgroundImage = 'url("' + url + '")';
    stage.style.backgroundSize = 'cover';
    stage.style.backgroundPosition = 'center bottom';
    stage.style.backgroundRepeat = 'no-repeat';
    stage.style.imageRendering = 'pixelated'; // keep the pixels crisp
    stage.classList.add('has-battle-bg');
  };
  probe.onerror = () => {
    if (stage.dataset.bgMap !== wanted) return;
    stage.style.backgroundImage = '';
    stage.classList.remove('has-battle-bg');
  };
  probe.src = url;
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install);
} else {
  install();
}

export { currentMap };
