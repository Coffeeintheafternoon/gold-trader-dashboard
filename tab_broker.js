// tab_broker.js — Generated Equity Reports tab
// Fetches generated_report_data.json and renders cover card, price chart,
// production table, Claude narrative sections, and history timeline.

(function () {
  'use strict';

  let _data            = null;
  let _selectedTicker  = null;
  let _selectedReportId = null;
  let _chartInstance   = null;

  // ── Friendly metric labels ─────────────────────────────────────────────────
  const METRIC_LABELS = {
    gold_production_koz: 'Gold Production',
    gold_sales_koz:      'Gold Sales',
    head_grade_gt:       'Head Grade',
    recovery_pct:        'Mill Recovery',
    aisc_per_oz:         'AISC',
    ore_milled_mt:       'Ore Milled',
    ore_mined_mt:        'Ore Mined',
    waste_mined_mt:      'Waste Mined',
    strip_ratio:         'Strip Ratio',
    cash_cost_per_oz:    'Cash Cost',
    capex_m:             'Capex',
    cash_m:              'Cash & Bullion',
  };

  // ── Entry point ─────────────────────────────────────────────────────────────
  window.initBrokerTab = function () {
    if (_data) { _render(); return; }
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

  // ── Top-level render ──────────────────────────────────────────────────────
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

    const bar = _buildTickerBar(_data.tickers);
    body.appendChild(bar);

    const content = document.createElement('div');
    content.id = 'broker-content';
    body.appendChild(content);

    if (!_selectedTicker) _selectedTicker = _data.tickers[0].ticker;
    _renderTicker(_selectedTicker);
  }

  // ── Ticker bar ────────────────────────────────────────────────────────────
  function _buildTickerBar(tickers) {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px';
    tickers.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (t.ticker === _selectedTicker ? ' active' : '');
      btn.textContent = t.ticker;
      btn.onclick = () => {
        _selectedTicker  = t.ticker;
        _selectedReportId = null;
        document.querySelectorAll('#broker-body .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _renderTicker(t.ticker);
      };
      bar.appendChild(btn);
    });
    return bar;
  }

  // ── Render one ticker ────────────────────────────────────────────────────
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

    content.appendChild(_buildCoverCard(report, ticker));
    content.appendChild(_buildPriceChart(report));
    content.appendChild(_buildProductionTable(report));
    content.appendChild(_buildNarrativePanel(report));
    if (td.reports.length > 1) {
      content.appendChild(_buildHistoryTimeline(td.reports, ticker));
    }
  }

  // ── Cover card ────────────────────────────────────────────────────────────
  function _buildCoverCard(report, ticker) {
    const s = report.cover_stats || {};
    const card = document.createElement('div');
    card.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const fmt = (v, pfx = 'A$', sfx = '') =>
      v != null ? `${pfx}${Number(v).toFixed(2)}${sfx}` : 'n/a';
    const fmtM = v => v != null ? `A$${Number(v).toFixed(0)}m` : 'n/a';

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <span style="font-size:22px;font-weight:900;color:var(--gold)">${ticker}</span>
          <span style="font-size:13px;color:var(--muted);margin-left:12px">${report.period || ''}</span>
          <span style="font-size:11px;color:#444;margin-left:8px">${(report.report_date || '').slice(0,10)}</span>
        </div>
        <span style="font-size:20px;font-weight:900;color:var(--gold)">${fmt(s.price)}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:16px">
        ${_statCell('Market Cap', fmtM(s.mktcap_m))}
        ${_statCell('Shares on Issue', s.shares_m != null ? `${Number(s.shares_m).toFixed(0)}m` : 'n/a')}
        ${_statCell('52wk High', fmt(s.wk52_high))}
        ${_statCell('52wk Low', fmt(s.wk52_low))}
        ${_statCell('ADTO', s.adto_m != null ? `A$${s.adto_m}m` : 'n/a')}
        ${_statCell('Net Cash (Debt)', s.net_cash_m != null ? `A$${Number(s.net_cash_m).toFixed(0)}m` : 'n/a')}
      </div>
    `;
    return card;
  }

  function _statCell(label, value) {
    return `
      <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:10px 12px">
        <div style="font-size:10px;color:var(--muted);font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px">${label}</div>
        <div style="font-size:14px;font-weight:700;color:#ddd">${value}</div>
      </div>
    `;
  }

  // ── Price chart ──────────────────────────────────────────────────────────
  function _buildPriceChart(report) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:12px';
    title.textContent = '90-Day Price Performance (Indexed to 100)';
    wrap.appendChild(title);

    const hist = report.price_history || [];
    if (!hist.length) {
      wrap.innerHTML += '<p style="color:var(--muted);font-size:12px">No price history available.</p>';
      return wrap;
    }

    const canvas = document.createElement('canvas');
    canvas.id     = 'broker-price-chart';
    canvas.style.cssText = 'width:100%;max-height:220px';
    wrap.appendChild(canvas);

    // Defer chart init until after DOM insert
    requestAnimationFrame(() => {
      if (typeof Chart === 'undefined') return;
      const labels  = hist.map(d => d.date);
      const prices  = hist.map(d => d.price);
      const axjo    = hist.map(d => d.axjo ?? null);
      const hasAxjo = axjo.some(v => v != null);

      const datasets = [
        {
          label: report.ticker || 'Stock',
          data:  prices,
          borderColor: '#c9a227',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: false,
        },
      ];
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
            x: {
              ticks: { color: '#444', maxTicksLimit: 8, font: { size: 10 } },
              grid:  { color: '#111' },
            },
            y: {
              ticks: { color: '#555', font: { size: 10 } },
              grid:  { color: '#1a1a1a' },
            },
          },
        },
      });
    });

    return wrap;
  }

  // ── Production table ────────────────────────────────────────────────────
  function _buildProductionTable(report) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:12px';
    title.textContent = `Production Actuals — ${report.period || ''}`;
    wrap.appendChild(title);

    const metrics = report.metrics || [];
    if (!metrics.length) {
      wrap.innerHTML += '<p style="color:var(--muted);font-size:12px">No metrics extracted from PDF.</p>';
      return wrap;
    }

    // Group by mine
    const mines = [...new Set(metrics.map(m => m.mine))];
    const mineOrder = ['Group', ...mines.filter(m => m !== 'Group')];

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px';

    // Build header: Metric | Unit | [mine1] | [mine2] ...
    const orderedMines = mineOrder.filter(m => mines.includes(m));
    table.innerHTML = `
      <thead>
        <tr style="color:var(--muted)">
          <th style="text-align:left;padding:4px 8px;font-weight:600">Metric</th>
          <th style="padding:4px 8px;font-weight:600;text-align:right">Unit</th>
          ${orderedMines.map(m =>
            `<th style="padding:4px 8px;font-weight:600;text-align:right">${m}</th>`
          ).join('')}
        </tr>
      </thead>
    `;

    // Collect all metric names
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
        <td style="padding:6px 8px;color:var(--muted);text-align:right">${unit}</td>
      `;
      orderedMines.forEach(mine => {
        const m = rowMetrics.find(r => r.mine === mine);
        const val = m && m.actual != null ? Number(m.actual).toFixed(1) : '—';
        cells += `<td style="padding:6px 8px;color:${m ? '#ddd' : '#333'};text-align:right">${val}</td>`;
      });

      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // ── Narrative panel ───────────────────────────────────────────────────────
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

    // Placeholder sections (dimmed cards)
    const placeholders = [
      'Earnings Estimates',
      'Valuation',
      'Financials',
      'Resources & Reserves',
      'Commodity Assumptions',
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

    // Placeholder cards
    placeholders.forEach(label => {
      const card = document.createElement('div');
      card.style.cssText = 'background:#0a0a0a;border:1px dashed #1f1f1f;border-radius:6px;padding:16px 22px;margin-bottom:10px;opacity:0.5';
      card.innerHTML = `
        <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;color:#333;text-transform:uppercase;margin-bottom:6px">${label}</div>
        <div style="font-size:12px;color:#2a2a2a">Coming soon</div>
      `;
      wrap.appendChild(card);
    });

    return wrap;
  }

  // ── History timeline ────────────────────────────────────────────────────
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
        color:${isActive ? '#c9a227' : '#888'};text-align:left;
      `;
      node.innerHTML = `
        <div style="font-weight:700">${r.period || r.report_date}</div>
        <div style="font-size:10px;color:var(--muted)">${(r.report_date || '').slice(0,10)}</div>
      `;
      node.onclick = () => {
        _selectedReportId = r.id;
        _renderTicker(ticker);
      };
      timeline.appendChild(node);
    });

    wrap.appendChild(timeline);
    return wrap;
  }

})();
