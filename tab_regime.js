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

  let macroData, model3m, model1y;

  // Fetch all three sources in parallel
  try {
    [macroData, model3m, model1y] = await Promise.all([
      fetch(`./regime_macro.json?v=${_CV}`).then(r => { if (!r.ok) throw new Error('regime_macro.json not found'); return r.json(); }),
      fetch(`./model_lab_wbc_regime_3m.json?v=${_CV}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`./model_lab_wbc_regime_1y.json?v=${_CV}`).then(r => r.ok ? r.json() : null).catch(() => null),
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
  body.style.display = 'block';

  _regimeBuildMacroSection(body, macroData);
  _regimeBuildModelSection(body, model3m, model1y);
  _regimeBuildSimilaritySection(body, model1y);
}

// ── Regime zone helpers ────────────────────────────────────────────────────────

function _regimeZone(key, value) {
  if (value == null) return { label: '—', color: 'var(--muted)' };
  if (key === 'vix') {
    if (value < 15)  return { label: 'CALM',     color: 'var(--green)' };
    if (value < 25)  return { label: 'ELEVATED', color: '#f5c842' };
    return                  { label: 'STRESS',   color: 'var(--red)' };
  }
  if (key === 'yield_curve') {
    if (value > 0.5)  return { label: 'NORMAL',        color: 'var(--green)' };
    if (value >= -0.5) return { label: 'FLAT',          color: '#f5c842' };
    return                   { label: 'INVERTED',       color: 'var(--red)' };
  }
  if (key === 'dxy') {
    if (value > 106) return { label: 'STRONG USD', color: 'var(--red)' };
    if (value > 98)  return { label: 'NEUTRAL',    color: '#f5c842' };
    return                  { label: 'WEAK USD',   color: 'var(--green)' };
  }
  // fallback: colour by percentile rank
  return null;   // caller will render pct bar instead
}

function _regimeZoneTip(key) {
  if (key === 'vix')         return 'VIX zone: CALM (<15) = low volatility, equity-bullish environment. ELEVATED (15–25) = caution, markets pricing increased risk. STRESS (>25) = crisis conditions — historically a strong gold safe-haven signal.';
  if (key === 'yield_curve') return 'Yield curve zone: NORMAL (>0.5%) = healthy growth expectations. FLAT (−0.5 to 0.5%) = mixed outlook, uncertainty. INVERTED (<−0.5%) = classic recession warning signal — historically precedes gold safe-haven rallies.';
  if (key === 'dxy')         return 'USD zone: STRONG (>106) = dollar headwind — gold faces resistance as it becomes expensive for foreign buyers. NEUTRAL (98–106) = balanced. WEAK (<98) = dollar tailwind — gold typically benefits from USD weakness.';
  return 'Zone classification based on historical thresholds for this indicator.';
}

function _regimePctPill(pct) {
  if (pct == null) return '';
  const color = pct > 80 ? 'var(--red)' : pct < 20 ? 'var(--green)' : '#f5c842';
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
  if (key === 'us10yr')      return [make(4.5, 'High rates (4.5)'), make(2.0, 'Low rates (2.0)')];
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
  const color = pct > 80 ? 'var(--red)' : pct < 20 ? 'var(--green)' : '#f5c842';
  const el = document.getElementById(`regime-pct-${key}`);
  if (el) {
    el.style.borderColor = color;
    el.style.color = color;
    el.textContent = `${pct}th pct`;
  }
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
    { key: 'gold',        title: 'Gold (USD/oz)',             fmt: v => '$' + v.toFixed(0),  tip: 'Spot gold price (USD/oz, front-month futures). Primary driver for gold miners. Moves are driven by: USD strength, real interest rates, central bank buying, and safe-haven demand during crises.' },
    { key: 'oil',         title: 'Oil — Brent Crude (USD)',   fmt: v => '$' + v.toFixed(2),  tip: 'Brent crude price (USD/barrel). Proxy for global economic growth and inflation expectations. High oil = inflationary pressures, potential rate hikes. The gold/oil ratio (below) strips out oil moves to show gold\'s relative safe-haven premium.' },
    { key: 'gold_oil',    title: 'Gold / Oil Ratio',          fmt: v => v.toFixed(2),        tip: 'Gold price divided by Brent crude — how many barrels of oil one ounce of gold can buy. Rising ratio = gold outperforming energy = risk-off, safe-haven regime. Falling ratio = growth/inflation regime favouring commodities.' },
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
      const barColor = pct > 80 ? 'var(--red)' : pct < 20 ? 'var(--green)' : '#f5c842';
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
    const pctColor = pct > 80 ? 'var(--red)' : pct < 20 ? 'var(--green)' : '#f5c842';
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
      <div class="chart-wrap" style="height:180px;cursor:crosshair"><canvas id="${canvasId}"></canvas></div>
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
              grid: { color: '#1a1a1a' },
            },
            y: {
              grid: { color: '#1a1a1a' },
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
    const pColor = p => p == null ? 'var(--muted)' : p < 0.05 ? 'var(--green)' : p < 0.20 ? '#f5c842' : 'var(--muted)';
    const pFmt   = p => p == null ? '—' : p.toFixed(3);
    const dFmt   = d => d == null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(3);
    const catColor = {
      macro: '#60a5fa', momentum: '#c084fc', volume: '#34d399',
      volatility: '#fb923c', trend: '#f472b6', candle: '#a8a29e',
      interaction: '#818cf8', announcement: '#fbbf24',
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
          x: { beginAtZero: true, grid: { color: '#1a1a1a' }, ticks: { font: { size: 10 } } },
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
    const agreeColor = both ? 'var(--green)' : '#f5c842';
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
            y: { ticks: { font: { size: 9 }, color: '#666', callback: function(v) { return v.toFixed(0)+'%'; } }, grid: { color: '#1a1a1a' } }
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
