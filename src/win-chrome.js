// ══ WINDOW CHROME: PER-PANE TRAFFIC LIGHTS ══
// Removes #win-main's macOS-style traffic-light dots (red close /
// yellow minimize / green maximize) while the warp-gate World Map or
// the Real World city Map is the visible pane. Every other pane keeps
// them, and the drawer window's own set is left completely untouched.
//
// ── WHY THIS IS CONDITIONAL AT ALL ──
// There is only ONE titlebar. index.html puts map, home, clinic, shop,
// world, safe, care, raid, battle, inventory, character, hack and steal
// inside a single shared window (#win-main > .win-titlebar +
// .win-body), and navigating between them just swaps which .pane has
// the `on` class -- see MAIN_SCENE_IDS / showMainPane() in
// src/ui-shell.js. So the dots cannot simply be deleted from the
// markup: that titlebar is the same DOM on every screen, and deleting
// them would remove them everywhere.
//
// ── WHY CSS AND NOT A DOM REMOVAL ──
// wireMainWindow() in src/ui-shell.js wires all three dots at boot with
// unguarded queries:
//
//     win.querySelector('[data-act="close"]').onclick = ...
//     win.querySelector('[data-act="min"]').onclick   = ...
//     win.querySelector('[data-act="max"]').onclick   = ...
//
// None of the three is null-checked, so removing (or even renaming)
// those buttons throws a TypeError inside boot() and takes the whole
// shell down with it -- no window would ever open. Hiding them keeps
// that wiring valid.
//
// `display:none` is a genuine removal from the player's point of view,
// not just an invisibility trick: the element leaves layout entirely
// (so the back button and title reclaim the space) and is not
// hit-tested, so no invisible tap target is left behind on the spot
// where the dots used to be. Compare `visibility:hidden` or `opacity:0`,
// which would both leave a dead 3-dot gap in the titlebar.
//
// ── WHY #win-main[data-pane] AND NOT #app[data-screen] ──
// showMainPane() sets `winMain.dataset.pane = id` on every single pane
// swap, so it always describes which pane is actually on screen inside
// the shared window.
//
// #app[data-screen] does NOT reliably describe that. focusWindow(),
// minimizeWindow() and closeWindow() all write 'drawer' into it while
// #win-main is still displaying the world map underneath -- so keying
// off it would make the dots flicker back into view the moment the
// player tapped the ☰ menu, then vanish again on the next tap.
//
// ── WHY NOT EDIT styles.css ──
// styles.css is ~144 KB and cannot be read back through the available
// tooling, so it cannot be safely modified in place (a write would have
// to replace the entire file). Injecting a narrow, high-specificity
// sheet from JS overrides whatever it declares without touching it.

// Panes that lose their traffic lights. These ids are the same ones
// MAIN_SCENE_IDS uses in src/ui-shell.js:
//   'world' = the warp-gate World Map (#screen-world)
//   'map'   = the Real World city map  (#screen-map)
// Add 'safe' here if the Safe Spot inside the gate world should match.
const HIDE_ON = ['world', 'map'];

const STYLE_ID = 'win-chrome-style';

function css() {
  // Scoped to #win-main so the drawer's identical .win-traffic-lights
  // markup (#drawer-panel .drawer-head) is never matched.
  const sel = HIDE_ON
    .map(pane => `#win-main[data-pane="${pane}"] .win-titlebar .win-traffic-lights`)
    .join(',\n');

  // ID + attribute + two classes beats anything styles.css is plausibly
  // declaring for .win-traffic-lights, and !important covers the case
  // where it used !important too.
  return `${sel} {
  display: none !important;
}
`;
}

function install() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css();
  document.head.appendChild(style);
}

// No MutationObserver and no polling: the rule is driven entirely by an
// attribute the shell already maintains, so it reacts to pane changes on
// its own with zero further JS. Nothing here ever writes to the DOM
// after this one <style> insert.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true });
} else {
  install();
}

export { HIDE_ON };
