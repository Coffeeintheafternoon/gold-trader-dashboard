// tab_macrostate.js
// GMM Macro Regime Clustering — dashboard tab
// Reads gmm_regime_data.json produced by scripts/run_gmm_regime_clustering.py
// GMM runs directly on standardised coefficient vectors — no PCA, no information loss.

'use strict';

// ── Regime definitions ─────────────────────────────────────────────────────
// k=4, 3m_ext_1y model. Cluster IDs stable via n_init=15, random_state=42.
// Profiles derived directly from coefficient space — no PCA inversion needed.
const _MS_K4 = {
  0: { name: 'Gold Bull / Dollar Momentum', short: 'Gold Bull',
       color: '#22c55e',
       desc:  'Dollar strength and gold momentum both positive simultaneously — a relatively rare alignment where macro uncertainty is driving both safe-haven and dollar demand. Historical: early gold bull runs, 2024 gold rally.',
       sig:   'dxy_mom ↑  gold_mom ↑  vix moderate' },
  1: { name: 'Disinflationary Fear',        short: 'Dis-inflation',
       color: '#2dd4bf',
       desc:  'Fear is the dominant driver but inflation is a headwind — the Fed is winning the inflation fight so CPI no longer supports gold. Gold is a pure fear asset here, not an inflation hedge. Current regime.',
       sig:   'vix ↑↑  cpi_yoy ↓  gold_mom ↓' },
  2: { name: 'Risk-Off Baseline',           short: 'Baseline',
       color: '#60a5fa',
       desc:  'The normal state — moderate fear premium, mild inflation tailwind, Fed policy in the background. No single driver dominates. The market is running with background anxiety but no acute stress.',
       sig:   'vix moderate  cpi_yoy +  ff_chg +' },
  3: { name: 'Stagflation',                 short: 'Stagflation',
       color: '#f59e0b',
       desc:  'The rarest and most dangerous regime. Real rates and CPI both strongly positive (inflation entrenched), but Fed Funds is falling — the Fed is behind the curve or cutting into inflation. Historical: 1970s oil shocks, early 1980s pre-Volcker.',
       sig:   'real_rate ↑↑  cpi_yoy ↑↑  ff_chg ↓↓' },
};

const _MS_K3 = {
  0: { name: 'Risk-Off / VIX Dominant', short: 'Risk-Off',
       color: '#60a5fa',
       desc:  'Fear premium dominant, real rates secondary. The broad "market is nervous" state.',
       sig:   'vix ↑↑  real_rate +  gold_mom -' },
  1: { name: 'Hard Money / Real Assets', short: 'Real Assets',
       color: '#22c55e',
       desc:  'Real rates dominate, gold momentum positive. Real assets and hard money era.',
       sig:   'real_rate ↑↑  gold_mom ↑  ff_chg ↓' },
  2: { name: 'Steady / Policy Driven', short: 'Steady',
       color: '#a78bfa',
       desc:  'VIX moderate, Fed policy and mild inflation in the background. Calmer markets.',
       sig:   'vix moderate  ff_chg +  cpi_yoy +' },
};

// Stagflation cluster index per k
const _MS_STAG_IDX = { 4: 3, 3: null };

// ── Init ───────────────────────────────────────────────────────────────────
let _msInitialised = false;

function initMacroStateTab() {
  if (_msInitialised) return;
  _msInitialised = true;

  const container = document.getElementById('tab-macrostate');
  container.innerHTML = `<div style="padding:16px 0 8px"><div id="ms-loading" style="color:var(--muted);padding:40px;text-align:center;font-size:13px">Loading GMM regime data…</div></div>`;

  const base = typeof _DATA_BASE !== 'undefined' ? _DATA_BASE : '';
  fetch(base + 'gmm_regime_data.json?v=' + Date.now())
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => _msBuild(container, data))
    .catch(err => {
      document.getElementById('ms-loading').innerHTML =
        `<span style="color:#ef4444">Failed to load gmm_regime_data.json — run scripts/run_gmm_regime_clustering.py first.<br><small>${err}</small></span>`;
    });
}

function _msBuild(container, data) {
  const m1y = data['3m_ext_1y'];
  if (!m1y) { container.innerHTML = '<p style="color:#ef4444;padding:20px">3m_ext_1y model not found.</p>'; return; }

  let activeK     = 4;
  let activeModel = '3m_ext_1y';
  const charts    = {};

  container.innerHTML = `
    <div style="padding:16px 0">

      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">GMM Macro Regime Clustering</div>
        <div style="font-size:11px;color:#555;max-width:860px;line-height:1.6">
          Walk-forward Ridge regression coefficients clustered directly in coefficient space — no PCA, no information loss.
          At each weekly step the model's full feature-weight vector is treated as a state snapshot.
          A Gaussian Mixture Model finds natural groupings in that space across 50+ years of history.
          Each group is a distinct macro regime, identified purely from how the model weighted macro features — not from prices, returns, or volatility.
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Clusters k =</div>
        <div id="ms-k-btns" style="display:flex;gap:6px"></div>
        <div style="width:1px;height:20px;background:#2a2a2a"></div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Model</div>
        <div id="ms-model-btns" style="display:flex;gap:6px"></div>
      </div>

      <div id="ms-banner" style="margin-bottom:20px"></div>

      <div class="chart-card" style="margin-bottom:16px">
        <div class="chart-title">Regime Probability Timeline — Full History</div>
        <div class="chart-subtitle">Stacked area showing probability of each regime at every weekly timestep. Single colour = model is confident. Mixed = transition zone. Zoom/pan to explore.</div>
        <div class="chart-wrap" style="height:260px;cursor:crosshair"><canvas id="ms-timeline"></canvas></div>
      </div>

      <div class="chart-card" style="margin-bottom:16px">
        <div class="chart-title">Regime Fingerprints — Mean Coefficient per Cluster</div>
        <div class="chart-subtitle">
          What each regime looks like in the model's own language. Positive bar = that feature was a tailwind in this regime. Negative = headwind.
          Clusters are derived entirely from the coefficient data — the labels and colours are applied after, based on the profiles.
        </div>
        <div class="chart-wrap" style="height:300px"><canvas id="ms-profiles"></canvas></div>
      </div>

      <div id="ms-stag-section" class="chart-card" style="border:1px solid #f59e0b44;margin-bottom:16px">
        <div class="chart-title" style="color:#f59e0b">Stagflation Watch</div>
        <div id="ms-stag-body"></div>
      </div>

      <div style="font-size:10px;color:#333;line-height:1.7;padding-top:8px;border-top:1px solid #111;max-width:860px">
        GMM fitted directly on standardised coefficient vectors — no PCA. Full coefficient variance preserved. ·
        n_init=15 · random_state=42 · covariance_type=full ·
        Method: Blake et al. (2025) arXiv:2510.03236 + Goulet Coulombe (2024) TVP-Ridge.
      </div>

    </div>
  `;

  // k buttons
  [3,4].forEach(k => {
    const btn = document.createElement('button');
    btn.id = `ms-k-${k}`; btn.textContent = k;
    btn.style.cssText = `padding:3px 12px;border-radius:3px;border:1px solid #2a2a2a;background:#0a0a0a;color:var(--muted);font-size:11px;font-weight:700;cursor:pointer;transition:all 0.15s`;
    btn.onclick = () => { activeK = k; _msRender(data, activeModel, activeK, charts); };
    document.getElementById('ms-k-btns').appendChild(btn);
  });

  // Model buttons
  [['3m_ext_1y','1Y Ext (1972–)'],['3m_ext_v2','V2 (2001–)']].forEach(([key, label]) => {
    if (!data[key]) return;
    const btn = document.createElement('button');
    btn.id = `ms-model-${key}`; btn.textContent = label;
    btn.style.cssText = `padding:3px 12px;border-radius:3px;border:1px solid #2a2a2a;background:#0a0a0a;color:var(--muted);font-size:11px;font-weight:700;cursor:pointer;transition:all 0.15s`;
    btn.onclick = () => { activeModel = key; _msRender(data, activeModel, activeK, charts); };
    document.getElementById('ms-model-btns').appendChild(btn);
  });

  _msRender(data, activeModel, activeK, charts);
}

function _msRender(data, modelKey, k, charts) {
  const m     = data[modelKey]; if (!m) return;
  const kData = m.k[k];        if (!kData) return;

  const feats   = m.feats;
  const dates   = m.dates;
  const assigns = kData.assigns;
  const probs   = kData.probs;
  const profiles= kData.profiles;
  const regimes = k === 4 ? _MS_K4 : _MS_K3;
  const curClust= assigns[assigns.length - 1];
  const curProbs= probs[probs.length - 1];
  const curReg  = regimes[curClust];

  // Button states
  [3,4].forEach(kk => {
    const b = document.getElementById(`ms-k-${kk}`);
    if (b) { b.style.background = kk===k ? 'var(--gold)' : '#0a0a0a'; b.style.color = kk===k ? '#000' : 'var(--muted)'; b.style.borderColor = kk===k ? 'var(--gold)' : '#2a2a2a'; }
  });
  ['3m_ext_1y','3m_ext_v2'].forEach(mk => {
    const b = document.getElementById(`ms-model-${mk}`);
    if (b) { b.style.background = mk===modelKey ? 'var(--gold)' : '#0a0a0a'; b.style.color = mk===modelKey ? '#000' : 'var(--muted)'; b.style.borderColor = mk===modelKey ? 'var(--gold)' : '#2a2a2a'; }
  });

  // ── Banner ─────────────────────────────────────────────────────────────
  document.getElementById('ms-banner').innerHTML = `
    <div style="border:1px solid ${curReg.color}44;border-radius:4px;overflow:hidden">
      <div style="display:grid;grid-template-columns:280px 1fr;gap:0">

        <div style="background:${curReg.color}12;padding:20px 24px;border-right:1px solid ${curReg.color}22">
          <div style="font-size:10px;color:${curReg.color};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin-bottom:6px">Current Macro Regime</div>
          <div style="font-size:20px;font-weight:900;color:${curReg.color};line-height:1.2;margin-bottom:6px">${curReg.name}</div>
          <div style="font-size:10px;color:${curReg.color}88;font-family:monospace;margin-bottom:10px">${curReg.sig}</div>
          <div style="font-size:26px;font-weight:900;color:${curReg.color}">${Math.round(curProbs[curClust]*100)}%</div>
          <div style="font-size:10px;color:${curReg.color}77">confidence · ${dates[dates.length-1]}</div>
        </div>

        <div style="padding:16px 20px">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">All regime probabilities</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
            ${Array.from({length: k}, (_,c) => {
              const reg = regimes[c];
              const pct = Math.round((curProbs[c]||0)*100);
              const isCur = c === curClust;
              return `<div style="display:flex;align-items:center;gap:10px">
                <div style="width:130px;font-size:10px;color:${reg.color};font-weight:${isCur?'700':'400'};white-space:nowrap">${reg.short}</div>
                <div style="flex:1;height:9px;background:#111;border-radius:2px;overflow:hidden">
                  <div style="width:${pct}%;height:100%;background:${reg.color};opacity:${isCur?1:0.55};border-radius:2px"></div>
                </div>
                <div style="width:34px;text-align:right;font-size:11px;font-weight:${isCur?'700':'400'};color:${isCur?reg.color:'#444'}">${pct}%</div>
              </div>`;
            }).join('')}
          </div>
          <div style="font-size:11px;color:#555;line-height:1.7;border-top:1px solid #1a1a1a;padding-top:10px">${curReg.desc}</div>
        </div>

      </div>
    </div>
  `;

  // ── Timeline ────────────────────────────────────────────────────────────
  if (charts.tl) { charts.tl.destroy(); charts.tl = null; }
  const tlCanvas = document.getElementById('ms-timeline');
  if (tlCanvas) {
    const step = 4;
    const tlDates = dates.filter((_,i) => i%step===0);
    const tlProbs  = probs.filter((_,i)  => i%step===0);
    charts.tl = new Chart(tlCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: tlDates,
        datasets: Array.from({length: k}, (_,c) => ({
          label: regimes[c].short,
          data:  tlProbs.map(r => Math.round((r[c]||0)*100)),
          backgroundColor: regimes[c].color + 'bb',
          borderColor:     regimes[c].color,
          borderWidth: 0, fill: true, pointRadius: 0, tension: 0.3,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode:'index', intersect:false },
        plugins: {
          legend: { display:true, position:'bottom', labels:{ color:'#888', font:{size:9}, boxWidth:10, padding:8 } },
          tooltip: {
            mode:'index', intersect:false,
            callbacks: {
              title: items => { const d=new Date(items[0].label); return isNaN(d)?items[0].label:d.toLocaleDateString('en-AU',{month:'short',year:'numeric'}); },
              label: item => `  ${item.dataset.label}: ${item.raw}%`,
              afterBody: items => {
                const dom = items.reduce((a,b) => a.raw>b.raw?a:b);
                return [``, `  Dominant: ${dom.dataset.label} (${dom.raw}%)`];
              },
            },
          },
          zoom: { pan:{enabled:true,mode:'x'}, zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x'} },
        },
        scales: {
          x: { stacked:true, ticks:{ maxTicksLimit:14, maxRotation:0, font:{size:8}, color:'#555',
               callback: function(v){ const l=this.getLabelForValue(v); if(!l) return ''; const d=new Date(l); return isNaN(d)?l:d.getFullYear(); } }, grid:{color:'#111'} },
          y: { stacked:true, min:0, max:100, ticks:{ font:{size:8}, color:'#555', callback: v=>v+'%' }, grid:{color:'#1a1a1a'} },
        },
      },
    });
  }

  // ── Fingerprints ────────────────────────────────────────────────────────
  if (charts.pf) { charts.pf.destroy(); charts.pf = null; }
  const pfCanvas = document.getElementById('ms-profiles');
  if (pfCanvas) {
    charts.pf = new Chart(pfCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: feats,
        datasets: Array.from({length: k}, (_,c) => ({
          label: regimes[c].short,
          data:  feats.map(f => { const v=profiles[c]?.[f]; return v!=null?parseFloat(v.toFixed(5)):0; }),
          backgroundColor: regimes[c].color + '88',
          borderColor:     regimes[c].color,
          borderWidth: 1,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display:true, position:'bottom', labels:{ color:'#888', font:{size:9}, boxWidth:10, padding:8 } },
          tooltip: {
            callbacks: {
              title: items => items[0].label,
              label: item => {
                const v = item.raw;
                return `  ${item.dataset.label}: ${v>=0?'+':''}${v.toFixed(5)}  [${v>0?'TAILWIND':'HEADWIND'}]`;
              },
            },
          },
        },
        scales: {
          x: { ticks:{ color:'#888', font:{size:9} }, grid:{color:'#111'} },
          y: { ticks:{ color:'#555', font:{size:8}, callback: v=>(v>=0?'+':'')+v.toFixed(4) }, grid:{color:'#1a1a1a'} },
        },
      },
    });
  }

  // ── Stagflation Watch ───────────────────────────────────────────────────
  const stagSection = document.getElementById('ms-stag-section');
  const stagBody    = document.getElementById('ms-stag-body');
  const STAG        = _MS_STAG_IDX[k];

  if (STAG === null) { stagSection.style.display = 'none'; return; }
  stagSection.style.display = 'block';

  const stagProb   = Math.round((curProbs[STAG]||0)*100);
  const probColor  = stagProb > 30 ? '#f59e0b' : stagProb > 10 ? '#d97706' : '#555';
  const recent52   = probs.slice(-52);
  const maxRecent  = Math.round(Math.max(...recent52.map(r => r[STAG]||0)) * 100);
  const histPct    = Math.round(assigns.filter(a=>a===STAG).length/assigns.length*100);

  // Historical stagflation periods
  const periods = [];
  let inStag = false, stagStart = null;
  for (let i = 0; i < assigns.length; i++) {
    if (assigns[i]===STAG && !inStag) { inStag=true; stagStart=dates[i]; }
    if (assigns[i]!==STAG && inStag)  { inStag=false; periods.push({start:stagStart, end:dates[i-1]}); }
  }
  if (inStag) periods.push({start:stagStart, end:dates[dates.length-1]});

  // Stagflation fingerprint from profiles
  const stagProfile = profiles[STAG] || {};
  const stagTop = Object.entries(stagProfile).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,4);

  stagBody.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:20px">
      <div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Current probability</div>
        <div style="font-size:36px;font-weight:900;color:${probColor};line-height:1">${stagProb}%</div>
        <div style="font-size:10px;color:#555;margin-top:4px">of being in stagflation cluster now</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Peak last 12 months</div>
        <div style="font-size:36px;font-weight:900;color:${maxRecent>20?'#f59e0b':'#555'};line-height:1">${maxRecent}%</div>
        <div style="font-size:10px;color:#555;margin-top:4px">highest stagflation probability in past year</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Historical frequency</div>
        <div style="font-size:36px;font-weight:900;color:#888;line-height:1">${histPct}%</div>
        <div style="font-size:10px;color:#555;margin-top:4px">of all history since 1972</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Cluster coefficient fingerprint</div>
        <div style="background:#1a1200;border:1px solid #f59e0b33;border-radius:3px;padding:10px 14px;font-family:monospace;font-size:11px;line-height:2">
          ${stagTop.map(([f,v]) => `<div><span style="color:#f59e0b88;display:inline-block;width:120px">${f}</span><span style="color:${v>0?'#f59e0b':'#ef4444'};font-weight:700">${v>=0?'+':''}${v.toFixed(5)}</span>&nbsp;<span style="color:#555;font-size:9px">${v>0?'TAILWIND':'HEADWIND'}</span></div>`).join('')}
        </div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">GMM-detected historical periods</div>
        <div style="font-size:11px;line-height:1.8">
          ${periods.length===0
            ? '<span style="color:#555">No historical periods at current cluster settings.</span>'
            : periods.map(p=>`<div style="display:inline-block;margin:2px 3px;padding:2px 9px;background:#f59e0b15;border:1px solid #f59e0b44;border-radius:3px;font-size:10px;font-family:monospace;color:#f59e0b">${p.start} → ${p.end}</div>`).join('')}
        </div>
      </div>
    </div>

    <div style="border-top:1px solid #1a1a1a;padding-top:14px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">What would trigger a shift to stagflation?</div>
      <div style="font-size:11px;color:#666;line-height:1.9;max-width:820px">
        The model currently reads <strong style="color:#2dd4bf">Disinflationary Fear</strong> — CPI is a headwind, meaning the Fed is winning the inflation fight.
        For the coefficient fingerprint to shift into the <strong style="color:#f59e0b">Stagflation</strong> cluster, three things must happen simultaneously:<br>
        <span style="color:#888">①</span>&nbsp; <strong style="color:#ccc">CPI flips from headwind to tailwind</strong> — inflation re-accelerates and the model stops penalising gold for it (tariff pass-through, oil supply shock, wage spiral are the current candidates)<br>
        <span style="color:#888">②</span>&nbsp; <strong style="color:#ccc">Fed Funds change goes negative</strong> — the Fed cuts or pauses despite elevated inflation, falling behind the curve<br>
        <span style="color:#888">③</span>&nbsp; <strong style="color:#ccc">Real rates rise</strong> — inflation outpaces the Fed response, real rates start lifting again<br><br>
        <span style="color:#f59e0b66">
          Leading indicator to watch: the <strong>cpi_yoy coefficient</strong> on the Regime tab (Sensitivity chart).
          When that line crosses from negative to positive, the model's internal fingerprint is beginning to resemble the stagflation cluster.
          That flip typically precedes a full cluster transition by 4–8 weeks.
        </span>
      </div>
    </div>
  `;
}
