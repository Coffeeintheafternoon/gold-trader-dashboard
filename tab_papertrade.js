// ── Paper Trading Tab ──────────────────────────────────────────────────────────
// Reads: paper_portfolio.json  +  paper_signals.json
// No per-ticker model selector — portfolio-centric view.

let _ptEquityChart = null;

function initPaperTradeTab() {
  document.getElementById('pt-spinner').style.display = 'flex';
  document.getElementById('pt-content').style.display = 'none';
  _ptLoad();
}

async function _ptLoad() {
  let portfolio = null, signals = { signals: {} };
  try {
    const [pr, sr] = await Promise.all([
      fetch(`./paper_portfolio.json?v=${_CV}`),
      fetch(`./paper_signals.json?v=${_CV}`)
    ]);
    if (pr.ok) portfolio = await pr.json();
    if (sr.ok) signals   = await sr.json();
  } catch(e) { /* leave nulls */ }

  document.getElementById('pt-spinner').style.display = 'none';
  document.getElementById('pt-content').style.display = 'block';

  if (!portfolio || (!portfolio.last_updated && !portfolio.equity_curve?.length)) {
    _ptShowEmpty();
    return;
  }

  _ptRenderHeader(portfolio, signals);
  _ptRenderHero(portfolio, signals);
  _ptRenderPositions(portfolio, signals);
  _ptRenderEquityCurve(portfolio);
  _ptRenderSignals(signals, portfolio);
  _ptRenderTrades(portfolio);
}

// ── Empty state ────────────────────────────────────────────────────────────────

function _ptShowEmpty() {
  document.getElementById('pt-hero-row').innerHTML =
    `<div style="color:var(--muted);font-size:13px;padding:20px 0">
      No paper trading data yet.<br><br>
      1. Add tickers to <code>config/paper_trading/watchlists.yaml</code><br>
      2. Run: <code>python scripts/paper_trade_engine.py --watchlist default --dry-run</code>
    </div>`;
  ['pt-positions-tbody','pt-signals-tbody','pt-trades-tbody'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

// ── Header bar ─────────────────────────────────────────────────────────────────

function _ptRenderHeader(portfolio, signals) {
  const wl    = (portfolio.watchlist || 'default').toUpperCase();
  const strat = portfolio.strategy_snapshot || {};
  const ts    = signals.generated_at || portfolio.last_updated;

  document.getElementById('pt-watchlist-badge').textContent = `PAPER — ${wl}`;

  const stratDesc = strat.broker
    ? `${strat.broker}  ·  A$${strat.position_size}/trade  ·  max ${strat.max_open_positions} pos`
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

  // Current equity = cash + mark-to-market open positions
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
    const stopLvl = (pos.entry_price * (1 - stopPct / 100)).toFixed(3);
    return `<tr style="border-bottom:1px solid #1a1a1a;${bg}">
      <td style="padding:6px 10px;font-weight:700;color:#e5e7eb">${ticker}</td>
      <td style="padding:6px 10px"><span style="color:var(--green);font-weight:700">▲ LONG</span></td>
      <td style="padding:6px 10px;color:var(--muted)">${pos.entry_date}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${pos.entry_price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${price.toFixed(3)}</td>
      <td style="padding:6px 10px;text-align:right;font-weight:700;color:${uC}">${unreal >= 0 ? '+' : ''}${unreal.toFixed(2)}%</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:var(--red)">${stopLvl}</td>
      <td style="padding:6px 10px;text-align:right;color:var(--muted)">${pos.composite_score != null ? pos.composite_score.toFixed(3) : '—'}</td>
    </tr>`;
  }).join('');
}

// ── Equity curve chart ─────────────────────────────────────────────────────────

function _ptRenderEquityCurve(portfolio) {
  const curve  = portfolio.equity_curve || [];
  const wrap   = document.getElementById('pt-equity-wrap');

  if (!curve.length) {
    wrap.innerHTML = '<div style="height:180px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px">No equity data yet — run the engine first</div>';
    return;
  }

  // Restore canvas if it was replaced
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
    tbody.innerHTML = '<tr><td colspan="7" style="padding:16px;color:var(--muted);text-align:center">No signals yet — run generate_paper_signals.py</td></tr>';
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
    const eligible = dir === 'LONG' || dir === 'SHORT';
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
