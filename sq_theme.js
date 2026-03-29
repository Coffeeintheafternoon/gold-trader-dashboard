// sq_theme.js — Squant Bot visual style guide v1
// Single source of truth for every color, chart default, and semantic token.
// Loaded BEFORE all tab JS files.  Tab files use SQ.* and the compat globals.

'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// 1.  CORE PALETTE
// ══════════════════════════════════════════════════════════════════════════════
const SQ = (() => {
  // ── CRT phosphor palette ──────────────────────────────────────────────────
  const green   = '#aaff00';   // primary UI chrome + bullish
  const red     = '#ff3355';   // bearish / error  (hot pink-red, more CRT)
  const amber   = '#ffcc00';   // warning / caution
  const cyan    = '#00ccff';   // info / secondary
  const violet  = '#bf5fff';   // accent
  const orange  = '#ff8800';   // accent 2
  const teal    = '#00ffcc';   // accent 3
  const magenta = '#ff44cc';   // accent 4
  const neutral = '#556677';   // flat / unknown / dim

  // ── Text / structure ──────────────────────────────────────────────────────
  const text  = '#dff5c0';
  const muted = '#5a6830';
  const grid  = 'rgba(170,255,0,0.07)';

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const tooltip = {
    bg:     '#000e06',
    border: 'rgba(170,255,0,0.40)',
    title:  green,
    body:   text,
  };

  // ── 8-stop ordered multi-series palette ──────────────────────────────────
  // Used for scatter categories, line series, bar groups etc.
  const palette   = [green, cyan, red, amber, violet, orange, teal, magenta];
  const paletteBg = [                          // low-alpha fill variants
    'rgba(170,255,0,0.10)',
    'rgba(0,204,255,0.10)',
    'rgba(255,51,85,0.10)',
    'rgba(255,204,0,0.10)',
    'rgba(191,95,255,0.10)',
    'rgba(255,136,0,0.10)',
    'rgba(0,255,204,0.10)',
    'rgba(255,68,204,0.10)',
  ];

  // ── Feature category colors (model lab / meta tab bar charts) ─────────────
  const cat = {
    price:         green,
    technical:     cyan,
    macro:         violet,
    momentum:      amber,
    interaction:   orange,
    volume:        teal,
    announcement:  red,
    volatility:    magenta,
    candle:        muted,
    trend:         cyan,
    other:         neutral,
  };

  // ── Model variant colors (meta tab comparison charts) ─────────────────────
  const model = {
    'Ridge (v5)':         green,
    'Ridge (v4)':         cyan,
    'Ridge (1yr)':        amber,
    'Ridge (6mo)':        violet,
    'Ridge (v2)':         orange,
    'Ridge (v3)':         magenta,
    'Regime-Weighted 3M': teal,
    'Regime-Weighted 6M': '#7755ff',
    'Regime-Weighted 1Y': '#5533dd',
    '18yr · 1yr window':  red,
    '18yr · 6mo window':  orange,
    '18yr · 2yr window':  '#cc2244',
  };

  return {
    // raw colors
    green, red, amber, cyan, violet, orange, teal, magenta, neutral,
    // ui
    text, muted, grid, tooltip,
    // palettes
    palette, paletteBg,
    // semantic shortcuts
    bullish: green,  bearish: red,  flat: neutral,
    ok:      green,  warn:    amber, error: red, info: cyan,
    low:     green,  medium:  amber, high: red,
    // lookup maps
    cat, model,
  };
})();

// ══════════════════════════════════════════════════════════════════════════════
// 2.  UTILITY HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/** Convert 6-char hex + alpha → rgba() string */
function hexA(h, a) {
  const r=parseInt(h.slice(1,3),16), g=parseInt(h.slice(3,5),16), b=parseInt(h.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Palette color at index i (wraps around) */
function sqColor(i)     { return SQ.palette[i % SQ.palette.length]; }
function sqColorA(i, a) { return hexA(sqColor(i), a); }
function sqBg(i)        { return SQ.paletteBg[i % SQ.paletteBg.length]; }

// ══════════════════════════════════════════════════════════════════════════════
// 3.  BACKWARD-COMPATIBLE GLOBALS
//     Existing tab files use these names — keep them working without changes.
// ══════════════════════════════════════════════════════════════════════════════
const GREEN  = SQ.green;
const RED    = SQ.red;
const GOLD   = SQ.green;   // was amber; UI chrome is now green
const GREY   = SQ.neutral;

const GREEN_08=hexA(GREEN,0.08), GREEN_1 =hexA(GREEN,0.10), GREEN_12=hexA(GREEN,0.12),
      GREEN_3 =hexA(GREEN,0.30), GREEN_4 =hexA(GREEN,0.40), GREEN_6 =hexA(GREEN,0.60),
      GREEN_7 =hexA(GREEN,0.70), GREEN_75=hexA(GREEN,0.75);

const RED_08=hexA(RED,0.08), RED_1 =hexA(RED,0.10), RED_3 =hexA(RED,0.30),
      RED_55=hexA(RED,0.55), RED_6 =hexA(RED,0.60), RED_65=hexA(RED,0.65),
      RED_75=hexA(RED,0.75);

// ══════════════════════════════════════════════════════════════════════════════
// 4.  CHART.JS GLOBAL DEFAULTS
//     Applied once here — every chart inherits without extra options.
// ══════════════════════════════════════════════════════════════════════════════
const _SQ_FONT = { family: "'Courier New', Courier, monospace" };

Chart.defaults.color                               = SQ.muted;
Chart.defaults.borderColor                         = SQ.grid;
Chart.defaults.font.family                         = _SQ_FONT.family;
Chart.defaults.font.size                           = 11;

Chart.defaults.plugins.tooltip.backgroundColor    = SQ.tooltip.bg;
Chart.defaults.plugins.tooltip.borderColor        = SQ.tooltip.border;
Chart.defaults.plugins.tooltip.borderWidth        = 1;
Chart.defaults.plugins.tooltip.titleColor         = SQ.green;
Chart.defaults.plugins.tooltip.bodyColor          = SQ.text;
Chart.defaults.plugins.tooltip.padding            = 10;
Chart.defaults.plugins.tooltip.cornerRadius       = 0;
Chart.defaults.plugins.tooltip.titleFont          = { ..._SQ_FONT, size: 11, weight: '700' };
Chart.defaults.plugins.tooltip.bodyFont           = { ..._SQ_FONT, size: 11 };

Chart.defaults.plugins.legend.labels.color        = SQ.muted;
Chart.defaults.plugins.legend.labels.font         = { ..._SQ_FONT, size: 10 };
Chart.defaults.plugins.legend.labels.boxWidth     = 10;
Chart.defaults.plugins.legend.labels.padding      = 12;

Chart.defaults.scale.grid.color                   = SQ.grid;
Chart.defaults.scale.ticks.color                  = SQ.muted;
Chart.defaults.scale.ticks.font                   = { ..._SQ_FONT, size: 10 };
