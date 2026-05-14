# Pocket Match v1.3.25 BGM Resume Fix

This version fixes the BGM issue introduced by the audio lifecycle patch.

## What changed

The v1.3.24 patch correctly stopped BGM when the iPhone web app was sent to the background, but the BGM start call was happening before the game was marked as active. Because of that, `playBgmIfAllowed()` exited early and the player had to toggle the sound button off/on to force playback.

In v1.3.25:

- New game marks the game as active before starting BGM.
- Continue from save marks the game as active before starting BGM.
- Resume from pause also re-checks BGM playback.
- iPhone background/foreground audio stopping behavior is preserved.

## Upload

For this fix, upload:

- `game.js`

Optional documentation files:

- `VERSION.txt`
- `README.md`

## v1.3.26 iPhone BGM Return Fix

This build fixes the remaining iPhone standalone web app audio lifecycle issue where BGM stopped correctly when exiting the app, but did not resume when returning.

Technical notes:
- Preserves the original BGM playing state across multiple iOS lifecycle events such as `visibilitychange`, `pagehide`, and `blur`.
- Avoids a later `blur` event overwriting the remembered playing state after BGM has already been paused.
- Uses the same guarded BGM restart path after `pageshow` / `focus`, with a short retry for iOS timing.

Only `game.js` needs to be uploaded for this fix.
