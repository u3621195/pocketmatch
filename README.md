# Pocket Match v1.3.30 - Brand Card Icon Fix

This package adds a new **BRANDS** tile set to the game.

## Added

- New sprite folder: `assets/sprites/brands/`
- 30 brand-logo PNG sprites
- New sprite array in `game.js`: `BRAND_SPRITES`
- New `SPRITE_SETS.brands` registration
- New **Brands** card in the start-screen tile-set carousel
- Updated cache-busters in `index.html`

## Upload guide

For this update, upload:

```text
index.html
game.js
assets/sprites/brands/
VERSION.txt
README.md
```

`style.css` is included in the package but was not functionally changed for this update.

## Notes

No gameplay, scoring, audio, popup, helper, carousel logic, or save-system behavior was intentionally changed.


## v1.3.30 update

- Replaced the Brands carousel card icon with a custom embedded SVG icon.
- No gameplay logic changed.
