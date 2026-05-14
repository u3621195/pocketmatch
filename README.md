# Pocket Match v1.3.23 Hint Glow Tone Down

This is a maintenance cleanup of the existing Pocket Match build.

## Files

- `index.html` — app structure and overlays
- `style.css` — visual layout, responsive rules, carousel styling, popups
- `game.js` — gameplay, scoring, save flow, audio, carousel logic
- `assets/` — fonts, sounds, and sprite sets

## What changed in this cleanup

- Re-formatted the source files for easier reading and future editing.
- Removed old version/patch comments that were no longer useful.
- Updated title/cache labels to `v1.3.21-clean`.
- Kept the current finite scroll-snap carousel approach.

## What was intentionally preserved

- Gameplay rules
- Scoring and combo logic
- Helper availability
- Level movement progression
- Save/resume behavior
- Quick Game behavior
- Sound effects and background music
- Tile-set assets and IDs
- Board path-routing behavior

## Recommended smoke test

1. Open `index.html`.
2. Select each tile set card and confirm the selected highlight moves correctly.
3. Use carousel arrows on desktop and swipe/scroll on mobile.
4. Start New Game, Continue, and Quick Game.
5. Complete a match and verify score/timer updates.
6. Test Hint, Shuffle, Pause, Save & Quit, and Resume.


## v1.3.23 Hint Glow Tone Down
- Stronger tile flash for the Hint helper, especially on iPhone.
- Added bright ring/glow pulse and extended hint display duration.


## v1.3.23 Hint Glow Tone Down
- Reduced hint flash/glow intensity after v1.3.22 was visually too bright.
- Kept improved visibility duration and pulse behavior.
- Upload `style.css` for this visual tuning. `game.js` is unchanged from v1.3.22.
