// ══════════════════════════════════════════════════════════════════════════════
// REGIME TAB
// ══════════════════════════════════════════════════════════════════════════════

let _regimeInited = false;
let _regimeMacroCharts = {};   // key → Chart instance (for destroy-on-reinit)
let _regimeMacroRaw   = {};    // key → { values: float[], current: float }

async function initRegimeTab() {
  if (_regimeInited) return;
  _regimeInited = true;

  const container = document.getElementById('regime-content');
  container.innerHTML = `
    <div id="regime-loading" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:50vh;gap:16px;color:var(--muted)">
      <div class="spin"></div><span>Loading macro data…</span>
    </div>
    <div id="regime-body" style="display:none"></div>
  `;

  let macroData, model3m, model1y, detectData;

  // Fetch all sources in parallel — failures are non-fatal for optional sections
  try {
    [macroData, model3m, model1y, detectData] = await Promise.all([
      fetch(`./regime_macro.json?v=${_CV}`).then(r => { if (!r.ok) throw new Error('regime_macro.json not found'); return r.json(); }),
      fetch(`./model_lab_wbc_regime_3m.json?v=${_CV}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`./model_lab_wbc_regime_1y.json?v=${_CV}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`./regime_data.json?v=${_CV}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
  } catch (e) {
    document.getElementById('regime-loading').innerHTML =
      `<div style="color:var(--muted);font-size:14px;text-align:center;max-width:500px">
        <div style="color:var(--red);font-size:16px;margin-bottom:12px">Failed to load macro data</div>
        <div>${e.message}</div>
        <div style="margin-top:10px;font-size:12px">Run: <code>python scripts/export_regime_dashboard.py --no-push</code></div>
      </div>`;
    return;
  }

  document.getElementById('regime-loading').style.display = 'none';
  const body = document.getElementById('regime-body');
  body.style.cssText = 'display:block; padding: 0 16px';

  // Section 0: Historical Regime Detection (1971–present)
  if (detectData) _regimeBuildDetectionSection(body, detectData);

  // Section 0b: Rolling momentum models
  if (detectData && detectData.momentum_models) _regimeBuildMomentumModels(body, detectData.momentum_models);

  _regimeBuildMacroSection(body, macroData);
  _regimeBuildModelSection(body, model3m, model1y);
  _regimeBuildSimilaritySection(body, model1y);
}

// ── Regime zone helpers ────────────────────────────────────────────────────────

function _regimeZone(key, value) {
  if (value == null) return { label: '—', color: 'var(--muted)' };
  if (key === 'vix') {
    if (value < 15)  return { label: 'CALM',     color: 'var(--green)' };
    if (value < 25)  return { label: 'ELEVATED', color: SQ.amber };
    return                  { label: 'STRESS',   color: 'var(--red)' };
  }
  if (key === 'yield_curve') {
    if (value > 0.5)  return { label: 'NORMAL',        color: 'var(--green)' };
    if (value >= -0.5) return { label: 'FLAT',          color: SQ.amber };
    return                   { label: 'INVERTED',       color: 'var(--red)' };
  }
  if (key === 'dxy') {
    if (value > 106) return { label: 'STRONG USD', color: 'var(--red)' };
    if (value > 98)  return { label: 'NEUTRAL',    color: SQ.amber };
    return                  { label: 'WEAK USD',   color: 'var(--green)' };
  }
  if (key === 'commodity_regime') {
    if (value >= 2)  return { label: 'TAILWIND',   color: 'var(--green)' };
    if (value >= 0)  return { label: 'MIXED',      color: SQ.amber };
    if (value >= -2) return { label: 'HEADWIND',   color: SQ.orange };
    return                  { label: 'FULL DRAG',  color: 'var(--red)' };
  }
  // fallback: colour by percentile rank
  return null;   // caller will render pct bar instead
}

function _regimeZoneTip(key) {
  if (key === 'vix')               return 'VIX zone: CALM (<15) = low volatility, equity-bullish environment. ELEVATED (15–25) = caution, markets pricing increased risk. STRESS (>25) = crisis conditions — historically a strong gold safe-haven signal.';
  if (key === 'yield_curve')       return 'Yield curve zone: NORMAL (>0.5%) = healthy growth expectations. FLAT (−0.5 to 0.5%) = mixed outlook, uncertainty. INVERTED (<−0.5%) = classic recession warning signal — historically precedes gold safe-haven rallies.';
  if (key === 'dxy')               return 'USD zone: STRONG (>106) = dollar headwind — gold faces resistance as it becomes expensive for foreign buyers. NEUTRAL (98–106) = balanced. WEAK (<98) = dollar tailwind — gold typically benefits from USD weakness.';
  if (key === 'commodity_regime')  return 'Commodity Regime zone: TAILWIND (≥+2) = weak USD + strong AUD + rising copper — ideal environment for ASX resource stocks. MIXED (0 to +2) = partial alignment. HEADWIND (−2 to 0) = mostly adverse conditions. FULL DRAG (<−2) = all three legs working against resource stocks.';
  return 'Zone classification based on historical thresholds for this indicator.';
}

function _regimePctPill(pct) {
  if (pct == null) return '';
  const color = pct > 80 ? 'var(--red)' : pct < 20 ? 'var(--green)' : SQ.amber;
  return `<span style="font-size:10px;padding:2px 7px;border-radius:3px;background:rgba(0,0,0,0.4);border:1px solid ${color};color:${color};margin-left:8px">${Math.round(pct)}th pct</span>`;
}

// ── Threshold lines for specific charts (as extra datasets) ───────────────────

function _regimeThresholdDatasets(key, n) {
  const dummy = Array(n).fill(null);
  const make = (val, label) => ({
    label,
    data: Array(n).fill(val),
    borderColor: 'rgba(239,68,68,0.55)',
    borderWidth: 1.5,
    borderDash: [6, 4],
    pointRadius: 0,
    fill: false,
    tension: 0,
  });
  if (key === 'vix')         return [make(20, 'Elevated (20)'), make(30, 'Crisis (30)')];
  if (key === 'yield_curve') return [make(0, 'Inversion (0)'), make(-0.5, 'Deep inversion (-0.5)')];
  if (key === 'us10yr')           return [make(4.5, 'High rates (4.5)'), make(2.0, 'Low rates (2.0)')];
  if (key === 'commodity_regime') return [make(2, 'Tailwind (≥+2)'), make(0, 'Neutral (0)'), make(-2, 'Full drag (≤−2)')];
  return [];
}

// ── Zoom helper: snap chart to last N bars + update pct pill ──────────────────
function _regimeZoom(key, bars) {
  const chart = _regimeMacroCharts[key];
  if (!chart) return;
  const n = chart.data.labels.length;
  const minIdx = Math.max(0, n - bars);
  chart.zoomScale('x', { min: minIdx, max: n - 1 }, 'none');
  chart.update('none');
  _regimeUpdatePct(key, minIdx, n);
}

function _regimeUpdatePct(key, minIdx, n) {
  const raw = _regimeMacroRaw[key];
  if (!raw) return;
  const windowVals = raw.values.slice(minIdx, n);
  if (!windowVals.length) return;
  const cur = raw.current;
  const below = windowVals.filter(v => v <= cur).length;
  const pct = Math.round(below / windowVals.length * 100);
  const color = pct > 80 ? 'var(--red)' : pct < 20 ? 'var(--green)' : SQ.amber;
  const el = document.getElementById(`regime-pct-${key}`);
  if (el) {
    el.style.borderColor = color;
    el.style.color = color;
    el.textContent = `${pct}th pct`;
  }
}

// ── Multi-line chart card (shared date axis, multiple datasets) ───────────────

function _regimeToggleDataset(chartKey, datasetIndex) {
  const chart = _regimeMacroCharts[chartKey];
  if (!chart) return;
  const meta = chart.getDatasetMeta(datasetIndex);
  meta.hidden = !meta.hidden;
  chart.update();
  const box = document.getElementById(`regime-lgbox-${chartKey}-${datasetIndex}`);
  if (box) box.style.opacity = meta.hidden ? '0.2' : '1';
}

function _regimeBuildMultiLineCard(grid, cfg, series, fullWidth) {
  const card = document.createElement('div');
  card.className = 'chart-card';
  card.style.marginBottom = '0';
  if (fullWidth) card.style.gridColumn = '1 / -1';

  // Build unified sorted date axis and per-series value maps
  const allDates = new Set();
  const valueMaps = {};
  for (const key of cfg.seriesKeys) {
    const sd = series[key];
    if (sd && sd.history) {
      sd.history.forEach(h => allDates.add(h.date));
      valueMaps[key] = Object.fromEntries(sd.history.map(h => [h.date, h.value]));
    }
  }
  const labels = Array.from(allDates).sort();

  // Custom legend: clickable coloured boxes only, text beside
  const legendHtml = cfg.seriesKeys.map((key, i) => {
    const sd = series[key];
    const cur = sd ? sd.current : null;
    const color = cfg.seriesColors[i];
    const label = cfg.seriesLabels[key];
    const curStr = cur != null ? (cfg.fmt ? cfg.fmt(cur) : cur.toFixed(2)) : '—';
    return `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;margin-bottom:3px">
      <span id="regime-lgbox-${cfg.key}-${i}"
        onclick="_regimeToggleDataset('${cfg.key}',${i})"
        style="width:22px;height:10px;background:${color};border-radius:2px;cursor:pointer;display:inline-block;flex-shrink:0;transition:opacity 0.15s"
        title="Toggle ${label}"></span>
      <span style="font-size:10px;color:#9ca3af;white-space:nowrap">${label}: <b style="color:#d1d5db">${curStr}</b></span>
    </span>`;
  }).join('');

  const canvasId = `regime-chart-${cfg.key}`;
  card.innerHTML = `
    <div style="margin-bottom:6px">
      <span class="chart-title tip" style="margin-bottom:0" data-tip="${cfg.tip}">${cfg.title}</span>
    </div>
    <div style="margin-bottom:8px;flex-wrap:wrap;display:flex">${legendHtml}</div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
      ${[['1M',21],['3M',63],['6M',126],['1Y',252],['2Y',504],['5Y',1260],['All',99999]].map(([r,b]) =>
        `<button onclick="_regimeZoomMulti('${cfg.key}',${b})" style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid #333;background:#111;color:var(--muted);cursor:pointer" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='#333'">${r}</button>`
      ).join('')}
    </div>
    <div class="chart-wrap" style="height:${cfg.fullWidth ? '480px' : '240px'};cursor:crosshair"><canvas id="${canvasId}"></canvas></div>
  `;
  grid.appendChild(card);

  requestAnimationFrame(() => {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !labels.length) return;
    if (_regimeMacroCharts[cfg.key]) _regimeMacroCharts[cfg.key].destroy();

    const datasets = cfg.seriesKeys.map((key, i) => ({
      label: cfg.seriesLabels[key],
      data: labels.map(d => valueMaps[key]?.[d] ?? null),
      borderColor: cfg.seriesColors[i],
      borderWidth: 1.8,
      pointRadius: 0,
      fill: false,
      tension: 0.2,
      spanGaps: true,
      ...(cfg.dualAxis ? { yAxisID: cfg.dualAxis.right.includes(key) ? 'y1' : 'y' } : {}),
    }));

    const ctx = canvas.getContext('2d');
    _regimeMacroCharts[cfg.key] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              title: items => {
                const d = new Date(items[0].label);
                return isNaN(d) ? items[0].label : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
              },
              label: item => {
                const v = item.raw;
                return `  ${item.dataset.label}: ${cfg.fmt ? cfg.fmt(v) : (v != null ? v.toFixed(2) : '—')}`;
              },
            },
          },
          zoom: {
            pan:  { enabled: true, mode: 'x' },
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
          },
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 6, maxRotation: 0, font: { size: 10 },
              callback: function(val) {
                const label = this.getLabelForValue(val);
                if (!label) return '';
                const d = new Date(label);
                return isNaN(d) ? label : d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
              },
            },
            grid: { color: SQ.grid },
          },
          y: {
            grid: { color: SQ.grid },
            ticks: { font: { size: 10 }, maxTicksLimit: 6, callback: v => cfg.fmt ? cfg.fmt(v) : v },
          },
          ...(cfg.dualAxis ? {
            y1: {
              position: 'right',
              grid: { drawOnChartArea: false },
              ticks: { font: { size: 10 }, maxTicksLimit: 6, color: '#666', callback: v => v.toFixed(0) },
            }
          } : {}),
        },
      },
    });
  });
}

function _regimeZoomMulti(key, bars) {
  const chart = _regimeMacroCharts[key];
  if (!chart) return;
  if (bars >= 99999) { chart.resetZoom(); }
  else {
    const n = chart.data.labels.length;
    chart.zoomScale('x', { min: Math.max(0, n - bars), max: n - 1 }, 'none');
  }
  chart.update('none');
}

// ── Section 1: Macro Regime Tracker ──────────────────────────────────────────

function _regimeBuildMacroSection(container, macroData) {
  const series = macroData.series || {};
  const genAt  = macroData.generated_at ? macroData.generated_at.slice(0, 16).replace('T', ' ') + ' UTC' : '';

  const chartConfigs = [
    { key: 'vix',         title: 'VIX — Fear Index',        fmt: v => v.toFixed(2),        tip: 'CBOE Volatility Index — measures expected 30-day equity market volatility. Below 20 = calm, 20–30 = elevated risk, above 30 = crisis/stress. Gold tends to rally when VIX spikes as investors seek safe havens.' },
    { key: 'us10yr',      title: 'US 10yr Yield (%)',        fmt: v => v.toFixed(3) + '%',  tip: 'US 10-year Treasury yield — the global risk-free rate. Rising yields strengthen USD and pressure gold (opportunity cost of holding a non-yielding asset). Watch for reversals at multi-year extremes.' },
    { key: 'yield_curve', title: 'Yield Curve (10yr − 3m)',  fmt: v => v.toFixed(3) + '%',  tip: '10yr minus 3-month Treasury yield spread. Positive = normal (growth expected); near zero = flat (uncertainty); negative = inverted (classic recession warning). Inversions often precede risk-off conditions and gold safe-haven rallies.' },
    { key: 'dxy',         title: 'DXY — US Dollar Index',    fmt: v => v.toFixed(2),        tip: 'Trade-weighted USD vs major currencies. Gold priced in USD — weak dollar makes gold cheaper for foreign buyers, boosting demand. Above 106 = historically strong USD headwind for gold.' },
    { key: 'audusd',      title: 'AUD / USD',                fmt: v => v.toFixed(5),        tip: 'Australian Dollar vs USD. AUD is a commodity-linked, risk-on currency — strengthens when global growth is expected and commodity demand is high. Weak AUD can signal domestic risk-off conditions and amplify AUD-denominated gold returns.' },
    {
      key: 'aud_usd_basket_ratio',
      title: 'AUD/Basket vs USD/Basket (rebased to 100)',
      multiLine: true,
      seriesKeys:   ['aud_per_basket', 'usd_per_basket'],
      seriesLabels: { aud_per_basket: 'AUD / Basket', usd_per_basket: 'USD (DXY) / Basket' },
      seriesColors: [GREEN, RED],
      fmt: v => v.toFixed(1),
      tip: 'Purchasing power of each currency relative to Australia\'s export commodity basket, both rebased to 100 at start. Falling AUD/basket = AUD losing ground vs commodity prices (export boom not captured by the currency — domestic drag). Falling USD/basket = commodities getting more expensive in USD terms (commodity inflation signal). When both fall together, commodities are outpacing all currencies.',
    },
    { key: 'gold',        title: 'Gold (USD/oz)',             fmt: v => '$' + v.toFixed(0),  tip: 'Spot gold price (USD/oz, front-month futures). Primary driver for gold miners. Moves are driven by: USD strength, real interest rates, central bank buying, and safe-haven demand during crises.' },
    { key: 'oil',         title: 'Oil — Brent Crude (USD)',   fmt: v => '$' + v.toFixed(2),  tip: 'Brent crude price (USD/barrel). Proxy for global economic growth and inflation expectations. High oil = inflationary pressures, potential rate hikes. The gold/oil ratio (below) strips out oil moves to show gold\'s relative safe-haven premium.' },
    { key: 'gold_oil',    title: 'Gold / Oil Ratio',          fmt: v => v.toFixed(2),        tip: 'Gold price divided by Brent crude — how many barrels of oil one ounce of gold can buy. Rising ratio = gold outperforming energy = risk-off, safe-haven regime. Falling ratio = growth/inflation regime favouring commodities.' },
    {
      key: 'basket_with_currencies',
      title: 'Export Basket + AUD/Basket + USD/Basket',
      multiLine: true,
      seriesKeys:   ['commodity_basket', 'aud_per_basket', 'usd_per_basket'],
      seriesLabels: { commodity_basket: 'Commodity Basket (L)', aud_per_basket: 'AUD/Basket (R)', usd_per_basket: 'USD/Basket (R)' },
      seriesColors: [GOLD, GREEN, RED],
      fmt: v => v.toFixed(1),
      tip: 'Export-weighted commodity basket (left axis) alongside AUD/basket and USD/basket ratios (right axis) — all rebased to 100. Shows whether each currency is keeping pace with Australia\'s export prices. When the basket rises while AUD/basket falls, the currency is losing purchasing power relative to what Australia exports — export revenue is growing but the currency isn\'t benefiting.',
      dualAxis: { right: ['aud_per_basket', 'usd_per_basket'] },
    },
    {
      key: 'commodity_components',
      title: 'Export Commodities — Individual (rebased to 100)',
      multiLine: true,
      seriesKeys:   ['iron_ore_idx', 'coal_idx', 'oil_idx', 'gold_idx', 'copper_idx'],
      seriesLabels: { iron_ore_idx: 'Iron Ore (40%)', coal_idx: 'Coal (26%)', oil_idx: 'LNG/Oil (20%)', gold_idx: 'Gold (10%)', copper_idx: 'Copper (4%)' },
      seriesColors: [GOLD, '#666', '#00d4ff', GREEN, RED],
      fmt: v => v.toFixed(1),
      tip: 'All five major export commodities rebased to 100 at their earliest common date. When lines move together the commodity cycle is broad-based. Divergence reveals different demand drivers — e.g. gold surging while iron ore falls signals safe-haven demand without Chinese growth, which benefits gold miners but not the iron ore majors (BHP, RIO, FMG).',
      fullWidth: true,
    },
    {
      key: 'asx_sectors',
      title: 'ASX Sector Rotation (rebased to 100)',
      multiLine: true,
      seriesKeys:   ['asx200_idx','asx_mat_idx','asx_egy_idx','asx_fin_idx','asx_hc_idx','asx_ind_idx','asx_disc_idx','asx_stap_idx','asx_tech_idx','asx_util_idx','asx_prop_idx','asx_gold_idx'],
      seriesLabels: { asx200_idx:'ASX 200', asx_mat_idx:'Materials', asx_egy_idx:'Energy', asx_fin_idx:'Financials', asx_hc_idx:'Health Care', asx_ind_idx:'Industrials', asx_disc_idx:'Cons. Discretionary', asx_stap_idx:'Cons. Staples', asx_tech_idx:'Technology', asx_util_idx:'Utilities', asx_prop_idx:'Property', asx_gold_idx:'Gold Index' },
      seriesColors: ['#ffffff','#f5a520','#fa3e3e','#2D88FF','#00ff41','#9b59b6','#f7b928','#00d4ff','#e056cf','#aaaaaa','#ff7043','#ffd700'],
      fmt: v => v.toFixed(1),
      tip: 'All ASX sector indices rebased to 100 at their earliest common date (~4 years). Shows which sectors are leading or lagging the broad market. Toggle individual sectors to compare. Materials and Energy reflect commodity exposure directly; Financials track RBA rate cycle; Gold Index is the pure gold miner benchmark.',
      fullWidth: true,
    },
  ];

  // Section header
  const header = document.createElement('div');
  header.innerHTML = `
    <div class="section-divider" style="margin-top:8px">
      <div class="section-divider-line"></div>
      <span class="section-divider-label tip" data-tip="Daily macro snapshots from live market data. Use these signals to assess the current macro environment before interpreting model signals. Each chart shows 2 years of daily history with the current reading, percentile rank, and key threshold levels.">Macro Regime Tracker</span>
      <div class="section-divider-line"></div>
    </div>
    ${genAt ? `<div style="font-size:11px;color:var(--muted);margin-bottom:16px">Data as at ${genAt}</div>` : ''}
  `;
  container.appendChild(header);

  // 2-column grid
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:20px;margin-bottom:32px';
  container.appendChild(grid);

  // Responsive: single column on narrow screens
  const mq = window.matchMedia('(max-width:800px)');
  const applyMQ = () => { grid.style.gridTemplateColumns = mq.matches ? '1fr' : 'repeat(2,1fr)'; };
  applyMQ();
  mq.addEventListener('change', applyMQ);

  chartConfigs.forEach(cfg => {
    if (cfg.multiLine) {
      _regimeBuildMultiLineCard(grid, cfg, series, cfg.fullWidth);
      return;
    }
    const sd = series[cfg.key];
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.style.marginBottom = '0';

    const cur  = sd ? sd.current  : null;
    const pct  = sd ? sd.pct_rank : null;
    const lo   = sd ? sd.wk52_low  : null;
    const hi   = sd ? sd.wk52_high : null;
    const curStr = (cur != null && cfg.fmt) ? cfg.fmt(cur) : '—';

    const zone = _regimeZone(cfg.key, cur);
    let zoneHtml = '';
    if (zone) {
      zoneHtml = `<span style="font-size:10px;padding:2px 8px;border-radius:3px;background:rgba(0,0,0,0.4);border:1px solid ${zone.color};color:${zone.color};margin-left:8px;letter-spacing:0.5px">${zone.label}</span>`;
    } else if (pct != null) {
      // pct bar for series without zone labels
      const barColor = pct > 80 ? 'var(--red)' : pct < 20 ? 'var(--green)' : SQ.amber;
      zoneHtml = `<div style="margin-top:6px;display:flex;align-items:center;gap:8px">
        <div style="flex:1;height:4px;background:#222;border-radius:2px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${barColor};border-radius:2px"></div>
        </div>
        <span style="font-size:10px;color:${barColor};white-space:nowrap">${Math.round(pct)}th pct</span>
      </div>`;
    }

    const rangeHtml = (lo != null && hi != null)
      ? `<span style="font-size:10px;color:var(--muted)">10yr: ${cfg.fmt ? cfg.fmt(lo) : lo} – ${cfg.fmt ? cfg.fmt(hi) : hi}</span>`
      : '';

    const canvasId = `regime-chart-${cfg.key}`;
    const resetId  = `regime-reset-${cfg.key}`;
    const pctTip = 'Percentile rank dynamically updates to reflect the currently selected time window. Green = historically low (<20th), yellow = mid-range, red = historically elevated (>80th) — all relative to the visible period.';
    const rangeTip = 'Min and max reading over the full 10-year history. Fixed reference regardless of zoom level.';
    const pctColor = pct > 80 ? 'var(--red)' : pct < 20 ? 'var(--green)' : SQ.amber;
    card.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:2px;flex-wrap:wrap">
        <span class="chart-title tip" style="margin-bottom:0" data-tip="${cfg.tip}">${cfg.title}</span>
        <span style="font-size:16px;font-weight:700;color:var(--gold);font-family:monospace">${curStr}</span>
        <span class="tip" data-tip="${pctTip}">
          <span id="regime-pct-${cfg.key}" style="font-size:10px;padding:2px 7px;border-radius:3px;background:rgba(0,0,0,0.4);border:1px solid ${pctColor};color:${pctColor};margin-left:8px">${pct != null ? Math.round(pct)+'th pct' : '—'}</span>
        </span>
        ${zoneHtml && zone ? `<span class="tip" data-tip="${_regimeZoneTip(cfg.key)}">${zoneHtml}</span>` : ''}
      </div>
      ${!zone && zoneHtml ? zoneHtml : ''}
      ${rangeHtml ? `<div class="tip" style="margin-bottom:6px" data-tip="${rangeTip}">${rangeHtml}</div>` : '<div style="margin-bottom:6px"></div>'}
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
        ${[['1M',21],['3M',63],['6M',126],['1Y',252],['2Y',504],['5Y',1260],['10Y',2520]].map(([r,b]) => `<button onclick="_regimeZoom('${cfg.key}',${b})" style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid #333;background:#111;color:var(--muted);cursor:pointer" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='#333'">${r}</button>`).join('')}
        <button id="${resetId}" onclick="_regimeMacroCharts['${cfg.key}']?.resetZoom();_regimeUpdatePct('${cfg.key}',0,_regimeMacroRaw['${cfg.key}']?.values?.length||0)" style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid #333;background:#111;color:var(--muted);cursor:pointer" onmouseover="this.style.borderColor='#555'" onmouseout="this.style.borderColor='#333'">All</button>
        <span style="font-size:10px;color:#444;margin-left:4px">scroll/drag · pct updates with view</span>
      </div>
      <div class="chart-wrap" style="height:216px;cursor:crosshair"><canvas id="${canvasId}"></canvas></div>
    `;
    grid.appendChild(card);

    // Build chart after DOM insertion
    requestAnimationFrame(() => {
      const canvas = document.getElementById(canvasId);
      if (!canvas || !sd || !sd.history || !sd.history.length) return;

      const labels = sd.history.map(h => h.date);
      const values = sd.history.map(h => h.value);
      const thresholds = _regimeThresholdDatasets(cfg.key, labels.length);

      // Destroy previous if re-initing
      if (_regimeMacroCharts[cfg.key]) {
        _regimeMacroCharts[cfg.key].destroy();
      }

      const ctx = canvas.getContext('2d');
      // Store raw data for dynamic pct recalculation on zoom
      _regimeMacroRaw[cfg.key] = { values, current: cur };

      _regimeMacroCharts[cfg.key] = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: cfg.title,
              data: values,
              borderColor: GOLD,
              borderWidth: 1.8,
              pointRadius: 0,
              fill: false,
              tension: 0.2,
            },
            ...thresholds,
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: thresholds.length > 0, labels: { boxWidth: 10, font: { size: 10 }, filter: item => item.datasetIndex > 0 } },
            tooltip: {
              mode: 'index',
              intersect: false,
              callbacks: {
                title: items => {
                  const raw = items[0].label;
                  const d = new Date(raw);
                  return isNaN(d) ? raw : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
                },
                label: item => {
                  if (item.datasetIndex !== 0) return null;
                  const v = item.raw;
                  return `  ${cfg.title}: ${cfg.fmt ? cfg.fmt(v) : (v != null ? v.toFixed(4) : '—')}`;
                },
                filter: item => item.datasetIndex === 0,
              },
            },
            zoom: {
              pan:  { enabled: true,  mode: 'x' },
              zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
            },
          },
          scales: {
            x: {
              ticks: {
                maxTicksLimit: 5,
                maxRotation: 0,
                font: { size: 10 },
                callback: function(val, idx) {
                  const label = this.getLabelForValue(val);
                  if (!label) return '';
                  const d = new Date(label);
                  if (isNaN(d)) return label;
                  return d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
                },
              },
              grid: { color: SQ.grid },
            },
            y: {
              grid: { color: SQ.grid },
              ticks: { font: { size: 10 }, maxTicksLimit: 6, callback: v => cfg.fmt ? cfg.fmt(v) : v },
            },
          },
        },
      });
    });
  });
}

// ── Section 2: Regime Model Intelligence ──────────────────────────────────────

function _regimeBuildModelSection(container, model3m, model1y) {
  const header = document.createElement('div');
  header.innerHTML = `
    <div class="section-divider" style="margin-top:8px">
      <div class="section-divider-line"></div>
      <span class="section-divider-label tip" data-tip="Regime-weighted feature analysis from WBC.AX regime models. These models use a Gaussian kernel to assign higher weight to IS training windows where macro conditions closely matched the current environment — isolating features that work specifically in today's regime.">Regime Model Intelligence — WBC.AX</span>
      <div class="section-divider-line"></div>
    </div>
  `;
  container.appendChild(header);

  if (!model3m && !model1y) {
    const msg = document.createElement('div');
    msg.style.cssText = 'color:var(--muted);font-size:13px;padding:20px 0';
    msg.textContent = 'Regime model files not found (model_lab_wbc_regime_3m.json / model_lab_wbc_regime_1y.json).';
    container.appendChild(msg);
    return;
  }

  const feats3m = (model3m && model3m.features) ? model3m.features : [];
  const feats1y = (model1y && model1y.features) ? model1y.features : [];

  // Build lookup for 1Y by name
  const map1y = {};
  feats1y.forEach(f => { map1y[f.name] = f; });

  // Merge: use 3m as primary, annotate with 1y values
  const merged = feats3m.map(f => ({
    ...f,
    p_value_1y:    map1y[f.name] ? map1y[f.name].p_value    : null,
    p_delta_1y:    map1y[f.name] ? map1y[f.name].p_delta     : null,
    sign_pct_1y:   map1y[f.name] ? map1y[f.name].sign_pct    : null,
  }));

  // Sort by lowest 3m p_value (most significant first)
  const sorted = merged.slice().sort((a, b) => (a.p_value ?? 1) - (b.p_value ?? 1));
  const top15  = sorted.slice(0, 15);

  // ── 1. Feature significance table ─────────────────────────────────────────
  const tableWrap = document.createElement('div');
  tableWrap.innerHTML = `
    <div class="tip" style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px" data-tip="Features ranked by weighted t-test p-value. Regime weighting amplifies time periods where macro conditions matched today — so a low p-value here means the feature has statistically significant edge in regimes similar to now. Green = p < 0.05 (significant), yellow = marginal (0.05–0.20), grey = no evidence of edge.">
      Top Features by Significance (3M Regime Model)
    </div>
    <div style="overflow-x:auto;margin-bottom:28px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid #2a2a2a">
            <th class="tip" style="text-align:left;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace" data-tip="Feature name — prefix indicates type: macro_ = macroeconomic variable, mom_ = price momentum, vol_ = volatility, ann_ = earnings announcement, ix_ = interaction term.">Feature</th>
            <th class="tip" style="text-align:left;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace" data-tip="Feature category. Macro = driven by external economic conditions. Momentum = price trend signals. Announcement = earnings/guidance events (valuable — hard to overfit). Interaction = product of two features.">Category</th>
            <th class="tip" style="text-align:right;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace" data-tip="Weighted p-value from 3-month lookback regime model. Measures how likely the observed edge is due to chance. p < 0.05 = 95% confidence the feature has real edge in similar regimes. p < 0.01 = very strong signal.">3M p-val</th>
            <th class="tip" style="text-align:right;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace" data-tip="Regime gain (p_delta): unweighted p-value minus regime-weighted p-value. Positive = feature became MORE significant when training was restricted to similar macro regimes. Large positive delta = this feature's edge is regime-specific, not universal.">3M Δ</th>
            <th class="tip" style="text-align:right;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace" data-tip="Same p-value metric from the 1-year lookback regime model. Comparing 3M vs 1Y shows whether the signal is robust across different reference windows. Agreement between both = higher confidence.">1Y p-val</th>
            <th class="tip" style="text-align:right;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace" data-tip="Regime gain from the 1-year model. Larger delta in 1Y vs 3M suggests the feature's regime-sensitivity is visible even on a longer lookback.">1Y Δ</th>
            <th class="tip" style="text-align:right;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace" data-tip="Sign consistency: percentage of IS windows where this feature predicted the same direction. >70% = reliable directional signal. ~50% = sign-flipper (noisy, may be capturing non-linear effects). <30% = contrarian signal.">Sign%</th>
          </tr>
        </thead>
        <tbody id="regime-feat-tbody"></tbody>
      </table>
    </div>
  `;
  container.appendChild(tableWrap);

  const tbody = document.getElementById('regime-feat-tbody');
  tbody.innerHTML = top15.map((f, i) => {
    const bg = i % 2 === 0 ? '' : 'background:#0d0d0d';
    const pColor = p => p == null ? 'var(--muted)' : p < 0.05 ? 'var(--green)' : p < 0.20 ? SQ.amber : 'var(--muted)';
    const pFmt   = p => p == null ? '—' : p.toFixed(3);
    const dFmt   = d => d == null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(3);
    const catColor = {
      macro: '#60a5fa', momentum: '#c084fc', volume: '#34d399',
      volatility: '#fb923c', trend: '#f472b6', candle: '#a8a29e',
      interaction: '#818cf8', announcement: SQ.amber,
    };
    const catC = catColor[f.category] || 'var(--muted)';
    return `<tr style="border-bottom:1px solid #1a1a1a;${bg}">
      <td style="padding:6px 10px;font-family:monospace;font-size:11px">${f.name}</td>
      <td style="padding:6px 10px"><span style="font-size:10px;color:${catC}">${f.category || '—'}</span></td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:${pColor(f.p_value)}">${pFmt(f.p_value)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:var(--muted)">${dFmt(f.p_delta)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:${pColor(f.p_value_1y)}">${pFmt(f.p_value_1y)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:var(--muted)">${dFmt(f.p_delta_1y)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:var(--muted)">${f.sign_pct != null ? f.sign_pct + '%' : '—'}</td>
    </tr>`;
  }).join('');

  // ── 2. Regime gain chart ───────────────────────────────────────────────────
  const gainWrap = document.createElement('div');
  gainWrap.innerHTML = `
    <div class="tip" style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px" data-tip="p_delta = unweighted p-value minus regime-weighted p-value. A large positive bar means the feature's statistical significance dramatically improved when we filtered to macro environments similar to today. These are the features most 'activated' by the current regime — prioritise them in your trading thesis.">
      Top Features by Regime Gain (3M p_delta — how much regime weighting helped)
    </div>
    <div class="chart-card" style="margin-bottom:28px">
      <div style="height:280px;cursor:crosshair"><canvas id="regime-gain-chart"></canvas></div>
    </div>
  `;
  container.appendChild(gainWrap);

  // Top 10 by p_delta (largest delta = most regime-sensitive)
  const byDelta = merged.slice()
    .filter(f => f.p_delta != null)
    .sort((a, b) => (b.p_delta ?? 0) - (a.p_delta ?? 0))
    .slice(0, 10)
    .reverse();  // horizontal bar: bottom = highest

  requestAnimationFrame(() => {
    const gainCtx = document.getElementById('regime-gain-chart');
    if (!gainCtx || !byDelta.length) return;
    new Chart(gainCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: byDelta.map(f => f.name),
        datasets: [{
          label: 'p_delta (regime vs flat)',
          data: byDelta.map(f => f.p_delta != null ? parseFloat(f.p_delta.toFixed(4)) : 0),
          backgroundColor: byDelta.map(f => (f.p_delta || 0) > 0.1 ? 'rgba(245,165,32,0.75)' : 'rgba(245,165,32,0.35)'),
          borderColor: GOLD,
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: item => `p_delta: +${item.raw.toFixed(4)}` } },
        },
        scales: {
          x: { beginAtZero: true, grid: { color: SQ.grid }, ticks: { font: { size: 10 } } },
          y: { grid: { display: false }, ticks: { font: { size: 11, family: 'monospace' } } },
        },
      },
    });
  });

  // ── 3. 3M vs 1Y agreement table ───────────────────────────────────────────
  const agreeWrap = document.createElement('div');
  agreeWrap.innerHTML = `
    <div class="tip" style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px" data-tip="Features that reached statistical significance (p < 0.05) in at least one regime model. AGREE = validated by both 3M and 1Y lookback windows — these are the most robust signals. '3M only' or '1Y only' means the feature may be more sensitive to recent vs longer-term regime cycles.">
      3M vs 1Y Model Agreement (p &lt; 0.05)
    </div>
    <div style="overflow-x:auto;margin-bottom:32px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid #2a2a2a">
            <th style="text-align:left;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">Feature</th>
            <th class="tip" style="text-align:center;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace" data-tip="Statistically significant (p < 0.05) in the 3-month lookback regime model — i.e., this feature has edge when macro conditions similar to the last 3 months are used as the reference.">3M sig</th>
            <th class="tip" style="text-align:center;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace" data-tip="Statistically significant (p < 0.05) in the 1-year lookback regime model — uses a broader 12-month macro reference window, giving a more stable but less responsive regime signal.">1Y sig</th>
            <th class="tip" style="text-align:center;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace" data-tip="AGREE = both models find this feature significant — highest confidence, trade with conviction. '3M only' = recent regime-specific signal, may be noise or a new regime shift. '1Y only' = longer-term regime signal, may lag current conditions.">Agreement</th>
          </tr>
        </thead>
        <tbody id="regime-agree-tbody"></tbody>
      </table>
    </div>
  `;
  container.appendChild(agreeWrap);

  // Features significant in at least one model
  const agreeFeats = merged
    .filter(f => (f.p_value != null && f.p_value < 0.05) || (f.p_value_1y != null && f.p_value_1y < 0.05))
    .sort((a, b) => (a.p_value ?? 1) - (b.p_value ?? 1))
    .slice(0, 20);

  const agreeTbody = document.getElementById('regime-agree-tbody');
  agreeTbody.innerHTML = agreeFeats.map((f, i) => {
    const bg = i % 2 === 0 ? '' : 'background:#0d0d0d';
    const sig3m = f.p_value != null && f.p_value < 0.05;
    const sig1y = f.p_value_1y != null && f.p_value_1y < 0.05;
    const both  = sig3m && sig1y;
    const agreeColor = both ? 'var(--green)' : SQ.amber;
    const agreeLabel = both ? 'AGREE' : sig3m ? '3M only' : '1Y only';
    const check = v => v ? `<span style="color:var(--green)">✓</span>` : `<span style="color:#333">—</span>`;
    return `<tr style="border-bottom:1px solid #1a1a1a;${bg}">
      <td style="padding:6px 10px;font-family:monospace;font-size:11px">${f.name}</td>
      <td style="padding:6px 10px;text-align:center">${check(sig3m)}</td>
      <td style="padding:6px 10px;text-align:center">${check(sig1y)}</td>
      <td style="padding:6px 10px;text-align:center"><span style="font-size:10px;padding:1px 8px;border-radius:3px;background:rgba(0,0,0,0.4);border:1px solid ${agreeColor};color:${agreeColor}">${agreeLabel}</span></td>
    </tr>`;
  }).join('');
}


// ── Section 3: Historical Regime Similarity ────────────────────────────────────
// Uses regime_weights from 1Y model (objects with macro_state, z-scores, weight).
// Visuals: top-3 summary cards, similarity timeline, radar fingerprint, weight-vs-macro scatters.

function _regimeBuildSimilaritySection(container, model1y) {
  if (!model1y) return;
  const rw = Array.isArray(model1y.regime_weights) ? model1y.regime_weights : [];
  const windows = rw.filter(w => w && w.macro_state_z && w.weight != null);
  if (!windows.length) return;

  const sorted    = [...windows].sort((a, b) => b.weight - a.weight);
  const COLS      = ['macro_vix', 'macro_dxy', 'macro_us10yr', 'macro_audusd', 'macro_gold'];
  const COL_LABEL = { macro_vix: 'VIX', macro_dxy: 'DXY', macro_us10yr: 'US10yr', macro_audusd: 'AUD/USD', macro_gold: 'Gold' };
  const COL_FMT   = {
    macro_vix:    v => v.toFixed(1),
    macro_dxy:    v => v.toFixed(1),
    macro_us10yr: v => v.toFixed(2) + '%',
    macro_audusd: v => v.toFixed(4),
    macro_gold:   v => '$' + Math.round(v),
  };
  const WIN_COLORS = ['#f5a520', '#c08030', '#888888', '#555555', '#333333'];

  // Section header
  const hdr = document.createElement('div');
  hdr.innerHTML = `
    <div class="section-divider" style="margin-top:8px">
      <div class="section-divider-line"></div>
      <span class="section-divider-label tip" data-tip="Visualises which historical macro periods most closely resembled today. Based on the 1Y Regime Similarity model — Gaussian kernel on 5 macro variables (VIX, DXY, US10yr, AUD/USD, Gold). Higher weight = that year was training data most relevant to current conditions.">Historical Regime Similarity — 1Y Model</span>
      <div class="section-divider-line"></div>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:20px;line-height:1.6">
      Which years in history looked most like today's macro environment?
      Gaussian kernel on VIX · DXY · US 10yr · AUD/USD · Gold · &sigma; = ${model1y.sigma != null ? model1y.sigma : 1.5}
    </div>
  `;
  container.appendChild(hdr);

  // Top 3 similar periods summary cards
  const top3 = sorted.slice(0, 3);
  const cardsWrap = document.createElement('div');
  cardsWrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-bottom:24px';
  cardsWrap.innerHTML = top3.map((w, i) => {
    const year  = (w.window_end || '').slice(0, 4);
    const pct   = (w.weight * 100).toFixed(1);
    const dist  = w.sq_distance != null ? w.sq_distance.toFixed(1) : '—';
    const state = w.macro_state || {};
    const bc    = i === 0 ? 'rgba(245,165,32,0.10)' : i === 1 ? 'rgba(192,128,48,0.06)' : 'rgba(80,80,80,0.06)';
    const tc    = WIN_COLORS[i];
    const rows  = COLS.map(c => {
      const raw = state[c];
      const z   = w.macro_state_z ? w.macro_state_z[c] : null;
      const zStr = z != null ? ' <span style="color:#444;font-size:10px">(z=' + (z >= 0 ? '+' : '') + z.toFixed(2) + ')</span>' : '';
      return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #111;font-size:11px">'
        + '<span style="color:var(--muted)">' + COL_LABEL[c] + '</span>'
        + '<span style="font-family:monospace;color:#ccc">' + (raw != null ? COL_FMT[c](raw) : '—') + zStr + '</span>'
        + '</div>';
    }).join('');
    const rank = ['#1 Most Similar', '#2 Most Similar', '#3 Most Similar'][i];
    return '<div class="chart-card" style="padding:16px;border-color:' + tc + '44;background:' + bc + '">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;flex-wrap:wrap;gap:8px">'
      + '<div>'
      + '<div style="font-size:22px;font-weight:700;color:' + tc + ';font-family:monospace">' + year + '</div>'
      + '<div style="font-size:10px;color:var(--muted);letter-spacing:0.5px">' + rank + '</div>'
      + '</div>'
      + '<div style="text-align:right">'
      + '<div class="tip" style="font-size:24px;font-weight:800;color:' + tc + '" data-tip="' + pct + '% of total regime weight assigned to this window. Higher = more macro-similar to today.">' + pct + '%</div>'
      + '<div class="tip" style="font-size:10px;color:var(--muted)" data-tip="Squared distance in z-score space. Lower = more similar to today. 0 = identical macro environment.">dist&sup2; = ' + dist + '</div>'
      + '</div></div>'
      + rows + '</div>';
  }).join('');
  container.appendChild(cardsWrap);

  // Timeline + Radar side by side
  const chartGrid = document.createElement('div');
  chartGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px';
  container.appendChild(chartGrid);

  const timelineCard = document.createElement('div');
  timelineCard.className = 'chart-card';
  timelineCard.innerHTML = '<div class="chart-title tip" style="margin-bottom:4px" data-tip="How much regime similarity weight each historical training window receives. Taller bars = that year\'s macro environment closely matched today\'s. The model trusts features that worked in those years more heavily.">Similarity Timeline</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">% of total weight per annual training window</div>'
    + '<div style="height:230px"><canvas id="regime-sim-timeline"></canvas></div>';
  chartGrid.appendChild(timelineCard);

  const radarCard = document.createElement('div');
  radarCard.className = 'chart-card';
  const radarSubtitle = top3.map((w, i) => '<span style="color:' + WIN_COLORS[i] + '">' + (w.window_end || '').slice(0, 4) + '</span>').join(' · ');
  radarCard.innerHTML = '<div class="chart-title tip" style="margin-bottom:4px" data-tip="The macro z-score profile of the top 3 most similar historical windows. Each axis = one regime variable in standard deviations from the 18yr IS mean. Outward = above average; inward = below. Overlapping shapes = similar macro conditions.">Macro Fingerprint — Top 3 Periods</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">z-score vs 18yr IS mean · ' + radarSubtitle + '</div>'
    + '<div style="height:230px"><canvas id="regime-radar"></canvas></div>';
  chartGrid.appendChild(radarCard);

  // Weight vs Macro scatter grid
  const scatterHdr = document.createElement('div');
  scatterHdr.innerHTML = '<div class="tip" style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:14px" data-tip="For each regime variable, shows how the macro value at each historical window relates to the similarity weight that window received. Bigger brighter dots = higher weight. Reveals which macro value ranges the model considers similar to today.">'
    + 'Regime Weight vs Macro Value</div>';
  container.appendChild(scatterHdr);

  const scatterGrid = document.createElement('div');
  scatterGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px;margin-bottom:40px';
  container.appendChild(scatterGrid);

  COLS.forEach((col, ci) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.style.cssText = 'padding:14px;margin-bottom:0';
    card.innerHTML = '<div class="tip" style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px" data-tip="X = ' + COL_LABEL[col] + ' value at that window\'s end date. Y = % similarity weight. Larger brighter dots = higher-weight windows.">'
      + COL_LABEL[col] + ' vs Weight</div>'
      + '<div style="height:155px"><canvas id="regime-scatter-' + ci + '"></canvas></div>';
    scatterGrid.appendChild(card);
  });

  // Build all charts after DOM insertion
  requestAnimationFrame(() => {

    // 1. Timeline bar chart
    const tlCtx = document.getElementById('regime-sim-timeline');
    if (tlCtx) {
      const labels   = windows.map(w => (w.window_end || '').slice(0, 4));
      const wts      = windows.map(w => parseFloat((w.weight * 100).toFixed(2)));
      const maxW     = Math.max.apply(null, wts.concat([0.01]));
      const bgC = wts.map(w => { const t = w/maxW; return 'rgba('+Math.round(40+t*205)+','+Math.round(40+t*125)+','+Math.round(Math.max(0,40-t*8))+','+(0.4+t*0.6)+')'; });
      const bdC = wts.map(w => (w/maxW) > 0.2 ? '#f5a520' : '#2a2a2a');
      new Chart(tlCtx.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets: [{ data: wts, backgroundColor: bgC, borderColor: bdC, borderWidth: 1, borderRadius: 3 }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function(ctx) {
              const w = windows[ctx.dataIndex]; const s = w.macro_state || {};
              return ['Weight: '+ctx.raw.toFixed(1)+'%  (dist\u00B2='+(w.sq_distance!=null?w.sq_distance.toFixed(1):'—')+')',
                'VIX: '+(s.macro_vix!=null?s.macro_vix.toFixed(1):'—'),
                'DXY: '+(s.macro_dxy!=null?s.macro_dxy.toFixed(1):'—'),
                'US10yr: '+(s.macro_us10yr!=null?s.macro_us10yr.toFixed(2):'—')+'%',
                'AUD/USD: '+(s.macro_audusd!=null?s.macro_audusd.toFixed(4):'—'),
                'Gold: $'+(s.macro_gold!=null?Math.round(s.macro_gold):'—')];
            }}}
          },
          scales: {
            x: { ticks: { font: { size: 9 }, color: '#666', maxRotation: 45 }, grid: { display: false } },
            y: { ticks: { font: { size: 9 }, color: '#666', callback: function(v) { return v.toFixed(0)+'%'; } }, grid: { color: SQ.grid } }
          }
        }
      });
    }

    // 2. Radar chart
    const radarCtx = document.getElementById('regime-radar');
    if (radarCtx) {
      const radarLabels = COLS.map(c => COL_LABEL[c]);
      const datasets = top3.map((w, i) => ({
        label: (w.window_end||'').slice(0,4)+'  '+(w.weight*100).toFixed(1)+'%',
        data: COLS.map(c => parseFloat(((w.macro_state_z&&w.macro_state_z[c]!=null?w.macro_state_z[c]:0)).toFixed(2))),
        borderColor: WIN_COLORS[i],
        backgroundColor: ['rgba(245,165,32,0.12)','rgba(192,128,48,0.07)','rgba(120,120,120,0.04)'][i],
        borderWidth: i === 0 ? 2.5 : 1.5,
        pointRadius: 3,
        pointBackgroundColor: WIN_COLORS[i],
        pointBorderColor: WIN_COLORS[i],
      }));
      new Chart(radarCtx.getContext('2d'), {
        type: 'radar',
        data: { labels: radarLabels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: true, labels: { font: { size: 10 }, color: '#888', boxWidth: 10, padding: 8 } } },
          scales: {
            r: {
              min: -3, max: 3,
              ticks: { stepSize: 1, font: { size: 8 }, color: '#555', backdropColor: 'transparent' },
              grid: { color: '#1e1e1e' },
              angleLines: { color: '#2a2a2a' },
              pointLabels: { font: { size: 10 }, color: '#888' },
            }
          }
        }
      });
    }

    // 3. Scatter plots
    COLS.forEach(function(col, ci) {
      const ctx = document.getElementById('regime-scatter-'+ci);
      if (!ctx) return;
      const pts = windows.map(w => ({ x: parseFloat((w.macro_state&&w.macro_state[col]!=null?w.macro_state[col]:0).toFixed(4)), y: parseFloat((w.weight*100).toFixed(2)), _year: (w.window_end||'').slice(0,4) }));
      const maxW = Math.max.apply(null, pts.map(p=>p.y).concat([0.01]));
      const bgC = pts.map(p => { const t=p.y/maxW; return 'rgba('+Math.round(40+t*205)+','+Math.round(40+t*125)+','+Math.round(Math.max(0,40-t*8))+','+(0.5+t*0.5)+')'; });
      const bdC = pts.map(p => (p.y/maxW)>0.2?'#f5a520':'#2a2a2a');
      const radii = pts.map(p => Math.round(3+(p.y/maxW)*7));
      new Chart(ctx.getContext('2d'), {
        type: 'scatter',
        data: { datasets: [{ data: pts, backgroundColor: bgC, borderColor: bdC, borderWidth: 1, pointRadius: radii, pointHoverRadius: radii.map(r=>r+3) }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function(ctx2) { return [ctx2.raw._year+': '+ctx2.raw.y.toFixed(1)+'% ('+COL_FMT[col](ctx2.raw.x)+')']; } } }
          },
          scales: {
            x: { ticks: { font: { size: 9 }, color: '#555', maxTicksLimit: 4 }, grid: { color: '#111' } },
            y: { ticks: { font: { size: 9 }, color: '#555', maxTicksLimit: 4, callback: function(v) { return v.toFixed(0)+'%'; } }, grid: { color: '#111' } }
          }
        }
      });
    });

  }); // end requestAnimationFrame
}


// ══════════════════════════════════════════════════════════════════════════════
// Section 0 — Historical Macro Regime Detection (1971–present)
// Loaded from regime_data.json (output of scripts/run_regime_analysis.py)
// ══════════════════════════════════════════════════════════════════════════════

const _RD_COLORS = {
  STAGFLATION:  '#f97316',
  GOLD_BULL:    SQ.amber,
  CRISIS:       '#ef4444',
  RISK_ON:      '#22c55e',
  TIGHTENING:   '#3b82f6',
  DEFLATION_QE: '#a855f7',
  TRANSITION:   '#555555',
};

function _rdColor(regime, alpha) {
  const hex = _RD_COLORS[regime] || '#888888';
  if (!alpha) return hex;
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

let _regimeDetectChart = null;

function _regimeBuildDetectionSection(container, d) {
  const cr     = d.current_regime || {};
  const labels = d.regime_labels  || {};
  const ts     = d.timeseries     || {};
  const dates  = ts.dates  || [];
  const simMap = ts.sim    || {};
  const macro  = ts.macro  || {};

  // ── Section header ─────────────────────────────────────────────────────────
  const hdr = document.createElement('div');
  hdr.innerHTML = `
    <div class="section-divider" style="margin-top:8px">
      <div class="section-divider-line"></div>
      <span class="section-divider-label tip" data-tip="Cosine-similarity regime detection across 1971–present using daily macro data. Each period is classified as the closest match to 6 named archetype vectors (Stagflation, Gold Bull, Crisis, Risk-On, Tightening, Deflation/QE). Transition = no archetype dominates. Smoothed over ~9 months to suppress noise.">
        Historical Macro Regime Detection  ·  1971–present
      </span>
      <div class="section-divider-line"></div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:18px">
      Generated ${d.generated || '—'}  ·  Data from 1971  ·  ${dates.length} monthly samples
      ·  <span style="font-size:10px">Smoothing: 189-day rolling average of cosine similarity scores</span>
    </div>
  `;
  container.appendChild(hdr);

  // ── Current regime card ────────────────────────────────────────────────────
  const regime   = cr.regime || 'TRANSITION';
  const regLabel = cr.regime_label || regime;
  const conf     = cr.confidence != null ? (cr.confidence * 100).toFixed(0) + '%' : '—';
  const regColor = _RD_COLORS[regime] || '#888';
  const topRegs  = (cr.top_regimes || []).slice(0, 3);
  const readings = cr.key_readings || {};
  const inTrans  = cr.in_transition;

  const topBars = topRegs.map(([r, s]) => {
    const pct = (s * 100).toFixed(0);
    const c   = _RD_COLORS[r] || '#888';
    return `<div style="margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <span style="font-size:11px;color:${c}">${labels[r] || r}</span>
        <span style="font-size:11px;font-family:monospace;color:${c}">${s.toFixed(3)}</span>
      </div>
      <div style="height:4px;background:#1a1a1a;border-radius:2px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${c};border-radius:2px"></div>
      </div>
    </div>`;
  }).join('');

  const readingRows = Object.entries(readings).map(([k, v]) => {
    const lbl = { real_rate:'Real Rate', yield_curve:'Yield Curve', gold_mom_z:'Gold Mom (z)',
                  spx_mom_z:'SPX Mom (z)', vol_regime_z:'Vol/VIX (z)',
                  dxy_mom_z:'DXY Mom (z)', cpi_accel_z:'CPI Accel (z)' }[k] || k;
    if (v == null) return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #111">
      <span style="font-size:11px;color:var(--muted)">${lbl}</span>
      <span style="font-size:11px;font-family:monospace;color:#444">—</span>
    </div>`;
    const col = k === 'vol_regime_z' ? (v > 1.5 ? '#ef4444' : v > 0 ? SQ.amber : '#22c55e')
               : k === 'real_rate'   ? (v < 0 ? '#22c55e' : v > 2 ? '#ef4444' : SQ.amber)
               : (v >= 0 ? '#22c55e' : '#ef4444');
    return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #111">
      <span style="font-size:11px;color:var(--muted)">${lbl}</span>
      <span style="font-size:11px;font-family:monospace;color:${col}">${v >= 0 ? '+' : ''}${v.toFixed(2)}</span>
    </div>`;
  }).join('');

  const curCard = document.createElement('div');
  curCard.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px';
  curCard.innerHTML = `
    <div class="chart-card" style="border-color:${regColor}55;background:${_rdColor(regime,0.06)}">
      <div style="font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Current Regime</div>
      <div style="font-size:28px;font-weight:800;color:${regColor};font-family:monospace;line-height:1.1;margin-bottom:6px">${regLabel}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px">
        Confidence: <span style="color:${regColor};font-weight:700">${conf}</span>
        ${inTrans ? `<span style="margin-left:8px;font-size:10px;color:#f5c842;border:1px solid #f5c84255;padding:1px 6px;border-radius:3px">TRANSITIONING</span>` : ''}
      </div>
      <div style="font-size:10px;color:var(--muted)">AS AT ${cr.date || '—'}</div>
    </div>
    <div class="chart-card">
      <div style="font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">Similarity Scores</div>
      ${topBars}
    </div>
    <div class="chart-card">
      <div style="font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Key Readings (z-scores)</div>
      ${readingRows}
    </div>
  `;
  container.appendChild(curCard);

  // ── Similarity scores timeseries chart ────────────────────────────────────
  const simChartWrap = document.createElement('div');
  simChartWrap.innerHTML = `
    <div class="tip" style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px"
         data-tip="Smoothed cosine similarity to each regime archetype over time. Higher = stronger match to that regime's macro fingerprint. Transition periods = no single regime exceeds 0.22 confidence. Drag/scroll to zoom.">
      Regime Similarity Scores  ·  1971–present
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px" id="rd-sim-toggles"></div>
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
      ${[['5Y',260],['10Y',520],['20Y',1040],['All',99999]].map(([r,b])=>
        `<button onclick="_rdZoom(${b})" style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid #333;background:#111;color:var(--muted);cursor:pointer" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='#333'">${r}</button>`
      ).join('')}
    </div>
    <div class="chart-card" style="margin-bottom:24px">
      <div class="chart-wrap" style="height:340px;cursor:crosshair"><canvas id="rd-sim-chart"></canvas></div>
    </div>
  `;
  container.appendChild(simChartWrap);

  // ── Macro series charts ────────────────────────────────────────────────────
  const macroSectionHdr = document.createElement('div');
  macroSectionHdr.innerHTML = `
    <div class="tip" style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px"
         data-tip="Raw macro series driving the regime detection. Monthly sampled for performance. Drag/scroll to zoom any chart.">
      Underlying Macro Series  ·  1971–present
    </div>
  `;
  container.appendChild(macroSectionHdr);

  const macroGrid = document.createElement('div');
  macroGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px';
  container.appendChild(macroGrid);

  const macroCfgs = [
    { key:'gold',        label:'Gold (USD/oz)',          fmt: v=>'$'+Math.round(v),               color:SQ.amber, log:true  },
    { key:'spx',         label:'S&P 500',                fmt: v=>Math.round(v).toLocaleString(),  color:'#22c55e', log:true  },
    { key:'asx200',      label:'ASX 200',                fmt: v=>Math.round(v).toLocaleString(),  color:'#38bdf8', log:true  },
    { key:'vix',         label:'VIX (stitched)',          fmt: v=>v.toFixed(1),                    color:'#ef4444', log:false },
    { key:'yield_curve', label:'Yield Curve (10yr−3mo)',  fmt: v=>v.toFixed(2)+'%',               color:'#34d399', log:false },
    { key:'real_rate',   label:'Real Rate (10yr−CPI)',    fmt: v=>v.toFixed(2)+'%',               color:'#60a5fa', log:false },
    { key:'cpi_yoy',     label:'CPI YoY %',              fmt: v=>v.toFixed(1)+'%',               color:'#f97316', log:false },
  ];

  macroCfgs.forEach(cfg => {
    if (!macro[cfg.key]) return;
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.style.marginBottom = '0';
    card.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">${cfg.label}</div>
      <div class="chart-wrap" style="height:200px;cursor:crosshair"><canvas id="rd-macro-${cfg.key}"></canvas></div>
    `;
    macroGrid.appendChild(card);
  });

  // ── Historical periods table ───────────────────────────────────────────────
  const periods = (d.periods || []).filter(p => p.duration_days > 90 && p.regime !== 'TRANSITION');
  const periodsWrap = document.createElement('div');
  periodsWrap.innerHTML = `
    <div class="tip" style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px"
         data-tip="All sustained regime periods >90 days, excluding transition. Avg score = mean cosine similarity to the winning archetype during that period.">
      Historical Regime Periods  ·  &gt;90 days
    </div>
    <div style="overflow-x:auto;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid #2a2a2a">
            <th style="text-align:left;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">Regime</th>
            <th style="text-align:left;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">Start</th>
            <th style="text-align:left;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">End</th>
            <th style="text-align:right;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">Duration</th>
            <th style="text-align:right;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">Avg Score</th>
          </tr>
        </thead>
        <tbody id="rd-periods-tbody"></tbody>
      </table>
    </div>
  `;
  container.appendChild(periodsWrap);

  // ── Regime definitions ─────────────────────────────────────────────────────
  const regimeDefs = [
    { r:'STAGFLATION',  desc:'Oil spike + high inflation + negative real rates + weak equities + strong gold. Classic 1970s conditions. Gold miners and commodities outperform; equities and bonds both suffer.', ex:'1973–74 Arab oil embargo, 1979–82 Volcker era' },
    { r:'GOLD_BULL',    desc:'Gold outperforming on weak USD + low/negative real rates. Not necessarily a crisis — can be a slow structural USD debasement cycle. Gold miners outperform. Equities often positive but lag gold.', ex:'2001–07 post dot-com gold bull, 2018–20' },
    { r:'CRISIS',       desc:'VIX spike + equity crash + yield curve flattening or inversion. Sharp short-duration events. Safe-haven flows into gold and treasuries. Opportunities in gold miners after initial vol flush.', ex:'1987 Black Monday, 2008–09 GFC, 2020 COVID' },
    { r:'RISK_ON',      desc:'Equities up + low vol + moderate rates + gold neutral. Classic bull market conditions. Broad equity outperformance. Gold underperforms equities but remains stable.', ex:'1995–99 tech boom, 2012–15, 2017, 2023–24' },
    { r:'TIGHTENING',   desc:'Fed hiking fast + rising DXY + falling equities + weak gold. Rate-shock regime. Gold faces headwinds from rising real rates and USD strength. Short-dated bonds outperform.', ex:'1994–95, 2004–06, 2022 Volcker echo' },
    { r:'DEFLATION_QE', desc:'Zero/near-zero rates + QE + equities recovering + elevated gold + low CPI. Post-crisis QE era. Gold benefits from money printing expectations. Growth stocks outperform.', ex:'2009–15 QE era, 2020–21 COVID QE' },
  ];

  const defsWrap = document.createElement('div');
  defsWrap.innerHTML = `
    <div class="tip" style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px"
         data-tip="Each regime is defined as a unit vector in 15-dimensional feature space. The classifier computes cosine similarity between the current feature vector and each archetype, then smooths over ~9 months (189 business days).">
      Regime Definitions
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:24px">
      ${regimeDefs.map(def => {
        const c = _RD_COLORS[def.r] || '#888';
        return `<div class="chart-card" style="border-left:3px solid ${c};padding:14px 14px 14px 16px">
          <div style="font-size:13px;font-weight:700;color:${c};margin-bottom:6px">${labels[def.r] || def.r}</div>
          <div style="font-size:11px;color:#9ca3af;line-height:1.5;margin-bottom:6px">${def.desc}</div>
          <div style="font-size:10px;color:#555">Examples: ${def.ex}</div>
        </div>`;
      }).join('')}
    </div>
  `;
  container.appendChild(defsWrap);

  // ── Data sources & methodology ─────────────────────────────────────────────
  const methodWrap = document.createElement('div');
  methodWrap.innerHTML = `
    <div class="tip" style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px"
         data-tip="Data sources and methodology used by the regime detection model.">
      Data Sources &amp; Methodology
    </div>
    <div class="chart-card" style="margin-bottom:32px">
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:20px;font-size:11px;color:#9ca3af;line-height:1.7">
        <div>
          <div style="color:var(--gold);font-weight:700;margin-bottom:6px">Data Sources</div>
          <div><span style="color:#555">Gold spot (1971+)</span> — Stooq XAUUSD daily</div>
          <div><span style="color:#555">S&amp;P 500 (1927+)</span> — yfinance ^GSPC</div>
          <div><span style="color:#555">ASX 200 (1992+)</span> — yfinance ^AXJO</div>
          <div><span style="color:#555">DXY (1971+)</span> — yfinance DX-Y.NYB</div>
          <div><span style="color:#555">US 10yr yield (1962+)</span> — yfinance ^TNX</div>
          <div><span style="color:#555">US 3mo T-bill (1982+)</span> — yfinance ^IRX</div>
          <div><span style="color:#555">VIX actual (1990+)</span> — yfinance ^VIX</div>
          <div><span style="color:#555">VIX synthetic (pre-1990)</span> — Parkinson vol × 1/0.76 · r=0.886 vs actual</div>
          <div><span style="color:#555">WTI oil (1986+)</span> — FRED DCOILWTICO</div>
          <div><span style="color:#555">CPI YoY (1947+)</span> — FRED CPIAUCSL</div>
          <div><span style="color:#555">Fed Funds (1954+)</span> — FRED FEDFUNDS</div>
        </div>
        <div>
          <div style="color:var(--gold);font-weight:700;margin-bottom:6px">Methodology</div>
          <div><b style="color:#ccc">Features (15)</b> — rolling z-scored: gold momentum (20d/63d), SPX momentum, vol regime, real rate, yield curve spread, CPI acceleration, DXY momentum, gold/SPX ratio, VIX percentile</div>
          <div style="margin-top:8px"><b style="color:#ccc">Classification</b> — cosine similarity to 6 named archetype vectors. 189-day rolling average (≈9 months) to smooth rapid flickering. Transition = max similarity below 0.22 threshold</div>
          <div style="margin-top:8px"><b style="color:#ccc">Synthetic VIX</b> — Parkinson realised vol (21-day) × calibration 1/0.76. Calibrated vs actual VIX 1990–2026 (r = 0.886)</div>
          <div style="margin-top:8px"><b style="color:#ccc">Limitations</b> — Regimes are gradual transitions, not instant flips. Labels may revise as smoothing window fills. Pre-1982 data has thinner coverage (no 3mo yield, no real VIX)</div>
        </div>
      </div>
    </div>
  `;
  container.appendChild(methodWrap);

  // ── Build all charts after DOM ─────────────────────────────────────────────
  requestAnimationFrame(() => {

    // Similarity scores chart
    const simCanvas  = document.getElementById('rd-sim-chart');
    const togglesEl  = document.getElementById('rd-sim-toggles');
    if (simCanvas && dates.length) {
      const regimeKeys = Object.keys(simMap);
      const datasets   = regimeKeys.map(r => ({
        label:           labels[r] || r,
        data:            simMap[r],
        borderColor:     _RD_COLORS[r] || '#888',
        backgroundColor: _rdColor(r, 0.07),
        borderWidth: 1.8,
        pointRadius: 0,
        fill: false,
        tension: 0.3,
        spanGaps: true,
      }));

      if (togglesEl) {
        regimeKeys.forEach((r, i) => {
          const c   = _RD_COLORS[r] || '#888';
          const btn = document.createElement('button');
          btn.dataset.active = 'true';
          btn.style.cssText  = `display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:4px;border:1px solid ${c};background:${c}22;color:${c};font-size:10px;font-family:monospace;font-weight:600;cursor:pointer;transition:opacity 0.15s,background 0.15s`;
          btn.innerHTML = `<span style="display:inline-block;width:12px;height:1.5px;background:${c};flex-shrink:0"></span>${labels[r] || r}`;
          btn.onclick = () => {
            const next = btn.dataset.active !== 'true';
            btn.dataset.active  = String(next);
            btn.style.background = next ? `${c}22` : 'transparent';
            btn.style.opacity   = next ? '1' : '0.35';
            if (_regimeDetectChart) { _regimeDetectChart.setDatasetVisibility(i, next); _regimeDetectChart.update(); }
          };
          togglesEl.appendChild(btn);
        });
      }

      if (_regimeDetectChart) _regimeDetectChart.destroy();
      _regimeDetectChart = new Chart(simCanvas.getContext('2d'), {
        type: 'line',
        data: { labels: dates, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              mode: 'index', intersect: false,
              callbacks: {
                title: items => { const d = new Date(items[0].label); return isNaN(d) ? items[0].label : d.toLocaleDateString('en-AU',{month:'short',year:'numeric'}); },
                label: item  => `  ${item.dataset.label}: ${item.raw != null ? item.raw.toFixed(3) : '—'}`,
              },
            },
            zoom: { pan: { enabled:true, mode:'x' }, zoom: { wheel:{enabled:true}, pinch:{enabled:true}, mode:'x' } },
          },
          scales: {
            x: {
              ticks: { maxTicksLimit:12, maxRotation:0, font:{size:10}, callback: function(val) { const l=this.getLabelForValue(val); if(!l) return ''; const d=new Date(l); return isNaN(d)?l:d.toLocaleDateString('en-AU',{month:'short',year:'2-digit'}); } },
              grid: { color:SQ.grid },
            },
            y: { min:0, max:1, grid:{color:SQ.grid}, ticks:{font:{size:10},maxTicksLimit:5} },
          },
        },
      });
    }

    // Macro series charts
    macroCfgs.forEach(cfg => {
      const vals = macro[cfg.key];
      if (!vals) return;
      const canvas = document.getElementById(`rd-macro-${cfg.key}`);
      if (!canvas) return;
      new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: dates, datasets: [{ data:vals, borderColor:cfg.color, borderWidth:1.5, pointRadius:0, fill:false, tension:0.2, spanGaps:true }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: items => { const d = new Date(items[0].label); return isNaN(d) ? items[0].label : d.toLocaleDateString('en-AU',{month:'short',year:'numeric'}); },
                label: item  => `  ${cfg.label}: ${cfg.fmt ? cfg.fmt(item.raw) : (item.raw != null ? item.raw.toFixed(2) : '—')}`,
              },
            },
            zoom: { pan:{enabled:true,mode:'x'}, zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x'} },
          },
          scales: {
            x: { ticks:{maxTicksLimit:8,maxRotation:0,font:{size:9},callback:function(val){const l=this.getLabelForValue(val);if(!l) return '';const d=new Date(l);return isNaN(d)?l:d.getFullYear();}}, grid:{color:'#111'} },
            y: { type: cfg.log ? 'logarithmic' : 'linear', grid:{color:'#111'}, ticks:{font:{size:9},maxTicksLimit:5,callback:v=>cfg.fmt?cfg.fmt(v):v} },
          },
        },
      });
    });

    // Periods table
    const tbody = document.getElementById('rd-periods-tbody');
    if (tbody && periods.length) {
      tbody.innerHTML = periods.map((p, i) => {
        const c   = _RD_COLORS[p.regime] || '#888';
        const lbl = labels[p.regime] || p.regime;
        const mo  = Math.round(p.duration_days / 30);
        const bg  = i % 2 === 0 ? '' : 'background:#0d0d0d';
        return `<tr style="border-bottom:1px solid #1a1a1a;${bg}">
          <td style="padding:6px 10px">
            <span style="display:inline-flex;align-items:center;gap:6px">
              <span style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0"></span>
              <span style="font-size:11px;color:${c};font-weight:600">${lbl}</span>
            </span>
          </td>
          <td style="padding:6px 10px;font-family:monospace;font-size:11px;color:#9ca3af">${p.start}</td>
          <td style="padding:6px 10px;font-family:monospace;font-size:11px;color:#9ca3af">${p.end}</td>
          <td style="padding:6px 10px;text-align:right;font-family:monospace;font-size:11px;color:#9ca3af">${mo}mo</td>
          <td style="padding:6px 10px;text-align:right;font-family:monospace;font-size:11px;color:#555">${p.avg_score ? p.avg_score.toFixed(3) : '—'}</td>
        </tr>`;
      }).join('');
    }

  }); // end requestAnimationFrame
}

function _rdZoom(bars) {
  if (!_regimeDetectChart) return;
  if (bars >= 99999) { _regimeDetectChart.resetZoom(); return; }
  const n = _regimeDetectChart.data.labels.length;
  _regimeDetectChart.zoomScale('x', { min: Math.max(0, n - bars), max: n - 1 }, 'none');
  _regimeDetectChart.update('none');
}

// ══════════════════════════════════════════════════════════════════════════════
// Rolling Momentum Models — 3 charts per model (3m + 6m)
//   Chart 1: Coefficients     — sensitivity (S&P response per 1σ of feature)
//   Chart 2: Contributions    — coef × current feature z-score (actual impact)
//   Chart 3: T-statistics     — coefficient reliability (signal vs noise)
// No regime labels given — patterns emerge from the data.
// ══════════════════════════════════════════════════════════════════════════════

// Key macro events — shown as vertical lines on momentum model charts
const _MM_EVENTS = [
  { date:'1973-10-17', label:'Oil Crisis',       color:'#f97316' },
  { date:'1979-01-16', label:'Iran Rev.',         color:'#f97316' },
  { date:'1980-06-01', label:'Volcker Peak',      color:'#3b82f6' },
  { date:'1987-10-19', label:'Black Monday',      color:'#ef4444' },
  { date:'1990-08-02', label:'Gulf War',          color:'#f97316' },
  { date:'1994-02-04', label:'Rate Shock',        color:'#3b82f6' },
  { date:'1997-07-02', label:'Asia Crisis',       color:'#ef4444' },
  { date:'1998-09-23', label:'LTCM',              color:'#ef4444' },
  { date:'2000-03-10', label:'.com Peak',         color:'#a855f7' },
  { date:'2001-09-11', label:'9/11',              color:'#ef4444' },
  { date:'2003-03-20', label:'Iraq War',          color:'#f97316' },
  { date:'2007-07-01', label:'Subprime',          color:'#ef4444' },
  { date:'2008-09-15', label:'Lehman',            color:'#ef4444' },
  { date:'2011-08-05', label:'US Downgrade',      color:'#f97316' },
  { date:'2013-05-22', label:'Taper Tantrum',     color:'#3b82f6' },
  { date:'2015-08-24', label:'China Deval.',      color:'#f97316' },
  { date:'2018-10-01', label:'Q4 Selloff',        color:'#ef4444' },
  { date:'2020-03-23', label:'COVID Low',         color:'#ef4444' },
  { date:'2022-02-24', label:'Ukraine',           color:'#f97316' },
  { date:'2022-03-16', label:'Rate Hikes',        color:'#3b82f6' },
  { date:'2023-03-10', label:'SVB',               color:'#ef4444' },
];

// Find nearest date string in array to a target date
function _mmNearestDate(dates, target) {
  const td = new Date(target).getTime();
  let best = dates[0], bestDiff = Infinity;
  for (const d of dates) {
    const diff = Math.abs(new Date(d).getTime() - td);
    if (diff < bestDiff) { bestDiff = diff; best = d; }
  }
  return best;
}

const _MM_COLORS = {
  gold_mom:         '#22c55e',   // green
  dxy_mom:          '#60a5fa',   // blue
  oil_mom:          '#f97316',   // orange
  vix_chg:          '#ef4444',   // red
  yield_curve_chg:  '#e879f9',   // fuchsia
  real_rate_chg:    '#a78bfa',   // purple
  cpi_accel:        SQ.amber,   // amber
  ff_chg:           '#2dd4bf',   // teal
  unemp_chg:        '#fb923c',   // light orange
  // V2 enhanced features
  cape_chg:         '#d8b4fe',   // lavender
  hy_spread_chg:    '#fda4af',   // rose
  copper_mom:       '#d97706',   // copper/brown
  m2_chg:           '#7dd3fc',   // sky blue
  ism_chg:          '#bef264',   // lime
  // Legacy names (backward compat)
  vix:              '#ef4444',
  yield_curve:      '#e879f9',
  real_rate:        '#a78bfa',
  cpi_yoy:          SQ.amber,
  cape:             '#d8b4fe',
  m2_yoy:           '#7dd3fc',
};
const _MM_LABELS = {
  gold_mom:         'Gold Mom',
  dxy_mom:          'DXY Mom',
  oil_mom:          'Oil Mom',
  vix_chg:          'VIX Δ',
  yield_curve_chg:  'Yield Curve Δ',
  real_rate_chg:    'Real Rate Δ',
  cpi_accel:        'CPI Accel',
  ff_chg:           'Fed Funds Δ',
  unemp_chg:        'Unemp Δ',
  cape_chg:         'PE Ratio Δ',
  hy_spread_chg:    'Credit Spread Δ',
  copper_mom:       'Copper Mom',
  m2_chg:           'M2 Δ',
  ism_chg:          'ISM Δ',
  // Legacy
  vix:              'VIX',
  yield_curve:      'Yield Curve',
  real_rate:        'Real Rate',
  cpi_yoy:          'CPI YoY',
  cape:             'PE Ratio',
  m2_yoy:           'M2 Growth',
};

const _MM_TIPS = {
  // Coefficients predict S&P 500 forward returns.
  // Positive coefficient = this macro condition predicts S&P gains over the next N months.
  // Negative coefficient = this condition predicts S&P weakness.
  gold_mom:         'Gold Momentum — 21-day % change in gold spot price (USD). Positive = gold has been rising. A positive coefficient means gold momentum predicts S&P gains at that window (risk-on confluence). Negative = gold rising as safe-haven while equities fall.',
  dxy_mom:          'DXY Momentum — 21-day % change in the US Dollar Index. A negative coefficient is the norm: strong USD predicts weaker S&P (tightening financial conditions, risk-off). Sign flip = unusual growth regime where USD and equities move together.',
  oil_mom:          'Oil Momentum — 21-day % change in WTI crude oil price. Excluded in extended models (data only from 1986). Positive coefficient = oil rising on demand strength, bullish for equities. Negative = oil as inflation shock, headwind.',
  vix_chg:          'VIX Change — 21-day change in CBOE VIX (pp). Negative coefficient is the norm: rising fear predicts S&P weakness. Positive = contrarian signal — fear spike followed by recovery (central bank put regime).',
  yield_curve_chg:  'Yield Curve Change — 21-day change in 10yr−3mo spread (pp). Positive = steepening predicts S&P gains (growth regime building). Negative = flattening/inversion predicts weakness (recession signal active).',
  real_rate_chg:    'Real Rate Change — 21-day change in real rate (10yr yield − CPI YoY, pp). Negative is the norm: rising real rates are a headwind for equities (competition from bonds). Sign flip = growth regime where rates and stocks rise together.',
  cpi_accel:        'CPI Acceleration — 21-day change in CPI YoY % (pp). Negative = re-accelerating inflation predicts S&P weakness (tightening risk). Positive = disinflation regime where falling inflation is bullish for equities.',
  ff_chg:           'Fed Funds Change — 21-day change in US Federal Funds Rate (pp). Negative is the norm: Fed hiking predicts S&P weakness. Positive coefficient (unusual) = cuts are already priced in, or market in "good news is good news" regime.',
  unemp_chg:        'Unemployment Change — 21-day change in US Unemployment Rate (pp). Negative = rising unemployment predicts S&P weakness (recession). Positive = rising unemployment predicts gains (Fed cutting regime, bad news = good news).',
  cape_chg:         'PE Ratio Change — 21-day change in S&P 500 trailing PE. Positive = valuation expansion momentum predicts further gains (momentum regime). Negative = valuation stretch predicts mean-reversion.',
  hy_spread_chg:    'Credit Spread Change — 21-day change in US HY spread (pp). Negative = widening credit spreads predict S&P weakness (financial stress). One of the best leading indicators of equity drawdowns.',
  copper_mom:       'Copper Momentum — 21-day % change in copper futures. Positive = industrial demand expanding, growth regime = bullish for equities. Divergence from gold (copper up, gold flat) is the cleanest growth signal.',
  m2_chg:           'M2 Change — 21-day change in M2 YoY % (pp). Positive = liquidity expansion predicts S&P gains. Captures the monetary stimulus signal. M2 contraction (2022) was a leading warning for the equity selloff.',
  ism_chg:          'ISM PMI Change — 21-day change in ISM Manufacturing PMI. Positive = manufacturing accelerating, growth regime = bullish for equities. PMI is one of the most reliable leading indicators of economic direction.',
  // Legacy names (backward compat)
  vix:              'VIX Level — CBOE Volatility Index (fear gauge). Legacy level feature.',
  yield_curve:      'Yield Curve Level — US 10yr minus 3mo yield spread (%). Legacy level feature.',
  real_rate:        'Real Rate Level — US 10yr yield minus CPI YoY (%). Legacy level feature.',
  cpi_yoy:          'CPI YoY Level — US Consumer Price Index, year-over-year % change. Legacy level feature.',
  cape:             'PE Ratio Level — S&P 500 trailing Price-to-Earnings ratio. Legacy level feature.',
  m2_yoy:           'M2 YoY Level — US M2 money supply year-over-year % change. Legacy level feature.',
};

function _mmMakeChart(container, id, label, tip, dates, feats, dataMap, yFmt, height, showEvents) {
  const togglesId = id + '-togs';
  const wrap = document.createElement('div');
  wrap.style.marginBottom = '20px';
  wrap.innerHTML = `
    <div class="tip" style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px"
         data-tip="${tip}">${label}</div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:7px" id="${togglesId}"></div>
    <div class="chart-card" style="margin-bottom:0">
      <div class="chart-wrap" style="height:${height}px;cursor:crosshair"><canvas id="${id}"></canvas></div>
    </div>
  `;
  container.appendChild(wrap);

  requestAnimationFrame(() => {
    const canvas = document.getElementById(id);
    const togsEl = document.getElementById(togglesId);
    if (!canvas) return;

    const datasets = feats.map(f => ({
      label:           _MM_LABELS[f] || f,
      data:            dataMap[f] || [],
      borderColor:     _MM_COLORS[f] || '#888',
      backgroundColor: 'transparent',
      borderWidth:     1.1,
      pointRadius:     0,
      fill:            false,
      tension:         0.25,
      spanGaps:        true,
    }));
    datasets.push({ label:'_zero', data: dates.map(()=>0), borderColor:'#2a2a2a', borderWidth:1,
                    borderDash:[3,3], pointRadius:0, fill:false, tension:0 });

    // Build event annotations
    const dateStart = dates.length ? new Date(dates[0]).getTime() : 0;
    const dateEnd   = dates.length ? new Date(dates[dates.length-1]).getTime() : Infinity;
    const annotations = {};
    if (showEvents) {
      _MM_EVENTS.forEach((ev, i) => {
        const evT = new Date(ev.date).getTime();
        if (evT < dateStart || evT > dateEnd) return;
        const nearest = _mmNearestDate(dates, ev.date);
        annotations[`ev${i}`] = {
          type: 'line',
          xMin: nearest, xMax: nearest,
          borderColor: ev.color + '77',
          borderWidth: 1,
          borderDash: [3, 3],
          label: {
            display: true,
            content: ev.label,
            position: 'start',
            color: ev.color + 'cc',
            font: { size: 8 },
            rotation: -90,
            backgroundColor: 'transparent',
            padding: 2,
            yAdjust: 4,
          },
        };
      });
    }

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: dates, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode:'index', intersect:false },
        plugins: {
          legend: { display: false },
          annotation: { annotations },
          tooltip: {
            mode:'index', intersect:false,
            filter: item => item.dataset.label !== '_zero',
            callbacks: {
              title: items => { const d = new Date(items[0].label); return isNaN(d) ? items[0].label : d.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}); },
              label: item => {
                if (item.dataset.label === '_zero') return null;
                const v = item.raw;
                return `  ${item.dataset.label}: ${v != null ? yFmt(v) : '—'}`;
              },
            },
          },
          zoom: { pan:{enabled:true,mode:'x'}, zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x'} },
        },
        scales: {
          x: { ticks:{ maxTicksLimit:12, maxRotation:0, font:{size:9},
                       callback: function(val){ const l=this.getLabelForValue(val); if(!l) return ''; const d=new Date(l); return isNaN(d)?l:d.getFullYear(); } },
               grid:{color:'#111'} },
          y: { grid:{color:SQ.grid}, ticks:{ font:{size:9}, maxTicksLimit:7, callback: v => yFmt(v) } },
        },
      },
    });

    if (togsEl) {
      feats.forEach((f, i) => {
        const c = _MM_COLORS[f] || '#888';
        const btn = document.createElement('button');
        btn.dataset.active = 'true';
        btn.className = 'tip';
        btn.setAttribute('data-tip', _MM_TIPS[f] || f);
        btn.style.cssText = `display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:3px;border:1px solid ${c};background:${c}22;color:${c};font-size:10px;font-family:monospace;cursor:pointer;transition:opacity 0.15s`;
        btn.innerHTML = `<span style="display:inline-block;width:10px;height:1.5px;background:${c};flex-shrink:0"></span>${_MM_LABELS[f]||f}`;
        btn.onclick = () => {
          const next = btn.dataset.active !== 'true';
          btn.dataset.active = String(next);
          btn.style.background = next ? `${c}22` : 'transparent';
          btn.style.opacity = next ? '1' : '0.35';
          chart.setDatasetVisibility(i, next);
          chart.update();
        };
        togsEl.appendChild(btn);
      });
    }
  });
}

// ── Pairwise rolling correlation between coefficient series ────────────────────
// Pairs are mathematically derived: all N*(N-1)/2 combinations computed, ranked
// by std-dev of their rolling correlation series (most regime-sensitive first).
function _mmMakeCorrChart(container, id, dates, feats, coefs) {
  const CORR_WINDOW  = 126;  // 6-month rolling window for correlation
  const SMOOTH_DAYS  = 21;   // 21-day trailing mean to remove micro-noise
  const TOP_N        = 10;   // show the top-N most regime-sensitive pairs
  const PALETTE      = Array.from({length:10},(_,i)=>sqColor(i));

  // Pretty label from feature key
  function pairLabel(a, b) {
    return `${_MM_LABELS[a]||a} / ${_MM_LABELS[b]||b}`;
  }

  // Rolling Pearson correlation between two arrays
  function rollingCorr(arr1, arr2, w) {
    const n = Math.min(arr1.length, arr2.length);
    const out = new Array(n).fill(null);
    for (let i = w - 1; i < n; i++) {
      const xs = [], ys = [];
      for (let j = i - w + 1; j <= i; j++) {
        const x = arr1[j], y = arr2[j];
        if (x != null && y != null) { xs.push(x); ys.push(y); }
      }
      if (xs.length < w * 0.7) continue;
      const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
      const my = ys.reduce((s, v) => s + v, 0) / ys.length;
      let cov = 0, vx = 0, vy = 0;
      for (let k = 0; k < xs.length; k++) {
        cov += (xs[k] - mx) * (ys[k] - my);
        vx  += (xs[k] - mx) ** 2;
        vy  += (ys[k] - my) ** 2;
      }
      const denom = Math.sqrt(vx) * Math.sqrt(vy);
      out[i] = denom > 0 ? Math.max(-1, Math.min(1, cov / denom)) : null;
    }
    return out;
  }

  // Trailing rolling mean (smoothing pass)
  function smooth(arr, w) {
    return arr.map((v, i) => {
      if (v == null) return null;
      const slice = arr.slice(Math.max(0, i - w + 1), i + 1).filter(x => x != null);
      return slice.length ? slice.reduce((s, x) => s + x, 0) / slice.length : null;
    });
  }

  // Std-dev of non-null values
  function stdDev(arr) {
    const vals = arr.filter(v => v != null);
    if (vals.length < 2) return 0;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  }

  // Build and rank all pairs
  const allPairs = [];
  for (let i = 0; i < feats.length; i++) {
    for (let j = i + 1; j < feats.length; j++) {
      const a = feats[i], b = feats[j];
      const raw  = rollingCorr(coefs[a] || [], coefs[b] || [], CORR_WINDOW);
      const data = smooth(raw, SMOOTH_DAYS);
      allPairs.push({ a, b, data, std: stdDev(raw) });
    }
  }
  // Top-N by std-dev of raw (unsmoothed) correlation — most regime-sensitive
  allPairs.sort((x, y) => y.std - x.std);
  const pairs = allPairs.slice(0, TOP_N);
  if (!pairs.length) return;

  const togglesId = id + '-togs';
  const wrap = document.createElement('div');
  wrap.style.marginBottom = '20px';
  wrap.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px">
      <span class="tip" style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase"
            data-tip="Pairs auto-selected by ranking all N×(N−1)/2 combinations on the std-dev of their ${CORR_WINDOW}-day rolling correlation — highest variance = most regime-sensitive. +1 = features locked in same direction. −1 = moving opposite. 0 = decorrelated. Smoothed with a ${SMOOTH_DAYS}-day trailing mean. A sustained move through ±0.5 often precedes a visible regime shift in the coefficient charts by 4–8 weeks.">
        Feature Coupling  ·  Top ${TOP_N} Most Regime-Sensitive Pairs
      </span>
      <span style="font-size:9px;color:#444">${CORR_WINDOW}d window · ${SMOOTH_DAYS}d smoothed · ranked by correlation variance</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:7px" id="${togglesId}"></div>
    <div class="chart-card" style="margin-bottom:0">
      <div class="chart-wrap" style="height:300px;cursor:crosshair"><canvas id="${id}"></canvas></div>
    </div>
  `;
  container.appendChild(wrap);

  requestAnimationFrame(() => {
    const canvas = document.getElementById(id);
    const togsEl = document.getElementById(togglesId);
    if (!canvas) return;

    const datasets = pairs.map((p, i) => ({
      label: pairLabel(p.a, p.b),
      data:  p.data,
      borderColor:     PALETTE[i % PALETTE.length],
      backgroundColor: 'transparent',
      borderWidth: 1.8,
      pointRadius: 0,
      fill: false,
      tension: 0.35,
      spanGaps: true,
    }));

    // Reference lines: 0 (zero), ±0.5 (meaningful threshold), ±1 (bounds)
    [[0,'#2a2a2a',[]],[0.5,'#1c2a1c',[4,4]],[-0.5,'#2a1c1c',[4,4]]].forEach(([y, c, dash]) =>
      datasets.push({ label:'_ref', data: dates.map(() => y),
        borderColor: c, borderWidth: 1, borderDash: dash, pointRadius: 0, order: 99 })
    );

    // Event annotations
    const annotations = {};
    const dateStart = dates.length ? new Date(dates[0]).getTime() : 0;
    const dateEnd   = dates.length ? new Date(dates[dates.length-1]).getTime() : Infinity;
    _MM_EVENTS.forEach((ev, i) => {
      const evT = new Date(ev.date).getTime();
      if (evT < dateStart || evT > dateEnd) return;
      const nearest = _mmNearestDate(dates, ev.date);
      annotations[`evc${i}`] = {
        type:'line', xMin: nearest, xMax: nearest,
        borderColor: ev.color + '55', borderWidth:1, borderDash:[3,3],
        label:{ display:true, content: ev.label, position:'start',
          color: ev.color+'aa', font:{size:8}, rotation:-90,
          backgroundColor:'transparent', padding:2, yAdjust:4 }
      };
    });

    // Interpretation helper for tooltip
    function corrInterpret(v) {
      if (v == null) return '—';
      const a = Math.abs(v);
      const dir = v >= 0 ? 'co-moving' : 'opposing';
      if (a >= 0.8) return `Strong ${dir} (${v >= 0 ? '+' : ''}${v.toFixed(2)}) — features locked`;
      if (a >= 0.5) return `Moderate ${dir} (${v >= 0 ? '+' : ''}${v.toFixed(2)}) — regime signal`;
      if (a >= 0.25) return `Weak ${dir} (${v >= 0 ? '+' : ''}${v.toFixed(2)}) — noisy`;
      return `Decorrelated (${v >= 0 ? '+' : ''}${v.toFixed(2)}) — near zero`;
    }

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: dates, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode:'index', intersect:false },
        plugins: {
          legend: { display: false },
          annotation: { annotations },
          tooltip: {
            mode:'index', intersect:false,
            filter: item => item.dataset.label !== '_ref',
            callbacks: {
              title: items => {
                const d = new Date(items[0].label);
                return isNaN(d) ? items[0].label : d.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
              },
              label: item => {
                if (item.dataset.label === '_ref') return null;
                const v = item.raw;
                if (v == null) return `  ${item.dataset.label}: —`;
                // Find the pair to get rank + std
                const pi = datasets.findIndex(ds => ds.label === item.dataset.label);
                const p  = pi >= 0 && pi < pairs.length ? pairs[pi] : null;
                const rankStr = p ? `  #${pi+1} of ${TOP_N}  ·  σ=${p.std.toFixed(3)}` : '';
                return [
                  `  ${item.dataset.label}`,
                  `    ${corrInterpret(v)}`,
                  `    Math: ρ = Σ[(Ci−C̄)(Cj−C̄)] / (σCi·σCj)  over ${CORR_WINDOW}d window`,
                  rankStr ? `    Regime sensitivity rank:${rankStr}` : '',
                ].filter(Boolean);
              },
              afterBody: items => {
                const visible = items.filter(it => it.dataset.label !== '_ref' && it.raw != null);
                if (!visible.length) return [];
                const vals = visible.map(it => it.raw);
                const spread = Math.max(...vals) - Math.min(...vals);
                const allPos = vals.every(v => v > 0.3);
                const allNeg = vals.every(v => v < -0.3);
                let note = '';
                if (allPos) note = '  → All pairs co-moving: unified regime, single macro driver dominant';
                else if (allNeg) note = '  → All pairs opposing: market fragmented, multiple conflicting drivers';
                else if (spread > 1.0) note = '  → High spread between pairs: regime transition likely underway';
                else note = '  → Mixed coupling: normal decorrelated state';
                return ['', note];
              },
            },
          },
          zoom: { pan:{enabled:true,mode:'x'}, zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x'} },
        },
        scales: {
          x: { ticks:{ maxTicksLimit:12, maxRotation:0, font:{size:9},
                       callback: function(val){ const l=this.getLabelForValue(val); if(!l) return ''; const d=new Date(l); return isNaN(d)?l:d.getFullYear(); } },
               grid:{color:'#111'} },
          y: { min:-1, max:1, grid:{color:SQ.grid},
               ticks:{ font:{size:9}, maxTicksLimit:9, callback: v => (v>=0?'+':'')+v.toFixed(1) } },
        },
      },
    });

    if (togsEl) {
      pairs.forEach((p, i) => {
        const c = PALETTE[i % PALETTE.length];
        const btn = document.createElement('button');
        btn.dataset.active = 'true';
        const rankNote = i === 0 ? ' ★' : '';
        btn.style.cssText = `display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:3px;border:1px solid ${c};background:${c}22;color:${c};font-size:10px;font-family:monospace;cursor:pointer;transition:opacity 0.15s`;
        btn.title = `Rank #${i+1} most regime-sensitive  ·  σ=${p.std.toFixed(3)}`;
        btn.innerHTML = `<span style="display:inline-block;width:10px;height:1.5px;background:${c};flex-shrink:0"></span>${pairLabel(p.a, p.b)}${rankNote}`;
        btn.onclick = () => {
          const isActive = btn.dataset.active === 'true';
          const next = !isActive;
          btn.dataset.active = String(next);
          btn.style.background = next ? `${c}22` : 'transparent';
          btn.style.opacity = next ? '1' : '0.35';
          chart.setDatasetVisibility(i, next);
          chart.update();
        };
        togsEl.appendChild(btn);
      });
    }
  });
}

// ── Pairwise coefficient spread (coef_A − coef_B) ─────────────────────────────
// All standardised coefficients are on the same scale (per 1σ of each feature),
// so coef_A − coef_B directly shows which feature the model is weighting more at
// each point in time — and how dramatically that balance shifts across regimes.
// Pairs auto-selected by std-dev of the spread: highest variance = most informative.
function _mmMakeSpreadChart(container, id, dates, feats, coefs) {
  const SMOOTH_DAYS = 42;   // trailing mean to surface regime-level moves, not daily noise
  const TOP_N       = 10;
  const PALETTE     = Array.from({length:10},(_,i)=>sqColor(i));

  function pairLabel(a, b) { return `${_MM_LABELS[a]||a} − ${_MM_LABELS[b]||b}`; }

  // Point-in-time spread: coef_A[t] − coef_B[t]
  function spread(a, b) {
    const ca = coefs[a] || [], cb = coefs[b] || [];
    const n = Math.min(ca.length, cb.length);
    const out = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (ca[i] != null && cb[i] != null) out[i] = ca[i] - cb[i];
    }
    return out;
  }

  // Trailing rolling mean
  function smooth(arr, w) {
    return arr.map((v, i) => {
      if (v == null) return null;
      const slice = arr.slice(Math.max(0, i - w + 1), i + 1).filter(x => x != null);
      return slice.length ? slice.reduce((s, x) => s + x, 0) / slice.length : null;
    });
  }

  function stdDev(arr) {
    const vals = arr.filter(v => v != null);
    if (vals.length < 2) return 0;
    const m = vals.reduce((s, v) => s + v, 0) / vals.length;
    return Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length);
  }

  // Build all pairs, rank by std-dev of raw spread
  const allPairs = [];
  for (let i = 0; i < feats.length; i++) {
    for (let j = i + 1; j < feats.length; j++) {
      const raw  = spread(feats[i], feats[j]);
      const data = smooth(raw, SMOOTH_DAYS);
      allPairs.push({ a: feats[i], b: feats[j], data, std: stdDev(raw) });
    }
  }
  allPairs.sort((x, y) => y.std - x.std);
  const pairs = allPairs.slice(0, TOP_N);
  if (!pairs.length) return;

  const togglesId = id + '-togs';
  const wrap = document.createElement('div');
  wrap.style.marginBottom = '20px';
  wrap.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px">
      <span class="tip" style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase"
            data-tip="Coefficient spread = coef_A minus coef_B at each date. Because all features are StandardScaled before fitting, coefficients are directly comparable — the spread tells you which feature the model is currently weighting more. Zero = equal weight. Positive = A dominates. Negative = B dominates. Pairs auto-selected by highest spread variance across history — the most unstable relationships are the most regime-sensitive. A spread accelerating away from zero is an early regime-formation signal.">
        Coefficient Spread  ·  Top ${TOP_N} Most Unstable Pairs
      </span>
      <span style="font-size:9px;color:#444">coef_A − coef_B  ·  ${SMOOTH_DAYS}d smoothed  ·  ranked by spread variance  ·  ★ = most unstable</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:7px" id="${togglesId}"></div>
    <div class="chart-card" style="margin-bottom:0">
      <div class="chart-wrap" style="height:300px;cursor:crosshair"><canvas id="${id}"></canvas></div>
    </div>
  `;
  container.appendChild(wrap);

  requestAnimationFrame(() => {
    const canvas = document.getElementById(id);
    const togsEl = document.getElementById(togglesId);
    if (!canvas) return;

    const datasets = pairs.map((p, i) => ({
      label: pairLabel(p.a, p.b),
      data:  p.data,
      borderColor:     PALETTE[i % PALETTE.length],
      backgroundColor: 'transparent',
      borderWidth: 1.8,
      pointRadius: 0,
      fill: false,
      tension: 0.35,
      spanGaps: true,
    }));

    // Zero reference line
    datasets.push({ label:'_ref', data: dates.map(() => 0),
      borderColor:'#2a2a2a', borderWidth:1, borderDash:[3,3], pointRadius:0, order:99 });

    // Event annotations
    const annotations = {};
    const dateStart = dates.length ? new Date(dates[0]).getTime() : 0;
    const dateEnd   = dates.length ? new Date(dates[dates.length-1]).getTime() : Infinity;
    _MM_EVENTS.forEach((ev, i) => {
      const evT = new Date(ev.date).getTime();
      if (evT < dateStart || evT > dateEnd) return;
      const nearest = _mmNearestDate(dates, ev.date);
      annotations[`evs${i}`] = {
        type:'line', xMin: nearest, xMax: nearest,
        borderColor: ev.color + '55', borderWidth:1, borderDash:[3,3],
        label:{ display:true, content: ev.label, position:'start',
          color: ev.color+'aa', font:{size:8}, rotation:-90,
          backgroundColor:'transparent', padding:2, yAdjust:4 }
      };
    });

    new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: dates, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode:'index', intersect:false },
        plugins: {
          legend: { display: false },
          annotation: { annotations },
          tooltip: {
            mode:'index', intersect:false,
            filter: item => item.dataset.label !== '_ref',
            callbacks: {
              title: items => { const d = new Date(items[0].label); return isNaN(d) ? items[0].label : d.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}); },
              label: item => {
                if (item.dataset.label === '_ref') return null;
                const v = item.raw;
                return `  ${item.dataset.label}: ${v != null ? (v >= 0 ? '+' : '') + v.toFixed(4) : '—'}`;
              },
            },
          },
          zoom: { pan:{enabled:true,mode:'x'}, zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x'} },
        },
        scales: {
          x: { ticks:{ maxTicksLimit:12, maxRotation:0, font:{size:9},
                       callback: function(val){ const l=this.getLabelForValue(val); if(!l) return ''; const d=new Date(l); return isNaN(d)?l:d.getFullYear(); } },
               grid:{color:'#111'} },
          y: { grid:{color:SQ.grid},
               ticks:{ font:{size:9}, maxTicksLimit:7,
                       callback: v => (v >= 0 ? '+' : '') + v.toFixed(4) } },
        },
      },
    });

    if (togsEl) {
      pairs.forEach((p, i) => {
        const c = PALETTE[i % PALETTE.length];
        const btn = document.createElement('button');
        btn.dataset.active = 'true';
        btn.title = `Rank #${i+1} most spread-variable  ·  σ=${p.std.toFixed(4)}`;
        btn.style.cssText = `display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:3px;border:1px solid ${c};background:${c}22;color:${c};font-size:10px;font-family:monospace;cursor:pointer;transition:opacity 0.15s`;
        btn.innerHTML = `<span style="display:inline-block;width:10px;height:1.5px;background:${c};flex-shrink:0"></span>${pairLabel(p.a, p.b)}${i===0?' ★':''}`;
        btn.onclick = () => {
          const next = btn.dataset.active !== 'true';
          btn.dataset.active = String(next);
          btn.style.background = next ? `${c}22` : 'transparent';
          btn.style.opacity = next ? '1' : '0.35';
          // find chart and toggle dataset
          const chart = Chart.getChart(document.getElementById(id));
          if (chart) { chart.setDatasetVisibility(i, next); chart.update(); }
        };
        togsEl.appendChild(btn);
      });
    }
  });
}

function _regimeBuildMomentumModels(container, models) {

  // Groups shown as labelled button clusters
  const _MM_GROUPS = [
    {
      groupLabel: '3-Year Window',
      tip: '3-year (756-day) training window. More stable coefficients, slower to adapt to new regimes.',
      cfgs: [
        { key:'1m',     label:'1M',     longLabel:'1-Month Model',              sub:'All features  ·  1989–present  ·  ~1 month blind spot',             note:'' },
        { key:'3m',     label:'3M',     longLabel:'3-Month Model',              sub:'All features  ·  1989–present  ·  ~3 month blind spot',             note:'' },
        { key:'6m',     label:'6M',     longLabel:'6-Month Model',              sub:'All features  ·  1989–present  ·  ~6 month blind spot',             note:'' },
        { key:'1m_ext', label:'1M Ext', longLabel:'1-Month Model — Extended',   sub:'No oil / yield curve  ·  ~1974–present  ·  ~1 month blind spot',   note:'Oil momentum and yield curve excluded to extend history back to the 1970s stagflation era.' },
        { key:'3m_ext', label:'3M Ext', longLabel:'3-Month Model — Extended',   sub:'No oil / yield curve  ·  ~1974–present  ·  ~3 month blind spot',   note:'Oil momentum and yield curve excluded to extend history back to the 1970s stagflation era.' },
        { key:'6m_ext', label:'6M Ext', longLabel:'6-Month Model — Extended',   sub:'No oil / yield curve  ·  ~1974–present  ·  ~6 month blind spot',   note:'Oil momentum and yield curve excluded to extend history back to the 1970s stagflation era.' },
      ],
    },
    {
      groupLabel: '1-Year Window',
      tip: '1-year (252-day) training window. Faster regime adaptation — catches turning points earlier, but noisier coefficients.',
      cfgs: [
        { key:'1m_1y',     label:'1M',     longLabel:'1-Month Model  ·  1Y Window',              sub:'All features  ·  ~1986–present  ·  ~1 month blind spot',              note:'1-year training window. Faster to detect regime shifts than 3Y, more noise in coefficients.' },
        { key:'3m_1y',     label:'3M',     longLabel:'3-Month Model  ·  1Y Window',              sub:'All features  ·  ~1986–present  ·  ~3 month blind spot',              note:'1-year training window. Faster to detect regime shifts than 3Y, more noise in coefficients.' },
        { key:'6m_1y',     label:'6M',     longLabel:'6-Month Model  ·  1Y Window',              sub:'All features  ·  ~1986–present  ·  ~6 month blind spot',              note:'1-year training window. Faster to detect regime shifts than 3Y, more noise in coefficients.' },
        { key:'1m_ext_1y', label:'1M Ext', longLabel:'1-Month Model — Extended  ·  1Y Window',  sub:'No oil / yield curve  ·  ~1974–present  ·  ~1 month blind spot',    note:'1-year window + extended history (no oil / yield curve). Fastest regime detection across full 1974–present span.' },
        { key:'3m_ext_1y', label:'3M Ext', longLabel:'3-Month Model — Extended  ·  1Y Window',  sub:'No oil / yield curve  ·  ~1974–present  ·  ~3 month blind spot',    note:'1-year window + extended history (no oil / yield curve). Fastest regime detection across full 1974–present span.' },
        { key:'6m_ext_1y', label:'6M Ext', longLabel:'6-Month Model — Extended  ·  1Y Window',  sub:'No oil / yield curve  ·  ~1974–present  ·  ~6 month blind spot',    note:'1-year window + extended history (no oil / yield curve). Fastest regime detection across full 1974–present span.' },
      ],
    },
    {
      groupLabel: '6-Month Window',
      tip: '6-month (126-day) training window. Most agile — reacts to regime changes within weeks, but highest coefficient noise. Use for early warnings, not stable signals.',
      cfgs: [
        { key:'1m_6m',     label:'1M',     longLabel:'1-Month Model  ·  6M Window',              sub:'All features  ·  ~1986–present  ·  ~1 month blind spot',              note:'6-month training window. Most agile of all models — highest noise, earliest regime detection.' },
        { key:'3m_6m',     label:'3M',     longLabel:'3-Month Model  ·  6M Window',              sub:'All features  ·  ~1986–present  ·  ~3 month blind spot',              note:'6-month training window. Most agile of all models — highest noise, earliest regime detection.' },
        { key:'6m_6m',     label:'6M',     longLabel:'6-Month Model  ·  6M Window',              sub:'All features  ·  ~1986–present  ·  ~6 month blind spot',              note:'6-month training window. Note: training window = forecast horizon, so this model is fitting on just enough data to cover one forecast period.' },
        { key:'1m_ext_6m', label:'1M Ext', longLabel:'1-Month Model — Extended  ·  6M Window',  sub:'No oil / yield curve  ·  ~1974–present  ·  ~1 month blind spot',    note:'6-month window + extended history (no oil / yield curve). Most agile across full 1974–present span.' },
        { key:'3m_ext_6m', label:'3M Ext', longLabel:'3-Month Model — Extended  ·  6M Window',  sub:'No oil / yield curve  ·  ~1974–present  ·  ~3 month blind spot',    note:'6-month window + extended history (no oil / yield curve). Most agile across full 1974–present span.' },
        { key:'6m_ext_6m', label:'6M Ext', longLabel:'6-Month Model — Extended  ·  6M Window',  sub:'No oil / yield curve  ·  ~1974–present  ·  ~6 month blind spot',    note:'6-month window + extended history (no oil / yield curve). Most agile across full 1974–present span.' },
      ],
    },
    {
      groupLabel: 'V2 — Enhanced',
      tip: 'V2 models add PE ratio, HY credit spreads (3m change), copper momentum, M2 money supply growth, and ISM PMI change on top of the original feature set. 1-year window. Limited to ~1997+ by HY spread data availability. Weekly step to keep file size manageable.',
      cfgs: [
        { key:'1m_v2',     label:'1M',     longLabel:'1-Month Model  ·  V2 Enhanced  ·  1Y Window',     sub:'+ PE · Credit Spread · Copper · M2 · ISM  ·  ~1997–present  ·  ~1 month blind spot',  note:'Enhanced feature set adds valuation (PE), credit stress (HY spread), growth (copper, ISM) and liquidity (M2) dimensions.' },
        { key:'3m_v2',     label:'3M',     longLabel:'3-Month Model  ·  V2 Enhanced  ·  1Y Window',     sub:'+ PE · Credit Spread · Copper · M2 · ISM  ·  ~1997–present  ·  ~3 month blind spot',  note:'Enhanced feature set adds valuation (PE), credit stress (HY spread), growth (copper, ISM) and liquidity (M2) dimensions.' },
        { key:'6m_v2',     label:'6M',     longLabel:'6-Month Model  ·  V2 Enhanced  ·  1Y Window',     sub:'+ PE · Credit Spread · Copper · M2 · ISM  ·  ~1997–present  ·  ~6 month blind spot',  note:'Enhanced feature set adds valuation (PE), credit stress (HY spread), growth (copper, ISM) and liquidity (M2) dimensions.' },
        { key:'1m_ext_v2', label:'1M Ext', longLabel:'1-Month Model — Extended  ·  V2 Enhanced  ·  1Y Window',  sub:'No oil / yield curve  ·  + PE · Credit Spread · Copper · M2 · ISM  ·  ~1997–present',  note:'Extended (no oil/yield curve) + enhanced features. Best balance of feature richness and coefficient stability.' },
        { key:'3m_ext_v2', label:'3M Ext', longLabel:'3-Month Model — Extended  ·  V2 Enhanced  ·  1Y Window',  sub:'No oil / yield curve  ·  + PE · Credit Spread · Copper · M2 · ISM  ·  ~1997–present',  note:'Extended (no oil/yield curve) + enhanced features. Best balance of feature richness and coefficient stability.' },
        { key:'6m_ext_v2', label:'6M Ext', longLabel:'6-Month Model — Extended  ·  V2 Enhanced  ·  1Y Window',  sub:'No oil / yield curve  ·  + PE · Credit Spread · Copper · M2 · ISM  ·  ~1997–present',  note:'Extended (no oil/yield curve) + enhanced features. Best balance of feature richness and coefficient stability.' },
      ],
    },
  ];

  // Flat list for lookup
  const _MM_CFGS = _MM_GROUPS.flatMap(g => g.cfgs);

  const DEFAULT_KEY = '6m_ext_1y';

  // ── Section header ──────────────────────────────────────────────────────────
  const hdr = document.createElement('div');
  hdr.innerHTML = `
    <div class="section-divider" style="margin-top:8px">
      <div class="section-divider-line"></div>
      <span class="section-divider-label tip" data-tip="Rolling Ridge regression (3-year window, daily step) predicting S&P 500 forward return from macro features. No regime labels used — any patterns that emerge are data-driven. Three views per model: sensitivity (coefficient), actual impact (contribution = coef × current signal), and reliability (t-statistic).">
        Rolling Momentum Models  ·  Latent Regime Discovery
      </span>
      <div class="section-divider-line"></div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:14px">
      Daily rolling Ridge  ·  3-year training window  ·  standardised features
      ·  <span style="color:#555">target = S&amp;P forward return  ·  no regime labels given to model</span>
    </div>
  `;
  container.appendChild(hdr);

  // ── Model selector button bar (grouped) ────────────────────────────────────
  const btnBar = document.createElement('div');
  btnBar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:20px';
  container.appendChild(btnBar);

  const btns = {};
  _MM_GROUPS.forEach(({ groupLabel, tip, cfgs }, gi) => {
    if (gi > 0) {
      // Divider
      const sep = document.createElement('span');
      sep.style.cssText = 'width:1px;height:22px;background:#2a2a2a;flex-shrink:0';
      btnBar.appendChild(sep);
    }
    const grpWrap = document.createElement('div');
    grpWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px';

    const grpLbl = document.createElement('div');
    grpLbl.className = 'tip';
    grpLbl.setAttribute('data-tip', tip);
    grpLbl.style.cssText = 'font-size:9px;color:#444;letter-spacing:0.8px;text-transform:uppercase;padding-left:2px';
    grpLbl.textContent = groupLabel;
    grpWrap.appendChild(grpLbl);

    const grpBtns = document.createElement('div');
    grpBtns.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';

    cfgs.forEach(({ key, label, longLabel }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.title = longLabel;
      btn.dataset.key = key;
      btn.style.cssText = 'padding:4px 12px;border-radius:4px;border:1px solid #333;background:#111;color:var(--muted);font-size:11px;letter-spacing:0.5px;cursor:pointer;transition:all 0.15s';
      btn.onclick = () => showModel(key);
      grpBtns.appendChild(btn);
      btns[key] = btn;
    });

    grpWrap.appendChild(grpBtns);
    btnBar.appendChild(grpWrap);
  });

  // ── Per-model content wrappers (lazy-rendered) ─────────────────────────────
  const wrappers = {};
  const rendered = new Set();
  let activeKey = null;

  _MM_CFGS.forEach(({ key }) => {
    const wrap = document.createElement('div');
    wrap.style.display = 'none';
    container.appendChild(wrap);
    wrappers[key] = wrap;
  });

  function renderModel(key) {
    if (rendered.has(key)) return;
    rendered.add(key);

    const cfg  = _MM_CFGS.find(c => c.key === key);
    const wrap = wrappers[key];
    const m    = models[key];

    if (!m || !m.dates || !m.dates.length) {
      wrap.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:20px 0">No data available for model <code>${key}</code>.</div>`;
      return;
    }

    const feats    = m.features      || [];
    const coefs    = m.coefficients  || {};
    const contribs = m.contributions || {};
    const tstats   = m.t_stats       || {};
    const r2arr    = m.r2            || [];
    const dates    = m.dates;
    const { longLabel, sub, note } = cfg;

    // Model header
    const modelHdr = document.createElement('div');
    modelHdr.style.cssText = 'margin-bottom:12px;margin-top:4px';
    modelHdr.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase">
        ${longLabel}  ·  S&amp;P forward ${key.replace('_ext','')} return
      </div>
      ${note ? `<div style="font-size:10px;color:#555;margin-top:2px">${note}</div>` : ''}
      <div style="font-size:10px;color:#555;margin-top:3px">
        ${sub}  ·  Horizon: ${m.horizon_days}d  ·  Window: ${m.window_days}d  ·  ${dates.length.toLocaleString()} daily obs
        ·  Avg R²: <span style="font-family:monospace;color:#666">${r2arr.length ? (r2arr.reduce((a,b)=>a+b,0)/r2arr.length).toFixed(3) : '—'}</span>
        ·  Current R²: <span style="font-family:monospace;color:#666">${r2arr.length ? r2arr[r2arr.length-1].toFixed(3) : '—'}</span>
      </div>
    `;
    wrap.appendChild(modelHdr);

    // Chart 1: Coefficients
    _mmMakeChart(wrap,
      `rd-mm-coef-${key}`,
      'Sensitivity (Coefficients)',
      'Standardised Ridge coefficient per feature. Positive = feature predicted S&P rising at that window. When a line crosses zero, the relationship with S&P inverted. Vertical lines = key macro events. Drag to zoom.',
      dates, feats, coefs,
      v => (v >= 0 ? '+' : '') + v.toFixed(4),
      340, true
    );

    // Chart 2: Contributions
    _mmMakeChart(wrap,
      `rd-mm-contrib-${key}`,
      'Actual Impact (Contribution = Coef × Current Signal)',
      'Coefficient × standardised feature value at each date. Shows what each feature is actually adding to the model\'s S&P prediction at that moment — combining the sensitivity with how strong the current signal is.',
      dates, feats, contribs,
      v => (v >= 0 ? '+' : '') + v.toFixed(4),
      300, true
    );

    // Chart 3: T-statistics
    _mmMakeChart(wrap,
      `rd-mm-tstat-${key}`,
      'Reliability (T-Statistic)  ·  |t| > 2 = statistically significant',
      'T-statistic = coefficient ÷ standard error. Measures how reliably different from zero the coefficient is at each window. |t| > 2 suggests the relationship is real (not noise).',
      dates, feats, tstats,
      v => (v >= 0 ? '+' : '') + v.toFixed(2),
      300, true
    );

    const refNote = document.createElement('div');
    refNote.style.cssText = 'font-size:10px;color:#444;text-align:right;margin-bottom:12px';
    refNote.textContent = '|t| > 2 threshold = statistical significance at ~95% confidence';
    wrap.appendChild(refNote);

    // Chart 4: Feature coupling (auto-derived pairs, 126d window, 21d smoothed)
    _mmMakeCorrChart(wrap, `rd-mm-corr-${key}`, dates, feats, coefs);

    const corrNote = document.createElement('div');
    corrNote.style.cssText = 'font-size:10px;color:#444;text-align:right;margin-bottom:12px';
    corrNote.textContent = 'Pairs auto-ranked by correlation variance  ·  126d window  ·  21d smoothed  ·  ★ = most regime-sensitive pair';
    wrap.appendChild(corrNote);

    // Chart 5: Coefficient spread (coef_A − coef_B), auto-ranked pairs
    _mmMakeSpreadChart(wrap, `rd-mm-spread-${key}`, dates, feats, coefs);

    const spreadNote = document.createElement('div');
    spreadNote.style.cssText = 'font-size:10px;color:#444;text-align:right;margin-bottom:28px';
    spreadNote.textContent = 'Positive = first feature dominates  ·  Negative = second feature dominates  ·  Zero = equal model weight  ·  ★ = most historically unstable pair';
    wrap.appendChild(spreadNote);
  }

  function showModel(key) {
    // Deactivate old
    if (activeKey && wrappers[activeKey]) wrappers[activeKey].style.display = 'none';
    if (activeKey && btns[activeKey]) {
      btns[activeKey].style.background    = '#111';
      btns[activeKey].style.borderColor   = '#333';
      btns[activeKey].style.color         = 'var(--muted)';
      btns[activeKey].style.fontWeight    = '400';
    }

    // Activate new — must show wrapper BEFORE rendering so canvas gets real width
    activeKey = key;
    wrappers[key].style.display = 'block';
    renderModel(key);

    btns[key].style.background  = '#1f1a0e';
    btns[key].style.borderColor = 'var(--gold)';
    btns[key].style.color       = 'var(--gold)';
    btns[key].style.fontWeight  = '600';
  }

  // Load default on init
  showModel(DEFAULT_KEY);
}
