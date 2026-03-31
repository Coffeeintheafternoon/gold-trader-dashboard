// tab_mines.js — MINES tab orchestrator
// Loads mine_data.json and coordinates all sub-modules.

let _mineData        = [];   // full dataset from mine_data.json
let _minesActiveTicker = null; // currently selected ticker

async function initMinesTab() {
  const loading = document.getElementById('mines-loading');
  const body    = document.getElementById('mines-body');

  const _showErr = (msg) => {
    loading.style.display = '';
    loading.innerHTML = `<div style="color:#ff6666;font-size:13px;text-align:center;padding:60px">
      ${msg}</div>`;
  };

  try {
    const _ctrl = new AbortController();
    const _t = setTimeout(() => _ctrl.abort(), 10000);
    const resp = await fetch('./mine_data.json?' + Date.now(), { signal: _ctrl.signal });
    clearTimeout(_t);
    if (!resp.ok) { _showErr('Fetch failed: HTTP ' + resp.status); return; }
    _mineData = await resp.json();
    if (!Array.isArray(_mineData) || _mineData.length === 0) {
      _showErr('No mine study data yet.<br><span style="font-size:11px">Run: python scripts/run_mine_study.py --all</span>');
      return;
    }
    loading.style.display = 'none';
    body.style.display    = '';
    _buildMinesPage();
  } catch (e) {
    _showErr('Error: ' + (e && e.message ? e.message : String(e)));
  }
}

function _buildMinesPage() {
  const body = document.getElementById('mines-body');

  body.innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:18px">
      <h2 style="margin:0;font-size:18px;color:var(--gold);letter-spacing:1px">MINE STUDIES</h2>
      <span style="font-size:11px;color:var(--muted)">v1.0 &mdash; ${_mineData.length} ticker${_mineData.length !== 1 ? 's' : ''} &mdash; data loaded ${new Date().toLocaleTimeString()}</span>
    </div>
    <!-- Ticker selector -->
    <div id="mines-ticker-bar" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px"></div>

    <!-- Overview cards -->
    <div id="mines-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
         gap:12px;margin-bottom:24px"></div>

    <!-- Detail panel (shown when ticker selected) -->
    <div id="mines-detail" style="display:none">
      <!-- Row 1: 3D viewer (full width, tall) -->
      <div class="chart-card" style="padding:0;overflow:hidden;margin-bottom:16px">
        <div style="padding:12px 16px 0;font-size:11px;font-weight:700;
             color:var(--muted);letter-spacing:1px">3D INTERCEPT VIEWER
          <span style="font-weight:400;margin-left:8px">· drag to rotate · scroll to zoom · right-drag to pan</span>
        </div>
        <div id="mines-3d-wrap" style="height:520px"></div>
      </div>
      <!-- Row 1b: intercepts table -->
      <div class="chart-card" style="padding:0;overflow:hidden;margin-bottom:16px">
        <div style="padding:12px 16px 0;font-size:11px;font-weight:700;
             color:var(--muted);letter-spacing:1px">DRILL INTERCEPTS</div>
        <div style="padding:12px">
          <canvas id="mines-map-canvas" style="display:none"></canvas>
          <div id="mines-map-inner"></div>
        </div>
      </div>

      <!-- Valuation summary bridge -->
      <div class="chart-card" id="mines-val-summary" style="padding:16px;margin-bottom:16px"></div>

      <!-- Row 2: resource history + grade-tonnage -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="chart-card" style="padding:16px">
          <div style="font-size:11px;font-weight:700;color:var(--muted);
               letter-spacing:1px;margin-bottom:12px">RESOURCE HISTORY (Moz)</div>
          <div style="position:relative;height:200px"><canvas id="mines-resource-chart"></canvas></div>
        </div>
        <div class="chart-card" style="padding:16px">
          <div style="font-size:11px;font-weight:700;color:var(--muted);
               letter-spacing:1px;margin-bottom:12px">GRADE vs CUTOFF</div>
          <div style="position:relative;height:200px"><canvas id="mines-grade-chart"></canvas></div>
        </div>
      </div>

      <!-- Row 3: valuation waterfall + sensitivity heatmap -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="chart-card" style="padding:16px">
          <div style="font-size:11px;font-weight:700;color:var(--muted);
               letter-spacing:1px;margin-bottom:12px">VALUATION WATERFALL (A$M)</div>
          <div style="position:relative;height:200px"><canvas id="mines-waterfall-chart"></canvas></div>
        </div>
        <div class="chart-card" style="padding:16px">
          <div style="font-size:11px;font-weight:700;color:var(--muted);
               letter-spacing:1px;margin-bottom:12px">NPV SENSITIVITY (A$M)</div>
          <div id="mines-heatmap"></div>
        </div>
      </div>

      <!-- Row 4: study timeline -->
      <div class="chart-card" style="padding:16px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);
             letter-spacing:1px;margin-bottom:16px">STUDY HISTORY TIMELINE</div>
        <div id="mines-timeline"></div>
      </div>

      <!-- Row 5: back-test scatter -->
      <div class="chart-card" style="padding:16px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);
             letter-spacing:1px;margin-bottom:12px">BACK-TEST: MODEL PREMIUM vs 90D RETURN</div>
        <div style="position:relative;height:180px"><canvas id="mines-backtest-chart"></canvas></div>
      </div>
    </div>
  `;

  _renderTickerBar();
  _renderOverviewCards();

  // Auto-select first ticker with data
  if (_mineData.length > 0) {
    try { _selectTicker(_mineData[0].ticker); } catch(e) {
      console.error('Mines _selectTicker failed:', e);
    }
  }
}

function _renderTickerBar() {
  const bar = document.getElementById('mines-ticker-bar');
  bar.innerHTML = _mineData.map(d => `
    <button id="mines-btn-${d.ticker}"
      onclick="_selectTicker('${d.ticker}')"
      style="background:#111;border:1px solid #2a2a2a;color:var(--muted);
             padding:6px 14px;border-radius:3px;font-size:12px;font-family:monospace;
             cursor:pointer;transition:all 0.15s">
      ${d.ticker.replace('.AX','')}
    </button>`
  ).join('');
}

function _fmtM(v) {
  if (v == null) return '—';
  return `A$${Math.round(v)}m`;
}

function _renderOverviewCards() {
  const wrap = document.getElementById('mines-cards');
  wrap.innerHTML = _mineData.map(d => {
    const latest = d.studies?.[0];
    const val    = d.valuation || {};

    // Prefer upside vs actual EV, fall back to vs market cap
    const up     = val.upside_vs_ev_pct != null ? val.upside_vs_ev_pct : val.upside_pct;
    const upLabel = val.upside_vs_ev_pct != null ? 'vs actual EV' : 'vs market cap';
    const upCol  = up == null ? 'var(--muted)' : up > 0 ? 'var(--green)' : 'var(--red)';
    const upStr  = up != null ? `${up > 0 ? '+' : ''}${up}%` : '—';
    const stg    = latest?.study_type || '—';
    const oz     = latest?.contained_metal_moz != null
      ? `${latest.contained_metal_moz.toFixed(2)} Moz` : '—';
    const grade  = latest?.avg_grade != null
      ? `${latest.avg_grade.toFixed(2)} g/t` : '—';

    const stageBg = {
      'DFS': 'rgba(170,255,0,0.08)', 'PFS': 'rgba(0,204,255,0.08)',
      'Scoping Study': 'rgba(255,204,0,0.08)', 'PEA': 'rgba(255,204,0,0.06)',
    }[stg] || 'rgba(255,255,255,0.03)';

    return `
      <div onclick="_selectTicker('${d.ticker}')"
           style="background:var(--card);border:1px solid #2a2a2a;border-radius:4px;
                  padding:14px 16px;cursor:pointer;transition:border-color 0.15s"
           onmouseover="this.style.borderColor='var(--gold)'"
           onmouseout="this.style.borderColor='#2a2a2a'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <span style="font-size:13px;font-weight:700;color:var(--text);font-family:monospace">
            ${d.ticker.replace('.AX','')}
          </span>
          <span style="font-size:10px;padding:2px 7px;border-radius:2px;
                       background:${stageBg};color:var(--text);border:1px solid #333">
            ${stg}
          </span>
        </div>
        <div style="font-size:22px;font-weight:700;font-family:monospace;
                    color:${upCol};margin-bottom:2px">${upStr}</div>
        <div style="font-size:10px;color:var(--muted)">${upLabel}</div>
        <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:4px">
          <div>
            <div style="font-size:10px;color:var(--muted)">RESOURCE</div>
            <div style="font-size:12px;color:var(--text);font-family:monospace">${oz}</div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--muted)">GRADE</div>
            <div style="font-size:12px;color:var(--text);font-family:monospace">${grade}</div>
          </div>
          <div style="margin-top:6px">
            <div style="font-size:10px;color:var(--muted)">MODEL EV</div>
            <div style="font-size:12px;color:var(--gold);font-family:monospace">${_fmtM(val.model_ev_m)}</div>
          </div>
          <div style="margin-top:6px">
            <div style="font-size:10px;color:var(--muted)">ACTUAL EV</div>
            <div style="font-size:12px;color:var(--text);font-family:monospace">${_fmtM(val.ev_m)}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function _renderValSummary(val) {
  const el = document.getElementById('mines-val-summary');
  if (!el) return;

  const up = val.upside_vs_ev_pct != null ? val.upside_vs_ev_pct : val.upside_pct;
  const upCol = up == null ? 'var(--muted)' : up > 0 ? 'var(--green)' : 'var(--red)';
  const upStr = up != null ? `${up > 0 ? '+' : ''}${up}%` : '—';
  const upLabel = val.upside_vs_ev_pct != null ? 'UPSIDE vs EV' : 'UPSIDE vs MCap';

  const stat = (label, value, col) => `
    <div style="min-width:100px">
      <div style="font-size:10px;color:var(--muted);margin-bottom:3px">${label}</div>
      <div style="font-size:13px;font-family:monospace;color:${col || 'var(--text)'}">
        ${value}
      </div>
    </div>`;

  const arrow = `<div style="font-size:16px;color:#444;align-self:center;padding-top:14px">→</div>`;

  el.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:1px;margin-bottom:12px">
      ENTERPRISE VALUE BRIDGE
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start">
      ${stat('MARKET CAP', _fmtM(val.market_cap_m))}
      <div style="font-size:16px;color:#444;align-self:center;padding-top:14px">+</div>
      ${stat('TOTAL DEBT', _fmtM(val.debt_m))}
      <div style="font-size:16px;color:#444;align-self:center;padding-top:14px">−</div>
      ${stat('CASH', _fmtM(val.cash_m))}
      ${arrow}
      ${stat('ACTUAL EV', _fmtM(val.ev_m), '#4499ff')}
      <div style="font-size:16px;color:#444;align-self:center;padding-top:14px">vs</div>
      ${stat('MODEL EV', _fmtM(val.model_ev_m), 'var(--gold)')}
      ${arrow}
      ${stat(upLabel, upStr, upCol)}
    </div>`;
}

function _selectTicker(ticker) {
  _minesActiveTicker = ticker;

  // Highlight button
  document.querySelectorAll('[id^="mines-btn-"]').forEach(b => {
    b.style.borderColor = '#2a2a2a';
    b.style.color = 'var(--muted)';
  });
  const btn = document.getElementById(`mines-btn-${ticker}`);
  if (btn) { btn.style.borderColor = 'var(--gold)'; btn.style.color = 'var(--gold)'; }

  const entry = _mineData.find(d => d.ticker === ticker);
  if (!entry) return;

  document.getElementById('mines-detail').style.display = '';

  // Render all sub-sections
  minesRender3D(entry.drill_holes || []);
  minesRenderMap(entry.drill_holes || []);
  _renderValSummary(entry.valuation || {});
  minesRenderCharts(entry.studies || [], entry.valuation || {});
}
