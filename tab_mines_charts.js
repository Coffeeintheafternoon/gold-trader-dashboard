// tab_mines_charts.js — All charts, panels, and data displays for MINES tab.
// Covers: resource history, grade-cutoff, waterfall, heatmap, timeline, backtest,
//         key stats, production profile, capex waterfall, AISC build-up,
//         NPV scenarios, synthetic DFS mission grid.

let _mineCharts = {};  // keyed by canvas id

function _destroyChart(id) {
  if (_mineCharts[id]) { _mineCharts[id].destroy(); delete _mineCharts[id]; }
}

// ── Main entry point (called on ticker select) ─────────────────────────────

function minesRenderCharts(studies, valuation) {
  _renderResourceHistory(studies);
  _renderGradeChart(studies);
  _renderWaterfall(studies[0] || {}, valuation);
  _renderHeatmap(valuation);
  _renderTimeline(studies);
  _renderBacktest(studies, valuation);
}

// ── 1. Resource history (bar, coloured by study type) ─────────────────────

function _renderResourceHistory(studies) {
  _destroyChart('mines-resource-chart');
  const c = document.getElementById('mines-resource-chart');
  if (!c || !studies.length) return;

  const stageCol = {
    'DFS': SQ.green, 'PFS': SQ.cyan, 'Scoping Study': SQ.amber,
    'PEA': SQ.amber, 'Resource Update': SQ.violet, 'Exploration Target': SQ.neutral,
  };

  const sorted = [...studies]
    .filter(s => s.contained_metal_moz)
    .sort((a, b) => (a.announced_at || '').localeCompare(b.announced_at || ''));

  if (!sorted.length) return;

  const labels = sorted.map(s => (s.announced_at || '').slice(0, 7));
  const vals   = sorted.map(s => +(s.contained_metal_moz || 0).toFixed(3));
  const colors = sorted.map(s => hexA(stageCol[s.study_type] || SQ.neutral, 0.55));
  const borders = sorted.map(s => stageCol[s.study_type] || SQ.neutral);

  _mineCharts['mines-resource-chart'] = new Chart(c, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Contained (Moz)',
        data: vals,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => {
          const s = sorted[ctx.dataIndex];
          return ` ${ctx.parsed.y.toFixed(2)} Moz — ${s.study_type || '?'} (${(s.extraction_confidence*100|0)}% conf)`;
        }}},
      },
      scales: {
        x: { ticks: { maxRotation: 45, font: { size: 9 } } },
        y: { title: { display: true, text: 'Moz', color: SQ.muted }, beginAtZero: true },
      },
    },
  });
}

// ── 2. Grade vs cut-off ────────────────────────────────────────────────────

function _renderGradeChart(studies) {
  _destroyChart('mines-grade-chart');
  const c = document.getElementById('mines-grade-chart');
  if (!c || !studies.length) return;

  const withGrade = studies.filter(s => s.avg_grade);
  if (!withGrade.length) return;

  const sorted = [...withGrade].sort((a, b) => (a.cutoff_grade || 0) - (b.cutoff_grade || 0));
  const labels = sorted.map(s => s.cutoff_grade ? `${s.cutoff_grade} g/t` : 'n/a');
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
      plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 12 } } },
      scales: {
        y:  { title: { display: true, text: 'g/t', color: SQ.muted }, position: 'left' },
        y2: { title: { display: true, text: 'Mt',  color: SQ.muted }, position: 'right',
              grid: { drawOnChartArea: false } },
      },
    },
  });
}

// ── 3. Valuation waterfall ─────────────────────────────────────────────────

function _renderWaterfall(study, val) {
  _destroyChart('mines-waterfall-chart');
  const c = document.getElementById('mines-waterfall-chart');
  if (!c) return;

  const ass   = val.assumptions || {};
  const gross = ass.gross_insitu_m || 0;
  const rec   = gross > 0 ? (gross * ((study.recovery_pct || 90) / 100) - gross) : 0;
  const disc  = (val.model_ev_m || 0) - gross - rec;
  const modelEv = val.model_ev_m || 0;
  const actualEv = val.ev_m;

  if (!gross && !modelEv) return;

  const labels = ['Gross In-Situ', 'Recovery', 'Stage Discount', 'Model EV'];
  const data   = [gross, rec, disc, modelEv];
  const colors = [
    hexA(SQ.green, 0.6), hexA(SQ.red, 0.5), hexA(SQ.red, 0.4), hexA(SQ.green, 0.8),
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
      datasets: [{ data, backgroundColor: colors,
        borderColor: colors.map(c => c.replace(/[\d.]+\)$/, '1)')), borderWidth: 1 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` A$${ctx.parsed.y.toFixed(0)}M` } } },
      scales: { y: { title: { display: true, text: 'A$M', color: SQ.muted } } },
    },
  });
}

// ── 4. NPV sensitivity heatmap ─────────────────────────────────────────────

function _renderHeatmap(val) {
  const wrap = document.getElementById('mines-heatmap');
  if (!wrap) return;

  const sens = val.sensitivity || [];
  if (!sens.length) {
    wrap.innerHTML = `<div style="color:var(--muted);font-size:12px;text-align:center;padding:40px">
      No sensitivity data — requires PFS/DFS economics</div>`;
    return;
  }

  const gRows = [...new Set(sens.map(r => r.gold_price_pct ?? r.vs_base_pct ?? 0))].sort((a,b) => b - a);
  const cCols = [...new Set(sens.map(r => r.capex_pct ?? 0))].sort((a,b) => a - b);
  const allEv = sens.map(r => r.model_ev_m).filter(Boolean);
  const minEv = Math.min(...allEv), maxEv = Math.max(...allEv);

  const cell = (ev) => {
    if (ev == null) return `<div style="padding:6px 4px;text-align:center;font-size:10px;color:var(--muted)">—</div>`;
    const t = maxEv === minEv ? 0.5 : (ev - minEv) / (maxEv - minEv);
    const r = Math.round(255 * (1 - t)), g = Math.round(200 * t);
    return `<div style="background:rgba(${r},${g},0,0.35);padding:6px 4px;text-align:center;
      font-size:10px;font-family:monospace;color:var(--text)">${Math.round(ev)}</div>`;
  };

  const colHeader = `<div></div>` + cCols.map(p =>
    `<div style="text-align:center;font-size:10px;color:var(--muted);padding:4px">
      CAPEX ${p >= 0 ? '+' : ''}${p}%</div>`
  ).join('');

  const rows = gRows.map(gp => {
    const cells = cCols.map(cp => {
      const r = sens.find(s => (s.gold_price_pct ?? 0) === gp && (s.capex_pct ?? 0) === cp);
      return cell(r?.model_ev_m ?? null);
    }).join('');
    return `<div style="font-size:10px;color:var(--muted);padding:4px 6px;
      display:flex;align-items:center">Au ${gp >= 0 ? '+' : ''}${gp}%</div>${cells}`;
  }).join('');

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:70px ${cCols.map(() => '1fr').join(' ')};
      gap:2px;font-family:monospace">
      ${colHeader}${rows}
    </div>`;
}

// ── 5. Study history timeline ──────────────────────────────────────────────

function _renderTimeline(studies) {
  const wrap = document.getElementById('mines-timeline');
  if (!wrap) return;

  if (!studies.length) {
    wrap.innerHTML = `<div style="color:var(--muted);font-size:12px">No studies found</div>`;
    return;
  }

  const stageCol = { DFS: SQ.green, PFS: SQ.cyan, 'Scoping Study': SQ.amber,
    PEA: SQ.amber, 'Resource Update': SQ.violet, 'Exploration Target': SQ.neutral };

  const sorted = [...studies].sort((a, b) => (a.announced_at || '').localeCompare(b.announced_at || ''));

  const items = sorted.map(s => {
    const col  = stageCol[s.study_type] || SQ.neutral;
    const date = (s.announced_at || '').slice(0, 7);
    const oz   = s.contained_metal_moz != null ? `${s.contained_metal_moz.toFixed(2)} Moz` : null;
    const gr   = s.avg_grade != null ? `${s.avg_grade.toFixed(2)} g/t` : null;
    const conf = s.extraction_confidence != null ? `${Math.round(s.extraction_confidence * 100)}%` : null;

    const lines = [
      `<div style="font-size:9px;color:${col};font-weight:700;white-space:nowrap;margin-top:4px">${s.study_type || '?'}</div>`,
      `<div style="font-size:9px;color:var(--muted)">${date}</div>`,
      oz   ? `<div style="font-size:9px;color:var(--text)">${oz}</div>` : '',
      gr   ? `<div style="font-size:9px;color:var(--muted)">${gr}</div>` : '',
      conf ? `<div style="font-size:8px;color:#334433">${conf} conf</div>` : '',
    ].join('');

    return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:70px">
      <div style="width:12px;height:12px;border-radius:50%;background:${col};
        flex-shrink:0;box-shadow:0 0 6px ${col}55"></div>
      ${lines}
    </div>`;
  });

  const connectors = items.map((_, i) => i < items.length - 1
    ? `<div style="flex:1;height:1px;background:rgba(170,255,0,0.12);margin-top:6px;min-width:8px"></div>`
    : ''
  );

  const combined = items.reduce((acc, item, i) => acc + item + (connectors[i] || ''), '');
  wrap.innerHTML = `<div style="display:flex;align-items:flex-start;overflow-x:auto;
    padding-bottom:8px;gap:0">${combined}</div>`;
}

// ── 6. Back-test scatter ───────────────────────────────────────────────────

function _renderBacktest(studies, val) {
  _destroyChart('mines-backtest-chart');
  const c = document.getElementById('mines-backtest-chart');
  if (!c) return;

  const points = studies
    .filter(s => s._backtest_upside_pct != null && s._backtest_ret90 != null)
    .map(s => ({ x: s._backtest_upside_pct, y: s._backtest_ret90, label: s.announced_at?.slice(0, 7) }));

  if (!points.length) {
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
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.raw.label}: ${ctx.raw.x}% → ${ctx.raw.y}%` } } },
      scales: {
        x: { title: { display: true, text: 'Model Upside % at Announcement', color: SQ.muted } },
        y: { title: { display: true, text: '90-Day Return %', color: SQ.muted } },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW SECTIONS — Synthetic DFS infrastructure
// ═══════════════════════════════════════════════════════════════════════════

// ── Key stats strip ────────────────────────────────────────────────────────

function minesRenderKeyStats(entry) {
  const el = document.getElementById('mines-keystats');
  if (!el) return;

  const studies = entry.studies || [];
  const val     = entry.valuation || {};
  const synth   = entry.synthetic_dfs?.financial_summary || {};

  // Pull best available values across studies + synthetic data
  const bestStudy = studies.find(s => s.mine_life_yr) || studies.find(s => s.aisc_per_oz) || studies[0] || {};

  const aisc     = synth.aisc_breakdown?.find?.(r => r.type === 'total')?.value_usd_oz
                   || bestStudy.aisc_per_oz;
  const mineLife = bestStudy.mine_life_yr;
  const annualOz = val.assumptions?.annual_oz;
  const recovery = bestStudy.recovery_pct;
  const capex    = synth.capex_breakdown?.find?.(r => r.type === 'total')?.value_m_usd
                   || bestStudy.capex_m;
  const npv      = entry.synthetic_dfs?.financial_summary?.npv_scenarios?.[0]?.npv_m_usd
                   || bestStudy.npv_posttax_m;
  const holes    = (entry.drill_holes || []).length;
  const studies_ = studies.length;

  const kpi = (label, value, unit = '', col = 'var(--text)') => `
    <div style="background:var(--card);border:1px solid #1e2e1e;border-radius:3px;
         padding:10px 14px;min-width:90px;flex:1">
      <div style="font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:4px">${label}</div>
      <div style="font-size:16px;font-weight:700;font-family:monospace;color:${col}">
        ${value != null ? value : '—'}${value != null && unit ? `<span style="font-size:10px;color:var(--muted);margin-left:2px">${unit}</span>` : ''}
      </div>
    </div>`;

  el.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${kpi('MINE LIFE', mineLife ? mineLife.toFixed(1) : null, 'yr')}
      ${kpi('ANN. PROD', annualOz ? Math.round(annualOz / 1000) : null, 'koz/yr')}
      ${kpi('RECOVERY', recovery ? recovery.toFixed(1) : null, '%', SQ.cyan)}
      ${kpi('AISC', aisc ? Math.round(aisc) : null, 'US$/oz', SQ.amber)}
      ${kpi('CAPEX', capex ? Math.round(capex) : null, 'US$M', SQ.red)}
      ${kpi('NPV (stated)', npv ? Math.round(npv) : null, 'US$M', SQ.green)}
      ${kpi('STUDIES', studies_)}
      ${kpi('DRILL HOLES', holes)}
    </div>`;
}

// ── Production profile ─────────────────────────────────────────────────────

function minesRenderProductionProfile(synth) {
  _destroyChart('mines-production-chart');
  const c = document.getElementById('mines-production-chart');
  if (!c) return;

  const profile = synth?.financial_summary?.production_profile || [];

  if (!profile.length) {
    const ctx = c.getContext('2d');
    c.height = 60;
    ctx.fillStyle = SQ.neutral;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No production profile — will populate when synthetic DFS is generated', c.width / 2, 30);
    return;
  }

  const labels = profile.map(p => `Yr ${p.year}`);
  const total  = profile.map(p => p.total_koz || 0);
  const op     = profile.map(p => p.op_koz || 0);
  const ug     = profile.map(p => p.ug_koz || 0);

  const hasUG = ug.some(v => v > 0);

  const datasets = hasUG ? [
    { label: 'OP koz',  data: op, backgroundColor: hexA(SQ.green, 0.55), stack: 'a' },
    { label: 'UG koz',  data: ug, backgroundColor: hexA(SQ.cyan,  0.55), stack: 'a' },
  ] : [
    { label: 'Total koz', data: total, backgroundColor: hexA(SQ.green, 0.55) },
  ];

  _mineCharts['mines-production-chart'] = new Chart(c, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} koz — ${ctx.dataset.label}` } },
      },
      scales: {
        x: { stacked: true, ticks: { font: { size: 9 } } },
        y: { stacked: true, title: { display: true, text: 'koz', color: SQ.muted }, beginAtZero: true },
      },
    },
  });
}

// ── Capex breakdown + AISC build-up ───────────────────────────────────────

function minesRenderCapexAISC(synth, studies) {
  _renderCapexChart(synth, studies);
  _renderAISCPanel(synth, studies);
}

function _renderCapexChart(synth, studies) {
  _destroyChart('mines-capex-chart');
  const c = document.getElementById('mines-capex-chart');
  if (!c) return;

  const breakdown = synth?.financial_summary?.capex_breakdown || [];

  // Fallback: build from study data if no synthetic breakdown
  let items = breakdown.filter(r => r.type !== 'total' && r.type !== 'sustaining');

  if (!items.length && studies) {
    const s = studies.find(st => st.capex_m);
    if (s?.capex_m) {
      items = [{ label: 'Total Capex', value_m_usd: s.capex_m, type: 'add' }];
    }
  }

  if (!items.length) {
    const ctx = c.getContext('2d');
    ctx.fillStyle = SQ.neutral;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No capex breakdown — will populate from synthetic DFS', c.width / 2, c.height / 2);
    return;
  }

  const labels = items.map(r => r.label);
  const data   = items.map(r => r.value_m_usd || 0);
  const colors = items.map(r =>
    r.label.toLowerCase().includes('ug') ? hexA(SQ.cyan, 0.6)
    : r.label.toLowerCase().includes('infra') ? hexA(SQ.amber, 0.5)
    : r.label.toLowerCase().includes('contingency') ? hexA(SQ.red, 0.4)
    : hexA(SQ.green, 0.5)
  );

  // Add sustaining as separate bar if available
  const sustaining = breakdown.find(r => r.type === 'sustaining');
  if (sustaining?.value_m_usd) {
    labels.push('Sustaining (LOM)');
    data.push(sustaining.value_m_usd);
    colors.push(hexA(SQ.violet, 0.5));
  }

  _mineCharts['mines-capex-chart'] = new Chart(c, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 1,
      borderColor: colors.map(c => c.replace(/[\d.]+\)$/, '0.9)')) }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` US$${ctx.parsed.x.toFixed(0)}M` } } },
      scales: { x: { title: { display: true, text: 'US$M', color: SQ.muted }, beginAtZero: true },
        y: { ticks: { font: { size: 9 } } } },
    },
  });
}

function _renderAISCPanel(synth, studies) {
  const wrap = document.getElementById('mines-aisc-wrap');
  if (!wrap) return;

  const breakdown = synth?.financial_summary?.aisc_breakdown || [];

  // Fallback to study AISC if no breakdown
  const fallbackAISC = studies?.find(s => s.aisc_per_oz)?.aisc_per_oz;
  const total = breakdown.find(r => r.type === 'total');
  const components = breakdown.filter(r => r.type === 'add' && r.value_usd_oz != null);

  if (!components.length && !total && !fallbackAISC) {
    wrap.innerHTML = `<div style="color:var(--muted);font-size:11px;text-align:center;padding:40px">
      No AISC breakdown — will populate from synthetic DFS</div>`;
    return;
  }

  // Simple horizontal bar build-up
  const totalVal = total?.value_usd_oz || fallbackAISC || 0;
  const maxBar   = totalVal * 1.05;

  const rows = components.length ? components : [{ label: 'Total AISC', value_usd_oz: fallbackAISC, type: 'add' }];
  const colMap = {
    'OP Mining': SQ.green, 'UG Mining': SQ.cyan, 'Processing': SQ.amber,
    'G&A': SQ.violet, 'Royalty': SQ.red, 'Sustaining': '#4499ff',
  };

  const barRows = rows.map(r => {
    const w = maxBar > 0 ? Math.round((r.value_usd_oz / maxBar) * 100) : 0;
    const col = colMap[r.label] || SQ.neutral;
    return `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:2px">
        <span>${r.label}</span>
        <span style="color:${col};font-family:monospace">${r.value_usd_oz != null ? `US$${r.value_usd_oz.toFixed(0)}/oz` : '—'}</span>
      </div>
      <div style="background:#0a0f0a;border-radius:1px;height:10px">
        <div style="height:10px;width:${w}%;background:${col};border-radius:1px;opacity:0.75"></div>
      </div>
    </div>`;
  }).join('');

  const totalRow = total || fallbackAISC
    ? `<div style="margin-top:12px;padding-top:8px;border-top:1px solid #1a2a1a;
         display:flex;justify-content:space-between">
         <span style="font-size:11px;font-weight:700;color:var(--muted)">TOTAL AISC</span>
         <span style="font-size:14px;font-weight:700;font-family:monospace;color:${SQ.amber}">
           US$${totalVal.toFixed(0)}/oz</span>
       </div>` : '';

  wrap.innerHTML = barRows + totalRow;
}

// ── NPV multi-scenario table ───────────────────────────────────────────────

function minesRenderNPVScenarios(synth, val) {
  const wrap = document.getElementById('mines-npv-scenarios');
  if (!wrap) return;

  const scenarios = synth?.financial_summary?.npv_scenarios || [];

  if (!scenarios.length) {
    // Build from sensitivity grid if available
    const sens = val?.sensitivity || [];
    if (sens.length) {
      const goldRows = sens.filter(s => (s.capex_pct ?? 0) === 0);
      if (goldRows.length) {
        wrap.innerHTML = `
          <table style="width:100%;border-collapse:collapse;font-family:monospace;font-size:11px">
            <thead><tr style="color:var(--muted);font-size:10px;border-bottom:1px solid #1a2a1a">
              <th style="padding:5px 10px;text-align:left">Au PRICE</th>
              <th style="padding:5px 10px;text-align:right">MODEL EV</th>
            </tr></thead>
            <tbody>
              ${goldRows.map(r => `<tr style="border-bottom:1px solid #0a140a">
                <td style="padding:4px 10px;color:var(--muted)">
                  A$${r.gold_price_aud?.toLocaleString() || '?'}/oz</td>
                <td style="padding:4px 10px;text-align:right;color:${SQ.green};font-weight:700">
                  A$${Math.round(r.model_ev_m)}M</td>
              </tr>`).join('')}
            </tbody>
          </table>`;
        return;
      }
    }
    wrap.innerHTML = `<div style="color:var(--muted);font-size:11px;text-align:center;padding:20px">
      No NPV scenarios — will populate from synthetic DFS financial model</div>`;
    return;
  }

  const rows = scenarios.map(s => {
    const npvCol = s.npv_m_usd > 1000 ? SQ.green : s.npv_m_usd > 500 ? SQ.amber : SQ.red;
    return `<tr style="border-bottom:1px solid #0a140a">
      <td style="padding:6px 12px;color:var(--muted)">US$${s.gold_usd?.toLocaleString()}/oz</td>
      <td style="padding:6px 12px;text-align:right;font-weight:700;font-family:monospace;color:${npvCol}">
        US$${Math.round(s.npv_m_usd)}M</td>
      <td style="padding:6px 12px;text-align:right;color:${SQ.cyan}">
        ${s.irr_pct != null ? s.irr_pct + '%' : '—'}</td>
      <td style="padding:6px 12px;text-align:right;color:var(--muted)">
        ${s.payback_yr != null ? s.payback_yr + ' yr' : '—'}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-family:monospace;font-size:11px">
      <thead><tr style="color:var(--muted);font-size:10px;border-bottom:1px solid #1a2a1a">
        <th style="padding:5px 12px;text-align:left">GOLD PRICE</th>
        <th style="padding:5px 12px;text-align:right">POST-TAX NPV5%</th>
        <th style="padding:5px 12px;text-align:right">IRR</th>
        <th style="padding:5px 12px;text-align:right">PAYBACK</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Synthetic DFS mission grid ─────────────────────────────────────────────

function minesRenderMissionGrid(synth) {
  const wrap = document.getElementById('mines-synth-content');
  if (!wrap) return;

  if (!synth) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:32px 20px">
        <div style="color:var(--muted);font-size:13px;margin-bottom:8px">
          No synthetic DFS generated yet</div>
        <div style="color:#334433;font-size:11px;line-height:1.7">
          Run: <span style="color:var(--gold);font-family:monospace">
          python scripts/synthetic_dfs_builder.py PDI.AX</span><br>
          The system will predict each DFS section from prior announcements and
          validate against the actual DFS as the holdout dataset.
        </div>
      </div>`;
    return;
  }

  const missions = synth.missions || [];
  const grade    = synth.overall_grade || '?';
  const score    = synth.overall_score != null ? synth.overall_score.toFixed(1) : '?';
  const genAt    = synth.generated_at ? synth.generated_at.slice(0, 10) : '?';
  const ho       = synth.holdout_ticker || '';

  const scoreCol = score >= 4 ? SQ.green : score >= 3 ? SQ.amber : score >= 2 ? '#ff8844' : SQ.red;

  const statusIcon = s => ({
    'validated': '✅', 'complete': '🟢', 'in_progress': '🟡',
    'defined': '🔵', 'failed': '❌',
  }[s?.toLowerCase()] || '⬜');

  const scoreColor = n => n >= 4 ? SQ.green : n >= 3 ? SQ.amber : n >= 2 ? '#ff8844' : SQ.red;

  // Mission summary pills
  const pills = missions.map(m => `
    <div style="background:#0a130a;border:1px solid #1a2a1a;border-radius:3px;
         padding:8px 10px;min-width:120px;flex:1">
      <div style="font-size:9px;color:var(--muted);margin-bottom:4px">
        ${statusIcon(m.status)} ${m.id?.toUpperCase() || '?'}</div>
      <div style="font-size:11px;color:var(--text);margin-bottom:4px;line-height:1.3">${m.name || ''}</div>
      <div style="font-size:13px;font-weight:700;font-family:monospace;
           color:${scoreColor(m.score)}">${m.score != null ? m.score + '/5' : '—'}</div>
      ${m.key_metric_label ? `<div style="font-size:9px;color:var(--muted);margin-top:4px">${m.key_metric_label}</div>` : ''}
      ${m.key_metric_predicted != null ? `
        <div style="font-size:10px;font-family:monospace;color:${SQ.cyan}">
          PRED: ${m.key_metric_predicted}${m.key_metric_unit || ''}</div>` : ''}
      ${m.key_metric_actual != null ? `
        <div style="font-size:10px;font-family:monospace;color:${SQ.green}">
          ACTV: ${m.key_metric_actual}${m.key_metric_unit || ''}</div>` : ''}
      ${m.error_pct != null ? `
        <div style="font-size:10px;color:${Math.abs(m.error_pct) < 10 ? SQ.green : SQ.red};
             font-family:monospace">${m.error_pct > 0 ? '+' : ''}${m.error_pct}% err</div>` : ''}
    </div>`
  ).join('');

  // Mission detail table
  const detailRows = missions.map(m => `
    <tr style="border-bottom:1px solid #0a140a">
      <td style="padding:5px 8px;color:var(--muted);font-size:10px;white-space:nowrap">
        ${statusIcon(m.status)} ${m.id?.toUpperCase() || '?'}</td>
      <td style="padding:5px 8px;color:var(--text);font-size:10px">${m.name || '?'}</td>
      <td style="padding:5px 8px;text-align:center;font-weight:700;font-family:monospace;
           font-size:11px;color:${scoreColor(m.score)}">${m.score != null ? m.score + '/5' : '—'}</td>
      <td style="padding:5px 8px;font-family:monospace;font-size:10px;color:${SQ.cyan}">
        ${m.key_metric_predicted != null ? m.key_metric_predicted + (m.key_metric_unit||'') : '—'}
        ${m.distribution ? `<br><span style="color:var(--muted);font-size:9px">
          P10 ${m.distribution.p10} / P50 ${m.distribution.p50} / P90 ${m.distribution.p90}</span>` : ''}
      </td>
      <td style="padding:5px 8px;font-family:monospace;font-size:10px;color:${SQ.green}">
        ${m.key_metric_actual != null ? m.key_metric_actual + (m.key_metric_unit||'') : '—'}</td>
      <td style="padding:5px 8px;font-family:monospace;font-size:10px;
           color:${m.error_pct != null ? (Math.abs(m.error_pct) < 15 ? SQ.green : SQ.red) : 'var(--muted)'}">
        ${m.error_pct != null ? (m.error_pct > 0 ? '+' : '') + m.error_pct + '%' : '—'}</td>
      <td style="padding:5px 8px;font-size:9px;color:var(--muted);font-style:italic">
        ${m.notes || ''}</td>
    </tr>`
  ).join('');

  // Risk flags
  const flags = synth.financial_summary?.risk_flags || {};
  const flagsHtml = Object.entries(flags).map(([k, v]) => {
    const label = k.replace(/_/g, ' ').toUpperCase();
    const isRisk = k === 'permit_risk' && v;
    const col = isRisk ? SQ.red : (v === true || (typeof v === 'number' && v > 0)) ? SQ.amber : SQ.neutral;
    const display = typeof v === 'boolean' ? (v ? 'YES' : 'NO') : v;
    return `<div style="padding:4px 10px;border-radius:2px;border:1px solid ${col}33;
         background:${col}11;font-size:10px;font-family:monospace;color:${col}">
      ${label}: ${display}
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <!-- Header row -->
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;flex-wrap:wrap">
      <div style="font-size:28px;font-weight:700;font-family:monospace;color:${scoreCol}">${grade}</div>
      <div>
        <div style="font-size:13px;color:var(--muted)">Overall: <span style="color:${scoreCol}">${score}/5</span></div>
        <div style="font-size:11px;color:var(--muted)">Generated ${genAt}${ho ? ` · Holdout: ${ho}` : ''}</div>
      </div>
      ${flagsHtml ? `<div style="margin-left:auto;display:flex;flex-wrap:wrap;gap:6px">${flagsHtml}</div>` : ''}
    </div>

    <!-- Mission pills (compact grid) -->
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
      ${pills || '<div style="color:var(--muted);font-size:11px">No mission data available</div>'}
    </div>

    <!-- Mission detail table (collapsible) -->
    ${detailRows ? `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-family:monospace">
        <thead>
          <tr style="color:var(--muted);font-size:9px;border-bottom:1px solid #1a2a1a">
            <th style="padding:5px 8px;text-align:left">MISSION</th>
            <th style="padding:5px 8px;text-align:left">NAME</th>
            <th style="padding:5px 8px;text-align:center">SCORE</th>
            <th style="padding:5px 8px;text-align:left">PREDICTED</th>
            <th style="padding:5px 8px;text-align:left">ACTUAL</th>
            <th style="padding:5px 8px;text-align:left">ERROR</th>
            <th style="padding:5px 8px;text-align:left">NOTES</th>
          </tr>
        </thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>` : ''}`;
}

// ── Assumed Ore Body framework ─────────────────────────────────────────────
//
// Expected JSON shape under synthetic_dfs.ore_body (all fields optional):
// {
//   "collar_coords_available": false,   // true when easting/northing extracted
//   "holes_with_coords": 0,
//   "holes_total": 74,
//   "deposit_type": "orogenic_gold",    // orogenic_gold | epithermal | porphyry | skarn
//   "assumed_strike_deg": 170,          // degrees from north
//   "assumed_dip_deg": -70,             // negative = dipping west
//   "strike_length_m": 1800,
//   "down_dip_m": 600,
//   "true_width_m": 25,
//   "avg_grade_gt": 2.1,
//   "estimated_tonnage_mt": 12.5,
//   "interpolation_method": "idw",      // idw | kriging
//   "blocks": null                      // block model array — populated when coords available
// }

function minesRenderOreBody(holes, synth) {
  const el = document.getElementById('mines-orebody');
  if (!el) return;

  const ob = synth?.ore_body || null;
  const totalHoles   = (holes || []).length;
  const coordHoles   = (holes || []).filter(h => h.easting != null && h.northing != null).length;
  const hasAzDip     = (holes || []).filter(h => h.azimuth != null && h.dip != null).length;
  const hasIntervals = (holes || []).filter(h => (h.intervals||[]).length > 0).length;
  const hasBlocks    = ob?.blocks && ob.blocks.length > 0;

  // ── Status chip helper ──
  const chip = (label, ok, n, tot) => {
    const col  = ok ? SQ.green : (n > 0 ? SQ.amber : SQ.neutral);
    const icon = ok ? '✓' : (n > 0 ? '◑' : '○');
    const sub  = tot != null ? ` ${n}/${tot}` : '';
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <span style="font-size:12px;color:${col}">${icon}</span>
      <span style="font-size:11px;color:${ok ? 'var(--text)' : 'var(--muted)'}">${label}</span>
      ${sub ? `<span style="font-size:10px;color:var(--muted);font-family:monospace">${sub}</span>` : ''}
    </div>`;
  };

  const dataGrid = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px;margin-bottom:16px">
      <div>
        ${chip('Drill holes extracted',    totalHoles > 0,   totalHoles,   null)}
        ${chip('Significant intercepts',   hasIntervals > 0, hasIntervals, totalHoles)}
        ${chip('Collar coordinates',       coordHoles > 0,   coordHoles,   totalHoles)}
      </div>
      <div>
        ${chip('Azimuth + dip',            hasAzDip > 0,     hasAzDip,     totalHoles)}
        ${chip('Ore body parameters',      !!ob,             ob ? 1 : 0,   null)}
        ${chip('Block model (IDW/kriging)',hasBlocks,        hasBlocks ? 1 : 0, null)}
      </div>
    </div>`;

  // ── No holes at all ──
  if (totalHoles === 0) {
    el.innerHTML = `${dataGrid}
      <div style="color:var(--muted);font-size:11px;padding:10px 0">
        No drill holes extracted yet.
        Run: <code style="color:var(--gold)">python scripts/bulk_mine_collector.py TICKER --export</code>
      </div>`;
    return;
  }

  // ── Holes but no collar coordinates ──
  if (coordHoles === 0) {
    el.innerHTML = `${dataGrid}
      <div style="background:#0a1a0a;border:1px solid #1a2a1a;border-radius:3px;
                  padding:12px 14px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--amber);margin-bottom:8px">
          AWAITING COLLAR COORDINATES
        </div>
        <div style="font-size:11px;color:var(--muted);line-height:1.6">
          Easting / northing coordinates are required to position drill holes in 3D space
          and interpolate grade between holes.<br><br>
          <strong style="color:var(--text)">Where to find them:</strong><br>
          · JORC Appendix 1 tables in the ASX announcement PDF<br>
          · "Drill hole collar" appendix in PFS/DFS technical report<br>
          · Company's quarterly report drill tables<br><br>
          <strong style="color:var(--text)">Once available:</strong> update the
          <code style="color:var(--gold)">mine_drill_holes</code> table with
          <code style="color:var(--gold)">easting, northing, elevation, azimuth, dip</code>
          and re-export — the 3D viewer above will switch to real coordinates automatically,
          and the ore body interpolation will run.
        </div>
      </div>
      ${_oreBodyPlaceholderCanvas()}`;
    return;
  }

  // ── Coordinates available, check for model parameters ──
  if (!ob) {
    el.innerHTML = `${dataGrid}
      <div style="background:#0a150a;border:1px solid #1a3a1a;border-radius:3px;
                  padding:12px 14px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:6px">
          COORDINATES LOADED — ORE BODY PARAMETERS PENDING
        </div>
        <div style="font-size:11px;color:var(--muted)">
          ${coordHoles} holes have real coordinates. Run the synthetic DFS builder
          to generate ore body parameters and block model interpolation.
        </div>
      </div>
      ${_oreBodyPlaceholderCanvas('Block model ready to run — awaiting synthetic DFS ore body parameters')}`;
    return;
  }

  // ── Full ore body model available ──
  const fv = (v, unit='', dp=0) => v != null ? `${(+v).toFixed(dp)}${unit}` : '—';
  const kv = (label, val) => `
    <div style="min-width:100px">
      <div style="font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:2px">${label}</div>
      <div style="font-size:13px;font-family:monospace;color:var(--text)">${val}</div>
    </div>`;

  el.innerHTML = `${dataGrid}
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px">
      ${kv('DEPOSIT TYPE',    (ob.deposit_type||'—').replace(/_/g,' ').toUpperCase())}
      ${kv('STRIKE',          fv(ob.strike_length_m, 'm') + (ob.assumed_strike_deg != null ? ` @ ${ob.assumed_strike_deg}°` : ''))}
      ${kv('DOWN-DIP',        fv(ob.down_dip_m, 'm'))}
      ${kv('TRUE WIDTH',      fv(ob.true_width_m, 'm'))}
      ${kv('AVG GRADE',       fv(ob.avg_grade_gt, ' g/t', 2))}
      ${kv('TONNAGE EST.',    fv(ob.estimated_tonnage_mt, ' Mt', 1))}
      ${kv('DIP',             fv(ob.assumed_dip_deg, '°'))}
      ${kv('METHOD',          (ob.interpolation_method||'—').toUpperCase())}
    </div>
    ${hasBlocks ? _oreBodyBlockCanvas(ob) : _oreBodyPlaceholderCanvas('Block model pending — run interpolation')}`;
}

function _oreBodyPlaceholderCanvas(msg) {
  const label = msg || 'Block model visualisation — awaiting collar coordinates';
  return `
    <div style="background:#050e05;border:1px dashed #1a2a1a;border-radius:3px;
                height:160px;display:flex;flex-direction:column;
                align-items:center;justify-content:center;gap:10px">
      <div style="display:flex;gap:4px">
        ${[SQ.green, SQ.amber, SQ.neutral, SQ.neutral, SQ.neutral].map(c =>
          `<div style="width:22px;height:22px;border-radius:2px;opacity:0.25;background:${c}"></div>`
        ).join('')}
      </div>
      <div style="font-size:10px;color:var(--muted);text-align:center;max-width:300px">
        ${label}
      </div>
    </div>`;
}

function _oreBodyBlockCanvas(ob) {
  // Placeholder — will be replaced with real IDW voxel renderer when blocks[] is populated.
  return `<div style="color:var(--muted);font-size:11px;padding:8px 0">
    Block model loaded (${ob.blocks.length} blocks) — voxel renderer coming soon.
  </div>`;
}

// hexA() is defined globally in sq_theme.js — no redefinition needed here.
