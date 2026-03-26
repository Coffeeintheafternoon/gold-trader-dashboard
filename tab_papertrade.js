// ── Paper Trading Tab ──────────────────────────────────────────────────────────
// Reads: paper_watchlists_index.json
//        paper_portfolio_{watchlist}.json
//        paper_signals_{watchlist}.json

let _ptEquityChart   = null;
let _ptActiveWl      = null;   // currently selected watchlist name
let _ptIndexData     = null;   // cached index

function initPaperTradeTab() {
  document.getElementById('pt-spinner').style.display = 'flex';
  document.getElementById('pt-content').style.display = 'none';
  _ptLoad();
}

async function _ptLoad() {
  // 1. Load index to discover available watchlists
  let index = null;
  try {
    const r = await fetch(`./paper_watchlists_index.json?v=${_CV}`);
    if (r.ok) index = await r.json();
  } catch(e) { /* leave null */ }

  document.getElementById('pt-spinner').style.display = 'none';
  document.getElementById('pt-content').style.display = 'block';

  if (!index || !index.watchlists?.length) {
    _ptShowEmpty();
    return;
  }

  _ptIndexData = index;

  // 2. Render strategy selector pills
  _ptRenderSelector(index.watchlists);

  // 3. Load first watchlist by default (or previously selected)
  const first = _ptActiveWl || index.watchlists[0].name;
  _ptLoadWatchlist(first);
}

// ── Strategy selector ──────────────────────────────────────────────────────────

function _ptRenderSelector(watchlists) {
  const wrap = document.getElementById('pt-selector-wrap');
  if (!wrap) return;

  const pills = watchlists.map(wl => {
    const label   = _ptWlLabel(wl.name);
    const isActive = wl.name === (_ptActiveWl || watchlists[0].name);
    const dot      = wl.has_data ? '' : '<span style="font-size:9px;opacity:0.5"> (empty)</span>';
    return `<button
      class="pt-wl-btn${isActive ? ' pt-wl-active' : ''}"
      onclick="_ptLoadWatchlist('${wl.name}')"
      title="${wl.name}"
    >${label}${dot}</button>`;
  }).join('');

  // Action buttons — only shown when local server is live
  const actions = _srvLive ? `
    <span style="flex:1"></span>
    <button class="pt-wl-btn" onclick="_ptRunEngine()" id="pt-run-btn"
      title="Run paper trade engine for current watchlist"
      style="border-color:#1d4ed8;color:#60a5fa">▶ RUN ENGINE</button>
    <button class="pt-wl-btn" onclick="_ptAddTickerPrompt()"
      title="Add ticker to current watchlist"
      style="border-color:#065f46;color:#34d399">+ ADD TICKER</button>
  ` : '';

  wrap.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;width:100%">${pills}${actions}</div>`;
}

function _ptWlLabel(name) {
  // Convert snake_case watchlist name to a readable label
  // e.g. "mcpt_mar26_conservative" → "MCPT MAR26 · CONSERVATIVE"
  //      "mcpt_mar26_no_stop"      → "MCPT MAR26 · NO STOP"
  //      "default"                 → "DEFAULT"
  return name.toUpperCase().replace(/_/g, ' ').replace(/\s([A-Z]{2,})\s([A-Z]{2,})\s/,
    (m, a, b) => ` ${a}${b} · `).replace(/^(\S+\s\S+)\s/, '$1 · ');
}

async function _ptLoadWatchlist(name) {
  _ptActiveWl = name;

  // Re-render selector to update active pill
  if (_ptIndexData) _ptRenderSelector(_ptIndexData.watchlists);

  // Show mini-spinner in content area while loading
  const content = document.getElementById('pt-watchlist-content');
  if (content) content.style.opacity = '0.4';

  let portfolio = null, signals = { signals: {} };
  try {
    const [pr, sr] = await Promise.all([
      fetch(`./paper_portfolio_${name}.json?v=${_CV}`),
      fetch(`./paper_signals_${name}.json?v=${_CV}`)
    ]);
    if (pr.ok) portfolio = await pr.json();
    if (sr.ok) signals   = await sr.json();
  } catch(e) { /* leave nulls */ }

  if (content) content.style.opacity = '1';

  if (!portfolio || (!portfolio.last_updated && !portfolio.equity_curve?.length)) {
    _ptShowEmptyWatchlist(name);
    return;
  }

  _ptRenderHeader(portfolio, signals);
  _ptRenderHero(portfolio, signals);
  _ptRenderPositions(portfolio, signals);
  _ptRenderEquityCurve(portfolio);
  _ptRenderSignals(signals, portfolio);
  _ptRenderTrades(portfolio);
}

// ── Empty states ───────────────────────────────────────────────────────────────

function _ptShowEmpty() {
  const sel = document.getElementById('pt-selector-wrap');
  if (sel) sel.innerHTML = '';
  document.getElementById('pt-hero-row').innerHTML =
    `<div style="color:var(--muted);font-size:13px;padding:20px 0">
      No paper trading data yet.<br><br>
      1. Add tickers to <code>config/paper_trading/watchlists.yaml</code><br>
      2. Run: <code>python scripts/paper_trade_engine.py --all</code>
    </div>`;
  ['pt-positions-tbody','pt-signals-tbody','pt-trades-tbody'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

function _ptShowEmptyWatchlist(name) {
  document.getElementById('pt-header-row').innerHTML =
    `<span style="color:var(--muted);font-size:12px">${name} — no data yet.
     Run: <code>python scripts/paper_trade_engine.py --watchlist ${name}</code></span>`;
  document.getElementById('pt-hero-row').innerHTML = '';
  ['pt-positions-tbody','pt-signals-tbody','pt-trades-tbody'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  const wrap = document.getElementById('pt-equity-wrap');
  if (wrap) wrap.innerHTML = '<div style="height:180px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px">No data — run the engine first</div>';
}

// ── Header bar ─────────────────────────────────────────────────────────────────

function _ptRenderHeader(portfolio, signals) {
  const wl    = (portfolio.watchlist || 'default').toUpperCase();
  const strat = portfolio.strategy_snapshot || {};
  const ts    = signals.generated_at || portfolio.last_updated;
  const stop  = strat.stop_loss_pct >= 999 ? 'No stop-loss' : `Stop ${strat.stop_loss_pct}%`;

  document.getElementById('pt-watchlist-badge').textContent = `PAPER — ${wl}`;

  const stratDesc = strat.broker
    ? `${strat.broker}  ·  A$${strat.position_size}/trade  ·  max ${strat.max_open_positions} pos  ·  ${stop}`
    : '';
  document.getElementById('pt-strategy-badge').textContent = stratDesc;

  document.getElementById('pt-last-updated').textContent = ts
    ? 'Signals: ' + ts.slice(0, 16).replace('T', ' ') + ' UTC'
    : '';
}

// ── Hero cards ─────────────────────────────────────────────────────────────────

function _ptRenderHero(portfolio, signals) {
  const start  = portfolio.starting_capital || 20000;
  const cash   = portfolio.cash || 0;
  const sigMap = signals.signals || {};

  let equity = cash;
  for (const [ticker, pos] of Object.entries(portfolio.positions || {})) {
    const price = (sigMap[ticker] || {}).current_price || pos.entry_price;
    equity += pos.shares * price;
  }
  equity = Math.round(equity * 100) / 100;

  const pnlPct  = ((equity - start) / start * 100);
  const pnlSign = pnlPct >= 0 ? '+' : '';
  const pnlC    = pnlPct >= 0 ? 'var(--green)' : 'var(--red)';

  const hwm   = portfolio.high_watermark || start;
  const ddPct = ((hwm - equity) / hwm * 100);
  const ddC   = ddPct > 5 ? 'var(--red)' : ddPct > 2 ? 'var(--gold)' : 'var(--green)';

  const nOpen   = Object.keys(portfolio.positions || {}).length;
  const trades  = portfolio.trades || [];
  const wins    = trades.filter(t => (t.pnl || 0) > 0).length;
  const winRate = trades.length ? (wins / trades.length * 100).toFixed(0) + '%' : '—';
  const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const totalPnlC = totalPnl >= 0 ? 'var(--green)' : 'var(--red)';

  const fmtAud = v => 'A$' + v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  document.getElementById('pt-hero-row').innerHTML = `
    <div class="hero-card"><div class="hero-label">Portfolio Equity</div><div class="hero-value color-gold">${fmtAud(equity)}</div><div style="font-size:10px;color:var(--muted)">started ${fmtAud(start)}</div></div>
    <div class="hero-card"><div class="hero-label">Total Return</div><div class="hero-value" style="color:${pnlC}">${pnlSign}${pnlPct.toFixed(2)}%</div></div>
    <div class="hero-card"><div class="hero-label">Cash</div><div class="hero-value" style="font-size:18px">${fmtAud(cash)}</div></div>
    <div class="hero-card"><div class="hero-label">Drawdown</div><div class="hero-value" style="color:${ddC};font-size:20px">-${ddPct.toFixed(1)}%</div><div style="font-size:10px;color:var(--muted)">from peak</div></div>
    <div class="hero-card"><div class="hero-label">Open / Closed</div><div class="hero-value" style="font-size:20px">${nOpen} / ${trades.length}</div><div style="font-size:10px;color:var(--muted)">positions</div></div>
    <div class="hero-card"><div class="hero-label">Win Rate</div><div class="hero-value" style="color:var(--green);font-size:20px">${winRate}</div><div style="font-size:10px;color:var(--muted)">${trades.length} closed</div></div>
    <div class="hero-card"><div class="hero-label">Realised P&L</div><div class="hero-value" style="color:${totalPnlC};font-size:18px">${totalPnl >= 0 ? '+' : ''}${fmtAud(totalPnl)}</div></div>`;
}

// ── Open positions table ────────────────────────────────────────────────────────

function _ptRenderPositions(portfolio, signals) {
  const sigMap  = signals.signals || {};
  const stopPct = (portfolio.strategy_snapshot || {}).stop_loss_pct || 15;
  const noStop  = stopPct >= 999;
  const entries = Object.entries(portfolio.positions || {});
  const tbody   = document.getElementById('pt-positions-tbody');

  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;color:var(--muted);text-align:center">No open positions</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map(([ticker, pos], i) => {
    const bg      = i % 2 ? 'background:#111' : '';
    const price   = (sigMap[ticker] || {}).current_price || pos.entry_price;
    const unreal  = (price - pos.entry_price) / pos.entry_price * 100;
    const uC      = unreal >= 0 ? 'var(--green)' : 'var(--red)';
    const stopLvl = noStop ? '—' : (pos.entry_price * (1 - stopPct / 100)).toFixed(3);
    const closeBtn = _srvLive
      ? `<button onclick="_ptClosePosition('${ticker}')"
           style="padding:2px 8px;font-size:10px;border-radius:3px;border:1px solid #7f1d1d;
                  background:rgba(127,29,29,0.2);color:#f87171;cursor:pointer;font-weight:700"
           title="Manually close this position">✕ CLOSE</button>`
      : '';
    return `<tr style="border-bottom:1px solid #1a1a1a;${bg}">
      <td style="padding:6px 10px;font-weight:700;color:#e5e7eb">${ticker}</td>
      <td style="padding:6px 10px"><span style="color:var(--green);font-weight:700">▲ LONG</span></td>
      <td style="padding:6px 10px;color:var(--muted)">${pos.entry_date}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${pos.entry_price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700;color:${uC}">${unreal >= 0 ? '+' : ''}${unreal.toFixed(2)}%</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:${noStop ? 'var(--muted)' : 'var(--red)'}">
        ${stopLvl}</td>
      <td style="padding:6px 10px;text-align:right;color:var(--muted)">${pos.composite_score != null ? pos.composite_score.toFixed(3) : '—'}</td>
      <td style="padding:6px 10px;text-align:center">${closeBtn}</td>
    </tr>`;
  }).join('');
}

// ── Equity curve chart ─────────────────────────────────────────────────────────

function _ptRenderEquityCurve(portfolio) {
  const curve = portfolio.equity_curve || [];
  const wrap  = document.getElementById('pt-equity-wrap');

  if (!curve.length) {
    wrap.innerHTML = '<div style="height:180px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px">No equity data yet — run the engine first</div>';
    return;
  }

  if (!document.getElementById('pt-equity-chart')) {
    wrap.innerHTML = '<div style="height:180px"><canvas id="pt-equity-chart"></canvas></div>';
  }

  const labels = curve.map(p => p.date);
  const vals   = curve.map(p => p.equity);
  const start  = portfolio.starting_capital || 20000;
  const last   = vals[vals.length - 1] || start;
  const col    = last >= start ? GREEN : RED;

  const ctx = document.getElementById('pt-equity-chart').getContext('2d');
  if (_ptEquityChart) _ptEquityChart.destroy();
  _ptEquityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: vals,
        borderColor: hexA(col, 0.9),
        backgroundColor: hexA(col, 0.08),
        fill: true,
        tension: 0.2,
        pointRadius: vals.length > 30 ? 0 : 3,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => 'A$' + c.raw.toLocaleString('en-AU', { minimumFractionDigits: 2 }) } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        y: { grid: { color: '#1a1a1a' }, ticks: { font: { size: 10 }, callback: v => 'A$' + (v / 1000).toFixed(1) + 'k' } }
      }
    }
  });
}

// ── Today's signals feed ───────────────────────────────────────────────────────

function _ptRenderSignals(signals, portfolio) {
  const sigMap  = signals.signals || {};
  const openSet = new Set(Object.keys(portfolio.positions || {}));
  const tbody   = document.getElementById('pt-signals-tbody');

  const rows = Object.values(sigMap).sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:16px;color:var(--muted);text-align:center">No signals yet — run paper_trade_engine.py</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((s, i) => {
    const bg     = i % 2 ? 'background:#111' : '';
    const dir    = s.direction || '—';
    const isOpen = openSet.has(s.ticker);
    const dirC   = dir === 'LONG' ? 'var(--green)' : dir === 'SHORT' ? 'var(--red)' : 'var(--muted)';
    const pred   = s.predicted_return != null ? (s.predicted_return >= 0 ? '+' : '') + s.predicted_return.toFixed(2) + '%' : '—';
    const predC  = s.predicted_return == null ? 'var(--muted)' : s.predicted_return >= 0 ? 'var(--green)' : 'var(--red)';
    const score  = s.composite_score != null ? s.composite_score.toFixed(3) : '—';
    const shr    = s.ho_sharpe != null ? s.ho_sharpe.toFixed(2) : '—';
    const price  = s.current_price != null ? s.current_price.toFixed(3) : '—';
    const eligible  = dir === 'LONG' || dir === 'SHORT';
    const statusBg  = isOpen ? 'rgba(245,165,32,0.12)' : eligible ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)';
    const statusCol = isOpen ? 'var(--gold)' : eligible ? 'var(--green)' : 'var(--muted)';
    const statusTxt = isOpen ? 'OPEN' : eligible ? 'ELIGIBLE' : dir;
    return `<tr style="border-bottom:1px solid #1a1a1a;${bg}">
      <td style="padding:6px 10px;font-weight:700;color:#e5e7eb">${s.ticker}</td>
      <td style="padding:6px 10px;text-align:center;font-weight:700;color:${dirC}">${dir}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:${predC}">${pred}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${score}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${shr}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:var(--muted)">${price}</td>
      <td style="padding:6px 10px;text-align:center"><span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${statusBg};color:${statusCol}">${statusTxt}</span></td>
    </tr>`;
  }).join('');
}

// ── Closed trade log ───────────────────────────────────────────────────────────

function _ptRenderTrades(portfolio) {
  const trades = [...(portfolio.trades || [])].reverse();
  const tbody  = document.getElementById('pt-trades-tbody');

  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;color:var(--muted);text-align:center">No closed trades yet</td></tr>';
    return;
  }

  tbody.innerHTML = trades.map((t, i) => {
    const bg     = i % 2 ? 'background:#111' : '';
    const pnl    = t.pnl || 0;
    const pnlPct = t.pnl_pct || 0;
    const pnlC   = pnl >= 0 ? 'var(--green)' : 'var(--red)';
    const reason = t.exit_reason || '—';
    const rsnC   = reason.startsWith('STOP') ? 'var(--red)' : 'var(--muted)';
    return `<tr style="border-bottom:1px solid #1a1a1a;${bg}">
      <td style="padding:6px 10px;font-weight:700;color:#e5e7eb">${t.ticker}</td>
      <td style="padding:6px 10px;color:var(--muted)">${t.entry_date}</td>
      <td style="padding:6px 10px;color:var(--muted)">${t.exit_date}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${t.entry_price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${t.exit_price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700;color:${pnlC}">${pnl >= 0 ? '+' : ''}A$${pnl.toFixed(2)}</td>
      <td style="padding:6px 10px;text-align:right;color:${pnlC}">${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%</td>
      <td style="padding:6px 10px;font-size:10px;color:${rsnC}">${reason}</td>
    </tr>`;
  }).join('');
}

// ── Interactive API actions ────────────────────────────────────────────────────

async function _ptRunEngine() {
  if (!_ptActiveWl) return;
  const btn = document.getElementById('pt-run-btn');
  if (btn) { btn.textContent = '⏳ RUNNING…'; btn.disabled = true; }

  try {
    const r = await fetch(`${_SRV_BASE}/api/paper/engine/run`, {
      method: 'POST',
      headers: _srvHeaders(),
      body: JSON.stringify({ watchlist: _ptActiveWl }),
    });
    const data = await r.json();
    if (!r.ok) { alert(`Engine error: ${data.error || r.status}`); return; }

    // Poll for completion
    const jobId = data.job_id;
    let done = false;
    for (let i = 0; i < 60 && !done; i++) {
      await new Promise(res => setTimeout(res, 5000));
      try {
        const sr = await fetch(`${_SRV_BASE}/api/paper/engine/status/${jobId}`, { headers: _srvHeaders() });
        const job = await sr.json();
        if (job.status === 'done')  { done = true; }
        if (job.status === 'error') { alert(`Engine failed: ${job.error}`); done = true; return; }
      } catch(e) { /* keep polling */ }
    }
    // Reload portfolio data
    await _ptLoadWatchlist(_ptActiveWl);
  } catch(e) {
    alert(`Request failed: ${e.message}`);
  } finally {
    if (btn) { btn.textContent = '▶ RUN ENGINE'; btn.disabled = false; }
  }
}

function _ptAddTickerPrompt() {
  if (!_ptActiveWl) return;
  const ticker = prompt(`Add ticker to ${_ptActiveWl}\n\nEnter ASX ticker (e.g. LYC.AX):`);
  if (!ticker) return;
  _ptAddTicker(ticker.trim().toUpperCase());
}

async function _ptAddTicker(ticker) {
  try {
    const r = await fetch(`${_SRV_BASE}/api/paper/watchlist/update`, {
      method: 'POST',
      headers: _srvHeaders(),
      body: JSON.stringify({ watchlist: _ptActiveWl, action: 'add', ticker }),
    });
    const data = await r.json();
    if (!r.ok) { alert(`Error: ${data.error || r.status}`); return; }
    alert(`${ticker} added to ${_ptActiveWl}.\n\nTickers now: ${(data.tickers || []).join(', ')}\n\nRun the engine to generate its first signal.`);
  } catch(e) {
    alert(`Request failed: ${e.message}`);
  }
}

async function _ptClosePosition(ticker) {
  if (!_ptActiveWl) return;
  if (!confirm(`Close ${ticker} position in ${_ptActiveWl}?\n\nThis will book the trade at the last known price.`)) return;

  try {
    const r = await fetch(`${_SRV_BASE}/api/paper/position/close`, {
      method: 'POST',
      headers: _srvHeaders(),
      body: JSON.stringify({ watchlist: _ptActiveWl, ticker }),
    });
    const data = await r.json();
    if (!r.ok) { alert(`Error: ${data.error || r.status}`); return; }
    const pnlSign = data.pnl >= 0 ? '+' : '';
    alert(`${ticker} closed.\nExit: ${data.exit_price?.toFixed(3)}\nP&L: ${pnlSign}A$${data.pnl?.toFixed(2)} (${pnlSign}${data.pnl_pct?.toFixed(2)}%)`);
    // Reload portfolio
    await _ptLoadWatchlist(_ptActiveWl);
  } catch(e) {
    alert(`Request failed: ${e.message}`);
  }
}
