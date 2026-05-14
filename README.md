# Pocket Match v1.3.28 - Popup Centering Fix

This build focuses only on popup layout stability across iPhone portrait, iPhone landscape, Safari, and Home Screen web-app mode.

## Fixed

- All in-game popups are forced to center within the visible screen.
- Popups now use safe-area-aware padding.
- Tall popups use internal scrolling rather than clipping off-screen.
- The CSS cache-buster in `index.html` was updated so iPhone browsers load the new popup CSS.

## Popups covered

- Start New Game confirmation
- Save confirmation
- Pause menu
- Level Complete
- Game Over
- Helper message
- End Quick Game confirmation

## Upload files

Upload these files for this fix:

- `style.css`
- `index.html`

No JavaScript or asset files were changed.
