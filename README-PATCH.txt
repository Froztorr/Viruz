VIRUZ PET — patch: city hub redesign, safe-spot NPC, skill cooldowns

Changed this round:
  index.html        — CSS for new map nodes (pin vs zone), NPC scene
  src/game.js        — buildMapNodes() rebuilt for text-only pins +
                       whole-building zone clicks; renderSafeSpot()
                       rebuilt as NPC dialogue; cooldown gate added to
                       skill selection in runTurn()
  src/data.js        — MAP_NODES rebuilt with 6 locations at measured
                       coordinates; every entry in SPECIALS now has a
                       cd (cooldown, seconds) field; MP costs raised
                       ~45-60%
  assets/video/city2.mp4 + .jpg  — new city hub background (3.9MB ->
                       290KB), replaces assets/video/background.mp4
  assets/ui/merchant.webp — safe-spot NPC portrait (82KB)

CITY HUB — 6 locations, coordinates measured from your marked
reference screenshot (same frame as the video, so they line up):
  Warp Gate       (pin)  -> world map
  Clinic          (pin)  -> clinic
  Your Home       (pin)  -> home
  Hacking Center  (zone) -> raid ("เจาะบ้านผู้เล่นคนอื่น")
  Tech Shop       (zone) -> shop (future: crafting equipment, upgrade
                            cards)
  Ramen Shop      (zone) -> care (future: buy ingredients to craft
                            homemade food, better stat/loyalty boosts
                            than shop potions)
Pin nodes show text only, no emoji/icon box. Zone nodes are clickable
across their entire circled area (measured radius), not a small pin —
tap anywhere on the building.

SAFE SPOT — now a dialogue scene: merchant portrait, greeting bubble
with the player's name inserted, and two menu buttons (rest / potion
shop) instead of plain section headers. Potion shop expands inline
when tapped rather than always being visible.

SKILL COOLDOWNS — every special now has a cd field (3.3s-4.9s,
scaled by how strong the effect is) tracked in real wall-clock time
per unit per skill (unit._cooldowns). A skill is only eligible for
auto-cast if it's unlocked, MP-affordable, AND off cooldown. Reset at
the start of every battle. MP costs raised across the board (~45% for
most, ~60% for the cheapest ones) so a cheap skill can't be
functionally free even off cooldown.

VERIFIED IN-BROWSER:
  - all 6 hub nodes route to their correct screen
  - safe-spot: greeting shows player name, portrait loads, rest heals,
    potion shop toggle works
  - cooldown: an unlocked special with autoCast on cast ONCE in a
    10-action sample, correctly falling back to normal attacks/
    signature skill for the rest of the fight (previously would fire
    on ~55% of every single turn with no gap)
  - full regression: all 7 screens navigate, a complete battle
    resolves and returns correctly, zero console errors, zero 404s

NOT BUILT YET (deferred per your own note — future systems):
  - Tech Shop crafting/equipment/upgrade-card system
  - Ramen Shop ingredient purchases + homemade food crafting
  Both currently route to the existing shop/care screens as
  placeholders until those systems exist.
