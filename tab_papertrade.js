// ── Paper Trading Tab ──────────────────────────────────────────────────────────
// Reads: paper_watchlists_index.json
//        paper_portfolio_{watchlist}.json
//        paper_signals_{watchlist}.json
// Server (when live): /api/paper/model/health, /api/paper/model/rerun

let _ptEquityChart   = null;
let _ptActiveWl      = null;   // currently selected watchlist name
let _ptIndexData     = null;   // cached index
let _ptHealthData    = null;   // model health from /api/paper/model/health (null if offline)

function initPaperTradeTab() {
  document.getElementById('pt-spinner').style.display = 'flex';
  document.getElementById('pt-content').style.display = 'none';
  _ptLoad();
}

async function _ptLoad() {
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
  _ptRenderSelector(index.watchlists);
  const first = _ptActiveWl || index.watchlists[0].name;
  _ptLoadWatchlist(first);
}

// ── Strategy selector ──────────────────────────────────────────────────────────

function _ptRenderSelector(watchlists) {
  const wrap = document.getElementById('pt-selector-wrap');
  if (!wrap) return;

  const pills = watchlists.map(wl => {
    const label    = _ptWlLabel(wl.name);
    const isActive = wl.name === (_ptActiveWl || watchlists[0].name);
    const dot      = wl.has_data ? '' : '<span style="font-size:9px;opacity:0.5"> (empty)</span>';
    return `<button
      class="pt-wl-btn${isActive ? ' pt-wl-active' : ''}"
      onclick="_ptLoadWatchlist('${wl.name}')"
      title="${wl.name}"
    >${label}${dot}</button>`;
  }).join('');

  const actions = _srvLive ? `
    <span style="flex:1"></span>
    <button class="pt-wl-btn" onclick="_ptRunEngine()" id="pt-run-btn"
      title="Run paper trade engine for current watchlist"
      style="border-color:#1d4ed8;color:#60a5fa">▶ RUN ENGINE</button>
    <button class="pt-wl-btn" onclick="_ptRerun()" id="pt-rerun-btn"
      title="Dry-run signal generation — shows results without saving anything"
      style="border-color:#4c1d95;color:#a78bfa">↺ RE-RUN MODEL</button>
    <button class="pt-wl-btn" onclick="_ptAddTickerPrompt()"
      title="Add ticker to current watchlist"
      style="border-color:#065f46;color:#34d399">+ ADD TICKER</button>
  ` : '';

  wrap.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;width:100%">${pills}${actions}</div>`;
}

function _ptWlLabel(name) {
  // "mcpt_mar26_conservative" → "MCPT MAR26 · CONSERVATIVE"
  // "default" → "DEFAULT"
  return name.toUpperCase().replace(/_/g, ' ').replace(/\s([A-Z]{2,})\s([A-Z]{2,})\s/,
    (m, a, b) => ` ${a}${b} · `).replace(/^(\S+\s\S+)\s/, '$1 · ');
}

async function _ptLoadWatchlist(name) {
  _ptActiveWl  = name;
  _ptHealthData = null;
  if (_ptIndexData) _ptRenderSelector(_ptIndexData.watchlists);

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

  // Fetch model health from server (non-blocking, enriches signals table + health panel)
  if (_srvLive) {
    try {
      const hr = await fetch(
        `${_SRV_BASE}/api/paper/model/health?watchlist=${encodeURIComponent(name)}`,
        { headers: _srvHeaders() }
      );
      if (hr.ok) _ptHealthData = (await hr.json()).health || null;
    } catch(e) { /* server offline */ }
  }

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
  _ptRenderModelHealth(signals);
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
  const mh = document.getElementById('pt-model-health-wrap');
  if (mh) mh.innerHTML = '';
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
  if (wrap) wrap.innerHTML = '<div style="height:200px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px">No data — run the engine first</div>';
  const mh = document.getElementById('pt-model-health-wrap');
  if (mh) mh.innerHTML = '';
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

// ── Hero cards (enhanced) ──────────────────────────────────────────────────────

function _ptRenderHero(portfolio, signals) {
  const start  = portfolio.starting_capital || 20000;
  const cash   = portfolio.cash || 0;
  const sigMap = signals.signals || {};

  // Live equity (cash + mark-to-market open positions)
  let equity = cash;
  for (const [ticker, pos] of Object.entries(portfolio.positions || {})) {
    const price = (sigMap[ticker] || {}).current_price || pos.entry_price;
    equity += pos.shares * price;
  }
  equity = Math.round(equity * 100) / 100;

  const pnlPct  = (equity - start) / start * 100;
  const pnlSign = pnlPct >= 0 ? '+' : '';
  const pnlC    = pnlPct >= 0 ? 'var(--green)' : 'var(--red)';

  const hwm   = portfolio.high_watermark || start;
  const ddPct = (hwm - equity) / hwm * 100;
  const ddC   = ddPct > 5 ? 'var(--red)' : ddPct > 2 ? 'var(--gold)' : 'var(--green)';

  const nOpen  = Object.keys(portfolio.positions || {}).length;
  const trades = portfolio.trades || [];
  const wins   = trades.filter(t => (t.pnl || 0) > 0);
  const losses = trades.filter(t => (t.pnl || 0) <= 0);
  const winRate = trades.length ? (wins.length / trades.length * 100).toFixed(0) + '%' : '—';

  // Profit factor
  const grossWin  = wins.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0));
  const pf        = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null);
  const pfStr     = pf === null ? '—' : pf === Infinity ? '∞' : pf.toFixed(2);
  const pfC       = pf === null ? 'var(--muted)' : pf >= 1.5 ? 'var(--green)' : pf >= 1.0 ? 'var(--gold)' : 'var(--red)';

  // Avg win / avg loss
  const avgWin  = wins.length   ? grossWin / wins.length   : null;
  const avgLoss = losses.length ? grossLoss / losses.length : null;

  // Best / worst single trade
  const pnls    = trades.map(t => t.pnl || 0);
  const bestPnl = pnls.length ? Math.max(...pnls) : null;
  const wrstPnl = pnls.length ? Math.min(...pnls) : null;

  const totalPnl  = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const totalPnlC = totalPnl >= 0 ? 'var(--green)' : 'var(--red)';

  const fmtAud = v => 'A$' + v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  document.getElementById('pt-hero-row').innerHTML = `
    <div class="hero-card"><div class="hero-label">Portfolio Equity</div><div class="hero-value color-gold">${fmtAud(equity)}</div><div style="font-size:10px;color:var(--muted)">started ${fmtAud(start)}</div></div>
    <div class="hero-card"><div class="hero-label">Total Return</div><div class="hero-value" style="color:${pnlC}">${pnlSign}${pnlPct.toFixed(2)}%</div></div>
    <div class="hero-card"><div class="hero-label">Cash</div><div class="hero-value" style="font-size:18px">${fmtAud(cash)}</div></div>
    <div class="hero-card"><div class="hero-label">Drawdown</div><div class="hero-value" style="color:${ddC};font-size:20px">-${ddPct.toFixed(1)}%</div><div style="font-size:10px;color:var(--muted)">from peak</div></div>
    <div class="hero-card"><div class="hero-label">Open / Closed</div><div class="hero-value" style="font-size:20px">${nOpen} / ${trades.length}</div></div>
    <div class="hero-card"><div class="hero-label">Win Rate</div><div class="hero-value" style="color:var(--green);font-size:20px">${winRate}</div><div style="font-size:10px;color:var(--muted)">${trades.length} closed</div></div>
    <div class="hero-card"><div class="hero-label">Realised P&L</div><div class="hero-value" style="color:${totalPnlC};font-size:18px">${totalPnl >= 0 ? '+' : ''}${fmtAud(totalPnl)}</div></div>
    <div class="hero-card"><div class="hero-label">Profit Factor</div><div class="hero-value" style="color:${pfC};font-size:20px">${pfStr}</div><div style="font-size:10px;color:var(--muted)">gross win÷loss</div></div>
    <div class="hero-card"><div class="hero-label">Avg Win / Avg Loss</div>
      <div style="font-size:14px;font-weight:700;color:var(--green);line-height:1.4">${avgWin  != null ? fmtAud(avgWin)  : '—'}</div>
      <div style="font-size:14px;font-weight:700;color:var(--red);  line-height:1.4">${avgLoss != null ? '-' + fmtAud(avgLoss) : '—'}</div>
    </div>
    <div class="hero-card"><div class="hero-label">Best / Worst Trade</div>
      <div style="font-size:14px;font-weight:700;color:var(--green);line-height:1.4">${bestPnl != null ? (bestPnl >= 0 ? '+' : '') + fmtAud(bestPnl) : '—'}</div>
      <div style="font-size:14px;font-weight:700;color:var(--red);  line-height:1.4">${wrstPnl != null ? (wrstPnl >= 0 ? '+' : '') + fmtAud(wrstPnl) : '—'}</div>
    </div>`;
}

// ── Open positions table (enhanced) ────────────────────────────────────────────

function _ptRenderPositions(portfolio, signals) {
  const sigMap  = signals.signals || {};
  const stopPct = (portfolio.strategy_snapshot || {}).stop_loss_pct || 15;
  const noStop  = stopPct >= 999;
  const entries = Object.entries(portfolio.positions || {});
  const tbody   = document.getElementById('pt-positions-tbody');
  const today   = Date.now();

  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="padding:16px;color:var(--muted);text-align:center">No open positions</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map(([ticker, pos], i) => {
    const bg       = i % 2 ? 'background:#111' : '';
    const price    = (sigMap[ticker] || {}).current_price || pos.entry_price;
    const unrPct   = (price - pos.entry_price) / pos.entry_price * 100;
    const unrAud   = (price - pos.entry_price) * pos.shares;
    const uC       = unrPct >= 0 ? 'var(--green)' : 'var(--red)';
    const stopLvl  = noStop ? '—' : (pos.entry_price * (1 - stopPct / 100)).toFixed(3);
    const holdDays = Math.round((today - new Date(pos.entry_date).getTime()) / 86400000);

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
      <td style="padding:6px 10px;text-align:right;color:var(--muted)">${holdDays}d</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${pos.entry_price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700;color:${uC}">${unrPct >= 0 ? '+' : ''}${unrPct.toFixed(2)}%</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700;color:${uC}">${unrAud >= 0 ? '+' : ''}A$${unrAud.toFixed(2)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:${noStop ? 'var(--muted)' : 'var(--red)'}">
        ${stopLvl}</td>
      <td style="padding:6px 10px;text-align:center">${closeBtn}</td>
    </tr>`;
  }).join('');
}

// ── Equity curve chart (enhanced) ──────────────────────────────────────────────

function _ptRenderEquityCurve(portfolio) {
  const curve  = portfolio.equity_curve || [];
  const wrap   = document.getElementById('pt-equity-wrap');

  if (!curve.length) {
    wrap.innerHTML = '<div style="height:200px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px">No equity data yet — run the engine first</div>';
    return;
  }

  if (!document.getElementById('pt-equity-chart')) {
    wrap.innerHTML = '<div style="height:200px"><canvas id="pt-equity-chart"></canvas></div>';
  }

  const labels = curve.map(p => p.date);
  const vals   = curve.map(p => p.equity);
  const start  = portfolio.starting_capital || 20000;
  const last   = vals[vals.length - 1] || start;
  const col    = last >= start ? GREEN : RED;

  // Trade entry/exit markers — scatter points on the equity line
  const trades = portfolio.trades || [];
  const entryMarkers = labels.map((d, i) =>
    trades.some(t => t.entry_date === d) ? vals[i] : null
  );
  const exitMarkers = labels.map((d, i) =>
    trades.some(t => t.exit_date === d) ? vals[i] : null
  );
  const hasMarkers = entryMarkers.some(v => v != null) || exitMarkers.some(v => v != null);

  const ctx = document.getElementById('pt-equity-chart').getContext('2d');
  if (_ptEquityChart) _ptEquityChart.destroy();
  _ptEquityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Equity',
          data: vals,
          borderColor: hexA(col, 0.9),
          backgroundColor: hexA(col, 0.08),
          fill: true,
          tension: 0.2,
          pointRadius: vals.length > 30 ? 0 : 3,
          borderWidth: 2,
          order: 1,
        },
        {
          // Benchmark: flat line at starting capital
          label: 'Benchmark',
          data: labels.map(() => start),
          borderColor: 'rgba(136,136,136,0.35)',
          backgroundColor: 'transparent',
          borderDash: [4, 4],
          pointRadius: 0,
          borderWidth: 1,
          fill: false,
          order: 2,
        },
        ...(hasMarkers ? [
          {
            label: 'Entry',
            data: entryMarkers,
            type: 'scatter',
            pointStyle: 'triangle',
            pointRadius: 7,
            backgroundColor: 'rgba(74,222,128,0.85)',
            borderColor: 'transparent',
            order: 0,
          },
          {
            label: 'Exit',
            data: exitMarkers,
            type: 'scatter',
            pointStyle: 'rectRot',
            pointRadius: 6,
            backgroundColor: 'rgba(248,113,113,0.85)',
            borderColor: 'transparent',
            order: 0,
          }
        ] : []),
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => {
              if (c.dataset.label === 'Equity')    return 'Equity: A$' + c.raw.toLocaleString('en-AU', { minimumFractionDigits: 2 });
              if (c.dataset.label === 'Benchmark') return 'Start: A$'  + c.raw.toLocaleString('en-AU', { minimumFractionDigits: 2 });
              return c.dataset.label;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
        y: { grid: { color: '#1a1a1a' }, ticks: { font: { size: 10 }, callback: v => 'A$' + (v / 1000).toFixed(1) + 'k' } }
      }
    }
  });
}

// ── Today's signals feed (enhanced) ───────────────────────────────────────────

function _ptRenderSignals(signals, portfolio) {
  const sigMap  = signals.signals || {};
  const openSet = new Set(Object.keys(portfolio.positions || {}));
  const tbody   = document.getElementById('pt-signals-tbody');

  // Build health lookup from server data (enriches MCPT p-value column)
  const healthMap = {};
  if (_ptHealthData) {
    for (const h of _ptHealthData) healthMap[h.ticker] = h;
  }

  const rows = Object.values(sigMap).sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="padding:16px;color:var(--muted);text-align:center">No signals yet — run paper_trade_engine.py</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((s, i) => {
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

    // Overfit badge (from signal, enriched by health data)
    const overfit = s.overfit_signal || (healthMap[s.ticker] || {}).overfit_signal || '—';
    const ovfC    = overfit === 'LOW' ? 'var(--green)' : overfit === 'MEDIUM' ? 'var(--gold)' : overfit === 'HIGH' ? 'var(--red)' : 'var(--muted)';
    const ovfBg   = overfit === 'LOW'  ? 'rgba(34,197,94,0.08)'  :
                    overfit === 'MEDIUM'? 'rgba(245,165,32,0.08)' :
                    overfit === 'HIGH'  ? 'rgba(255,32,32,0.08)'  : 'transparent';

    // MCPT p-value — only available from server health data
    const mcptP   = (healthMap[s.ticker] || {}).mcpt_p_value;
    const mcptStr = mcptP != null ? mcptP.toFixed(3) : (_ptHealthData ? '—' : 'n/a');
    const mcptC   = mcptP == null ? 'var(--muted)' :
                    mcptP <= 0.01 ? 'var(--green)' :
                    mcptP <= 0.05 ? '#86efac' :
                    mcptP <= 0.10 ? 'var(--gold)' : 'var(--muted)';

    // Row tint: HIGH overfit → faint red wash
    const rowBg = overfit === 'HIGH' ? 'rgba(255,32,32,0.03)' : (i % 2 ? 'background:#111' : '');

    return `<tr style="border-bottom:1px solid #1a1a1a;${rowBg}">
      <td style="padding:6px 10px;font-weight:700;color:#e5e7eb">${s.ticker}</td>
      <td style="padding:6px 10px;text-align:center;font-weight:700;color:${dirC}">${dir}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:${predC}">${pred}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${score}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${shr}</td>
      <td style="padding:6px 10px;text-align:center"><span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${ovfBg};color:${ovfC}">${overfit}</span></td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:${mcptC}">${mcptStr}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:var(--muted)">${price}</td>
      <td style="padding:6px 10px;text-align:center"><span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${statusBg};color:${statusCol}">${statusTxt}</span></td>
    </tr>`;
  }).join('');
}

// ── Closed trade log (enhanced) ────────────────────────────────────────────────

function _ptRenderTrades(portfolio) {
  const trades = [...(portfolio.trades || [])].reverse();   // newest first in table
  const tbody  = document.getElementById('pt-trades-tbody');

  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="padding:16px;color:var(--muted);text-align:center">No closed trades yet</td></tr>';
    return;
  }

  // Build cumulative P&L map in chronological order (oldest first)
  let runPnl = 0;
  const cumPnlList = (portfolio.trades || []).map(t => {
    runPnl += t.pnl || 0;
    return { key: t.entry_date + t.ticker + t.exit_date, cum: runPnl };
  });
  const cumMap = new Map(cumPnlList.map(x => [x.key, x.cum]));

  const _exitColor = r => {
    if (!r || r === '—') return 'var(--muted)';
    if (r.startsWith('STOP'))     return '#f87171';
    if (r === 'SIGNAL_FLIP')      return '#fcd34d';
    if (r === 'MANUAL_CLOSE')     return '#93c5fd';
    return 'var(--muted)';
  };
  const _exitBg = r => {
    if (!r) return 'transparent';
    if (r.startsWith('STOP'))  return 'rgba(248,113,113,0.10)';
    if (r === 'SIGNAL_FLIP')   return 'rgba(252,211,77,0.10)';
    if (r === 'MANUAL_CLOSE')  return 'rgba(147,197,253,0.10)';
    return 'transparent';
  };

  tbody.innerHTML = trades.map((t, i) => {
    const bg     = i % 2 ? 'background:#111' : '';
    const pnl    = t.pnl || 0;
    const pnlPct = t.pnl_pct || 0;
    const pnlC   = pnl >= 0 ? 'var(--green)' : 'var(--red)';
    const reason = t.exit_reason || '—';
    const cum    = cumMap.get(t.entry_date + t.ticker + t.exit_date);
    const cumC   = cum == null ? 'var(--muted)' : cum >= 0 ? 'var(--green)' : 'var(--red)';

    return `<tr style="border-bottom:1px solid #1a1a1a;${bg}">
      <td style="padding:6px 10px;font-weight:700;color:#e5e7eb">${t.ticker}</td>
      <td style="padding:6px 10px;color:var(--muted)">${t.entry_date}</td>
      <td style="padding:6px 10px;color:var(--muted)">${t.exit_date}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${t.entry_price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${t.exit_price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700;color:${pnlC}">${pnl >= 0 ? '+' : ''}A$${pnl.toFixed(2)}</td>
      <td style="padding:6px 10px;text-align:right;color:${pnlC}">${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%</td>
      <td style="padding:6px 10px;text-align:right;font-weight:600;color:${cumC}">${cum != null ? (cum >= 0 ? '+' : '') + 'A$' + cum.toFixed(2) : '—'}</td>
      <td style="padding:6px 10px"><span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${_exitBg(reason)};color:${_exitColor(reason)}">${reason}</span></td>
    </tr>`;
  }).join('');
}

// ── Model health panel (new) ───────────────────────────────────────────────────

function _ptRenderModelHealth(signals) {
  const wrap = document.getElementById('pt-model-health-wrap');
  if (!wrap) return;

  const sigMap  = signals.signals || {};
  const tickers = Object.keys(sigMap);
  if (!tickers.length) { wrap.innerHTML = ''; return; }

  // Build per-ticker health: prefer server data, fallback to signal fields
  const healthMap = {};
  if (_ptHealthData) {
    for (const h of _ptHealthData) healthMap[h.ticker] = h;
  }

  const rows = tickers.map(ticker => {
    const s = sigMap[ticker] || {};
    const h = healthMap[ticker] || {};
    return {
      ticker,
      status:         h.status || (s.direction === 'NO_MODEL' ? 'NO_MODEL' : 'OK'),
      overfit_signal: s.overfit_signal || h.overfit_signal || '—',
      ho_sharpe:      s.ho_sharpe  ?? h.ho_sharpe,
      ho_pf:          h.ho_pf,
      is_sharpe:      s.is_sharpe  ?? h.is_sharpe,
      mcpt_p_value:   h.mcpt_p_value,
    };
  });

  const _ovfC = v => v === 'LOW' ? '#4ade80' : v === 'MEDIUM' ? '#fcd34d' : v === 'HIGH' ? '#f87171' : '#555';
  const _mcptC = v => v == null ? '#555' : v <= 0.01 ? '#4ade80' : v <= 0.05 ? '#86efac' : v <= 0.10 ? '#fcd34d' : '#555';
  const _shrC  = v => v == null ? '#555' : v >= 0.5 ? '#4ade80' : v >= 0 ? '#fcd34d' : '#f87171';
  const _pfC   = v => v == null ? '#555' : v >= 1.2 ? '#4ade80' : v >= 1.0 ? '#fcd34d' : '#f87171';

  const serverNote = !_ptHealthData
    ? '<span style="font-size:10px;color:var(--muted);margin-left:10px;font-weight:400">HO PF and MCPT p require local server</span>'
    : '';

  const tableRows = rows.map((r, i) => {
    const bg     = i % 2 ? 'background:#111' : '';
    const shr    = r.ho_sharpe   != null ? r.ho_sharpe.toFixed(2)   : '—';
    const pf     = r.ho_pf       != null ? r.ho_pf.toFixed(2)       : (_ptHealthData ? '—' : 'n/a');
    const isShr  = r.is_sharpe   != null ? r.is_sharpe.toFixed(2)   : '—';
    const mcpt   = r.mcpt_p_value != null ? r.mcpt_p_value.toFixed(3) : (_ptHealthData ? '—' : 'n/a');
    const statC  = r.status === 'OK' ? '#4ade80' : '#f87171';

    return `<tr style="border-bottom:1px solid #1a1a1a;${bg}">
      <td style="padding:5px 10px;font-weight:700;color:#e5e7eb">${r.ticker}</td>
      <td style="padding:5px 10px;text-align:center">
        <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(0,0,0,0.3);color:${statC}">${r.status || '—'}</span>
      </td>
      <td style="padding:5px 10px;text-align:right;font-family:monospace;color:${_shrC(r.ho_sharpe)}">${shr}</td>
      <td style="padding:5px 10px;text-align:right;font-family:monospace;color:${_pfC(r.ho_pf)}">${pf}</td>
      <td style="padding:5px 10px;text-align:right;font-family:monospace;color:#888">${isShr}</td>
      <td style="padding:5px 10px;text-align:center">
        <span style="font-size:10px;padding:1px 6px;border-radius:3px;color:${_ovfC(r.overfit_signal)}">${r.overfit_signal}</span>
      </td>
      <td style="padding:5px 10px;text-align:right;font-family:monospace;color:${_mcptC(r.mcpt_p_value)}">${mcpt}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="section-divider"><span class="section-divider-label">Model Health${serverNote}</span></div>
    <div style="overflow-x:auto;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid #2a2a2a;color:var(--muted)">
            <th style="text-align:left;padding:7px 10px">Ticker</th>
            <th style="text-align:center;padding:7px 10px">Status</th>
            <th style="text-align:right;padding:7px 10px">HO Sharpe</th>
            <th style="text-align:right;padding:7px 10px">HO PF</th>
            <th style="text-align:right;padding:7px 10px">IS Sharpe</th>
            <th style="text-align:center;padding:7px 10px">Overfit</th>
            <th style="text-align:right;padding:7px 10px">MCPT p</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

// ── Rerun (dry-run) ────────────────────────────────────────────────────────────

async function _ptRerun() {
  if (!_ptActiveWl) return;
  const btn = document.getElementById('pt-rerun-btn');
  if (btn) { btn.textContent = '⏳ RUNNING…'; btn.disabled = true; }

  try {
    const r = await fetch(`${_SRV_BASE}/api/paper/model/rerun`, {
      method: 'POST',
      headers: _srvHeaders(),
      body: JSON.stringify({ watchlist: _ptActiveWl }),
    });
    const data = await r.json();
    if (!r.ok) { alert(`Rerun error: ${data.error || r.status}`); return; }

    const jobId = data.job_id;
    let done = false;
    for (let i = 0; i < 24 && !done; i++) {
      await new Promise(res => setTimeout(res, 5000));
      try {
        const sr  = await fetch(`${_SRV_BASE}/api/paper/engine/status/${jobId}`, { headers: _srvHeaders() });
        const job = await sr.json();
        if (job.status === 'done')  { _ptShowRerunModal(job.output || [], false); done = true; }
        if (job.status === 'error') { _ptShowRerunModal([`ERROR: ${job.error}`], true); done = true; }
      } catch(e) { /* keep polling */ }
    }
    if (!done) _ptShowRerunModal(['Timed out waiting for results.'], true);
  } catch(e) {
    alert(`Request failed: ${e.message}`);
  } finally {
    if (btn) { btn.textContent = '↺ RE-RUN MODEL'; btn.disabled = false; }
  }
}

function _ptShowRerunModal(lines, isError) {
  const existing = document.getElementById('pt-rerun-modal');
  if (existing) existing.remove();

  const borderCol = isError ? '#f87171' : '#a78bfa';
  const _lineColor = l => {
    if (l.includes('LONG'))   return '#4ade80';
    if (l.includes('FLAT'))   return '#888';
    if (l.includes('SKIP'))   return '#fcd34d';
    if (l.includes('ERROR'))  return '#f87171';
    if (l.startsWith('  '))   return '#e5e7eb';
    return '#aaa';
  };

  const html = lines.map(l => `<div style="margin:1px 0;color:${_lineColor(l)}">${_ptEscHtml(l)}</div>`).join('');

  const modal = document.createElement('div');
  modal.id = 'pt-rerun-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:#0d0d0d;border:1px solid ${borderCol};border-radius:8px;padding:24px;
                max-width:700px;width:100%;max-height:82vh;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="color:${borderCol};font-weight:700;font-size:14px;letter-spacing:0.5px">
          ↺ DRY-RUN — ${(_ptActiveWl || '').replace(/_/g,' ').toUpperCase()}
        </div>
        <button onclick="document.getElementById('pt-rerun-modal').remove()"
          style="padding:4px 14px;border-radius:3px;border:1px solid #333;background:#111;color:#aaa;font-size:12px;cursor:pointer">
          ✕ CLOSE</button>
      </div>
      <div style="font-size:10px;color:#555;font-style:italic;letter-spacing:0.3px">
        Dry-run only — no files were modified. Re-run the engine to apply changes.
      </div>
      <div style="overflow-y:auto;font-family:monospace;font-size:11px;line-height:1.7;
                  background:#040404;padding:14px;border-radius:4px;border:1px solid #1a1a1a;flex:1;min-height:200px">
        ${html || '<span style="color:#555">No output</span>'}
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function _ptEscHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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

    const jobId = data.job_id;
    let done = false;
    for (let i = 0; i < 60 && !done; i++) {
      await new Promise(res => setTimeout(res, 5000));
      try {
        const sr  = await fetch(`${_SRV_BASE}/api/paper/engine/status/${jobId}`, { headers: _srvHeaders() });
        const job = await sr.json();
        if (job.status === 'done')  { done = true; }
        if (job.status === 'error') { alert(`Engine failed: ${job.error}`); done = true; return; }
      } catch(e) { /* keep polling */ }
    }
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
    await _ptLoadWatchlist(_ptActiveWl);
  } catch(e) {
    alert(`Request failed: ${e.message}`);
  }
}
