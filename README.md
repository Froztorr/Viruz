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
assets/video/           background.mp4 (city map)
assets/ui/              city_map.jpg (video poster fallback)
src/sprites.js          creature renderer — handles both GIF art and inline SVG
assets/sprites/<name>/  still.gif + attack.gif for GIF-based species
```

## Adding a species

Species use one of two art sources. The renderer picks automatically.

**Real GIF art (preferred):**
1. Put `still.gif` + `attack.gif` in `assets/sprites/<name>/`
2. Add a `SPECIES` entry in `src/data.js` with `gif:'<name>'`

**Procedural SVG (no art needed):**
1. Add a shape builder to `SHAPES` in `src/sprites.js` (100x100 viewBox, facing right)
2. Add a `SPECIES` entry with `shape:'<yourshape>'`

To replace an SVG species with real art later, just add `gif:'<folder>'`
to it — the `shape` becomes an automatic fallback. No renderer changes.

## Attribute tinting

Each attribute in `ATTR` (src/data.js) has a `hue` block:

    hue: { rotate: -18, sat: 1.85, bright: .95 }

GIF art is tinted with a CSS filter built from these values; SVG
creatures use the attribute `color` directly for their fills. Tune the
numbers there to shift a whole attribute's palette.

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
