VIRUZ PET — patch: recovery checkpoint + effect assets

IMPORTANT CONTEXT: while integrating your uploaded effect videos, an
editing mistake deleted a large block of core battle code from
src/game.js (turn loop, attack sequencing, battle results, the hack/
password minigame — ~20 functions). This patch is the fully
reconstructed and RE-VERIFIED file. Everything below has been tested
in-browser end to end:
  - boot -> map -> world -> zone battle -> results panel -> return  OK
  - raid -> password terminal -> steal menu -> raid fight -> resolve OK
  - all screen navigation (home/world/care/tree/raid/shop/map)       OK
  - zero console errors, zero 404s across all of the above

Changed this round:
  src/game.js       — full reconstruction of the battle core (see above)
  assets/fx/*.webp  — 12 processed effect clips, background-removed,
                      transparent, capped at 320px/28 frames each
                      (2.6MB total)

NOT YET DONE (next patch): exp gap gating by level difference, floating
pet-status/skill-explainer windows, skill tree 3/5 pre-unlock, removing
the button-tap zoom, and wiring the new effect assets into the actual
self-then-enemy cast sequence (the plumbing for this exists in
playSpellVFX/castSpecial but hasn't been exercised against the new
assets yet — verify VFX playback before relying on it).

Copy src/game.js over your existing file, and copy the assets/fx/
folder into your repo's assets/ directory (new folder).
