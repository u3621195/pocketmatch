# Pocket Match - Clean Base v1

This package is a cleanup of the selected stable baseline.

## What changed

- Split the previous single-file app into:
  - `index.html` — page structure only
  - `style.css` — all original CSS
  - `game.js` — all original JavaScript
  - `assets/` — unchanged audio and sprite assets

## What did not change

No gameplay, layout, scoring, tile movement, saved-game logic, tile set data, or visual design was intentionally changed in this cleanup pass.

## Recommended test checklist

1. Open `index.html` in a browser.
2. Confirm the start screen loads correctly.
3. Confirm each tile set can be selected.
4. Start a new game.
5. Match tiles and complete at least one level.
6. Test Hint and Shuffle.
7. Test Save and Resume.
8. Test on mobile/iPhone view if possible.

## Next suggested step

Use this version as the editable clean base before making UI or feature adjustments.


## Clean Base v1.1 notes

- Added HOME sprite set under `assets/sprites/home/`.
- Renamed visible ORIGINAL card/set name to POKÉMON while keeping the internal saved-game id as `original`.
- Removed category subtitles from the sprite selection cards.
- Added a Pokémon-set card image using an existing yellow electric-style sprite from the original set.

## v1.2.0 update notes

This package updates the start-screen save flow:

- Adds one saved-game slot per tile set.
- Shows `NEW` or `LV ##` status pills on each tile-set card.
- Auto-selects the tile set with the latest saved game when the app loads.
- Enables `CONTINUE` only when the selected tile set has saved progress.
- Keeps `NEW GAME` always available, with a warning before overwriting a selected set's saved progress.
- Adds `QUICK GAME`, which starts from Level 1 using a random tile set and does not save progress.
- Reduces start-button size and text size for a more polished look.

Testing checklist:

1. Open the app with no saves: all cards should show `NEW`, Continue should be disabled.
2. Start a New Game with one tile set, use Save & Quit, and confirm only that tile set shows `LV ##`.
3. Select a saved tile set: Continue should be enabled.
4. Select an unsaved tile set: Continue should be disabled.
5. Use New Game on a saved tile set: warning popup should appear.
6. Use Quick Game: it should start at Level 1 with a random tile set and not create/update a saved game.


## v1.2.1 Font embedding note
- Changa One is embedded locally at `assets/fonts/ChangaOne-Regular.ttf`.
- The app no longer loads Changa One from Google Fonts.
- Space Grotesk is still loaded from Google Fonts for the rest of the UI.
