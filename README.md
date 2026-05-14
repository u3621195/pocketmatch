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


## v1.3.0 Scoring System Update

- Replaced flat +20 match scoring with combo scoring.
- Combo window is 5 seconds.
- Match points: 100, 150, 200, 300, 400, then 500 for combo 6+.
- Time bonus: remaining seconds × 50.
- Perfect bonus: +5,000 when a level is cleared without using Hint or Shuffle.
- Hint and Shuffle do not directly deduct points, but using either removes the perfect bonus for that level.

## v1.3.1 Helpers + Movement Progression Update

- Helper availability now follows the carry-forward system:
  - Start a new run with 5 Hints and 10 Shuffles.
  - Helpers do not reset every level.
  - After clearing every 3rd level, add +1 Hint and +2 Shuffles.
  - Maximum Hints = 10.
  - Maximum Shuffles = 15.
- Hint and Shuffle still have no direct score penalty, but using either one removes the Perfect Bonus for that level.
- Tile movement now follows an 8-level loop:
  - Level 1: NORMAL
  - Level 2: BOTTOM
  - Level 3: TOP
  - Level 4: LEFT
  - Level 5: RIGHT
  - Level 6: LEFT+RIGHT
  - Level 7: TOP+BOTTOM
  - Level 8: RANDOM
  - Level 9 repeats back to NORMAL.
- Removed X CENTER and Y CENTER from the movement progression.
- Level 6 now splits the 16-column board into fixed halves: columns 1–8 move left, columns 9–16 move right.
- Level 7 now treats row 5 as a neutral center row: rows 1–4 move up, row 5 stays, rows 6–9 move down.
- RANDOM movement picks from BOTTOM, TOP, LEFT, RIGHT, LEFT+RIGHT, and TOP+BOTTOM.
- Timer progression now reduces by 15 seconds every 8 levels:
  - Levels 1–8: 8:00
  - Levels 9–16: 7:45
  - Levels 17–24: 7:30
  - Levels 25–32: 7:15
  - Levels 33–40: 7:00
  - Levels 41–48: 6:45
  - Levels 49–56: 6:30
  - Levels 57–64: 6:15
  - Levels 65+: 6:00 minimum.


## v1.3.4 - Connection Line + Status Box Polish
- Fixed top/bottom outside-route connection-line visibility by expanding vertical routing space and raising the connection-line layer above the board frame.
- Kept left/right outside-route behavior unchanged.
- Fixed timer display width and added tabular numerals to prevent top-bar jitter.
- Polished score box label spacing.
- Added thousand separators to score displays.

## v1.3.11 update notes

- Changed the start-screen tile-set selector into a one-row horizontal carousel.
- Carousel behavior is infinite/continuous and auto-selects the card nearest the center.
- Added subtle carousel dots under the selector.
- Standardized card icon sizing and layout across all tile sets.
- Replaced Foodies, Gadgets, Sports, Home, and Landmarks card icons with consistent embedded SVG-style illustrations.
- Kept the Pokémon private-use PNG icon, but normalized its size/padding to match the other cards.
- No gameplay, scoring, helper, movement, save, sound, or board-routing logic was intentionally changed.

## v1.3.12 update notes

- Replaced the fake infinite carousel reset with a controlled circular carousel so looping from Landmarks back to Pokémon is smooth and does not bounce/jump on desktop.
- Added left/right carousel arrows on desktop.
- Kept mobile swipe support, center-card auto-selection, and subtle dots.
- Stabilized the Selected Run card by reserving the delete-save button space even when the selected theme has no saved game.
- No gameplay, scoring, helper, sound, movement, or path-routing logic was intentionally changed.


## v1.3.13

- Improved the startup theme carousel on iPhone and iPad so it behaves like a smoother draggable carousel rather than a strict one-swipe/one-card stepper.
- Cards now follow the drag gesture and snap to the nearest centered theme on release.
- Preserved the controlled circular loop logic, desktop arrows, dots, and selected-run stability behavior from v1.3.12.
