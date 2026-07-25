VIRUZ PET — patch: shield/DEF attribute icon

Changed this round:
  src/data.js           — ATTR.yellow.iconImg now points to
                          assets/icons/def.png (was null/emoji fallback)
  assets/icons/def.png  — the shield icon, new asset

All 4 attributes now have real icon art:
  red (ATK)    -> sword
  green (SPD)  -> winged boot
  yellow (DEF) -> shield  <- this patch
  white (Healer) -> holy cross

Verified in-browser: a yellow-attribute pet's card correctly loads
assets/icons/def.png (96x96), zero errors, zero 404s.

Copy src/data.js over your existing file, and add
assets/icons/def.png as a new file in your assets/icons/ folder.
