# Patch: Stage-2 mutations + attribute art (this zip)

## ⚠️ If you downloaded a build of this before ~05:40 UTC, redownload
An earlier version of this zip was built on top of an outdated copy
of `game.js`/`data.js` (one you'd uploaded standalone earlier in the
conversation) instead of the real, fuller files inside your actual
project — which cost you the cooking menu, the wandering-pet care
screen, and the swipeable pet detail window, none of which I'd
touched. This build is redone from your real `game.js`/`data.js`;
all three are confirmed present alongside everything below. Also
fixed in this pass, found from your bug report:
- A boss surviving into its rage phase was briefly redrawing into
  your OWN ally slot instead of the enemy slot (`applyDamage()` was
  keying off the attacker's side instead of the target's).
- The boss map pin sat at the exact same coordinates as the zone
  pin underneath it, blocking clicks on that zone entirely — now
  offset to sit beside it instead.
- v2 species art (the 14 upgraded species) was stretching to fill a
  square box instead of keeping its real proportions ("too short
  horizontally") — your CSS already had the fix for this exact
  problem on the older raster sprites (`object-fit:contain` +
  2x-in-battle sizing), it just never got extended to the new art.
  Extended now; non-battle boxes also shortened to fit the art's
  actual proportions instead of leaving empty vertical space.

## What's new

### 1. Real per-attribute art for all 14 species
`assets/sprites_v2/<species>/` — 280 PNGs total:
- `stage1_<attr>.png` — the base creature, recolored by attribute (red/green/yellow/white)
- `<mutation>_<attr>.png` — the stage-2 evolved form, one set per mutation
  (`overclock`, `bulwark`, `phantom`, `corrupted`) × attribute

`sprites.js` renders these automatically for any species flagged
`art2:true` in `data.js` — everything else keeps the original
fixed-palette SVG unchanged. See `creatureMarkupFor()`.

### 2. Stage-2 "mutations"
Reaching evolution stage 2 now rolls a **mutation** (`pet.mutation`,
in `evolve()`, `engine.js`) — equal odds by default across the 4
types. This drives BOTH the art variant above and a second, smaller
skill tree (8 nodes, Lv50-75) layered on top of the pet's normal
attribute tree:

| Mutation | Theme | Example skills |
|---|---|---|
| Overclock | Speed + freeze (system lockup) | System Lockup, Short Circuit, Clock Singularity |
| Bulwark | Heavy hits + endurance | Bulwark Slam, Brace Protocol, Unbreakable Core |
| Phantom | Evasion | Phantom Veil, Shadowstep, Voidwalk |
| Corrupted | Debuffs the enemy (ATK/DEF/SPD drain) | Data Decay, Corrupt Strike, Oblivion Protocol |

All defined in `data.js` (`MUTATION_TREES`, `MUTATIONS`, the new
`SPECIALS` entries, and one new `corrupt` ailment). The Pet Detail →
Skill Tree tab now shows a small toggle to switch between the
attribute tree and the mutation tree once one exists (`game.js`,
`renderTree()`).

A species can restrict which mutations it's eligible to roll via an
optional `mutationPool` field (used temporarily while NulWorm's art
was incomplete — now removed since all 4 sets exist).

### 3. Engine changes (`engine.js`)
- `ailmentMods()` generalized: any ailment/buff carrying
  atk/def/spd/eva/crit now applies, not just the original hardcoded
  `'frenzy'` case. This is what makes the Phantom evasion buff and
  Corrupted debuff work — no new combat mechanics were needed.
- `combatStats()` now applies the eva/crit ailment multipliers too
  (previously only atk/def/spd were affected by ailments).
- `treesFor(pet)` / node lookups now search both the attribute tree
  and the mutation tree (once unlocked) — `canTakeNode`, `takeNode`,
  `treeBonuses`, `unlockedSpecials` all updated.

### Known gaps
- Only the 14 species in `ART2_SPECIES` (data.js) have v2 art; the
  rest of the roster (ByteHound, ArmorHound, etc., if present in your
  current `data.js`) is unaffected and still uses SVG/gif art.
- No new UI beyond the tree-toggle — there's no dedicated "mutation
  reveal" animation/screen when a pet evolves into one; it just takes
  effect silently the moment `evolve()` runs.
- Not tested in an actual browser (no DOM available in this
  environment) — verified via Node: all imports/exports resolve
  correctly end-to-end, and mutation rolling / skill tree math /
  combat stat application were exercised directly and checked against
  hand-computed expected values. Worth a real playtest before
  shipping.

## Patch 2: Gated final evolution — Tech Lab, region bosses, materials

### 1. Final evolution is now gated, not automatic
`canEvolve()`/`evolve()` (`engine.js`) changed: reaching stage 2 used
to just need `level >= 50`. Now, for stage 1→2 specifically:
- `pet.level >= pet.maxLv` (rarity-relative — 30 for Normal, 50 Rare,
  70 Epic, 90 Legendary, 120 Mythic — not a flat number)
- Loyalty at the top tier (`'loyal'`)
- Performed through the Tech Lab ONLY (see below) — nothing else in
  the codebase calls `evolve()` for the final stage anymore.

A green ▲ badge appears next to a pet's name (roster card + status
window) once `canEvolve(pet).ok` — reusing that one function as the
single source of truth so the badge can never drift out of sync with
the actual gate.

**Conflict I found and resolved**: the shop's "Evo Stone" item used
to instant-evolve any pet, bypassing every check above. Repurposed it
to grant 1 Malware Core instead (`data.js` ITEMS, `type:'material'`)
so it's a shortcut *into* the gate, not around it. Flagging this in
case you'd rather it do something else entirely.

### 2. Tech Lab (new section on the Shop screen)
`index.html` / `game.js` (`renderTechLab`, `confirmTechLabEvolve`,
`openCodePartPicker`). 4 slots: 1 Malware Core + 3 Code Parts (any
mix of the 4 types, picked per-slot from your bag). Shows a live
odds preview as you fill slots, using the exact formula you gave:

- Each part in a slot = +30 percentage points to that mutation
- Whatever's left over (100 − 30×n) splits evenly across mutations
  that got zero parts
- 3× same type → 90% that type, ~3.3% each of the other 3
- Confirms → spends the materials → plays the evolve animation → calls
  `evolve(pet, false, weightedOdds)`

**Simplification**: this is a new *section* on the existing Shop
screen, not a true swipeable tab like the Pet Detail window uses —
restructuring the working Items/Bots layout into real tabs felt
riskier than adding alongside it. Say the word if you want it as an
actual tab instead.

### 3. Region bosses
One wandering boss per map/region (`bossPoolForMap()` in `data.js`),
rolled from that region's 3 highest-power monsters. Spawns at a
random battle-zone position on the world map; defeating it "resets
its position" — immediately rolls a new spot elsewhere in the same
region (`rollBossSpawn`/`onBossDefeated` in `game.js`).

- 1.5× sprite scale, dark-red rotating radiant glow on the map pin,
  pin label deliberately reads "Boss Lv???" — real level is only
  shown in the pre-fight briefing modal
- Two HP bars: phase 1 (normal max HP) → phase 2 (70% of that,
  entered via `enterBossRage()` in `engine.js` instead of dying) with
  bouncing anger-mark emoji and +50% ATK
- On actual death: 2× Bitz, 25% Malware Core, and equipment rolls one
  grade tier above normal (reuses the Deep Craft weighting as a
  stand-in "better loot" table)

**Simplification**: "3 highest-level enemies of that region" — since
monster levels aren't fixed (they're scaled at spawn time to whatever
zone they appear in), I read this as "region's 3 highest-power
monster *definitions*" (atk+def+spd×0.5+mhp×0.3, unleveled) rather
than a literal level number. Worth checking this matches what you had
in mind.

### 4. Evolution materials
`data.js`: `MATERIALS` (Malware Core + 4 Code Parts), tracked as
simple stackable counts in `G.materials` — not the unique-instance
equipment-bag pattern, since these are fungible. Code Parts drop from
any Lv1-50 kill at 5%→50% (linear by level); Malware Cores ONLY from
a region boss kill, flat 25%, on top of everything else it drops.

### 5. Evolve animation
`playEvolveAnimation()` in `game.js`: white pulse on the sprite 3×
(~950ms each), then a real pixel-shard explosion — for the 14 v2
species this tiles actual slices of the sprite image per shard (not
generic particles), flies them outward, and reveals the new
post-evolve form underneath. SVG-only species (no v2 art) get the
same pulse+shard-fly beat with plain shard tiles instead of
image-sliced ones, since SVG doesn't have a plain image URL to tile.

### Still not done / not verified
- None of this has run in an actual browser — no DOM available here.
  Verified as far as Node allows: every import/export resolves
  end-to-end, and I exercised the gating logic, weighted-parts odds,
  and boss phase transition directly against hand-computed expected
  values (see the test output in this session if you want to rerun
  it yourself). The animation timing, CSS layout, and pin styling are
  all reasoned through carefully but genuinely unverified visually —
  please playtest before shipping.
- No cooldown on boss respawn — a defeated boss's replacement is
  immediately available elsewhere in the region. Add one if that's
  too fast for your economy.
- Tech Lab is additive to the Shop screen, not a real tab (see #2).

