// tab_broker.js — Broker Research Report tab
// Fetches broker_data.json and renders report cards, variance tables,
// Claude narrative, and report history timeline.

(function () {
  'use strict';

  let _data = null;
  let _selectedTicker = null;
  let _selectedReportId = null;

  // ── Friendly metric labels ──────────────────────────────────────────────
  const METRIC_LABELS = {
    gold_production_koz: 'Gold Production',
    head_grade_gt:       'Head Grade',
    recovery_pct:        'Mill Recovery',
    aisc_per_oz:         'AISC',
    ore_milled_mt:       'Ore Milled',
    strip_ratio:         'Strip Ratio',
    cash_cost_per_oz:    'Cash Cost',
    capex_m:             'Capex',
  };

  // ── Verdict colours ─────────────────────────────────────────────────────
  const VERDICT_COLOUR = {
    BEAT:    '#c9a227',
    MISS:    '#e05252',
    MIXED:   '#e07f2a',
    IN_LINE: '#555',
    UNKNOWN: '#444',
  };

  // ── Entry point ─────────────────────────────────────────────────────────
  window.initBrokerTab = function () {
    if (_data) { _render(); return; }
    fetch('broker_data.json?_=' + Date.now())
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => {
        _data = json;
        _render();
      })
      .catch(err => {
        document.getElementById('broker-loading').textContent =
          'broker_data.json not found — ingest a report first.';
        console.warn('broker tab:', err);
      });
  };

  // ── Top-level render ─────────────────────────────────────────────────────
  function _render() {
    const loading = document.getElementById('broker-loading');
    const body    = document.getElementById('broker-body');

    if (!_data || !_data.tickers || !_data.tickers.length) {
      loading.textContent = 'No broker reports ingested yet. Run scripts/ingest_broker_report.py to add one.';
      return;
    }

    loading.style.display = 'none';
    body.style.display    = 'block';
    body.innerHTML        = '';

    // Ticker selector bar
    const bar = _buildTickerBar(_data.tickers);
    body.appendChild(bar);

    // Content area
    const content = document.createElement('div');
    content.id = 'broker-content';
    body.appendChild(content);

    // Select first ticker by default
    if (!_selectedTicker) _selectedTicker = _data.tickers[0].ticker;
    _renderTicker(_selectedTicker);
  }

  // ── Ticker selector bar ──────────────────────────────────────────────────
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
    const content  = document.getElementById('broker-content');
    content.innerHTML = '';

    const tickerData = _data.tickers.find(t => t.ticker === ticker);
    if (!tickerData || !tickerData.reports.length) {
      content.innerHTML = '<p style="color:var(--muted)">No reports for ' + ticker + '</p>';
      return;
    }

    // Default to latest report
    if (!_selectedReportId) _selectedReportId = tickerData.reports[0].id;
    const report = tickerData.reports.find(r => r.id === _selectedReportId)
                || tickerData.reports[0];

    content.appendChild(_buildHeaderCard(report, ticker));
    content.appendChild(_buildVarianceTable(report));
    content.appendChild(_buildNarrativePanel(report));
    if (tickerData.reports.length > 1) {
      content.appendChild(_buildHistoryTimeline(tickerData.reports, ticker));
    }
  }

  // ── Header card ──────────────────────────────────────────────────────────
  function _buildHeaderCard(report, ticker) {
    const a = report.analysis || {};
    const verdict = a.overall_verdict || 'UNKNOWN';
    const colour  = VERDICT_COLOUR[verdict] || '#444';

    const card = document.createElement('div');
    card.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div>
          <span style="font-size:18px;font-weight:900;color:var(--gold)">${ticker}</span>
          <span style="font-size:13px;color:var(--muted);margin-left:12px">${report.broker_name}</span>
          <span style="font-size:12px;color:#444;margin-left:8px">${report.report_date || ''}</span>
          ${report.report_quarter ? `<span style="font-size:12px;color:#444;margin-left:8px">${report.report_quarter}</span>` : ''}
        </div>
        <span style="font-size:11px;font-weight:900;letter-spacing:1px;padding:4px 12px;border-radius:3px;background:${colour}22;color:${colour};border:1px solid ${colour}44">${verdict}</span>
      </div>
      ${a.headline ? `<div style="margin-top:12px;font-size:13px;color:#ccc;line-height:1.5">${a.headline}</div>` : ''}
    `;
    return card;
  }

  // ── Variance table ───────────────────────────────────────────────────────
  function _buildVarianceTable(report) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:12px';
    title.textContent = 'Metrics vs Estimates';
    wrap.appendChild(title);

    if (!report.variances || !report.variances.length) {
      wrap.innerHTML += '<p style="color:var(--muted);font-size:12px">No metrics extracted.</p>';
      return wrap;
    }

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px';
    table.innerHTML = `
      <thead>
        <tr style="color:var(--muted);text-align:right">
          <th style="text-align:left;padding:4px 8px;font-weight:600">Metric</th>
          <th style="padding:4px 8px;font-weight:600">Unit</th>
          <th style="padding:4px 8px;font-weight:600">Estimate</th>
          <th style="padding:4px 8px;font-weight:600">Actual</th>
          <th style="padding:4px 8px;font-weight:600">Var %</th>
          <th style="padding:4px 8px;font-weight:600">Result</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement('tbody');
    report.variances.forEach(v => {
      const verdict = v.beat_miss || '';
      const colour  = verdict === 'BEAT' ? '#c9a227' : verdict === 'MISS' ? '#e05252' : '#555';
      const varPct  = v.variance_pct != null ? (v.variance_pct > 0 ? '+' : '') + v.variance_pct.toFixed(1) + '%' : 'n/a';
      const label   = METRIC_LABELS[v.metric_name] || v.metric_name;
      const est     = v.estimate != null ? v.estimate.toFixed(2) : 'n/a';
      const act     = v.actual   != null ? v.actual.toFixed(2)   : 'n/a';

      const tr = document.createElement('tr');
      tr.style.cssText = 'border-top:1px solid #1a1a1a';
      tr.innerHTML = `
        <td style="padding:6px 8px;color:#ccc">${label}</td>
        <td style="padding:6px 8px;color:var(--muted);text-align:right">${v.unit || ''}</td>
        <td style="padding:6px 8px;color:var(--muted);text-align:right">${est}</td>
        <td style="padding:6px 8px;color:#ccc;text-align:right">${act}</td>
        <td style="padding:6px 8px;color:${colour};text-align:right">${varPct}</td>
        <td style="padding:6px 8px;text-align:right">
          <span style="font-size:10px;font-weight:700;letter-spacing:0.8px;color:${colour}">${verdict}</span>
        </td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // ── Claude narrative panel ───────────────────────────────────────────────
  function _buildNarrativePanel(report) {
    const a = report.analysis;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:18px 22px;margin-bottom:16px';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;margin-bottom:12px';
    title.textContent = 'Analysis';
    wrap.appendChild(title);

    if (!a || !a.narrative) {
      wrap.innerHTML += '<p style="color:var(--muted);font-size:12px">No analysis available. Re-run with Claude enabled.</p>';
      return wrap;
    }

    // Narrative paragraphs
    const narr = document.createElement('div');
    narr.style.cssText = 'font-size:13px;line-height:1.7;color:#ccc;margin-bottom:16px';
    narr.innerHTML = a.narrative.split('\n').filter(l => l.trim()).map(p => `<p style="margin:0 0 10px">${p}</p>`).join('');
    wrap.appendChild(narr);

    // Key drivers
    if (a.key_drivers && a.key_drivers.length) {
      const drivers = document.createElement('div');
      drivers.style.marginBottom = '12px';
      drivers.innerHTML = `
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Key Drivers</div>
        <ul style="margin:0;padding-left:18px;font-size:12px;color:#aaa;line-height:1.7">
          ${a.key_drivers.map(d => `<li>${d}</li>`).join('')}
        </ul>
      `;
      wrap.appendChild(drivers);
    }

    // Risks
    if (a.risks && a.risks.length) {
      const risks = document.createElement('div');
      risks.innerHTML = `
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Risks</div>
        <ul style="margin:0;padding-left:18px;font-size:12px;color:#e05252;line-height:1.7">
          ${a.risks.map(r => `<li>${r}</li>`).join('')}
        </ul>
      `;
      wrap.appendChild(risks);
    }

    // Token cost
    if (a.input_tokens) {
      const meta = document.createElement('div');
      meta.style.cssText = 'margin-top:14px;font-size:10px;color:#333';
      meta.textContent = `${a.model || 'claude'} · ${a.input_tokens}→${a.output_tokens} tokens · ${(a.analysed_at || '').slice(0,10)}`;
      wrap.appendChild(meta);
    }

    return wrap;
  }

  // ── History timeline ─────────────────────────────────────────────────────
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
      const a       = r.analysis || {};
      const verdict = a.overall_verdict || 'UNKNOWN';
      const colour  = VERDICT_COLOUR[verdict] || '#444';
      const isActive = r.id === _selectedReportId;

      const node = document.createElement('button');
      node.style.cssText = `
        background:${isActive ? colour + '22' : '#0a0a0a'};
        border:1px solid ${colour}${isActive ? '' : '44'};
        border-radius:4px;padding:6px 12px;cursor:pointer;
        font-size:11px;color:${colour};text-align:left;
      `;
      node.innerHTML = `
        <div style="font-weight:700">${r.report_quarter || r.report_date}</div>
        <div style="font-size:10px;color:var(--muted)">${r.broker_name}</div>
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
