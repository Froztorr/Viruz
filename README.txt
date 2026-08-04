VIRUZ ICON PATCH - all 16 sheets
=================================

165 transparent PNGs sliced from your 16 Gemini contact sheets,
background removed, renamed to the paths src/data.js already expects.


HOW TO INSTALL
--------------
Unzip at the root of your Viruz repo. The folder structure already
matches the repo, so files land in assets/icons, assets/potions,
assets/fx and assets/ui directly.

    cd /path/to/Viruz
    unzip -o viruz_icons_all.zip
    git checkout -b assets/icons
    git add assets/
    git commit -m "Add generated icon assets (16 sheets, 165 icons)"
    git push origin assets/icons

Or on github.com: Add file -> Upload files -> drag the assets folder in.

Do NOT commit _masters512/ - see below.


WHAT IS IN HERE
---------------
assets/icons/     game entities: habits, stats, foods, materials, crafting
assets/potions/   potion sprites (matches existing 160x160 convention)
assets/fx/        the 7 ailment icons
assets/ui/        interface chrome with no data.js entry yet
_masters512/      512x512 versions, mirrors the assets tree.
                  Working masters for re-exports. Not for the repo.
MANIFEST.csv      every icon: source slot, destination, data.js key,
                  the emoji it replaces, and a confidence rating.

All shipped icons are 160x160 RGBA, artwork inset to 92% of canvas,
matching the existing assets/potions files.


CONFIDENCE
----------
certain  43   sheet carried a printed caption, or the art is unambiguous
high     87   single clear match to one data.js entry
medium   28   plausible, or a duplicate variant of an already-matched icon
low       7   genuine guesses - review these first

The 7 low-confidence files:
  assets/icons/exp_b.png          rocket. EXP Booster was the closest fit,
                                  but nothing in data.js really wants a rocket.
  assets/icons/recipe_burger.png  no burger art exists in the pixel-food set.
                                  A meatball plate is standing in. Re-roll this.
  assets/icons/toy_ball_alt.png   purple circuit disc, purpose unclear.
  assets/ui/lock_locked.png       four padlock icons with no data.js home.
  assets/ui/lock_locked_alt.png   Probably chrome for the #45 equipment
  assets/ui/lock_unlocked.png     lock toggle, which lives in code, not data.
  assets/ui/lock_unlocked_alt.png


DUPLICATES
----------
Gemini repeated itself when a sheet had more cells than concepts. Those
are kept as *_alt.png rather than discarded, so you can pick the better
draw and delete the loser. Affected: malware_core, code_part_bulwark,
hp_s, evo_s, tp_crit, tp_cleanse, ing_meat, toy_arcade, toy_ball,
bot_guard, craft_deep, trash, hourglass, remove, capsule, close.


NO CODE CHANGES NEEDED FOR HABITS AND ATTRIBUTES
------------------------------------------------
data.js already documents this:

  "Every iconImg below points at a PNG that doesn't exist yet -
   habitIcon() renders the emoji fallback until one actually lands at
   that path, then switches over automatically."

So ATTR, HABIT_COLORS and HABIT_TYPES light up the moment these files
land. Same for POTIONS and EQUIP_ICONS, which already carry img: paths.

Still needs img/iconImg fields added in data.js: FOODS, INGREDIENTS,
MEAT_ITEM, RECIPES, TOYS, CARE_CLEAN, ITEMS, EGGS, MATERIALS, AILMENTS,
STAT_META, LOYALTY_TIERS, WHITE_TRAITS, EQUIP_SLOTS, PAYLOAD_EFFECTS,
CRAFT_RECIPES, DEFENSE_BOTS, REVIVE_POTION.


KNOWN COSMETIC ISSUES
---------------------
- Faint Gemini watermark triangle, bottom right: sheet01 icon 09
  (payload_overclock.png) and sheet04 icon 09 (food_premium.png).
  Present in your source images, not a slicing artifact.
- Faint grey halo around healer.png and ui/rank_down.png, left over
  from a white glow that cannot be cleanly separated from white paper.
- assets/ui/hourglass*.png and the circle icons keep white interiors.
  Punching them transparent would have eaten the hourglass sand.
- sheet16 art (stat_*.png, atk.png, spd.png) is flatter and less neon
  than the other 15 sheets. Consider a re-roll for visual consistency.
- assets/fx/ailment_stoned.png supersedes the assets/fx/stoned.gif
  placeholder referenced in data.js.
