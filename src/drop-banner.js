// ── DROP BANNER ──
// Post-battle drops used to be announced with toast(), which sets
// textContent -- so an <img> icon in that string would have shown up as
// literal markup, and a colour was impossible. Drops get their own
// banner instead: real icon art, the item name, and a frame in the
// item's rarity colour.
//
// Stacks downward so several drops from one kill (gear + a Code Part +
// meat is entirely possible) are all readable instead of overwriting
// each other the way toasts did.

import { RARITY } from './data.js';

const CSS_ID = 'drop-banner-css';
const HOST_ID = 'drop-banner-host';
const MAX_ON_SCREEN = 4;
const LIFETIME_MS = 2800;

function rarityMeta(id) { return RARITY[id] || RARITY.normal; }

// Accepts a data.js entry (icons.js stamps .iconImg onto these), a bare
// path, or an emoji, and always returns something safe to drop into
// innerHTML. Falls back to the emoji so a missing PNG never renders an
// empty box.
function iconMarkupFor(entry, fallbackEmoji) {
  const glyph = g => `<span class="db-glyph">${g || '🎁'}</span>`;
  if (!entry) return glyph(fallbackEmoji);
  if (typeof entry === 'string') {
    return entry.includes('/') ? `<img class="db-art" src="${entry}" alt="">` : glyph(entry);
  }
  const path = entry.iconImg || entry.img ||
    (typeof entry.icon === 'string' && entry.icon.includes('/') ? entry.icon : null);
  if (path) return `<img class="db-art" src="${path}" alt="">`;
  return glyph((typeof entry.icon === 'string' && entry.icon) || fallbackEmoji);
}

function injectCss() {
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_ID;
  style.textContent = `
#${HOST_ID}{
  position:fixed; left:50%; top:64px; transform:translateX(-50%);
  display:flex; flex-direction:column; align-items:center; gap:7px;
  z-index:9000; pointer-events:none; width:max-content; max-width:92vw;
}
.drop-banner{
  display:flex; align-items:center; gap:10px;
  padding:7px 14px 7px 9px; border-radius:12px;
  background:rgba(10,7,22,.93);
  border:2px solid var(--rarity-color,#9aa4b8);
  box-shadow:0 0 12px var(--rarity-glow,transparent),
             inset 0 0 10px var(--rarity-glow,transparent);
  animation:drop-banner-in .32s cubic-bezier(.2,1.3,.4,1);
}
.drop-banner.leaving{ animation:drop-banner-out .3s ease-in forwards; }
.drop-banner .db-icon{
  width:34px; height:34px; display:flex; align-items:center; justify-content:center;
  flex:0 0 34px;
}
.drop-banner .db-art{
  width:34px; height:34px; object-fit:contain; image-rendering:pixelated;
  filter:drop-shadow(0 0 5px var(--rarity-glow,transparent));
}
.drop-banner .db-glyph{ font-size:26px; line-height:1; }
.drop-banner .db-text{ display:flex; flex-direction:column; gap:1px; min-width:0; }
.drop-banner .db-name{
  font-size:14px; font-weight:700; color:#f2f0ff;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60vw;
}
.drop-banner .db-meta{
  font-size:10.5px; letter-spacing:.06em; text-transform:uppercase;
  color:var(--rarity-color,#9aa4b8);
}
.drop-banner .db-sub{ font-size:11px; color:#9aa4b8; }
@keyframes drop-banner-in{
  from{ opacity:0; transform:translateY(-14px) scale(.92); }
  to  { opacity:1; transform:translateY(0) scale(1); }
}
@keyframes drop-banner-out{
  to{ opacity:0; transform:translateY(-10px) scale(.96); }
}
@media (prefers-reduced-motion:reduce){
  .drop-banner, .drop-banner.leaving{ animation:none; }
}
`;
  document.head.appendChild(style);
}

function host() {
  injectCss();
  let h = document.getElementById(HOST_ID);
  if (!h) {
    h = document.createElement('div');
    h.id = HOST_ID;
    document.body.appendChild(h);
  }
  return h;
}

function dismiss(card) {
  if (!card || card.dataset.leaving) return;
  card.dataset.leaving = '1';
  card.classList.add('leaving');
  setTimeout(() => card.remove(), 320);
}

/**
 * Announce a dropped item.
 *   entry     - the data.js entry (or icon path / emoji) to draw
 *   name      - item name shown in bold
 *   rarityId  - 'normal' | 'rare' | 'epic' | 'legendary' | 'mythic'
 *   sub       - optional second line, e.g. the slot and level
 *   fallback  - emoji used when there is no art for this entry
 */
export function showDropBanner({ entry, name, rarityId, sub, fallback } = {}) {
  if (!name) return null;
  const h = host();
  const meta = rarityMeta(rarityId);
  const card = document.createElement('div');
  card.className = 'drop-banner';
  card.style.setProperty('--rarity-color', meta.color);
  card.style.setProperty('--rarity-glow', meta.glow);
  card.innerHTML =
    `<div class="db-icon">${iconMarkupFor(entry, fallback)}</div>` +
    `<div class="db-text">` +
      `<div class="db-name">${name}</div>` +
      `<div class="db-meta">${meta.name}</div>` +
      (sub ? `<div class="db-sub">${sub}</div>` : '') +
    `</div>`;
  h.appendChild(card);
  // Oldest first, so a burst of drops never walks off the screen.
  while (h.children.length > MAX_ON_SCREEN) dismiss(h.firstElementChild);
  setTimeout(() => dismiss(card), LIFETIME_MS);
  return card;
}
