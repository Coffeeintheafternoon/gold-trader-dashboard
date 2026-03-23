// ══════════════════════════════════════════════════════════════════════════════
// REGIME TAB
// ══════════════════════════════════════════════════════════════════════════════

let _regimeInited = false;
let _regimeMacroCharts = {};   // key → Chart instance (for destroy-on-reinit)

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

// ── Section 1: Macro Regime Tracker ──────────────────────────────────────────

function _regimeBuildMacroSection(container, macroData) {
  const series = macroData.series || {};
  const genAt  = macroData.generated_at ? macroData.generated_at.slice(0, 16).replace('T', ' ') + ' UTC' : '';

  const chartConfigs = [
    { key: 'vix',         title: 'VIX — Fear Index',        fmt: v => v.toFixed(2) },
    { key: 'us10yr',      title: 'US 10yr Yield (%)',        fmt: v => v.toFixed(3) + '%' },
    { key: 'yield_curve', title: 'Yield Curve (10yr − 3m)',  fmt: v => v.toFixed(3) + '%' },
    { key: 'dxy',         title: 'DXY — US Dollar Index',    fmt: v => v.toFixed(2) },
    { key: 'audusd',      title: 'AUD / USD',                fmt: v => v.toFixed(5) },
    { key: 'gold',        title: 'Gold (USD/oz)',             fmt: v => '$' + v.toFixed(0) },
    { key: 'oil',         title: 'Oil — Brent Crude (USD)',   fmt: v => '$' + v.toFixed(2) },
    { key: 'gold_oil',    title: 'Gold / Oil Ratio',          fmt: v => v.toFixed(2) },
  ];

  // Section header
  const header = document.createElement('div');
  header.innerHTML = `
    <div class="section-divider" style="margin-top:8px">
      <div class="section-divider-line"></div>
      <span class="section-divider-label">Macro Regime Tracker</span>
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
      ? `<span style="font-size:10px;color:var(--muted)">2yr: ${cfg.fmt ? cfg.fmt(lo) : lo} – ${cfg.fmt ? cfg.fmt(hi) : hi}</span>`
      : '';

    const canvasId = `regime-chart-${cfg.key}`;
    card.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:2px;flex-wrap:wrap">
        <span class="chart-title" style="margin-bottom:0">${cfg.title}</span>
        <span style="font-size:16px;font-weight:700;color:var(--gold);font-family:monospace">${curStr}</span>
        ${_regimePctPill(pct)}
        ${zoneHtml && zone ? zoneHtml : ''}
      </div>
      ${!zone && zoneHtml ? zoneHtml : ''}
      ${rangeHtml ? `<div style="margin-bottom:10px">${rangeHtml}</div>` : '<div style="margin-bottom:10px"></div>'}
      <div class="chart-wrap" style="height:180px"><canvas id="${canvasId}"></canvas></div>
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
              callbacks: {
                title: items => items[0].label,
                label: item => {
                  if (item.datasetIndex !== 0) return null;
                  const v = item.raw;
                  return cfg.fmt ? cfg.fmt(v) : (v != null ? v.toFixed(4) : '—');
                },
                filter: item => item.datasetIndex === 0,
              },
            },
          },
          scales: {
            x: {
              ticks: { maxTicksLimit: 8, font: { size: 10 }, maxRotation: 0 },
              grid: { color: '#1a1a1a' },
            },
            y: {
              grid: { color: '#1a1a1a' },
              ticks: { font: { size: 10 }, callback: v => cfg.fmt ? cfg.fmt(v) : v },
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
      <span class="section-divider-label">Regime Model Intelligence — WBC.AX</span>
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
    <div style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">
      Top Features by Significance (3M Regime Model)
    </div>
    <div style="overflow-x:auto;margin-bottom:28px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid #2a2a2a">
            <th style="text-align:left;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">Feature</th>
            <th style="text-align:left;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">Category</th>
            <th style="text-align:right;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">3M p-val</th>
            <th style="text-align:right;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">3M Δ</th>
            <th style="text-align:right;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">1Y p-val</th>
            <th style="text-align:right;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">1Y Δ</th>
            <th style="text-align:right;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">Sign%</th>
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
    <div style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">
      Top Features by Regime Gain (3M p_delta — how much regime weighting helped)
    </div>
    <div class="chart-card" style="margin-bottom:28px">
      <div style="height:280px"><canvas id="regime-gain-chart"></canvas></div>
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
    <div style="font-size:12px;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">
      3M vs 1Y Model Agreement (p &lt; 0.05)
    </div>
    <div style="overflow-x:auto;margin-bottom:32px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid #2a2a2a">
            <th style="text-align:left;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">Feature</th>
            <th style="text-align:center;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">3M sig</th>
            <th style="text-align:center;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">1Y sig</th>
            <th style="text-align:center;padding:7px 10px;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px;font-family:monospace">Agreement</th>
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

