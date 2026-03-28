// tab_macrostate.js
// GMM Macro Regime Clustering — dashboard tab
// Reads gmm_regime_data.json (written by scripts/run_gmm_regime_clustering.py)
// Does NOT touch regime_data.json or any existing pipeline.

'use strict';

// ── Regime definitions (k=4, 3m_ext_1y model) ─────────────────────────────
// Manually assigned based on cluster coefficient profiles from GMM output.
// Cluster IDs are stable across runs (n_init=10, random_state=42, sorted by BIC).
const _MS_REGIMES_K4 = {
  0: {
    name:    'Hard Money / Real Assets',
    short:   'Real Assets',
    color:   '#22c55e',
    desc:    'High real rates, gold momentum positive, dollar strong. Real assets dominate over financial assets. Historical: Volcker 1980–82, post-hike stabilisation 2023.',
    signature: 'real_rate ↑  gold_mom ↑  dxy_mom ↑',
  },
  1: {
    name:    'Risk-Off Baseline',
    short:   'Baseline',
    color:   '#60a5fa',
    desc:    'Moderate fear premium, mild inflation, no single dominant driver. The "normal" macro state — market running with background anxiety but no acute stress.',
    signature: 'vix ↑  real_rate moderate  cpi_yoy +',
  },
  2: {
    name:    'Stagflation',
    short:   'Stagflation',
    color:   '#f59e0b',
    desc:    'High and rising CPI, rising real rates, but Fed Funds FALLING — the Fed is behind the curve or cutting into inflation. The rarest and most dangerous regime. Historical: 1970s oil shocks, early 1980s pre-Volcker.',
    signature: 'cpi_yoy ↑↑  real_rate ↑↑  ff_chg ↓↓',
  },
  3: {
    name:    'Disinflationary Tightening',
    short:   'Dis-inflation',
    color:   '#2dd4bf',
    desc:    'Fear elevated but CPI is a headwind — inflation is losing its grip. The Fed is winning the fight. Gold is not an inflation hedge here, it\'s a fear asset. Historical: 2022 rate hike cycle, 2025.',
    signature: 'cpi_yoy ↓↓  vix ↑  gold_mom ↓',
  },
};

const _MS_REGIMES_K3 = {
  0: { name: 'Risk-Off Baseline', short: 'Baseline', color: '#60a5fa',
       desc: 'Normal fear-premium state. VIX dominant, moderate inflation tailwind.', signature: 'vix ↑  real_rate +  cpi_yoy +' },
  1: { name: 'Disinflationary Fear', short: 'Dis-inflation', color: '#2dd4bf',
       desc: 'Fear is high but inflation is a headwind — market pricing in Fed success.', signature: 'vix ↑↑  cpi_yoy ↓  gold_mom ↓' },
  2: { name: 'Hard Money / Real Assets', short: 'Real Assets', color: '#22c55e',
       desc: 'Real rates dominant, gold momentum positive, inflation tailwind. Real assets era.', signature: 'real_rate ↑↑  gold_mom ↑  cpi_yoy ↑' },
};

// ── Init ───────────────────────────────────────────────────────────────────
let _msInitialised = false;

function initMacroStateTab() {
  if (_msInitialised) return;
  _msInitialised = true;

  const container = document.getElementById('tab-macrostate');
  container.innerHTML = `
    <div style="padding:16px 0 8px">
      <div id="ms-loading" style="color:var(--muted);padding:40px;text-align:center;font-size:13px">
        Loading GMM regime data…
      </div>
    </div>
  `;

  const base = typeof _DATA_BASE !== 'undefined' ? _DATA_BASE : '';
  fetch(base + 'gmm_regime_data.json?v=' + Date.now())
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => _msBuild(container, data))
    .catch(err => {
      document.getElementById('ms-loading').innerHTML =
        `<span style="color:#ef4444">Failed to load gmm_regime_data.json — run scripts/run_gmm_regime_clustering.py first.<br><small>${err}</small></span>`;
    });
}

// ── Build UI ───────────────────────────────────────────────────────────────
function _msBuild(container, data) {
  const m1y = data['3m_ext_1y'];
  if (!m1y) { container.innerHTML = '<p style="color:#ef4444;padding:20px">3m_ext_1y model not found in data.</p>'; return; }

  // Default to k=4
  let activeK = 4;
  let activeModel = '3m_ext_1y';

  container.innerHTML = `
    <div style="padding:16px 0">

      <!-- Header -->
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">
          GMM Macro Regime Clustering
        </div>
        <div style="font-size:11px;color:#555;max-width:820px;line-height:1.6">
          Walk-forward Ridge regression coefficients (3m forecast, 1Y window) projected via PCA, then clustered
          with a Gaussian Mixture Model. Each point in history is assigned a soft probability distribution over
          macro regimes — based solely on how the model's feature weightings evolved, not on returns or volatility.
          Method: Blake et al. (2025) arXiv:2510.03236 + Goulet Coulombe (2024) TVP-Ridge.
        </div>
      </div>

      <!-- Controls -->
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Clusters k =</div>
        <div id="ms-k-btns" style="display:flex;gap:6px"></div>
        <div style="width:1px;height:20px;background:#2a2a2a"></div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Model</div>
        <div id="ms-model-btns" style="display:flex;gap:6px"></div>
      </div>

      <!-- Current regime banner -->
      <div id="ms-banner" style="margin-bottom:20px"></div>

      <!-- PCA scatter + probability bars -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="chart-card">
          <div class="chart-title">PCA Coefficient Space — Regime Map</div>
          <div class="chart-subtitle">Each dot = one week of market history. Axes are the first two principal components of the Ridge coefficient vector. Clusters in this space represent distinct macro regimes.</div>
          <div class="chart-wrap" style="height:320px;cursor:crosshair"><canvas id="ms-pca-scatter"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">Current Regime Probabilities</div>
          <div class="chart-subtitle">Soft membership probabilities for the most recent observation. Sum to 100%.</div>
          <div id="ms-prob-bars" style="padding:16px 0"></div>
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid #1a1a1a">
            <div class="chart-subtitle" id="ms-regime-desc" style="font-size:11px;line-height:1.7;color:#666"></div>
          </div>
        </div>
      </div>

      <!-- Regime timeline -->
      <div class="chart-card" style="margin-bottom:16px">
        <div class="chart-title">Regime Probability Timeline — Full History</div>
        <div class="chart-subtitle">Stacked area: probability of each regime at each weekly timestep. When one colour dominates, the model is confident. Mixed colours = transition zone.</div>
        <div class="chart-wrap" style="height:240px;cursor:crosshair"><canvas id="ms-timeline"></canvas></div>
      </div>

      <!-- Cluster profiles -->
      <div class="chart-card" style="margin-bottom:16px">
        <div class="chart-title">Regime Fingerprints — Mean Coefficient per Cluster</div>
        <div class="chart-subtitle">
          What each regime looks like in coefficient space. A positive value means that feature was a tailwind for gold returns in that regime. Magnitude = how strongly the model weighted it.
          The stagflation cluster has the most extreme readings — CPI and real rates both strongly positive, Fed Funds strongly negative.
        </div>
        <div class="chart-wrap" style="height:280px"><canvas id="ms-profiles"></canvas></div>
      </div>

      <!-- Stagflation Watch -->
      <div id="ms-stag-section" class="chart-card" style="border:1px solid #f59e0b44;margin-bottom:16px">
        <div class="chart-title" style="color:#f59e0b">Stagflation Watch</div>
        <div id="ms-stag-body" style="font-size:12px;line-height:1.8;color:#888"></div>
      </div>

      <!-- Footer -->
      <div style="font-size:10px;color:#333;line-height:1.7;padding-top:8px;border-top:1px solid #111;max-width:820px">
        Model: 3m_ext_1y (1-year training window, 3-month horizon, no oil/yield curve) · 2,807 weekly observations 1972–2025 ·
        PCA 3 components (72.8% variance) · GMM random_state=42, n_init=10 ·
        Based on Blake et al. (2025) arXiv:2510.03236 coefficient-based regime clustering.
      </div>

    </div>
  `;

  // Build k buttons
  const kBtns = document.getElementById('ms-k-btns');
  [3, 4].forEach(k => {
    const btn = document.createElement('button');
    btn.textContent = k;
    btn.style.cssText = `padding:3px 12px;border-radius:3px;border:1px solid #2a2a2a;background:#0a0a0a;color:var(--muted);font-size:11px;font-weight:700;cursor:pointer;transition:all 0.15s`;
    btn.onclick = () => { activeK = k; _msRender(data, activeModel, activeK, charts); };
    btn.id = `ms-k-${k}`;
    kBtns.appendChild(btn);
  });

  // Build model buttons
  const modelBtns = document.getElementById('ms-model-btns');
  [['3m_ext_1y','1Y Ext (1972–)'],['3m_ext_v2','V2 Ext (2001–)']].forEach(([key, label]) => {
    if (!data[key]) return;
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `padding:3px 12px;border-radius:3px;border:1px solid #2a2a2a;background:#0a0a0a;color:var(--muted);font-size:11px;font-weight:700;cursor:pointer;transition:all 0.15s`;
    btn.onclick = () => { activeModel = key; _msRender(data, activeModel, activeK, charts); };
    btn.id = `ms-model-${key}`;
    modelBtns.appendChild(btn);
  });

  const charts = {};
  _msRender(data, activeModel, activeK, charts);
}

function _msRender(data, modelKey, k, charts) {
  const m     = data[modelKey];
  if (!m) return;
  const kData = m.k[k];
  if (!kData) return;

  const feats    = m.feats;
  const dates    = m.dates;
  const pca2d    = m.pca_2d;
  const assigns  = kData.assigns;
  const probs    = kData.probs;
  const profiles = kData.profiles;
  const regimes  = k === 4 ? _MS_REGIMES_K4 : _MS_REGIMES_K3;
  const curIdx   = assigns.length - 1;
  const curClust = assigns[curIdx];
  const curProbs = probs[curIdx];
  const curReg   = regimes[curClust];

  // Update k button styles
  [3,4].forEach(kk => {
    const btn = document.getElementById(`ms-k-${kk}`);
    if (btn) { btn.style.background = kk === k ? 'var(--gold)' : '#0a0a0a'; btn.style.color = kk === k ? '#000' : 'var(--muted)'; btn.style.borderColor = kk === k ? 'var(--gold)' : '#2a2a2a'; }
  });
  ['3m_ext_1y','3m_ext_v2'].forEach(mk => {
    const btn = document.getElementById(`ms-model-${mk}`);
    if (btn) { btn.style.background = mk === modelKey ? 'var(--gold)' : '#0a0a0a'; btn.style.color = mk === modelKey ? '#000' : 'var(--muted)'; btn.style.borderColor = mk === modelKey ? 'var(--gold)' : '#2a2a2a'; }
  });

  // ── Banner ─────────────────────────────────────────────────────────────
  const banner = document.getElementById('ms-banner');
  banner.innerHTML = `
    <div style="display:grid;grid-template-columns:auto 1fr;gap:0;border:1px solid ${curReg.color}44;border-radius:4px;overflow:hidden">
      <div style="background:${curReg.color}18;padding:16px 24px;border-right:1px solid ${curReg.color}33;min-width:200px">
        <div style="font-size:10px;color:${curReg.color};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin-bottom:4px">Current Macro Regime</div>
        <div style="font-size:22px;font-weight:900;color:${curReg.color};line-height:1.2;margin-bottom:6px">${curReg.name}</div>
        <div style="font-size:11px;color:${curReg.color}99;font-family:monospace">${curReg.signature}</div>
        <div style="margin-top:8px;font-size:18px;font-weight:700;color:${curReg.color}">${Math.round(curProbs[curClust]*100)}% confidence</div>
      </div>
      <div style="padding:16px 20px">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Probability Distribution</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${Array.from({length: k}, (_,c) => {
            const reg = regimes[c];
            const pct = Math.round((curProbs[c]||0)*100);
            const isCur = c === curClust;
            return `<div style="display:flex;align-items:center;gap:8px">
              <div style="width:120px;font-size:10px;color:${reg.color};font-weight:${isCur?'700':'400'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${reg.short}</div>
              <div style="flex:1;height:8px;background:#111;border-radius:2px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${reg.color};border-radius:2px;transition:width 0.4s"></div>
              </div>
              <div style="width:36px;text-align:right;font-size:11px;font-weight:${isCur?'700':'400'};color:${isCur?reg.color:'#555'}">${pct}%</div>
            </div>`;
          }).join('')}
        </div>
        <div style="margin-top:12px;font-size:11px;color:#555;line-height:1.6">
          Date: <span style="color:#888">${dates[curIdx]}</span> &nbsp;·&nbsp;
          k = <span style="color:#888">${k} regimes</span> &nbsp;·&nbsp;
          Model: <span style="color:#888">${modelKey}</span>
        </div>
      </div>
    </div>
  `;

  // ── Prob bars (right card) ─────────────────────────────────────────────
  const probBars = document.getElementById('ms-prob-bars');
  probBars.innerHTML = Array.from({length: k}, (_, c) => {
    const reg = regimes[c];
    const pct = Math.round((curProbs[c]||0)*100);
    const isCur = c === curClust;
    return `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:10px;color:${reg.color};font-weight:${isCur?'700':'400'}">${reg.name}</span>
          <span style="font-size:11px;font-weight:700;color:${isCur?reg.color:'#555'}">${pct}%</span>
        </div>
        <div style="height:10px;background:#111;border-radius:2px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${reg.color};opacity:${isCur?1:0.5};border-radius:2px"></div>
        </div>
        <div style="font-size:9px;color:#444;margin-top:2px;font-family:monospace">${reg.signature}</div>
      </div>
    `;
  }).join('');
  document.getElementById('ms-regime-desc').textContent = curReg.desc;

  // ── PCA Scatter ────────────────────────────────────────────────────────
  if (charts.pca) { charts.pca.destroy(); charts.pca = null; }
  const scatterCanvas = document.getElementById('ms-pca-scatter');
  if (scatterCanvas) {
    // Build per-cluster point sets
    const scatterDatasets = Array.from({length: k}, (_, c) => {
      const reg = regimes[c];
      const pts = pca2d
        .map((pt, i) => assigns[i] === c ? {x: pt[0], y: pt[1]} : null)
        .filter(Boolean);
      return {
        label: reg.short,
        data: pts,
        backgroundColor: reg.color + '66',
        borderColor: reg.color + 'aa',
        borderWidth: 0.5,
        pointRadius: 2.5,
        pointHoverRadius: 5,
      };
    });
    // Highlight current point
    scatterDatasets.push({
      label: 'Now',
      data: [{ x: pca2d[curIdx][0], y: pca2d[curIdx][1] }],
      backgroundColor: '#ffffff',
      borderColor: curReg.color,
      borderWidth: 2,
      pointRadius: 7,
      pointHoverRadius: 9,
    });

    charts.pca = new Chart(scatterCanvas.getContext('2d'), {
      type: 'scatter',
      data: { datasets: scatterDatasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: {
            display: true, position: 'bottom',
            labels: { color: '#888', font: { size: 9 }, boxWidth: 10, padding: 8 }
          },
          tooltip: {
            callbacks: {
              label: item => {
                if (item.dataset.label === 'Now') return ' Current state';
                return ` ${item.dataset.label}  (PC1=${item.parsed.x.toFixed(2)}, PC2=${item.parsed.y.toFixed(2)})`;
              }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'PC1 — Inflation / Rates axis', color: '#444', font: { size: 9 } },
               ticks: { color: '#444', font: { size: 8 } }, grid: { color: '#111' } },
          y: { title: { display: true, text: 'PC2 — Safe-haven axis (USD vs Fear)', color: '#444', font: { size: 9 } },
               ticks: { color: '#444', font: { size: 8 } }, grid: { color: '#111' } },
        }
      }
    });
  }

  // ── Timeline (stacked area) ────────────────────────────────────────────
  if (charts.timeline) { charts.timeline.destroy(); charts.timeline = null; }
  const tlCanvas = document.getElementById('ms-timeline');
  if (tlCanvas) {
    // Downsample to ~monthly for performance (every 4 weeks)
    const step = 4;
    const tlDates = dates.filter((_, i) => i % step === 0);
    const tlProbs  = probs.filter((_, i) => i % step === 0);

    const tlDatasets = Array.from({length: k}, (_, c) => ({
      label: regimes[c].short,
      data: tlProbs.map(row => Math.round((row[c]||0)*100)),
      backgroundColor: regimes[c].color + 'bb',
      borderColor:     regimes[c].color,
      borderWidth: 0,
      fill: true,
      pointRadius: 0,
      tension: 0.3,
    }));

    charts.timeline = new Chart(tlCanvas.getContext('2d'), {
      type: 'line',
      data: { labels: tlDates, datasets: tlDatasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'bottom',
                    labels: { color: '#888', font: { size: 9 }, boxWidth: 10, padding: 8 } },
          tooltip: {
            mode: 'index', intersect: false,
            callbacks: {
              title: items => { const d = new Date(items[0].label); return isNaN(d) ? items[0].label : d.toLocaleDateString('en-AU', {month:'short',year:'numeric'}); },
              label: item => `  ${item.dataset.label}: ${item.raw}%`,
            }
          },
          zoom: { pan:{enabled:true,mode:'x'}, zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x'} },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { maxTicksLimit: 14, maxRotation: 0, font: { size: 8 }, color: '#555',
                     callback: function(val) { const l = this.getLabelForValue(val); if (!l) return ''; const d = new Date(l); return isNaN(d) ? l : d.getFullYear(); } },
            grid: { color: '#111' },
          },
          y: {
            stacked: true, min: 0, max: 100,
            ticks: { font: { size: 8 }, color: '#555', callback: v => v + '%' },
            grid: { color: '#1a1a1a' },
          },
        }
      }
    });
  }

  // ── Cluster profiles ───────────────────────────────────────────────────
  if (charts.profiles) { charts.profiles.destroy(); charts.profiles = null; }
  const pfCanvas = document.getElementById('ms-profiles');
  if (pfCanvas) {
    const pfDatasets = Array.from({length: k}, (_, c) => ({
      label: regimes[c].short,
      data: feats.map(f => {
        const v = profiles[c]?.[f];
        return v != null ? parseFloat(v.toFixed(5)) : 0;
      }),
      backgroundColor: regimes[c].color + '88',
      borderColor:     regimes[c].color,
      borderWidth: 1,
    }));

    charts.profiles = new Chart(pfCanvas.getContext('2d'), {
      type: 'bar',
      data: { labels: feats, datasets: pfDatasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: true, position: 'bottom',
                    labels: { color: '#888', font: { size: 9 }, boxWidth: 10, padding: 8 } },
          tooltip: {
            callbacks: {
              label: item => {
                const v = item.raw;
                const dir = v > 0 ? 'TAILWIND' : 'HEADWIND';
                return `  ${item.dataset.label}: ${v >= 0 ? '+' : ''}${v.toFixed(5)}  [${dir}]`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: '#888', font: { size: 9 } }, grid: { color: '#111' } },
          y: { ticks: { color: '#555', font: { size: 8 },
                        callback: v => (v >= 0 ? '+' : '') + v.toFixed(4) },
               grid: { color: '#1a1a1a' } },
        }
      }
    });
  }

  // ── Stagflation Watch section ──────────────────────────────────────────
  _msBuildStagWatch(k, regimes, assigns, dates, probs, curProbs);
}

function _msBuildStagWatch(k, regimes, assigns, dates, probs, curProbs) {
  // Find the stagflation cluster: highest |cpi_yoy| + ff_chg negative
  // For k=4 this is always cluster 2, for k=3 there's no pure stag cluster
  const stagEl = document.getElementById('ms-stag-section');
  const body   = document.getElementById('ms-stag-body');

  if (k === 3) {
    stagEl.style.display = 'none';
    return;
  }
  stagEl.style.display = 'block';

  const STAG = 2;  // Cluster 2 is stagflation in k=4
  const stagReg = regimes[STAG];

  // Find all historical stagflation periods
  const periods = [];
  let inStag = false, stagStart = null;
  for (let i = 0; i < assigns.length; i++) {
    if (assigns[i] === STAG && !inStag) { inStag = true; stagStart = dates[i]; }
    if (assigns[i] !== STAG && inStag)  { inStag = false; periods.push({ start: stagStart, end: dates[i-1], n: i - assigns.slice(0,i).lastIndexOf(STAG) }); }
  }
  if (inStag) periods.push({ start: stagStart, end: dates[dates.length-1] });

  // Current stagflation probability
  const stagProb = Math.round((curProbs[STAG] || 0) * 100);
  const probColor = stagProb > 30 ? '#f59e0b' : stagProb > 10 ? '#d97706' : '#555';

  // Max stag prob in last 52 weeks (1 year)
  const recent52 = probs.slice(-52);
  const maxRecent = Math.round(Math.max(...recent52.map(r => r[STAG] || 0)) * 100);

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px">
      <div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Current Probability</div>
        <div style="font-size:28px;font-weight:900;color:${probColor}">${stagProb}%</div>
        <div style="font-size:10px;color:#555">of being in stagflation cluster right now</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Peak (last 12mo)</div>
        <div style="font-size:28px;font-weight:900;color:${maxRecent > 20 ? '#f59e0b' : '#555'}">${maxRecent}%</div>
        <div style="font-size:10px;color:#555">highest stagflation probability in last year</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Historical frequency</div>
        <div style="font-size:28px;font-weight:900;color:#888">${Math.round(assigns.filter(a=>a===STAG).length/assigns.length*100)}%</div>
        <div style="font-size:10px;color:#555">of all history since 1972</div>
      </div>
    </div>

    <div style="margin-bottom:14px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Stagflation Cluster Signature</div>
      <div style="font-family:monospace;font-size:11px;color:#f59e0b;background:#1a1200;border:1px solid #f59e0b33;border-radius:3px;padding:8px 12px;line-height:1.8">
        cpi_yoy  → STRONGLY POSITIVE  (inflation is a tailwind)<br>
        real_rate → STRONGLY POSITIVE  (real rates rising)<br>
        ff_chg   → STRONGLY NEGATIVE  (Fed Funds falling / Fed behind curve)<br>
        <span style="color:#555">Interpretation: prices rising, real economy under stress, Fed unable or unwilling to tighten enough</span>
      </div>
    </div>

    <div style="margin-bottom:14px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Historical Stagflation Periods (GMM-detected)</div>
      ${periods.length === 0
        ? '<div style="color:#555;font-size:11px">No historical periods detected at current cluster assignments.</div>'
        : periods.map(p => `
            <div style="display:inline-block;margin:3px 4px;padding:3px 10px;background:#f59e0b18;border:1px solid #f59e0b44;border-radius:3px;font-size:10px;font-family:monospace;color:#f59e0b">
              ${p.start} → ${p.end}
            </div>`).join('')
      }
    </div>

    <div>
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">What Would Trigger a Regime Shift to Stagflation?</div>
      <div style="font-size:11px;color:#666;line-height:1.8">
        The model currently reads <strong style="color:#2dd4bf">Disinflationary Tightening</strong> — CPI is a headwind (Fed winning the inflation fight).
        For the model to shift toward <strong style="color:#f59e0b">Stagflation</strong>, the following would need to occur:<br>
        <span style="color:#888">①</span> CPI re-accelerates (tariff pass-through, oil supply shock, wage spiral) — flipping cpi_yoy from headwind to tailwind<br>
        <span style="color:#888">②</span> Fed cuts rates despite elevated inflation (political pressure, recession fear, banking stress) — ff_chg goes negative<br>
        <span style="color:#888">③</span> Real rates rise (inflation outpacing Fed response) — real_rate coefficient strengthens<br>
        <br>
        <span style="color:#f59e0b44">The current tariff environment (2025) creates conditions ① and possibly ② simultaneously.
        Watch the CPI coefficient — when it flips from negative to positive in the sensitivity chart (Regime tab), that is the early warning.</span>
      </div>
    </div>
  `;
}
