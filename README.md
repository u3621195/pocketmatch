# Pocket Match v1.3.24 Audio Lifecycle Fix

This package is based on v1.3.23 and keeps the toned-down hint glow.

## What changed in v1.3.24
- Fixed iPhone web app issue where background music could continue playing after exiting to the home screen or switching apps.
- Added audio lifecycle guards for `visibilitychange`, `pagehide`, `pageshow`, `blur`, and `focus`.
- Background music pauses immediately when the app is hidden or loses focus.
- Short UI sound effects are also stopped when the app is hidden.
- Background music resumes only when returning to an active, unpaused game and music is enabled.

## Not changed
- Gameplay logic
- Scoring
- Tile movement
- Save/continue logic
- Carousel layout
- Tile sets
- Hint glow styling from v1.3.23

## Upload guidance
For this fix, upload:

```text
game.js
VERSION.txt
README.md
```

The required file for the audio fix is:

```text
game.js
```

If your browser or iPhone web app keeps using the old script, clear cache or open the game once with a version query such as:

```text
index.html?v=1324
```
