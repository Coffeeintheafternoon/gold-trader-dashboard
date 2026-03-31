// tab_mines_charts.js — Chart.js charts + heatmap + timeline for MINES tab

let _mineCharts = {};  // keyed by canvas id

function _destroyChart(id) {
  if (_mineCharts[id]) { _mineCharts[id].destroy(); delete _mineCharts[id]; }
}

// ── Main entry point ──────────────────────────────────────────────────────────

function minesRenderCharts(studies, valuation) {
  _renderResourceHistory(studies);
  _renderGradeChart(studies);
  _renderWaterfall(studies[0] || {}, valuation);
  _renderHeatmap(valuation);
  _renderTimeline(studies);
  _renderBacktest(studies, valuation);
}

// ── 1. Resource history (stacked bar) ─────────────────────────────────────────

function _renderResourceHistory(studies) {
  _destroyChart('mines-resource-chart');
  const c = document.getElementById('mines-resource-chart');
  if (!c || !studies.length) return;

  const sorted = [...studies].sort((a, b) => (a.announced_at || '').localeCompare(b.announced_at || ''));
  const labels = sorted.map(s => (s.announced_at || '').slice(0, 7));
  const vals   = sorted.map(s => +(s.contained_metal_moz || 0).toFixed(3));

  _mineCharts['mines-resource-chart'] = new Chart(c, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Contained (Moz)',
        data:  vals,
        backgroundColor: vals.map((_, i) => `rgba(170,255,0,${0.3 + i * 0.1})`),
        borderColor: SQ.green,
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxRotation: 45 } },
        y: { title: { display: true, text: 'Moz', color: SQ.muted }, beginAtZero: true },
      },
    },
  });
}

// ── 2. Grade vs cut-off ────────────────────────────────────────────────────────

function _renderGradeChart(studies) {
  _destroyChart('mines-grade-chart');
  const c = document.getElementById('mines-grade-chart');
  if (!c || !studies.length) return;

  const sorted = [...studies].sort((a, b) => (a.cutoff_grade || 0) - (b.cutoff_grade || 0));
  const labels = sorted.map(s => `${(s.cutoff_grade || '?')} g/t COG`);
  const grades = sorted.map(s => s.avg_grade || 0);
  const tonnes = sorted.map(s => s.total_tonnes_mt || 0);

  _mineCharts['mines-grade-chart'] = new Chart(c, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Avg Grade (g/t)',
          data: grades, yAxisID: 'y',
          borderColor: SQ.green, backgroundColor: hexA(SQ.green, 0.1),
          tension: 0.3, fill: true, pointRadius: 4,
        },
        {
          label: 'Tonnes (Mt)',
          data: tonnes, yAxisID: 'y2',
          borderColor: SQ.cyan, backgroundColor: 'transparent',
          tension: 0.3, borderDash: [4, 3], pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true } },
      scales: {
        y:  { title: { display: true, text: 'g/t', color: SQ.muted }, position: 'left' },
        y2: { title: { display: true, text: 'Mt',  color: SQ.muted }, position: 'right', grid: { drawOnChartArea: false } },
      },
    },
  });
}

// ── 3. Valuation waterfall ─────────────────────────────────────────────────────

function _renderWaterfall(study, val) {
  _destroyChart('mines-waterfall-chart');
  const c = document.getElementById('mines-waterfall-chart');
  if (!c) return;

  const ass   = val.assumptions || {};
  const gross = ass.gross_insitu_m || 0;
  const rec   = gross * ((study.recovery_pct || 90) / 100) - gross;   // negative
  const disc  = (val.model_ev_m || 0) - gross - rec;
  const modelEv = val.model_ev_m || 0;
  const actualEv = val.ev_m;   // may be null if data unavailable

  const labels = ['Gross In-Situ', 'Recovery', 'Stage Discount', 'Model EV'];
  const data   = [gross, rec, disc, modelEv];
  const colors = [
    hexA(SQ.green, 0.6),
    hexA(SQ.red,   0.5),
    hexA(SQ.red,   0.4),
    hexA(SQ.green, 0.8),
  ];

  if (actualEv != null) {
    labels.push('Actual EV');
    data.push(actualEv);
    colors.push('rgba(68,153,255,0.7)');
  }

  _mineCharts['mines-waterfall-chart'] = new Chart(c, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor:     colors.map(c => c.replace(/[\d.]+\)$/, '1)')),
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` A$${ctx.parsed.y.toFixed(0)}M` } } },
      scales: { y: { title: { display: true, text: 'A$M', color: SQ.muted } } },
    },
  });
}

// ── 4. Sensitivity heatmap (CSS grid) ─────────────────────────────────────────

function _renderHeatmap(val) {
  const wrap = document.getElementById('mines-heatmap');
  if (!wrap) return;

  const sens = val.sensitivity || [];
  if (!sens.length) {
    wrap.innerHTML = `<div style="color:var(--muted);font-size:12px;text-align:center;
      padding:40px">No sensitivity data — requires PFS/DFS economics</div>`;
    return;
  }

  // Unique gold price pcts (rows) and capex pcts (cols)
  const gRows = [...new Set(sens.map(r => r.gold_price_pct ?? r.vs_base_pct ?? 0))].sort((a,b) => b - a);
  const cCols = [...new Set(sens.map(r => r.capex_pct ?? 0))].sort((a,b) => a - b);

  const allEv = sens.map(r => r.model_ev_m).filter(Boolean);
  const minEv = Math.min(...allEv), maxEv = Math.max(...allEv);

  const cell = (ev) => {
    const t = maxEv === minEv ? 0.5 : (ev - minEv) / (maxEv - minEv);
    const r = Math.round(255 * (1 - t)), g = Math.round(200 * t);
    const bg = `rgba(${r},${g},0,0.35)`;
    const isBase = ev === allEv[Math.floor(allEv.length / 2)];
    return `<div style="background:${bg};padding:6px 4px;text-align:center;
      font-size:10px;font-family:monospace;color:var(--text);
      ${isBase ? 'outline:1px solid var(--gold)' : ''}">
      ${ev != null ? Math.round(ev) : '—'}
    </div>`;
  };

  const colHeader = cCols.map(p =>
    `<div style="text-align:center;font-size:10px;color:var(--muted);padding:4px">
      CAPEX ${p > 0 ? '+' : ''}${p}%</div>`
  ).join('');

  const rows = gRows.map(gp => {
    const rowLabel = `<div style="font-size:10px;color:var(--muted);padding:4px 6px;
      display:flex;align-items:center">Au ${gp > 0 ? '+' : ''}${gp}%</div>`;
    const cells = cCols.map(cp => {
      const r = sens.find(s => (s.gold_price_pct ?? 0) === gp && (s.capex_pct ?? 0) === cp);
      return cell(r?.model_ev_m ?? null);
    }).join('');
    return `<div style="display:contents">${rowLabel}${cells}</div>`;
  }).join('');

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:70px ${cCols.map(() => '1fr').join(' ')};
      gap:2px;font-family:monospace">
      <div></div>${colHeader}
      ${rows}
    </div>`;
}

// ── 5. Study history timeline ─────────────────────────────────────────────────

function _renderTimeline(studies) {
  const wrap = document.getElementById('mines-timeline');
  if (!wrap) return;

  if (!studies.length) {
    wrap.innerHTML = `<div style="color:var(--muted);font-size:12px">No studies found</div>`;
    return;
  }

  const sorted = [...studies].sort((a, b) => (a.announced_at || '').localeCompare(b.announced_at || ''));
  const stageColor = { DFS: SQ.green, PFS: SQ.cyan, 'Scoping Study': SQ.amber,
    PEA: SQ.amber, 'Resource Update': SQ.violet, 'Exploration Target': SQ.neutral };

  const items = sorted.map(s => {
    const col  = stageColor[s.study_type] || SQ.neutral;
    const date = (s.announced_at || '').slice(0, 7);
    const oz   = s.contained_metal_moz != null ? `${s.contained_metal_moz.toFixed(2)} Moz` : '';
    const conf = s.extraction_confidence != null ? `${Math.round(s.extraction_confidence * 100)}% conf` : '';
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <div style="width:12px;height:12px;border-radius:50%;background:${col};
          box-shadow:0 0 8px ${col}"></div>
        <div style="font-size:9px;color:${col};font-weight:700;white-space:nowrap">${s.study_type || '?'}</div>
        <div style="font-size:9px;color:var(--muted)">${date}</div>
        ${oz   ? `<div style="font-size:9px;color:var(--text)">${oz}</div>` : ''}
        ${conf ? `<div style="font-size:8px;color:var(--muted)">${conf}</div>` : ''}
      </div>`;
  });

  const connectors = items.map((_, i) =>
    i < items.length - 1
      ? `<div style="flex:1;height:1px;background:rgba(170,255,0,0.15);margin-top:6px"></div>`
      : ''
  );

  const combined = items.reduce((acc, item, i) => acc + item + (connectors[i] || ''), '');
  wrap.innerHTML = `<div style="display:flex;align-items:flex-start;gap:0;overflow-x:auto;
    padding-bottom:8px">${combined}</div>`;
}

// ── 6. Back-test scatter ───────────────────────────────────────────────────────

function _renderBacktest(studies, val) {
  _destroyChart('mines-backtest-chart');
  const c = document.getElementById('mines-backtest-chart');
  if (!c) return;

  // Build scatter points from studies that have both upside and a return
  const points = studies
    .filter(s => s._backtest_upside_pct != null && s._backtest_ret90 != null)
    .map(s => ({ x: s._backtest_upside_pct, y: s._backtest_ret90, label: s.announced_at?.slice(0, 7) }));

  if (!points.length) {
    // No back-test data yet — show placeholder message
    const ctx2 = c.getContext('2d');
    c.height = 80;
    ctx2.fillStyle = '#334433';
    ctx2.font = '12px monospace';
    ctx2.textAlign = 'center';
    ctx2.fillText('Run scripts/run_mine_backtest.py to populate', c.width / 2, 40);
    return;
  }

  _mineCharts['mines-backtest-chart'] = new Chart(c, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Announcements',
        data: points,
        backgroundColor: points.map(p => p.y > 0 ? hexA(SQ.green, 0.6) : hexA(SQ.red, 0.5)),
        pointRadius: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          label: ctx => `${ctx.raw.label}: upside ${ctx.raw.x}% → ret ${ctx.raw.y}%`,
        }},
      },
      scales: {
        x: { title: { display: true, text: 'Model Upside % at Announcement', color: SQ.muted } },
        y: { title: { display: true, text: '90-Day Return %', color: SQ.muted } },
      },
    },
  });
}
