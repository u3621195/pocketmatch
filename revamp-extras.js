/* =============================================================
   POCKET MATCH — REVAMP EXTRAS
   -------------------------------------------------------------
   Sits on top of game.js. Does not touch any game state — it
   only:
     1. Wires the in-page "visual direction" picker (Candy /
        Crystal / Cozy) → toggles data-direction on <body> and
        persists to localStorage.
     2. Tracks `data-screen="menu"|"play"` on <body> so CSS can
        rotate the gameplay shell to landscape on portrait phones.
     3. Adds match-juice: particle bursts, score-fly numbers,
        and a brief screen-shake on every successful match.
     4. Adds a floating Tweaks panel that mirrors the start-screen
        direction picker. The panel uses the same postMessage
        protocol as our editor host's "Tweaks" toolbar toggle.
   ============================================================= */

(function () {
  "use strict";

  // ─── DIRECTION PICKER ─────────────────────────────────────
  const DIRECTION_KEY = "pocketmatch_direction_v1";
  const DIRECTIONS = ["candy", "crystal", "cozy"];

  function getStoredDirection() {
    try {
      const v = localStorage.getItem(DIRECTION_KEY);
      return DIRECTIONS.includes(v) ? v : TWEAK_DEFAULTS.direction;
    } catch (e) {
      return TWEAK_DEFAULTS.direction;
    }
  }
  function setDirection(dir) {
    if (!DIRECTIONS.includes(dir)) dir = "candy";
    document.body.setAttribute("data-direction", dir);
    try {
      localStorage.setItem(DIRECTION_KEY, dir);
    } catch (e) {}
    // Sync chips in both the start-screen picker and the Tweaks panel.
    document.querySelectorAll("[data-direction-control]").forEach((el) => {
      el.classList.toggle(
        "is-active",
        el.getAttribute("data-direction-control") === dir,
      );
    });
    document.querySelectorAll(".direction-chip").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.direction === dir);
    });
    // Persist via the host's editmode protocol so tweak values survive
    // reload (no-op outside the editor host).
    try {
      window.parent?.postMessage(
        { type: "__edit_mode_set_keys", edits: { direction: dir } },
        "*",
      );
    } catch (e) {}
  }

  function initDirectionPicker() {
    const initial = getStoredDirection();
    setDirection(initial);
    document.querySelectorAll(".direction-chip").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        setDirection(chip.dataset.direction);
      });
    });
  }

  // ─── SCREEN-STATE TRACKING (menu / play) ─────────────────
  // We watch the .hidden class on the start overlay so we don't have to
  // patch game.js at all. When the overlay opens we're on the menu;
  // when it closes we're playing.
  function updateScreenState() {
    const overlay = document.getElementById("overlay");
    if (!overlay) return;
    const onMenu = !overlay.classList.contains("hidden");
    document.body.setAttribute("data-screen", onMenu ? "menu" : "play");
  }
  function initScreenStateObserver() {
    const overlay = document.getElementById("overlay");
    if (!overlay) return;
    const mo = new MutationObserver(updateScreenState);
    mo.observe(overlay, { attributes: true, attributeFilter: ["class"] });
    updateScreenState();
  }

  // ─── MATCH-JUICE: tunable presets ─────────────────────────
  // Defaults are declared in index.html (inside an EDITMODE block so the
  // editor host can persist user tweaks to disk). We just read them here.
  const TWEAK_DEFAULTS = Object.assign(
    { direction: "candy", motion: "subtle" },
    (typeof window !== "undefined" && window.__pocketmatchTweakDefaults) || {},
  );

  // Motion presets. Each match fires `effects` in order; counts can be 0.
  const MOTION_PRESETS = {
    off: {
      particles: 0,
      particleDistance: 0,
      ring: false,
      scoreFly: false,
      shake: "none",
      vibrate: 0,
    },
    subtle: {
      particles: 5,
      particleDistance: 50,
      ring: true,
      scoreFly: true,
      shake: "none",     // no shake on subtle
      vibrate: 8,        // Android only — silently ignored on iOS
    },
    medium: {
      particles: 10,
      particleDistance: 70,
      ring: true,
      scoreFly: true,
      shake: "small",
      vibrate: 12,
    },
    big: {
      particles: 16,
      particleDistance: 100,
      ring: true,
      scoreFly: true,
      shake: "big",
      vibrate: 18,
    },
  };

  const MOTION_KEY = "pocketmatch_motion_v1";
  function getStoredMotion() {
    try {
      const v = localStorage.getItem(MOTION_KEY);
      return MOTION_PRESETS[v] ? v : TWEAK_DEFAULTS.motion;
    } catch (e) {
      return TWEAK_DEFAULTS.motion;
    }
  }
  let motionLevel = getStoredMotion();
  function setMotionLevel(level) {
    if (!MOTION_PRESETS[level]) level = "subtle";
    motionLevel = level;
    try { localStorage.setItem(MOTION_KEY, level); } catch (e) {}
    document.querySelectorAll("[data-motion-control]").forEach((el) => {
      el.classList.toggle(
        "is-active",
        el.getAttribute("data-motion-control") === level,
      );
    });
    try {
      window.parent?.postMessage(
        { type: "__edit_mode_set_keys", edits: { motion: level } },
        "*",
      );
    } catch (e) {}
  }

  function getTileRect(r, c) {
    const tile = document.querySelector(
      `.tile[data-r="${r}"][data-c="${c}"]`,
    );
    return tile ? tile.getBoundingClientRect() : null;
  }
  function getAccentColors() {
    const cs = getComputedStyle(document.documentElement);
    return [
      cs.getPropertyValue("--accent").trim() || "#7c5cff",
      cs.getPropertyValue("--accent-2").trim() || "#ff6fb5",
      cs.getPropertyValue("--accent-3").trim() || "#5cc8ff",
    ];
  }

  function burstAt(x, y) {
    const preset = MOTION_PRESETS[motionLevel];
    if (!preset.particles) return;
    const layer = document.getElementById("comboLayer");
    if (!layer) return;
    const colors = getAccentColors();
    for (let i = 0; i < preset.particles; i++) {
      const p = document.createElement("span");
      p.className = "particle";
      const color = colors[i % colors.length];
      p.style.background = color;
      p.style.left = x + "px";
      p.style.top = y + "px";
      const angle =
        (Math.PI * 2 * i) / preset.particles + Math.random() * 0.4;
      const distance = preset.particleDistance * (0.7 + Math.random() * 0.6);
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 20; // slight upward bias
      const dur = 480 + Math.random() * 220;
      const size = 5 + Math.random() * 5;
      p.style.width = size + "px";
      p.style.height = size + "px";
      // No glow on subtle — it's the noisiest part visually
      if (motionLevel !== "subtle") {
        p.style.boxShadow = `0 0 8px ${color}`;
      }
      p.animate(
        [
          { transform: "translate(-50%, -50%) scale(1)", opacity: 0.95 },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.35)`,
            opacity: 0,
          },
        ],
        { duration: dur, easing: "cubic-bezier(0.22, 0.7, 0.36, 1)" },
      );
      layer.appendChild(p);
      setTimeout(() => p.remove(), dur + 40);
    }
  }

  function ringAt(x, y) {
    if (!MOTION_PRESETS[motionLevel].ring) return;
    const layer = document.getElementById("comboLayer");
    if (!layer) return;
    const el = document.createElement("span");
    el.className = "match-ring";
    el.style.left = x + "px";
    el.style.top = y + "px";
    layer.appendChild(el);
    setTimeout(() => el.remove(), 540);
  }

  function scoreFlyAt(x, y, text, large = false) {
    if (!MOTION_PRESETS[motionLevel].scoreFly) return;
    const layer = document.getElementById("comboLayer");
    if (!layer) return;
    const el = document.createElement("div");
    el.className = "score-fly" + (large ? " score-fly--lg" : "");
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.textContent = text;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function shake() {
    const mode = MOTION_PRESETS[motionLevel].shake;
    if (mode === "none") return;
    const shell = document.querySelector(".app-shell");
    if (!shell) return;
    const cls = mode === "big" ? "shake-big" : "shake";
    shell.classList.remove("shake", "shake-big");
    // Force reflow so the animation can restart.
    void shell.offsetWidth;
    shell.classList.add(cls);
    setTimeout(() => shell.classList.remove(cls), 400);
  }

  // Haptics — Android only. iOS Safari (iPhone/iPad) does not support
  // navigator.vibrate, so this is a silent no-op there. Documenting
  // here because users often expect haptics to "just work" on iOS.
  function haptic() {
    const ms = MOTION_PRESETS[motionLevel].vibrate;
    if (!ms) return;
    try {
      if (typeof navigator.vibrate === "function") navigator.vibrate(ms);
    } catch (e) {}
  }

  // We hook into tile matching by watching when `.matched` is added.
  // game.js calls tileEl.classList.add("matched") right before scoring,
  // so a MutationObserver on the board lets us fire effects without
  // modifying game.js.
  let lastBurstAt = 0;
  function initMatchObserver() {
    const board = document.getElementById("board");
    if (!board) return;
    const mo = new MutationObserver((records) => {
      const matched = new Set();
      for (const rec of records) {
        if (rec.type !== "attributes") continue;
        const t = rec.target;
        if (t.classList && t.classList.contains("matched")) {
          matched.add(t);
        }
      }
      if (!matched.size) return;
      const now = Date.now();
      // One shake + one haptic per match batch (both tiles toggle together).
      if (now - lastBurstAt > 60) {
        shake();
        haptic();
        lastBurstAt = now;
      }
      matched.forEach((tile) => {
        const r = tile.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        burstAt(x, y);
        ringAt(x, y);
      });
      // Read combo/score from the status pill and surface a fly-out number
      // at the midpoint of the matched pair.
      const status = document.getElementById("moveStatus");
      if (status) {
        const text = status.textContent || "";
        const m = text.match(/\+([\d,]+)/);
        const isCombo = /COMBO/i.test(text);
        if (m) {
          const tiles = [...matched];
          const mid = tiles.reduce(
            (acc, t) => {
              const r = t.getBoundingClientRect();
              acc.x += r.left + r.width / 2;
              acc.y += r.top + r.height / 2;
              return acc;
            },
            { x: 0, y: 0 },
          );
          mid.x /= tiles.length;
          mid.y /= tiles.length;
          scoreFlyAt(mid.x, mid.y - 12, "+" + m[1], isCombo);
        }
      }
    });
    // Observe attribute changes on every tile (delegated).
    mo.observe(board, {
      attributes: true,
      attributeFilter: ["class"],
      subtree: true,
    });
  }

  // ─── TWEAKS PANEL ─────────────────────────────────────────
  function buildTweaksPanel() {
    if (document.getElementById("tweaksPanel")) return;
    const panel = document.createElement("div");
    panel.className = "tweaks-panel hidden";
    panel.id = "tweaksPanel";
    panel.innerHTML = `
      <div class="tweaks-head">
        <span class="tweaks-title">Tweaks</span>
        <button class="tweaks-close" type="button" aria-label="Close" id="tweaksCloseBtn">✕</button>
      </div>
      <div class="tweaks-section">
        <div class="tweaks-section-label">Visual style</div>
        <div class="tweaks-options">
          <button class="tweaks-option" data-direction-control="candy" type="button">
            <span class="tweaks-swatch direction-swatch-candy"></span>
            Candy
          </button>
          <button class="tweaks-option" data-direction-control="crystal" type="button">
            <span class="tweaks-swatch direction-swatch-crystal"></span>
            Crystal
          </button>
          <button class="tweaks-option" data-direction-control="cozy" type="button">
            <span class="tweaks-swatch direction-swatch-cozy"></span>
            Cozy
          </button>
        </div>
      </div>
      <div class="tweaks-section">
        <div class="tweaks-section-label">Match feedback</div>
        <div class="tweaks-options tweaks-options--row">
          <button class="tweaks-option tweaks-option--compact" data-motion-control="off" type="button">Off</button>
          <button class="tweaks-option tweaks-option--compact" data-motion-control="subtle" type="button">Subtle</button>
          <button class="tweaks-option tweaks-option--compact" data-motion-control="medium" type="button">Medium</button>
          <button class="tweaks-option tweaks-option--compact" data-motion-control="big" type="button">Big</button>
        </div>
        <div class="tweaks-note">
          On Android, the device vibrates briefly on each match.
          iPhone &amp; iPad do not support web vibration.
        </div>
      </div>
      <div class="tweaks-section">
        <div class="tweaks-section-label">Tile pack</div>
        <div class="tweaks-options" id="tweaksPackOptions"></div>
      </div>
    `;
    document.body.appendChild(panel);

    // Wire close button
    panel
      .querySelector("#tweaksCloseBtn")
      .addEventListener("click", () => {
        panel.classList.add("hidden");
        try {
          window.parent?.postMessage(
            { type: "__edit_mode_dismissed" },
            "*",
          );
        } catch (e) {}
      });

    // Wire direction options
    panel.querySelectorAll("[data-direction-control]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setDirection(btn.getAttribute("data-direction-control"));
      });
    });
    // Wire motion options
    panel.querySelectorAll("[data-motion-control]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setMotionLevel(btn.getAttribute("data-motion-control"));
      });
    });

    // Tile pack options — read live from .sprite-option list to stay in sync
    const packs = panel.querySelector("#tweaksPackOptions");
    document.querySelectorAll(".sprite-option[data-set]").forEach((opt) => {
      const setId = opt.dataset.set;
      const name = opt.querySelector(".sprite-name")?.textContent || setId;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tweaks-option";
      btn.dataset.pack = setId;
      btn.style.flex = "1 1 30%";
      btn.textContent = name;
      btn.addEventListener("click", () => {
        if (typeof window.selectSpriteCarouselSet === "function") {
          window.selectSpriteCarouselSet(setId, true);
        } else if (typeof applySpriteSet === "function") {
          applySpriteSet(setId);
        }
        panel
          .querySelectorAll("[data-pack]")
          .forEach((b) =>
            b.classList.toggle("is-active", b.dataset.pack === setId),
          );
      });
      packs.appendChild(btn);
    });

    // Sync initial active state for pack chips
    const initialPack =
      document.querySelector(".sprite-option.active")?.dataset.set ||
      "original";
    panel
      .querySelectorAll("[data-pack]")
      .forEach((b) =>
        b.classList.toggle("is-active", b.dataset.pack === initialPack),
      );

    return panel;
  }

  function initTweaksPanel() {
    // Build but keep hidden.
    buildTweaksPanel();
    // Listen for the editor host's tweak toggle messages.
    window.addEventListener("message", (e) => {
      const data = e.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "__activate_edit_mode") {
        document.getElementById("tweaksPanel")?.classList.remove("hidden");
      } else if (data.type === "__deactivate_edit_mode") {
        document.getElementById("tweaksPanel")?.classList.add("hidden");
      }
    });
    // Announce we support tweaks (toolbar toggle appears).
    try {
      window.parent?.postMessage({ type: "__edit_mode_available" }, "*");
    } catch (e) {}
  }

  // ─── BOOTSTRAP ───────────────────────────────────────────
  function init() {
    initDirectionPicker();
    initScreenStateObserver();
    initMatchObserver();
    initTweaksPanel();
    // Apply stored motion level so the chip UI reflects it.
    setMotionLevel(motionLevel);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/*
  ─────────────────────────────────────────────────────────────
  HOW THE ASSETS HOOK BACK IN
  ─────────────────────────────────────────────────────────────
  Tile sprite images:
      <img class="entity-sprite" src="assets/sprites/<pack>/<id-name>.png">
    Built by game.js renderBoard(). Paths come from the SPRITES /
    GADGET_SPRITES / etc. constants at the top of game.js. Replace
    the PNGs in assets/sprites/<pack>/ to swap art.

  Background music:        assets/audio/background-music.mp3
  Level complete sound:    assets/audio/level-complete.wav
  Game over sound:         assets/audio/game-over.wav
    Wired through the `bgm` and `uiAudio` objects in game.js. Drop
    in new files at the same paths (same filenames) to replace.

  Tile-pack thumbnails:    assets/ui-icons/<pack>-card.png
    Used on the start-screen carousel. Swap by path.

  Fonts:                   assets/fonts/SpaceGrotesk-*.ttf,
                           assets/fonts/ChangaOne-Regular.ttf
    Loaded via @font-face in style.css.
*/
