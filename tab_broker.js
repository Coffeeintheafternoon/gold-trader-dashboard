// tab_broker.js — Generated Equity Reports tab
// Fetches generated_report_data.json and renders cover card, price chart,
// production table, Claude narrative sections, and history timeline.
//
// Data-source colour coding (building phase):
//   yfinance data  →  #4a9eff  (blue)
//   PDF data       →  #e8e8e8  (white)

(function () {
  'use strict';

  let _data            = null;
  let _selectedTicker  = null;
  let _selectedReportId = null;
  let _chartInstance   = null;

  // Source colours — remove once data is fully verified
  const SRC_COLOUR = {
    yfinance: '#4a9eff',
    pdf:      '#e8e8e8',
  };
  const SRC_LABEL = {
    yfinance: 'yf',
    pdf:      '',
  };

  const METRIC_LABELS = {
    gold_production_koz:  'Gold Production',
    annual_production_koz:'Full-Year Production',
    gold_sales_koz:       'Gold Sales',
    head_grade_gt:        'Head Grade',
    recovery_pct:         'Mill Recovery',
    recovery_prior_pct:   'Prior Recovery',
    aisc_per_oz:          'AISC',
    ore_milled_kt:        'Ore Milled',
    ore_mined_kt:         'Ore Mined',
    waste_mined_kt:       'Waste Mined',
    strip_ratio:          'Strip Ratio',
    cash_cost_per_oz:     'Cash Cost',
    capex_m:              'Capex',
    cash_m:               'Cash',
    bullion_m:            'Bullion on Hand',
  };

  // ── Entry point ────────────────────────────────────────────────────────────
  window.initBrokerTab = function () {
    // Always re-fetch — data changes between sessions and new tickers get added
    fetch('generated_report_data.json?_=' + Date.now())
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => { _data = json; _render(); })
      .catch(err => {
        const el = document.getElementById('broker-loading');
        if (el) el.textContent =
          'No generated reports found. Run scripts/generate_equity_report.py to create one.';
        console.warn('broker tab:', err);
      });
  };

  // ── Top-level render ────────────────────────────────────────────────────────
  function _render() {
    const loading = document.getElementById('broker-loading');
    const body    = document.getElementById('broker-body');
    if (!_data || !_data.tickers || !_data.tickers.length) {
      if (loading) loading.textContent =
        'No generated reports. Run scripts/generate_equity_report.py to create one.';
      return;
    }
    if (loading) loading.style.display = 'none';
    if (body)    body.style.display    = 'block';
    if (body)    body.innerHTML        = '';

    if (!_selectedTicker) _selectedTicker = _data.tickers[0].ticker;

    body.appendChild(_buildTickerBar(_data.tickers));

    const content = document.createElement('div');
    content.id = 'broker-content';
    body.appendChild(content);

    _renderTicker(_selectedTicker);
  }

  // ── Ticker bar ──────────────────────────────────────────────────────────────
  function _buildTickerBar(tickers) {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px';
    tickers.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (t.ticker === _selectedTicker ? ' active' : '');
      btn.textContent = t.ticker;
      btn.onclick = () => {
        _selectedTicker   = t.ticker;
        _selectedReportId = null;
        document.querySelectorAll('#broker-body .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _renderTicker(t.ticker);
      };
      bar.appendChild(btn);
    });
    return bar;
  }

  // ── Render one ticker ────────────────────────────────────────────────────────
  function _renderTicker(ticker) {
    const content = document.getElementById('broker-content');
    content.innerHTML = '';
    if (_chartInstance) { _chartInstance.destroy(); _chartInstance = null; }

    const td = _data.tickers.find(t => t.ticker === ticker);
    if (!td || !td.reports.length) {
      content.innerHTML = '<p style="color:var(--muted)">No reports for ' + ticker + '</p>';
      return;
    }

    if (!_selectedReportId) _selectedReportId = td.reports[0].id;
    const report = td.reports.find(r => r.id === _selectedReportId) || td.reports[0];

    const p2   = report.page2_data   || {};
    const fund = report.fundamentals || {};

    content.appendChild(_buildSourceLegend());
    content.appendChild(_buildCoverCard(report, ticker));
    content.appendChild(_buildFundamentalsPanel(fund, report.cover_stats || {}));
    content.appendChild(_buildPriceChart(report));
    const companyType = fund.company_type || 'mining';

    // Production table — mining only
    if (companyType === 'mining') {
      content.appendChild(_buildProductionTable(report));
    }

    // Valuation ratios + profitability — non-mining (or mining without page2 data)
    if (companyType !== 'mining' || !Object.keys(p2).length) {
      if (fund.valuation_ratios && Object.keys(fund.valuation_ratios).some(k => fund.valuation_ratios[k] != null))
        content.appendChild(_buildValuationRatiosCard(fund));
      if (fund.profitability && Object.keys(fund.profitability).some(k => fund.profitability[k] != null))
        content.appendChild(_buildProfitabilityCard(fund));
    }

    // Page 2 sections — mining only
    if (companyType === 'mining') {
      if (p2.production_forecasts && p2.production_forecasts.length)
        content.appendChild(_buildForecastTable('Production Forecasts (koz)', p2.years, p2.production_forecasts, 'mine', 'values'));
      if (p2.aisc_forecasts && p2.aisc_forecasts.length)
        content.appendChild(_buildForecastTable('AISC Forecasts (A$/oz)', p2.years, p2.aisc_forecasts, 'mine', 'values'));
      if (p2.key_metrics && p2.key_metrics.length)
        content.appendChild(_buildForecastTable('Key Metrics', p2.years, p2.key_metrics, 'label', 'values'));
      if (p2.commodity_assumptions && p2.commodity_assumptions.length)
        content.appendChild(_buildForecastTable('Commodity Assumptions', p2.years, p2.commodity_assumptions, 'label', 'values'));
      if (p2.pnl && p2.pnl.length)
        content.appendChild(_buildForecastTable('P&L / Cash Flow Summary (A$m)', p2.years, p2.pnl, 'label', 'values'));
      if (p2.reserves && p2.reserves.length) {
        content.appendChild(_buildRRDetailTable('Ore Reserves', p2.reserves));
      } else if (report.cover_stats && _hasCoverKey(report.cover_stats, ['reserves_koz'])) {
        content.appendChild(_buildRRCard(report));
      }
      if (p2.resources && p2.resources.length)
        content.appendChild(_buildRRDetailTable('Mineral Resources', p2.resources));
      if (p2.valuation && p2.valuation.length)
        content.appendChild(_buildValuationTable(p2.valuation));
      if (p2.shareholders && p2.shareholders.length)
        content.appendChild(_buildShareholdersTable(p2.shareholders));
    }

    content.appendChild(_buildNarrativePanel(report));
    if (td.reports.length > 1) {
      content.appendChild(_buildHistoryTimeline(td.reports, ticker));
    }
  }

  // ── Source colour legend ─────────────────────────────────────────────────────
  function _buildSourceLegend() {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:16px;margin-bottom:12px;font-size:10px;color:var(--muted)';
    row.innerHTML = `
      <span>Data sources:</span>
      <span><span style="color:${SRC_COLOUR.pdf};font-weight:700">■</span> PDF extract (Argonaut holdout)</span>
      <span><span style="color:${SRC_COLOUR.yfinance};font-weight:700">■</span> yfinance (our independent estimate)</span>
    `;
    return row;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Get value + colour from a cover_stats entry (new {value, source} or legacy flat). */
  function _statVal(cs, key) {
    const entry = cs[key];
    if (entry === null || entry === undefined) return { v: null, colour: '#555' };
    if (typeof entry === 'object' && 'value' in entry) {
      return { v: entry.value, colour: SRC_COLOUR[entry.source] || '#e8e8e8' };
    }
    return { v: entry, colour: '#e8e8e8' };  // legacy flat format
  }

  function _hasCoverKey(cs, keys) {
    return keys.some(k => {
      const e = cs[k];
      if (!e) return false;
      const v = typeof e === 'object' ? e.value : e;
      return v != null;
    });
  }

  function _fmtNum(v, dp = 2) {
    return v != null ? Number(v).toFixed(dp) : 'n/a';
  }

  // ── Cover card ───────────────────────────────────────────────────────────────
  function _buildCoverCard(report, ticker) {
    const cs   = report.cover_stats || {};
    const card = document.createElement('div');
    card.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const price   = _statVal(cs, 'price');
    const pt      = _statVal(cs, 'price_target');
    const tsr     = _statVal(cs, 'tsr_pct');

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <span style="font-size:22px;font-weight:900;color:var(--gold)">${ticker}</span>
          <span style="font-size:13px;color:var(--muted);margin-left:12px">${report.period || ''}</span>
          <span style="font-size:11px;color:#444;margin-left:8px">${(report.report_date || '').slice(0,10)}</span>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:900;color:${price.colour}">${price.v != null ? 'A$' + _fmtNum(price.v) : 'n/a'}</div>
          ${pt.v != null ? `<div style="font-size:11px;color:${pt.colour}">PT A$${_fmtNum(pt.v)}${tsr.v != null ? ` &nbsp;TSR <span style="color:${tsr.colour}">${_fmtNum(tsr.v,0)}%</span>` : ''}</div>` : ''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:16px">
        ${_statCell('Market Cap',     cs, 'mktcap_m',   v => 'A$' + _fmtNum(v,0) + 'm')}
        ${_statCell('Shares on Issue',cs, 'shares_m',   v => _fmtNum(v,0) + 'm')}
        ${_statCell('52wk High',      cs, 'wk52_high',  v => 'A$' + _fmtNum(v))}
        ${_statCell('52wk Low',       cs, 'wk52_low',   v => 'A$' + _fmtNum(v))}
        ${_statCell('ADTO',           cs, 'adto_m',     v => 'A$' + _fmtNum(v) + 'm')}
        ${_statCell('Net Cash (Debt)',cs, 'net_cash_m', v => 'A$' + _fmtNum(v,0) + 'm')}
        ${_statCell('EV',             cs, 'ev_m',       v => 'A$' + _fmtNum(v,0) + 'm')}
        ${_statCellRaw('Bullion on Hand', cs, 'bullion_m', v => 'A$' + _fmtNum(v,0) + 'm')}
      </div>
    `;
    return card;
  }

  function _statCell(label, cs, key, fmt) {
    const { v, colour } = _statVal(cs, key);
    const display = v != null ? fmt(v) : 'n/a';
    const src = cs[key] && typeof cs[key] === 'object' ? cs[key].source : null;
    const badge = src === 'yfinance'
      ? `<span style="font-size:8px;color:${SRC_COLOUR.yfinance};margin-left:3px">yf</span>` : '';
    return `
      <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:10px 12px">
        <div style="font-size:10px;color:var(--muted);font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px">${label}</div>
        <div style="font-size:14px;font-weight:700;color:${colour}">${display}${badge}</div>
      </div>`;
  }

  function _statCellRaw(label, cs, key, fmt) {
    return _statCell(label, cs, key, fmt);
  }

  // ── Price chart ──────────────────────────────────────────────────────────────
  function _buildPriceChart(report) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px';
    title.textContent = '90-Day Price Performance (Indexed to 100)';
    wrap.appendChild(title);

    const src = document.createElement('div');
    src.style.cssText = `font-size:9px;color:${SRC_COLOUR.yfinance};margin-bottom:10px`;
    src.textContent = 'source: yfinance';
    wrap.appendChild(src);

    const hist = report.price_history || [];
    if (!hist.length) {
      wrap.innerHTML += '<p style="color:var(--muted);font-size:12px">No price history available.</p>';
      return wrap;
    }

    const canvas = document.createElement('canvas');
    canvas.id    = 'broker-price-chart';
    canvas.style.cssText = 'width:100%;max-height:220px';
    wrap.appendChild(canvas);

    requestAnimationFrame(() => {
      if (typeof Chart === 'undefined') return;
      const labels  = hist.map(d => d.date);
      const prices  = hist.map(d => d.price);
      const axjo    = hist.map(d => d.axjo ?? null);
      const hasAxjo = axjo.some(v => v != null);

      const datasets = [{
        label: report.ticker || 'Stock',
        data:  prices,
        borderColor: SRC_COLOUR.yfinance,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
      }];
      if (hasAxjo) {
        datasets.push({
          label: 'ASX 200',
          data:  axjo,
          borderColor: '#555',
          borderWidth: 1.5,
          pointRadius: 0,
          borderDash: [4,4],
          tension: 0.3,
          fill: false,
        });
      }

      if (_chartInstance) _chartInstance.destroy();
      _chartInstance = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          animation: false,
          plugins: { legend: { labels: { color: '#888', font: { size: 11 } } } },
          scales: {
            x: { ticks: { color: '#444', maxTicksLimit: 8, font: { size: 10 } }, grid: { color: '#111' } },
            y: { ticks: { color: '#555', font: { size: 10 } }, grid: { color: '#1a1a1a' } },
          },
        },
      });
    });

    return wrap;
  }

  // ── Production table ────────────────────────────────────────────────────────
  function _buildProductionTable(report) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px';
    title.textContent = `Production Actuals — ${report.period || ''}`;
    wrap.appendChild(title);

    const src = document.createElement('div');
    src.style.cssText = `font-size:9px;color:${SRC_COLOUR.pdf};margin-bottom:10px`;
    src.textContent = 'source: PDF extract';
    wrap.appendChild(src);

    const metrics = report.metrics || [];
    if (!metrics.length) {
      wrap.innerHTML += '<p style="color:var(--muted);font-size:12px">No metrics extracted from PDF.</p>';
      return wrap;
    }

    const mines = [...new Set(metrics.map(m => m.mine))];
    const mineOrder = ['Group', ...mines.filter(m => m !== 'Group').sort()];
    const orderedMines = mineOrder.filter(m => mines.includes(m));

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px';
    table.innerHTML = `
      <thead>
        <tr style="color:var(--muted)">
          <th style="text-align:left;padding:4px 8px;font-weight:600">Metric</th>
          <th style="padding:4px 8px;font-weight:600;text-align:right">Unit</th>
          ${orderedMines.map(m => `<th style="padding:4px 8px;font-weight:600;text-align:right">${m}</th>`).join('')}
        </tr>
      </thead>`;

    const allMetrics = [...new Set(metrics.map(m => m.metric_name))];
    const tbody = document.createElement('tbody');

    allMetrics.forEach(metricName => {
      const rowMetrics = metrics.filter(m => m.metric_name === metricName);
      if (!rowMetrics.length) return;
      const unit  = rowMetrics[0].unit || '';
      const label = METRIC_LABELS[metricName] || metricName;

      const tr = document.createElement('tr');
      tr.style.cssText = 'border-top:1px solid #1a1a1a';

      let cells = `
        <td style="padding:6px 8px;color:#ccc">${label}</td>
        <td style="padding:6px 8px;color:var(--muted);text-align:right">${unit}</td>`;

      orderedMines.forEach(mine => {
        const m = rowMetrics.find(r => r.mine === mine);
        const val = m && m.actual != null ? Number(m.actual).toFixed(1) : '—';
        const src = m ? (m.source || 'pdf') : null;
        const colour = m ? (SRC_COLOUR[src] || SRC_COLOUR.pdf) : '#333';
        cells += `<td style="padding:6px 8px;color:${colour};text-align:right">${val}</td>`;
      });

      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // ── R&R card ─────────────────────────────────────────────────────────────────
  function _buildRRCard(report) {
    const cs   = report.cover_stats || {};
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px';
    title.textContent = 'Reserves & Resources';
    wrap.appendChild(title);

    const src = document.createElement('div');
    src.style.cssText = `font-size:9px;color:${SRC_COLOUR.pdf};margin-bottom:10px`;
    src.textContent = 'source: PDF extract';
    wrap.appendChild(src);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px';

    const rrRows = [
      ['Ore Reserves',    'reserves_koz',  v => _fmtNum(v,0) + ' koz'],
      ['Reserve Grade',   'reserves_gt',   v => _fmtNum(v,2) + ' g/t'],
      ['Reserve Tonnes',  'reserves_mt',   v => _fmtNum(v,1) + ' mt'],
      ['Mineral Resources','resources_koz', v => _fmtNum(v,0) + ' koz'],
      ['Resource Grade',  'resources_gt',  v => _fmtNum(v,2) + ' g/t'],
      ['Resource Tonnes', 'resources_mt',  v => _fmtNum(v,1) + ' mt'],
    ];

    rrRows.forEach(([label, key, fmt]) => {
      const { v, colour } = _statVal(cs, key);
      if (v == null) return;
      grid.innerHTML += `
        <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:10px 12px">
          <div style="font-size:10px;color:var(--muted);font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px">${label}</div>
          <div style="font-size:14px;font-weight:700;color:${colour}">${fmt(v)}</div>
        </div>`;
    });

    wrap.appendChild(grid);
    return wrap;
  }

  // ── Generic forecast table (years as columns) ────────────────────────────
  function _buildForecastTable(title, years, rows, labelKey, valKey) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px';
    hdr.textContent = title;
    wrap.appendChild(hdr);

    const src = document.createElement('div');
    src.style.cssText = `font-size:9px;color:${SRC_COLOUR.pdf};margin-bottom:10px`;
    src.textContent = 'source: PDF extract';
    wrap.appendChild(src);

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px';

    const yrCols = (years || ['CY25E','CY26E','CY27E','CY28E','CY29E','CY30E']);
    table.innerHTML = `<thead><tr style="color:var(--muted)">
      <th style="text-align:left;padding:4px 8px;font-weight:600"></th>
      ${yrCols.map(y => `<th style="padding:4px 8px;font-weight:600;text-align:right">${y}</th>`).join('')}
    </tr></thead>`;

    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const label = row[labelKey] || '';
      const vals  = row[valKey] || [];
      const tr = document.createElement('tr');
      tr.style.cssText = 'border-top:1px solid #1a1a1a';
      tr.innerHTML = `<td style="padding:5px 8px;color:#ccc">${label}</td>` +
        yrCols.map((_, i) => {
          const v = vals[i];
          const txt = v == null ? '—' : Number(v).toLocaleString('en-AU', {maximumFractionDigits: 2});
          const col = v != null && v < 0 ? '#e05252' : '#ddd';
          return `<td style="padding:5px 8px;color:${col};text-align:right">${txt}</td>`;
        }).join('');
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // ── R&R detail table (deposit rows) ───────────────────────────────────────
  function _buildRRDetailTable(title, rows) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px';
    hdr.textContent = title;
    wrap.appendChild(hdr);

    const src = document.createElement('div');
    src.style.cssText = `font-size:9px;color:${SRC_COLOUR.pdf};margin-bottom:10px`;
    src.textContent = 'source: PDF extract';
    wrap.appendChild(src);

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px';
    table.innerHTML = `<thead><tr style="color:var(--muted)">
      <th style="text-align:left;padding:4px 8px;font-weight:600">Deposit</th>
      <th style="padding:4px 8px;font-weight:600;text-align:right">Ore (mt)</th>
      <th style="padding:4px 8px;font-weight:600;text-align:right">Grade (g/t)</th>
      <th style="padding:4px 8px;font-weight:600;text-align:right">Metal (koz)</th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');
    rows.forEach(r => {
      const isTotal = (r.deposit || '').toLowerCase() === 'total';
      const tr = document.createElement('tr');
      tr.style.cssText = `border-top:1px solid #1a1a1a${isTotal ? ';font-weight:700' : ''}`;
      const col = isTotal ? 'var(--gold)' : '#ccc';
      tr.innerHTML = `
        <td style="padding:5px 8px;color:${col}">${r.deposit || ''}</td>
        <td style="padding:5px 8px;color:#aaa;text-align:right">${r.mt != null ? Number(r.mt).toFixed(1) : '—'}</td>
        <td style="padding:5px 8px;color:#aaa;text-align:right">${r.grade_gt != null ? Number(r.grade_gt).toFixed(2) : '—'}</td>
        <td style="padding:5px 8px;color:${col};text-align:right">${r.koz != null ? Number(r.koz).toLocaleString() : '—'}</td>`;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // ── Valuation table ────────────────────────────────────────────────────────
  function _buildValuationTable(rows) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px';
    hdr.textContent = 'NPV Valuation';
    wrap.appendChild(hdr);

    const src = document.createElement('div');
    src.style.cssText = `font-size:9px;color:${SRC_COLOUR.pdf};margin-bottom:10px`;
    src.textContent = 'source: PDF extract';
    wrap.appendChild(src);

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px';
    table.innerHTML = `<thead><tr style="color:var(--muted)">
      <th style="text-align:left;padding:4px 8px;font-weight:600">Asset</th>
      <th style="padding:4px 8px;font-weight:600;text-align:right">Spot (A$m)</th>
      <th style="padding:4px 8px;font-weight:600;text-align:right">Spot (A$/sh)</th>
      <th style="padding:4px 8px;font-weight:600;text-align:right">Base (A$m)</th>
      <th style="padding:4px 8px;font-weight:600;text-align:right">Base (A$/sh)</th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');
    rows.forEach(r => {
      const isTotal = (r.asset || '').toLowerCase() === 'total';
      const tr = document.createElement('tr');
      tr.style.cssText = `border-top:1px solid #1a1a1a${isTotal ? ';font-weight:700' : ''}`;
      const col = isTotal ? 'var(--gold)' : '#ccc';
      const fmt = v => v != null ? Number(v).toLocaleString('en-AU', {maximumFractionDigits: 1}) : '—';
      const fmtPs = v => v != null ? Number(v).toFixed(2) : '—';
      tr.innerHTML = `
        <td style="padding:5px 8px;color:${col}">${r.asset || ''}</td>
        <td style="padding:5px 8px;color:#aaa;text-align:right">${fmt(r.spot_m)}</td>
        <td style="padding:5px 8px;color:#aaa;text-align:right">${fmtPs(r.spot_ps)}</td>
        <td style="padding:5px 8px;color:#aaa;text-align:right">${fmt(r.base_m)}</td>
        <td style="padding:5px 8px;color:${col};text-align:right">${fmtPs(r.base_ps)}</td>`;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // ── Shareholders table ─────────────────────────────────────────────────────
  function _buildShareholdersTable(rows) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px';
    hdr.textContent = 'Substantial Shareholders';
    wrap.appendChild(hdr);

    const src = document.createElement('div');
    src.style.cssText = `font-size:9px;color:${SRC_COLOUR.pdf};margin-bottom:10px`;
    src.textContent = 'source: PDF extract';
    wrap.appendChild(src);

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px';
    table.innerHTML = `<thead><tr style="color:var(--muted)">
      <th style="text-align:left;padding:4px 8px;font-weight:600">Holder</th>
      <th style="padding:4px 8px;font-weight:600;text-align:right">Shares (m)</th>
      <th style="padding:4px 8px;font-weight:600;text-align:right">Stake</th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.style.cssText = 'border-top:1px solid #1a1a1a';
      tr.innerHTML = `
        <td style="padding:5px 8px;color:#ccc">${r.name || ''}</td>
        <td style="padding:5px 8px;color:#aaa;text-align:right">${r.shares_m != null ? Number(r.shares_m).toFixed(1) : '—'}</td>
        <td style="padding:5px 8px;color:var(--gold);text-align:right">${r.pct != null ? Number(r.pct).toFixed(1) + '%' : '—'}</td>`;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // ── Independent Estimates panel (holdout comparison) ─────────────────────
  function _buildFundamentalsPanel(fund, coverStats) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px';
    hdr.textContent = 'Independent Estimates (Our Data vs PDF Holdout)';
    wrap.appendChild(hdr);

    const note = document.createElement('div');
    note.style.cssText = `font-size:9px;color:${SRC_COLOUR.yfinance};margin-bottom:16px`;
    note.textContent = 'source: yfinance — independently computed, not from the broker PDF';
    wrap.appendChild(note);

    // ── Price target comparison ──
    const pt     = fund.price_target || {};
    const pdfPt  = coverStats.price_target;
    const pdfPtV = pdfPt && typeof pdfPt === 'object' ? pdfPt.value : pdfPt;

    if (pt.mean != null || pdfPtV != null) {
      const ptRow = document.createElement('div');
      ptRow.style.cssText = 'margin-bottom:14px';
      const ptTitle = document.createElement('div');
      ptTitle.style.cssText = 'font-size:10px;color:#666;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px';
      ptTitle.textContent = 'Price Target';
      ptRow.appendChild(ptTitle);

      const ptGrid = document.createElement('div');
      ptGrid.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';

      if (pt.mean != null) {
        ptGrid.innerHTML += `<div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:8px 12px;min-width:110px">
          <div style="font-size:9px;color:var(--muted);margin-bottom:3px">Consensus Mean <span style="color:${SRC_COLOUR.yfinance}">(yf)</span></div>
          <div style="font-size:16px;font-weight:700;color:${SRC_COLOUR.yfinance}">A$${_fmtNum(pt.mean)}</div>
          ${pt.n != null ? `<div style="font-size:9px;color:#555">${pt.n} analysts</div>` : ''}
        </div>`;
      }
      if (pt.high != null || pt.low != null) {
        ptGrid.innerHTML += `<div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:8px 12px;min-width:110px">
          <div style="font-size:9px;color:var(--muted);margin-bottom:3px">Range <span style="color:${SRC_COLOUR.yfinance}">(yf)</span></div>
          <div style="font-size:13px;font-weight:700;color:#aaa">A$${_fmtNum(pt.low)} – A$${_fmtNum(pt.high)}</div>
        </div>`;
      }
      if (pdfPtV != null) {
        const delta = pt.mean != null ? (pt.mean - pdfPtV) : null;
        const deltaCol = delta == null ? '#888' : delta >= 0 ? '#4ec94e' : '#e05252';
        ptGrid.innerHTML += `<div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:8px 12px;min-width:110px">
          <div style="font-size:9px;color:var(--muted);margin-bottom:3px">PDF (Argonaut)</div>
          <div style="font-size:16px;font-weight:700;color:${SRC_COLOUR.pdf}">A$${_fmtNum(pdfPtV)}</div>
          ${delta != null ? `<div style="font-size:9px;color:${deltaCol}">${delta >= 0 ? '+' : ''}${_fmtNum(delta)} vs ours</div>` : ''}
        </div>`;
      }
      ptRow.appendChild(ptGrid);
      wrap.appendChild(ptRow);
    }

    // ── Gold spot ──
    if (fund.gold_spot_aud != null) {
      const goldRow = document.createElement('div');
      goldRow.style.cssText = 'margin-bottom:14px';
      const goldTitle = document.createElement('div');
      goldTitle.style.cssText = 'font-size:10px;color:#666;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px';
      goldTitle.textContent = 'Live Gold Price';
      goldRow.appendChild(goldTitle);

      const goldGrid = document.createElement('div');
      goldGrid.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';
      goldGrid.innerHTML = `
        <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:8px 12px">
          <div style="font-size:9px;color:var(--muted);margin-bottom:3px">Spot Gold <span style="color:${SRC_COLOUR.yfinance}">(yf GC=F)</span></div>
          <div style="font-size:16px;font-weight:700;color:${SRC_COLOUR.yfinance}">A$${Number(fund.gold_spot_aud).toLocaleString('en-AU', {maximumFractionDigits:0})}/oz</div>
          ${fund.gold_spot_usd != null ? `<div style="font-size:9px;color:#555">US$${_fmtNum(fund.gold_spot_usd, 0)}/oz · AUDUSD ${fund.audusd}</div>` : ''}
        </div>`;
      goldRow.appendChild(goldGrid);
      wrap.appendChild(goldRow);
    }

    // ── Analyst forward estimates ──
    const ae = fund.analyst_estimates || {};
    const aeYears = Object.keys(ae).sort();
    if (aeYears.length) {
      const aeTitle = document.createElement('div');
      aeTitle.style.cssText = 'font-size:10px;color:#666;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px';
      aeTitle.textContent = 'Analyst Consensus Estimates';
      wrap.appendChild(aeTitle);

      const aeTable = document.createElement('table');
      aeTable.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px';
      aeTable.innerHTML = `<thead><tr style="color:var(--muted)">
        <th style="text-align:left;padding:4px 8px;font-weight:600">Metric</th>
        ${aeYears.map(y => `<th style="padding:4px 8px;font-weight:600;text-align:right">${y}</th>`).join('')}
      </tr></thead>`;
      const aeTbody = document.createElement('tbody');

      const aeRows = [
        { label: 'EPS (A$)',        avgKey: 'eps_avg',       loKey: 'eps_low',        hiKey: 'eps_high',       fmt: v => _fmtNum(v, 3) },
        { label: 'Revenue (A$m)',   avgKey: 'revenue_m_avg', loKey: 'revenue_m_low',  hiKey: 'revenue_m_high', fmt: v => _fmtNum(v, 0) },
      ];

      aeRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-top:1px solid #1a1a1a';
        let cells = `<td style="padding:5px 8px;color:#ccc">${row.label}</td>`;
        aeYears.forEach(y => {
          const d = ae[y] || {};
          const avg = d[row.avgKey];
          if (avg == null) {
            cells += `<td style="padding:5px 8px;color:#444;text-align:right">—</td>`;
          } else {
            const lo = d[row.loKey]; const hi = d[row.hiKey];
            const range = (lo != null && hi != null) ? ` <span style="font-size:9px;color:#555">(${row.fmt(lo)}–${row.fmt(hi)})</span>` : '';
            cells += `<td style="padding:5px 8px;color:${SRC_COLOUR.yfinance};text-align:right">${row.fmt(avg)}${range}</td>`;
          }
        });
        tr.innerHTML = cells;
        aeTbody.appendChild(tr);
      });

      aeTable.appendChild(aeTbody);
      wrap.appendChild(aeTable);
    }

    // ── Historical P&L actuals ──
    const hist = fund.historical_pnl || {};
    const histYears = Object.keys(hist).sort();
    const compType  = fund.company_type || 'mining';
    if (histYears.length) {
      const histTitle = document.createElement('div');
      histTitle.style.cssText = 'font-size:10px;color:#666;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px';
      histTitle.textContent = 'Historical P&L Actuals (yfinance)';
      wrap.appendChild(histTitle);

      const histTable = document.createElement('table');
      histTable.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px';
      histTable.innerHTML = `<thead><tr style="color:var(--muted)">
        <th style="text-align:left;padding:4px 8px;font-weight:600">Metric</th>
        ${histYears.map(y => `<th style="padding:4px 8px;font-weight:600;text-align:right">${y}</th>`).join('')}
      </tr></thead>`;
      const histTbody = document.createElement('tbody');

      // Show gross profit for consumer/general; not relevant for mining
      const histRows = [
        { label: 'Revenue (A$m)',      key: 'revenue_m',      fmt: v => _fmtNum(v, 0) },
        ...(compType !== 'mining' ? [{ label: 'Gross Profit (A$m)', key: 'gross_profit_m', fmt: v => _fmtNum(v, 0) }] : []),
        { label: 'EBITDA (A$m)',       key: 'ebitda_m',       fmt: v => _fmtNum(v, 0) },
        { label: 'EBIT (A$m)',         key: 'ebit_m',         fmt: v => _fmtNum(v, 0) },
        { label: 'Net Income (A$m)',   key: 'net_income_m',   fmt: v => _fmtNum(v, 0) },
        { label: 'EPS (A$)',           key: 'eps',            fmt: v => _fmtNum(v, 3) },
      ];

      histRows.forEach(row => {
        const hasAny = histYears.some(y => hist[y] && hist[y][row.key] != null);
        if (!hasAny) return;
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-top:1px solid #1a1a1a';
        let cells = `<td style="padding:5px 8px;color:#ccc">${row.label}</td>`;
        histYears.forEach(y => {
          const v = hist[y] ? hist[y][row.key] : null;
          const col = v != null && v < 0 ? '#e05252' : SRC_COLOUR.yfinance;
          cells += `<td style="padding:5px 8px;color:${v != null ? col : '#444'};text-align:right">${v != null ? row.fmt(v) : '—'}</td>`;
        });
        tr.innerHTML = cells;
        histTbody.appendChild(tr);
      });

      histTable.appendChild(histTbody);
      wrap.appendChild(histTable);
    }

    // ── Historical Balance Sheet ──
    const bs = fund.historical_bs || {};
    const bsYears = Object.keys(bs).sort();
    if (bsYears.length) {
      const bsTitle = document.createElement('div');
      bsTitle.style.cssText = 'font-size:10px;color:#666;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px';
      bsTitle.textContent = 'Historical Balance Sheet (yfinance)';
      wrap.appendChild(bsTitle);

      const bsTable = document.createElement('table');
      bsTable.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px';
      bsTable.innerHTML = `<thead><tr style="color:var(--muted)">
        <th style="text-align:left;padding:4px 8px;font-weight:600">Metric</th>
        ${bsYears.map(y => `<th style="padding:4px 8px;font-weight:600;text-align:right">${y}</th>`).join('')}
      </tr></thead>`;
      const bsTbody = document.createElement('tbody');

      const bsRows = [
        { label: 'Cash (A$m)',        key: 'cash_m',        fmt: v => _fmtNum(v, 1) },
        { label: 'Net Cash (A$m)',    key: 'net_cash_m',    fmt: v => _fmtNum(v, 1) },
        { label: 'Total Assets (A$m)',key: 'total_assets_m',fmt: v => _fmtNum(v, 1) },
        { label: 'Net Equity (A$m)',  key: 'net_equity_m',  fmt: v => _fmtNum(v, 1) },
      ];

      bsRows.forEach(row => {
        const hasAny = bsYears.some(y => bs[y] && bs[y][row.key] != null);
        if (!hasAny) return;
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-top:1px solid #1a1a1a';
        let cells = `<td style="padding:5px 8px;color:#ccc">${row.label}</td>`;
        bsYears.forEach(y => {
          const v = bs[y] ? bs[y][row.key] : null;
          const col = v != null && v < 0 ? '#e05252' : SRC_COLOUR.yfinance;
          cells += `<td style="padding:5px 8px;color:${v != null ? col : '#444'};text-align:right">${v != null ? row.fmt(v) : '—'}</td>`;
        });
        tr.innerHTML = cells;
        bsTbody.appendChild(tr);
      });

      bsTable.appendChild(bsTbody);
      wrap.appendChild(bsTable);
    }

    // If nothing to show, hide the panel
    if (!Object.keys(fund).some(k => fund[k] && (typeof fund[k] !== 'object' || Object.keys(fund[k]).length > 0))) {
      return document.createElement('div');
    }

    return wrap;
  }

  // ── Valuation Ratios card (non-mining) ────────────────────────────────────
  function _buildValuationRatiosCard(fund) {
    const vr   = fund.valuation_ratios || {};
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px';
    hdr.textContent = 'Valuation & Returns';
    wrap.appendChild(hdr);

    const note = document.createElement('div');
    note.style.cssText = `font-size:9px;color:${SRC_COLOUR.yfinance};margin-bottom:12px`;
    note.textContent = 'source: yfinance';
    wrap.appendChild(note);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px';

    const cells = [
      { label: 'Trailing P/E',   v: vr.trailing_pe,    fmt: v => _fmtNum(v, 1) + 'x' },
      { label: 'Forward P/E',    v: vr.forward_pe,     fmt: v => _fmtNum(v, 1) + 'x' },
      { label: 'EV/EBITDA',      v: vr.ev_ebitda,      fmt: v => _fmtNum(v, 1) + 'x' },
      { label: 'Price/Book',     v: vr.price_to_book,  fmt: v => _fmtNum(v, 2) + 'x' },
      { label: 'Div Yield',      v: vr.div_yield_pct,  fmt: v => _fmtNum(v, 2) + '%' },
      { label: 'DPS (A$)',       v: vr.div_rate,       fmt: v => 'A$' + _fmtNum(v, 2) },
      { label: 'Payout Ratio',   v: vr.payout_ratio_pct, fmt: v => _fmtNum(v, 0) + '%' },
      { label: 'Trailing EPS',   v: vr.trailing_eps,   fmt: v => 'A$' + _fmtNum(v, 3) },
      { label: 'Forward EPS',    v: vr.forward_eps,    fmt: v => 'A$' + _fmtNum(v, 3) },
      { label: 'Debt/Equity',    v: vr.debt_to_equity, fmt: v => _fmtNum(v, 1) + '%' },
      { label: 'Current Ratio',  v: vr.current_ratio,  fmt: v => _fmtNum(v, 2) + 'x' },
    ];

    cells.forEach(({ label, v, fmt }) => {
      if (v == null) return;
      const col = (label.includes('P/E') || label.includes('EV')) && v > 0
        ? SRC_COLOUR.yfinance : SRC_COLOUR.yfinance;
      grid.innerHTML += `
        <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:8px 12px">
          <div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:4px">${label}</div>
          <div style="font-size:14px;font-weight:700;color:${col}">${fmt(v)}</div>
        </div>`;
    });

    wrap.appendChild(grid);
    return wrap;
  }

  // ── Profitability card (non-mining) ────────────────────────────────────────
  function _buildProfitabilityCard(fund) {
    const pr   = fund.profitability || {};
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px';
    hdr.textContent = 'Profitability & Growth';
    wrap.appendChild(hdr);

    const note = document.createElement('div');
    note.style.cssText = `font-size:9px;color:${SRC_COLOUR.yfinance};margin-bottom:12px`;
    note.textContent = 'source: yfinance (trailing 12 months)';
    wrap.appendChild(note);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px';

    const cells = [
      { label: 'Gross Margin',      v: pr.gross_margin_pct,    positive: true },
      { label: 'Op Margin',         v: pr.op_margin_pct,       positive: true },
      { label: 'Net Margin',        v: pr.net_margin_pct,      positive: true },
      { label: 'ROE',               v: pr.roe_pct,             positive: true },
      { label: 'ROA',               v: pr.roa_pct,             positive: true },
      { label: 'Revenue Growth',    v: pr.revenue_growth_pct,  positive: null },
      { label: 'Earnings Growth',   v: pr.earnings_growth_pct, positive: null },
    ];

    cells.forEach(({ label, v }) => {
      if (v == null) return;
      const col = v >= 0 ? SRC_COLOUR.yfinance : '#e05252';
      grid.innerHTML += `
        <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:8px 12px">
          <div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:4px">${label}</div>
          <div style="font-size:14px;font-weight:700;color:${col}">${v >= 0 ? '' : ''}${_fmtNum(v, 2)}%</div>
        </div>`;
    });

    wrap.appendChild(grid);
    return wrap;
  }

  // ── Narrative panel ────────────────────────────────────────────────────────
  function _buildNarrativePanel(report) {
    const narrs = report.narratives || {};
    const wrap  = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:16px';

    const sections = [
      { key: 'headline',     label: 'Headline' },
      { key: 'exec_summary', label: 'Executive Summary' },
      { key: 'production',   label: 'Production Analysis' },
      { key: 'outlook',      label: 'Outlook' },
    ];
    sections.forEach(s => {
      const content = narrs[s.key];
      const card = document.createElement('div');
      card.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:16px 22px;margin-bottom:10px';

      const hdr = document.createElement('div');
      hdr.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:8px';
      hdr.textContent = s.label;
      card.appendChild(hdr);

      const body = document.createElement('div');
      body.style.cssText = 'font-size:13px;line-height:1.7;color:#ccc';
      body.textContent = content || 'Analysis not available — re-run with Claude enabled.';
      card.appendChild(body);
      wrap.appendChild(card);
    });

    return wrap;
  }

  // ── History timeline ───────────────────────────────────────────────────────
  function _buildHistoryTimeline(reports, ticker) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:12px';
    title.textContent = 'Report History';
    wrap.appendChild(title);

    const timeline = document.createElement('div');
    timeline.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';

    reports.forEach(r => {
      const isActive = r.id === _selectedReportId;
      const node = document.createElement('button');
      node.style.cssText = `
        background:${isActive ? '#c9a22722' : '#0a0a0a'};
        border:1px solid ${isActive ? '#c9a22788' : '#222'};
        border-radius:4px;padding:6px 12px;cursor:pointer;font-size:11px;
        color:${isActive ? '#c9a227' : '#888'};text-align:left;`;
      node.innerHTML = `
        <div style="font-weight:700">${r.period || r.report_date}</div>
        <div style="font-size:10px;color:var(--muted)">${(r.report_date || '').slice(0,10)}</div>`;
      node.onclick = () => { _selectedReportId = r.id; _renderTicker(ticker); };
      timeline.appendChild(node);
    });

    wrap.appendChild(timeline);
    return wrap;
  }

})();
