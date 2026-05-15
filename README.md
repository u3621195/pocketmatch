# Pocket Match v1.3.31 Travel Set Added

This package adds the **TRAVEL** tile set to Pocket Match.

## Added

- `assets/sprites/travel/` with 30 travel item sprites
- `TRAVEL_SPRITES` array in `game.js`
- `travel` entry in `SPRITE_SETS`
- Startup carousel card for **Travel**
- Custom embedded SVG icon for the Travel card
- Cache-buster update in `index.html`

## Upload for this update

Upload these files/folders to your hosting:

```text
index.html
game.js
assets/sprites/travel/
VERSION.txt
README.md
```

No intentional gameplay, scoring, audio, popup, helper, save, or carousel behavior changes were made.

## v1.3.32 - iPhone Rotate Screen Polish

- Replaced the transparent portrait warning with an opaque full-screen orientation screen.
- Prevents players from seeing the unfinished board layout behind the rotate message on iPhone portrait.
- Added a centered rotate message card with app-style background/glow.
- No gameplay, scoring, audio, carousel, tile set, helper, or save logic changes.
