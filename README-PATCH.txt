VIRUZ PET — patch: fluid animation pass

Changed this round:
  index.html   — directional screen transitions, click ripple,
                  battle entrance CSS (VS slam, dust puff, pixel step-in)
  src/game.js  — showScreen() rewritten with slide direction by nav
                  depth, playArenaEntrance() sequencer, click-ripple
                  event delegation

Copy both files into your repo, replacing the existing ones. No other
files changed.

What's new:
- Screens now slide directionally: going deeper (map -> home -> tree)
  slides in from the right; going back slides in from the left; battle/
  hack/steal rise up from below as full-screen takeovers.
- Every .btn, .qb, .zone-pin, .pet-card, .care-card, .loot-card,
  .swap-card, .shop-card, .tree-node, .sk-btn, .potion-btn, .raid-card,
  .map-tab, .ts-dot now spawns a click ripple on tap (event-delegated,
  so new elements matching those selectors get it automatically).
- Battle entrance: both fighters step in pixel-style from off-stage,
  land with a squash + dust puff, then a VS banner slams in before the
  first turn. Tap anywhere on the stage to skip it. First-turn delay
  extended (900ms -> 1200ms) so no attack overlaps the entrance.
