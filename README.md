# VIRUZ PET

Cyberpunk monster-raising game. Raise VIRUZ, hack into systems, raid other players.

## Run locally

ES modules need a server — opening `index.html` directly will fail with a CORS error.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Push to GitHub, then Settings → Pages → Deploy from branch → `main` / root.

## Structure

```
index.html              UI shell + all styles
src/data.js             attributes, species, dungeons, items — edit this to tune
src/engine.js           stat math, synergy, combat resolution (pure, no DOM)
src/game.js             state, screens, battle loop
src/net.js              backend adapter — swap LocalBackend for Firebase later
assets/video/           background.mp4 (city hub)
assets/maps/            forest.mp4 / hell.mp4 + poster frames
assets/ui/              city_map.jpg (video poster fallback)
src/sprites.js          creature renderer — handles both GIF art and inline SVG
assets/sprites/<name>/  still.gif + attack.gif for GIF-based species
```

## Adding a species

Species use one of two art sources. The renderer picks automatically.

**Real art (preferred):**
1. Put `still.gif` + `attack.gif` in `assets/sprites/<name>/`
2. Add a `SPECIES` entry in `src/data.js` with `gif:'<name>'`

PNG art works too — use `still.png` + `attack.png` and add `ext:'png'`
alongside `gif:'<name>'`. The Hell monsters use this.

**Procedural SVG (no art needed):**
1. Add a shape builder to `SHAPES` in `src/sprites.js` (100x100 viewBox, facing right)
2. Add a `SPECIES` entry with `shape:'<yourshape>'`

To replace an SVG species with real art later, just add `gif:'<folder>'`
to it — the `shape` becomes an automatic fallback. No renderer changes.

## Creature palettes

Colour is creature IDENTITY, not attribute. Each SVG species names a
palette from `PALETTES` in `src/sprites.js`:

    blobyte: { shape:'royalslime', palette:'slime_royal', ... }

Attributes still drive stats and synergy — they just don't recolour
the art, so a blue whale stays blue whether it rolls Red or Green.

## Battle system

Fights are fully automatic, one VIRUZ per side at a time (VR2 style).
When your active fighter falls, a menu lets you pick who steps up next.
There are no skill buttons — attacks are chosen automatically.

Presentation tuning lives in two places:
- `TUNING.turnBaseMs` (src/data.js) — gap between exchanges
- `playAttack()` (src/game.js) — wind-up / lunge / hit-stop / return timings

The attack sequence is: turn banner → wind-up (pull back) → lunge →
contact (impact burst + giant damage number + hit-stop freeze + screen
shake) → return.

Attributes are rolled randomly at hatch. To pin one, add `fixedAttr:'red'` to the species.

## Attributes

| Attr | Icon | Profile |
|---|---|---|
| Red | ⚔️ | High ATK, low DEF |
| Green | 🌪️ | High SPD, 28% double-hit chance, low DEF |
| Yellow | 🛡️ | High DEF + HP, low SPD |
| White | ➕ | Support — team buff scaling with level, plus a rolled trait (aura / regen / both) |

## Synergy

Team of 3, counting the most common attribute:

- 2 matching → ×1.15 to ATK/DEF/SPD
- 3 matching → ×1.30

## Modes

- **Hack** — sequential antiviruz waves, HP carries between waves
- **Arena** — single 3v3 match
- **Raid** — instant resolution against another player's base defense

## Going online

`src/net.js` defines the whole backend contract. A `FirebaseBackend` skeleton
is commented at the bottom of that file — implement the same method signatures
and change the last line to `export const NET = new FirebaseBackend(app)`.
Nothing else in the codebase touches storage directly.


## World maps & zones

Two maps, each a looping video with clickable pins (`MAPS` and `ZONES`
in src/data.js). Pin `x`/`y` are percentages of the video frame, so
they scale to any screen size.

| Map | Levels | Zones |
|---|---|---|
| Verdant Realm | 1–50 | Forest → Mountain → Riverfall → Wolf Den → Desert → Oasis → Island |
| Infernal Realm | 51–100 | Ruined Village → Crossroads → Demonbeast Den → Servant Quarter → Vice Manor → Demon Lord Castle |

Each battle zone declares its own `lv` range, wave count, monster
`pool`, and reward multipliers. Pins colour themselves by how far the
zone is above your team's level.

Safe zones (green pins) restore all HP for free and sell combat
potions. Potions are consumed from the potion bar during a fight and
heal the ACTIVE fighter — using one doesn't skip the enemy's swing.

To add a zone: append to `ZONES` with a `map` id, `x`/`y` percentages,
`lv`, `waves`, and a `pool` of monster ids from `ANTIVIRUZ`.


## Hell monster roster

Hell zones use hand-drawn PNG art (`ext:'png'`) rather than procedural
SVG. Progression follows the fiction of each location:

| Zone | Levels | Monsters |
|---|---|---|
| Outer Ruined Village | 51–58 | Goblin, MinerGoblin |
| The Crossroads | 59–66 | MinerGoblin, BlackBeast |
| Demonbeast Den | 67–74 | BlackBeast, RockGolem |
| Servant Demon Quarter | 75–82 | RedHobgoblin, FireGolem |
| Vice Manor Castle | 83–90 | ManorButler, VampireLady |
| Demon Lord Castle | 91–100 | VampireLord, VampireLady, ManorButler |

Backgrounds were removed by flood-filling from the image border only,
so white details inside a sprite (the butler's shirt, the lord's crown)
survive. Attack frames are generated from the still by leaning and
scaling it.


## Forest monster roster

Forest zones use hand-drawn PNG art, placed by habitat:

| Zone | Levels | Monsters |
|---|---|---|
| The Forest | 1–7 | GreenWorm, JadeBeetle |
| The Mountain | 8–14 | JadeBeetle, StoneImp |
| Riverfall Mountain | 15–21 | Kappa, StoneImp |
| The Wolf Den | 22–28 | FangStalker, Kappa |
| The Desert | 29–35 | SandWorm, SandTurtle |
| The Oasis | 36–42 | OasisOtter, RainbowFrog |
| The Island | 43–50 | FlyingFish, IslandMonkey |

StoneImp and FangStalker are still procedural SVG — drop in art and add
`gif:'<folder>'` + `ext:'png'` to convert them.


## Loyalty & care

Every VIRUZ has a loyalty score (0-100) with four tiers:

| Tier | At | Stats | Perk |
|---|---|---|---|
| Stranger | 0 | ×1.00 | — |
| Friendly | 25 | ×1.10 | DEF +8% |
| Trusted | 55 | ×1.25 | DEF +15%, SPD +10% |
| Loyal Buddy | 85 | ×1.50 | Signature attack, DEF +20%, SPD +15% |

The stat multiplier is applied in `statsOf()`; the DEF/SPD buffs in
`combatStats()`. At Loyal Buddy a pet unlocks a named signature move
(`SIGNATURE_SKILLS`, chosen by attribute) which fires ~25% of the time
rather than competing equally in the random skill pick.

**Gaining loyalty:** +1 per battle won (slow), or via care activities
on the 💗 screen. Each activity has its own 1-hour cooldown per pet,
tracked in `G.care[petUid][activityId]`.

- **Cleaning** — free, +4
- **Foods** (`FOODS`) — bought and consumed, +3 to +24
- **Toys** (`TOYS`) — bought once and kept, +5 to +26

More expensive items give more loyalty. Toys stay in inventory forever
but each is individually on cooldown after use.

## Combat tuning

- `TUNING.expCurve` is polynomial, not exponential — a Lv1 pet reaches
  Lv2 in about two fights, and Lv50 needs ~12.6k exp rather than 243M.
- `DMG_SCALE` in engine.js controls how hard hits land (lower = harder).
- `TUNING.turnBaseMs` is the gap between exchanges.
- Crits trigger an enlarged attacker animation, a red damage number,
  and a comic POW! starburst.


## Hub UI

- **Quick-access bar** (`#quickbar`) — jump buttons to every main screen,
  highlights the current one.
- **Team strip** (`#teamstrip`) — one active-team pet at a time with HP/XP
  bars and loyalty; arrows, dots, or swipe to cycle. Driven by `renderTeamStrip()`.
- **PROCESS feed** (`#process-panel`) — persistent timestamped event log on
  the city map. Records live in `G.feed` (capped at 40) via `feed()`. Built
  as records so it can become a chat box when multiplayer lands.

## Hack minigame (raid rework)

Raiding another player is now two stages:

**1. Password terminal** (`buildHackPuzzle` in engine.js) — a Fallout-style
green screen with tech words hidden in junk characters. Clicking a word
reveals its likeness to the password (shared letters in the same position).
Four attempts; running out locks you out. Word length scales with target
level (4/5/6 letters).

**2. Steal menu** — pick one pet, then choose loot. Each item shows a
success %:
- **100%** → auto-win, no fight
- **below 100%** → enemy stats ×`chanceToEnemyMult(chance)` (up to ~×1.9),
  fought as a single-pet raid battle

The % is set by `buildLootMenu(targetLevel, hackerLevel)`: pricier loot =
lower %, and the level gap shifts it (you higher than target = easier).
Never 0%. Losing a committed raid costs `RAID_LOSS_BITZ` (300).

Everything routes through the existing battle system with `mode:'raid'`.
