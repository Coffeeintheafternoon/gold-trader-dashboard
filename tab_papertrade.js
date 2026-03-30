// ── Paper Trading Tab ──────────────────────────────────────────────────────────
// Reads: paper_watchlists_index.json
//        paper_portfolio_{watchlist}.json
//        paper_signals_{watchlist}.json
// Server (when live): /api/paper/model/health, /api/paper/model/rerun

let _ptEquityChart   = null;
let _ptActiveWl      = null;   // currently selected watchlist name
let _ptIndexData     = null;   // cached index
let _ptHealthData    = null;   // model health from /api/paper/model/health (null if offline)

// ── Model stats tooltip ────────────────────────────────────────────────────────
let _ptScreenerIndex = null;   // ticker → screener_full entry
let _ptModelCache    = {};     // ticker → computed stats (null = no model)

async function _ptEnsureScreener() {
  if (_ptScreenerIndex) return;
  try {
    const d = await fetch('screener_full.json').then(r => r.json());
    _ptScreenerIndex = {};
    for (const t of (d.tickers || [])) _ptScreenerIndex[t.ticker] = t;
  } catch (e) { _ptScreenerIndex = {}; }
}

async function _ptGetModelStats(ticker) {
  if (ticker in _ptModelCache) return _ptModelCache[ticker];
  await _ptEnsureScreener();
  const entry = (_ptScreenerIndex || {})[ticker];
  if (!entry || !(entry.models || []).length) { _ptModelCache[ticker] = null; return null; }

  const modelRef = entry.models[0];
  try {
    const d = await fetch(modelRef.file).then(r => r.json());
    const trades  = d.trades_is || [];
    const wins    = trades.filter(t => t.win);
    const losses  = trades.filter(t => !t.win);
    const barsList= trades.map(t => t.bars || 0);
    const years   = (d.bars || 0) / 252;

    const stats = {
      label:          modelRef.label || 'Ridge',
      is_pf:          modelRef.is_pf,
      is_sharpe:      modelRef.is_sharpe,
      ho_pf:          modelRef.ho_pf,
      ho_sharpe:      modelRef.ho_sharpe,
      overfit:        d.overfit_signal || entry.overfit || '—',
      n_trades:       trades.length,
      win_rate:       trades.length ? (wins.length / trades.length * 100).toFixed(1) : '—',
      trades_per_yr:  years > 0 ? (trades.length / years).toFixed(1) : '—',
      avg_hold_bars:  barsList.length ? (barsList.reduce((a,b)=>a+b,0)/barsList.length).toFixed(1) : '—',
      avg_win_pct:    wins.length   ? (wins.reduce((s,t)=>s+t.return_pct,0)/wins.length).toFixed(2)   : '—',
      avg_loss_pct:   losses.length ? (losses.reduce((s,t)=>s+t.return_pct,0)/losses.length).toFixed(2) : '—',
      n_features:     (d.features || []).length,
      period:         d.period_start && d.period_end ? `${d.period_start} → ${d.period_end}` : '—',
      n_windows:      (d.is_model || {}).n_windows || '—',
    };
    _ptModelCache[ticker] = stats;
    return stats;
  } catch (e) { _ptModelCache[ticker] = null; return null; }
}

function _ptShowModelTip(ticker, event) {
  const tip = document.getElementById('pt-model-tip');
  if (!tip) return;
  tip.innerHTML = `<div class="mt-head">${ticker} — loading model…</div>`;
  tip.style.display = 'block';
  _ptPositionTip(tip, event);

  _ptGetModelStats(ticker).then(s => {
    if (!tip.style.display || tip.style.display === 'none') return;  // hidden while loading
    if (!s) {
      tip.innerHTML = `<div class="mt-head">${ticker}</div><div style="color:var(--muted);font-size:11px">No model data found</div>`;
      return;
    }
    const c = v => v == null ? '—' : v;
    const pf  = v => v == null ? '—' : `<span style="color:${v>=1.2?'var(--green)':v>=1?SQ.amber:'var(--red)'}">${v.toFixed(3)}</span>`;
    const shr = v => v == null ? '—' : `<span style="color:${v>=0.5?'var(--green)':v>=0?SQ.amber:'var(--red)'}">${v.toFixed(3)}</span>`;
    const ovC = o => o === 'LOW' ? 'var(--green)' : o === 'HIGH' ? 'var(--red)' : SQ.amber;
    tip.innerHTML = `
      <div class="mt-head">${ticker} <span style="font-size:10px;font-weight:400;color:var(--muted)">${s.label}</span></div>
      <div class="mt-row"><span class="mt-label">IS Profit Factor</span>  <span class="mt-val">${pf(s.is_pf)}</span></div>
      <div class="mt-row"><span class="mt-label">IS Sharpe</span>         <span class="mt-val">${shr(s.is_sharpe)}</span></div>
      <div class="mt-row"><span class="mt-label">HO Profit Factor</span>  <span class="mt-val">${pf(s.ho_pf)}</span></div>
      <div class="mt-row"><span class="mt-label">HO Sharpe</span>         <span class="mt-val">${shr(s.ho_sharpe)}</span></div>
      <div class="mt-row"><span class="mt-label">Overfit Risk</span>      <span class="mt-val" style="color:${ovC(s.overfit)}">${c(s.overfit)}</span></div>
      <div class="mt-sep"></div>
      <div class="mt-row"><span class="mt-label">Win Rate (IS)</span>     <span class="mt-val">${s.win_rate}%</span></div>
      <div class="mt-row"><span class="mt-label">Total Trades (IS)</span> <span class="mt-val">${c(s.n_trades)}</span></div>
      <div class="mt-row"><span class="mt-label">Trades / Year</span>     <span class="mt-val">${c(s.trades_per_yr)}</span></div>
      <div class="mt-row"><span class="mt-label">Avg Hold (bars)</span>   <span class="mt-val">${c(s.avg_hold_bars)}</span></div>
      <div class="mt-row"><span class="mt-label">Avg Win %</span>         <span class="mt-val" style="color:var(--green)">+${c(s.avg_win_pct)}%</span></div>
      <div class="mt-row"><span class="mt-label">Avg Loss %</span>        <span class="mt-val" style="color:var(--red)">${c(s.avg_loss_pct)}%</span></div>
      <div class="mt-sep"></div>
      <div class="mt-row"><span class="mt-label">Features</span>          <span class="mt-val">${c(s.n_features)}</span></div>
      <div class="mt-row"><span class="mt-label">WF Windows</span>        <span class="mt-val">${c(s.n_windows)}</span></div>
      <div class="mt-row"><span class="mt-label">Period</span>            <span class="mt-val" style="font-size:10px">${c(s.period)}</span></div>`;
  });
}

function _ptPositionTip(tip, event) {
  const pad = 14, vw = window.innerWidth, vh = window.innerHeight;
  let x = event.clientX + pad, y = event.clientY + pad;
  // Flip left if too close to right edge (estimate tooltip width ~240px)
  if (x + 240 > vw) x = event.clientX - 240 - pad;
  // Flip up if too close to bottom (estimate tooltip height ~300px)
  if (y + 300 > vh) y = event.clientY - 300 - pad;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

function _ptHideModelTip() {
  const tip = document.getElementById('pt-model-tip');
  if (tip) tip.style.display = 'none';
}

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
  try { _ptRenderEquityCurve(portfolio); } catch(e) { console.error('_ptRenderEquityCurve:', e); }
  try { _ptRenderSignals(signals, portfolio); } catch(e) {
    console.error('_ptRenderSignals:', e);
    const tb = document.getElementById('pt-signals-tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="9" style="color:var(--red);padding:12px">Render error: ${e.message}</td></tr>`;
  }
  try { _ptRenderTrades(portfolio, signals); } catch(e) {
    console.error('_ptRenderTrades:', e);
    const tb = document.getElementById('pt-trades-tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="10" style="color:var(--red);padding:12px">Render error: ${e.message}</td></tr>`;
  }
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
  const stratTip = strat.broker
    ? `Broker: ${strat.broker} | Position size: A$${strat.position_size} flat per trade | Max ${strat.max_open_positions} open at once | Stop-loss: ${stop} | Portfolio drawdown halt: ${strat.max_portfolio_drawdown_pct}%`
    : '';
  const stratBadge = document.getElementById('pt-strategy-badge');
  stratBadge.textContent = stratDesc;
  if (stratTip) { stratBadge.classList.add('tip'); stratBadge.setAttribute('data-tip', stratTip); }

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
    <div class="hero-card tip" data-tip="Cash + all open positions valued at current market price"><div class="hero-label">Portfolio Equity</div><div class="hero-value color-gold">${fmtAud(equity)}</div><div style="font-size:10px;color:var(--muted)">started ${fmtAud(start)}</div></div>
    <div class="hero-card tip" data-tip="% gain or loss versus starting capital of ${fmtAud(start)}"><div class="hero-label">Total Return</div><div class="hero-value" style="color:${pnlC}">${pnlSign}${pnlPct.toFixed(2)}%</div></div>
    <div class="hero-card tip" data-tip="Uninvested capital available for new positions. Each position costs A$500 + fees."><div class="hero-label">Cash</div><div class="hero-value" style="font-size:18px">${fmtAud(cash)}</div></div>
    <div class="hero-card tip" data-tip="% decline from the highest equity ever reached. &gt; 5% = caution, &gt; 20% = engine halts new entries."><div class="hero-label">Drawdown</div><div class="hero-value" style="color:${ddC};font-size:20px">-${ddPct.toFixed(1)}%</div><div style="font-size:10px;color:var(--muted)">from peak</div></div>
    <div class="hero-card tip" data-tip="Open: positions currently held · Closed: fully completed trades (wins + losses)"><div class="hero-label">Open / Closed</div><div class="hero-value" style="font-size:20px">${nOpen} / ${trades.length}</div></div>
    <div class="hero-card tip" data-tip="% of closed trades that were profitable. 50%+ is good when profit factor &gt; 1."><div class="hero-label">Win Rate</div><div class="hero-value" style="color:var(--green);font-size:20px">${winRate}</div><div style="font-size:10px;color:var(--muted)">${trades.length} closed</div></div>
    <div class="hero-card tip" data-tip="Total profit/loss from all completed trades after brokerage fees. Does not include unrealised open positions."><div class="hero-label">Realised P&amp;L</div><div class="hero-value" style="color:${totalPnlC};font-size:18px">${totalPnl >= 0 ? '+' : ''}${fmtAud(totalPnl)}</div></div>
    <div class="hero-card tip" data-tip="Gross profit ÷ gross loss across all closed trades. &gt; 1.5 = strong edge, 1.0–1.5 = marginal, &lt; 1.0 = net losing strategy."><div class="hero-label">Profit Factor</div><div class="hero-value" style="color:${pfC};font-size:20px">${pfStr}</div><div style="font-size:10px;color:var(--muted)">gross win÷loss</div></div>
    <div class="hero-card tip" data-tip="Mean dollar gain per winning trade (green) vs mean dollar loss per losing trade (red). Higher ratio = better risk/reward."><div class="hero-label">Avg Win / Avg Loss</div>
      <div style="font-size:14px;font-weight:700;color:var(--green);line-height:1.4">${avgWin  != null ? fmtAud(avgWin)  : '—'}</div>
      <div style="font-size:14px;font-weight:700;color:var(--red);  line-height:1.4">${avgLoss != null ? '-' + fmtAud(avgLoss) : '—'}</div>
    </div>
    <div class="hero-card tip" data-tip="Single largest profit (green) and single largest loss (red) across all closed trades"><div class="hero-label">Best / Worst Trade</div>
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
    tbody.innerHTML = '<tr><td colspan="13" style="padding:16px;color:var(--muted);text-align:center">No open positions</td></tr>';
    return;
  }

  let totalBookVal = 0, totalMktVal = 0;

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

    const bookVal = pos.entry_price * pos.shares;
    const mktVal  = price * pos.shares;
    const fmtQty  = pos.shares % 1 === 0 ? pos.shares.toLocaleString('en-AU') : pos.shares.toFixed(2);

    totalBookVal += bookVal;
    totalMktVal  += mktVal;

    const asxUrl = `https://www.asx.com.au/markets/company/${ticker.replace('.AX','').replace('.ax','')}`;
    return `<tr style="border-bottom:1px solid #1a1a1a;white-space:nowrap;${bg}">
      <td style="padding:6px 10px;font-weight:700"><a href="${asxUrl}" target="_blank" rel="noopener" style="color:#e5e7eb;text-decoration:none" onmouseover="_ptShowModelTip('${ticker}',event);this.style.color='var(--gold)'" onmouseout="_ptHideModelTip();this.style.color='#e5e7eb'">${ticker}</a></td>
      <td style="padding:6px 10px"><span style="color:var(--green);font-weight:700">▲ LONG</span></td>
      <td style="padding:6px 10px;color:var(--muted)">${pos.entry_date}</td>
      <td style="padding:6px 10px;text-align:right;color:var(--muted)">${holdDays}d</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:var(--muted)">${fmtQty}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${pos.entry_price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:var(--muted)">A$${bookVal.toFixed(2)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:${uC}">A$${mktVal.toFixed(2)}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700;color:${uC}">${unrPct >= 0 ? '+' : ''}${unrPct.toFixed(2)}%</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700;color:${uC}">${unrAud >= 0 ? '+' : ''}A$${unrAud.toFixed(2)}</td>
      <td class="tip" data-tip="${noStop ? 'No hard stop — this strategy exits on signal flip only' : `Stop-loss at ${stopLvl} (${stopPct}% below entry). Position exits automatically if price drops here.`}" style="padding:6px 10px;text-align:right;font-family:monospace;color:${noStop ? 'var(--muted)' : 'var(--red)'}">
        ${stopLvl}</td>
      <td style="padding:6px 10px;text-align:center">${closeBtn}</td>
    </tr>`;
  }).join('');

  // ── Totals row ────────────────────────────────────────────────────────────
  const totalUnrAud = totalMktVal - totalBookVal;
  const totalUnrPct = totalBookVal > 0 ? (totalUnrAud / totalBookVal * 100) : 0;
  const tC          = totalUnrAud >= 0 ? 'var(--green)' : 'var(--red)';
  const tfoot       = document.getElementById('pt-positions-tfoot');
  tfoot.innerHTML   = `
    <tr style="border-top:2px solid #333;background:#0d0d0d;font-weight:700;white-space:nowrap">
      <td style="padding:7px 10px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.05em" colspan="6">TOTAL (${entries.length} positions)</td>
      <td style="padding:7px 10px;text-align:right;font-family:monospace;color:var(--muted)">A$${totalBookVal.toFixed(2)}</td>
      <td></td>
      <td style="padding:7px 10px;text-align:right;font-family:monospace;color:${tC}">A$${totalMktVal.toFixed(2)}</td>
      <td style="padding:7px 10px;text-align:right;color:${tC}">${totalUnrPct >= 0 ? '+' : ''}${totalUnrPct.toFixed(2)}%</td>
      <td style="padding:7px 10px;text-align:right;color:${tC}">${totalUnrAud >= 0 ? '+' : ''}A$${totalUnrAud.toFixed(2)}</td>
      <td colspan="2"></td>
    </tr>`;
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
    const statusBg  = isOpen ? 'rgba(245,165,32,0.12)' : eligible ? GREEN_08 : 'rgba(255,255,255,0.04)';
    const statusCol = isOpen ? 'var(--gold)' : eligible ? 'var(--green)' : 'var(--muted)';
    const statusTxt = isOpen ? 'OPEN' : eligible ? 'ELIGIBLE' : dir;

    // Overfit badge (from signal, enriched by health data)
    const overfit = s.overfit_signal || (healthMap[s.ticker] || {}).overfit_signal || '—';
    const ovfC    = overfit === 'LOW' ? 'var(--green)' : overfit === 'MEDIUM' ? 'var(--gold)' : overfit === 'HIGH' ? 'var(--red)' : 'var(--muted)';
    const ovfBg   = overfit === 'LOW'  ? GREEN_08  :
                    overfit === 'MEDIUM'? hexA(SQ.amber,0.08) :
                    overfit === 'HIGH'  ? RED_08  : 'transparent';

    // MCPT p-value — only available from server health data
    const mcptP   = (healthMap[s.ticker] || {}).mcpt_p_value;
    const mcptStr = mcptP != null ? mcptP.toFixed(3) : (_ptHealthData ? '—' : 'n/a');
    const mcptC   = mcptP == null ? 'var(--muted)' :
                    mcptP <= 0.01 ? 'var(--green)' :
                    mcptP <= 0.05 ? hexA(SQ.green,0.75) :
                    mcptP <= 0.10 ? 'var(--gold)' : 'var(--muted)';

    // Row tint: HIGH overfit → faint red wash
    const rowBg = overfit === 'HIGH' ? 'rgba(255,32,32,0.03)' : (i % 2 ? 'background:#111' : '');

    const ovfTip  = overfit === 'LOW'    ? 'LOW — model generalises well to unseen data' :
                    overfit === 'MEDIUM' ? 'MEDIUM — moderate curve-fitting risk, trade with awareness' :
                    overfit === 'HIGH'   ? 'HIGH — likely memorised training data. Signal unreliable.' :
                    'Overfitting risk assessment';
    const mcptTip = mcptP == null
      ? 'MCPT p-value — requires local server to display'
      : mcptP <= 0.05
        ? `p=${mcptP.toFixed(3)} — statistically validated edge (< 0.05). Strategy beat random permutations.`
        : mcptP <= 0.10
          ? `p=${mcptP.toFixed(3)} — borderline edge (0.05–0.10). Some evidence but not fully validated.`
          : `p=${mcptP.toFixed(3)} — not statistically significant. Edge may be random.`;
    const statusTip = isOpen ? 'Position currently open in this portfolio' :
                      eligible ? 'Signal qualifies for entry — waiting for engine to run' :
                      dir === 'FLAT' ? 'No actionable signal from model this cycle' :
                      dir === 'SKIP' ? 'Excluded — overfit HIGH or no trained model found' : '';

    const asxUrl = `https://www.asx.com.au/markets/company/${s.ticker.replace('.AX','').replace('.ax','')}`;
    return `<tr style="border-bottom:1px solid #1a1a1a;${rowBg}">
      <td style="padding:6px 10px;font-weight:700"><a href="${asxUrl}" target="_blank" rel="noopener" style="color:#e5e7eb;text-decoration:none" onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='#e5e7eb'">${s.ticker}</a></td>
      <td style="padding:6px 10px;text-align:center;font-weight:700;color:${dirC}">${dir}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:${predC}">${pred}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${score}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${shr}</td>
      <td style="padding:6px 10px;text-align:center"><span class="tip" data-tip="${ovfTip}" style="font-size:10px;padding:1px 6px;border-radius:3px;background:${ovfBg};color:${ovfC}">${overfit}</span></td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace"><span class="tip" data-tip="${mcptTip}" style="color:${mcptC}">${mcptStr}</span></td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:var(--muted)">${price}</td>
      <td style="padding:6px 10px;text-align:center"><span class="tip" data-tip="${statusTip}" style="font-size:10px;padding:1px 6px;border-radius:3px;background:${statusBg};color:${statusCol}">${statusTxt}</span></td>
    </tr>`;
  }).join('');
}

// ── Trade log (unified open + closed) ──────────────────────────────────────────

let _ptTradeLogFilter = 'all';   // 'all' | 'open' | 'closed'
let _ptTradeLogData   = null;    // cached for tab switching

function _ptTradeLogTab(tab) {
  _ptTradeLogFilter = tab;
  ['all','open','closed'].forEach(t => {
    const btn = document.getElementById(`pt-tl-tab-${t}`);
    if (!btn) return;
    const active = t === tab;
    btn.style.borderColor  = active ? '#60a5fa' : '#444';
    btn.style.background   = active ? '#60a5fa22' : 'transparent';
    btn.style.color        = active ? '#60a5fa' : '#6b7280';
  });
  if (_ptTradeLogData) _ptRenderTradeLogRows(_ptTradeLogData);
}

function _ptRenderTrades(portfolio, signals) {
  const sigMap = (signals || {}).signals || {};
  const today  = Date.now();

  // Build unified list: open positions + closed trades
  const openRows = Object.entries(portfolio.positions || {}).map(([ticker, pos]) => {
    const price  = (sigMap[ticker] || {}).current_price || pos.entry_price;
    const pnlAud = (price - pos.entry_price) * pos.shares;
    const pnlPct = (price - pos.entry_price) / pos.entry_price * 100;
    const days   = Math.round((today - new Date(pos.entry_date).getTime()) / 86400000);
    return { ticker, status: 'OPEN', entry_date: pos.entry_date, exit_date: null,
             entry_price: pos.entry_price, exit_price: price,
             pnl: pnlAud, pnl_pct: pnlPct, days, exit_reason: 'OPEN' };
  });

  const closedRows = (portfolio.trades || []).map(t => {
    const days = Math.round((new Date(t.exit_date).getTime() - new Date(t.entry_date).getTime()) / 86400000);
    return { ticker: t.ticker, status: 'CLOSED', entry_date: t.entry_date, exit_date: t.exit_date,
             entry_price: t.entry_price, exit_price: t.exit_price,
             pnl: t.pnl || 0, pnl_pct: t.pnl_pct || 0, days, exit_reason: t.exit_reason || '—' };
  });

  // Sort all rows newest entry first
  const allRows = [...openRows, ...closedRows].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  _ptTradeLogData = allRows;
  _ptRenderTradeLogRows(allRows);
}

function _ptRenderTradeLogRows(allRows) {
  const tbody = document.getElementById('pt-trades-tbody');
  const count = document.getElementById('pt-tl-count');

  const rows = _ptTradeLogFilter === 'open'   ? allRows.filter(r => r.status === 'OPEN')
             : _ptTradeLogFilter === 'closed' ? allRows.filter(r => r.status === 'CLOSED')
             : allRows;

  if (count) count.textContent = `${rows.length} trade${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:16px;color:var(--muted);text-align:center">No trades to show</td></tr>`;
    return;
  }

  const _reasonColor = r => {
    if (r === 'OPEN')          return 'var(--green)';
    if (!r || r === '—')       return 'var(--muted)';
    if (r.startsWith('STOP'))  return SQ.red;
    if (r === 'SIGNAL_FLIP')   return SQ.amber;
    if (r === 'MANUAL_CLOSE')  return '#93c5fd';
    return 'var(--muted)';
  };
  const _reasonBg = r => {
    if (r === 'OPEN')          return 'rgba(74,222,128,0.10)';
    if (r.startsWith('STOP'))  return 'rgba(248,113,113,0.10)';
    if (r === 'SIGNAL_FLIP')   return 'rgba(252,211,77,0.10)';
    if (r === 'MANUAL_CLOSE')  return 'rgba(147,197,253,0.10)';
    return 'transparent';
  };

  tbody.innerHTML = rows.map((r, i) => {
    const bg    = i % 2 ? 'background:#111' : '';
    const pnlC  = r.pnl >= 0 ? 'var(--green)' : 'var(--red)';
    const asxUrl = `https://www.asx.com.au/markets/company/${r.ticker.replace('.AX','').replace('.ax','')}`;
    const statusBadge = r.status === 'OPEN'
      ? `<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(74,222,128,0.12);color:var(--green);font-weight:700">OPEN</span>`
      : `<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(107,114,128,0.15);color:var(--muted)">CLOSED</span>`;
    return `<tr style="border-bottom:1px solid #1a1a1a;white-space:nowrap;${bg}">
      <td style="padding:6px 10px;font-weight:700"><a href="${asxUrl}" target="_blank" rel="noopener" style="color:#e5e7eb;text-decoration:none" onmouseover="_ptShowModelTip('${r.ticker}',event);this.style.color='var(--gold)'" onmouseout="_ptHideModelTip();this.style.color='#e5e7eb'">${r.ticker}</a></td>
      <td style="padding:6px 10px">${statusBadge}</td>
      <td style="padding:6px 10px;color:var(--muted)">${r.entry_date}</td>
      <td style="padding:6px 10px;color:var(--muted)">${r.exit_date || '—'}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${r.entry_price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:${r.status === 'OPEN' ? 'var(--muted)' : ''}">${r.exit_price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700;color:${pnlC}">${r.pnl >= 0 ? '+' : ''}A$${r.pnl.toFixed(2)}</td>
      <td style="padding:6px 10px;text-align:right;color:${pnlC}">${r.pnl_pct >= 0 ? '+' : ''}${r.pnl_pct.toFixed(2)}%</td>
      <td style="padding:6px 10px;text-align:right;color:var(--muted)">${r.days}d</td>
      <td style="padding:6px 10px"><span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${_reasonBg(r.exit_reason)};color:${_reasonColor(r.exit_reason)}">${r.exit_reason}</span></td>
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

  const _ovfC = v => v === 'LOW' ? SQ.green : v === 'MEDIUM' ? SQ.amber : v === 'HIGH' ? SQ.red : '#555';
  const _mcptC = v => v == null ? '#555' : v <= 0.01 ? SQ.green : v <= 0.05 ? hexA(SQ.green,0.75) : v <= 0.10 ? SQ.amber : '#555';
  const _shrC  = v => v == null ? '#555' : v >= 0.5 ? SQ.green : v >= 0 ? SQ.amber : SQ.red;
  const _pfC   = v => v == null ? '#555' : v >= 1.2 ? SQ.green : v >= 1.0 ? SQ.amber : SQ.red;

  const serverNote = !_ptHealthData
    ? '<span style="font-size:10px;color:var(--muted);margin-left:10px;font-weight:400">HO PF and MCPT p require local server</span>'
    : '';

  const tableRows = rows.map((r, i) => {
    const bg     = i % 2 ? 'background:#111' : '';
    const shr    = r.ho_sharpe   != null ? r.ho_sharpe.toFixed(2)   : '—';
    const pf     = r.ho_pf       != null ? r.ho_pf.toFixed(2)       : (_ptHealthData ? '—' : 'n/a');
    const isShr  = r.is_sharpe   != null ? r.is_sharpe.toFixed(2)   : '—';
    const mcpt   = r.mcpt_p_value != null ? r.mcpt_p_value.toFixed(3) : (_ptHealthData ? '—' : 'n/a');
    const statC  = r.status === 'OK' ? SQ.green : SQ.red;

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
            <th style="text-align:center;padding:7px 10px"><span class="tip" data-tip="OK = valid model / FAIL_DATA = insufficient price history to train">Status</span></th>
            <th style="text-align:right;padding:7px 10px"><span class="tip" data-tip="Holdout Sharpe — return on data the model never saw. &gt; 0.5 = strong, &lt; 0 = losing on unseen data.">HO Sharpe</span></th>
            <th style="text-align:right;padding:7px 10px"><span class="tip" data-tip="Holdout Profit Factor — gross win / gross loss on holdout data. &gt; 1.2 = good. Requires local server.">HO PF</span></th>
            <th style="text-align:right;padding:7px 10px"><span class="tip" data-tip="In-sample Sharpe — fit on training data. Always higher than holdout. Use only to detect gross failure.">IS Sharpe</span></th>
            <th style="text-align:center;padding:7px 10px"><span class="tip" data-tip="LOW = healthy generalisation / MEDIUM = moderate / HIGH = likely overfit to training data.">Overfit</span></th>
            <th style="text-align:right;padding:7px 10px"><span class="tip" data-tip="Monte Carlo p-value (500 permutations). p &lt; 0.05 = statistically validated. Requires local server.">MCPT p</span></th>
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

  const borderCol = isError ? SQ.red : '#a78bfa';
  const _lineColor = l => {
    if (l.includes('LONG'))   return SQ.green;
    if (l.includes('FLAT'))   return '#888';
    if (l.includes('SKIP'))   return SQ.amber;
    if (l.includes('ERROR'))  return SQ.red;
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
