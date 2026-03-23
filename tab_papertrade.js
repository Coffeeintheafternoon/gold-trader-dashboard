// ── Paper Trading Tab ─────────────────────────────────────────────────────────
let _ptChart = null;
let _ptData  = null;

function initPaperTradeTab() {
  document.getElementById('pt-spinner').style.display = 'flex';
  document.getElementById('pt-content').style.display = 'none';
  loadPaperTrade();
}

async function loadPaperTrade() {
  const safe = document.getElementById('pt-model-select').value;
  let data;
  try {
    const res = await fetch(`./paper_trading_${safe}.json?v=${_CV}`);
    if (!res.ok) {
      _ptShowEmpty(safe);
      return;
    }
    data = await res.json();
  } catch(e) {
    _ptShowEmpty(safe);
    return;
  }
  _ptData = data;
  document.getElementById('pt-spinner').style.display = 'none';
  document.getElementById('pt-content').style.display = 'block';
  document.getElementById('pt-last-updated').textContent =
    data.generated_at ? 'Updated ' + data.generated_at.slice(0,16).replace('T',' ') + ' UTC' : '';
  _ptRenderHero(data);
  _ptRenderPosition(data);
  _ptRenderSignalChart(data);
  _ptRenderTrades(data);
  _ptRenderSignalLog(data);
}

function _ptShowEmpty(safe) {
  document.getElementById('pt-spinner').style.display = 'none';
  document.getElementById('pt-content').style.display = 'block';
  document.getElementById('pt-hero-row').innerHTML =
    `<div style="color:var(--muted);font-size:13px;padding:20px 0">
      No paper trading data yet for <code>${safe}</code>.<br>
      Run: <code>python scripts/run_paper_trade.py --ticker WOW.AX --safe-name ${safe} --dry-run</code>
    </div>`;
  document.getElementById('pt-position-card').innerHTML = '';
  document.getElementById('pt-trades-tbody').innerHTML = '';
  document.getElementById('pt-signals-tbody').innerHTML = '';
}

function _ptRenderHero(d) {
  const s = d.summary || {};
  const n = s.n_trades || 0;
  const wr = s.win_rate != null ? s.win_rate.toFixed(1)+'%' : '—';
  const pnl = s.total_pnl_aud != null ? (s.total_pnl_aud >= 0 ? '+' : '') + '$'+s.total_pnl_aud.toFixed(2) : '—';
  const pnlC = s.total_pnl_aud == null ? 'var(--muted)' : s.total_pnl_aud >= 0 ? 'var(--green)' : 'var(--red)';
  const signals = (d.signals || []);
  const lastSig = signals.length ? signals[0] : null;
  const sigLabel = lastSig ? _ptSigLabel(lastSig.signal) : '—';
  const sigC = lastSig ? (lastSig.signal === 1 ? 'var(--green)' : lastSig.signal === -1 ? 'var(--red)' : 'var(--muted)') : 'var(--muted)';
  document.getElementById('pt-hero-row').innerHTML = `
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Total Trades</div><div class="hero-value color-gold">${n}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">closed</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Win Rate</div><div class="hero-value" style="color:var(--green)">${wr}</div></div>
    <div class="hero-card" style="min-width:160px"><div class="hero-label">Total P&L</div><div class="hero-value" style="color:${pnlC}">${pnl}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">AUD (demo)</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Latest Signal</div><div class="hero-value" style="color:${sigC};font-size:20px">${sigLabel}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${lastSig ? lastSig.signal_date : ''}</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Signals Logged</div><div class="hero-value" style="font-size:20px">${signals.length}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">trading days</div></div>`;
}

function _ptRenderPosition(d) {
  const t = d.open_trade;
  const el = document.getElementById('pt-position-card');
  if (!t) {
    el.innerHTML = '<div style="background:#0d0d0d;border:1px solid #1a1a1a;border-radius:6px;padding:20px;color:var(--muted);font-size:13px">No open position — model is flat.</div>';
    return;
  }
  const dirC = t.direction === 'long' ? 'var(--green)' : 'var(--red)';
  const dirLabel = t.direction === 'long' ? '▲ LONG' : '▼ SHORT';
  el.innerHTML = `
    <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;padding:20px;display:flex;flex-wrap:wrap;gap:24px;align-items:center">
      <div><div style="font-size:10px;color:var(--muted);margin-bottom:4px">DIRECTION</div><div style="font-size:22px;font-weight:900;color:${dirC}">${dirLabel}</div></div>
      <div><div style="font-size:10px;color:var(--muted);margin-bottom:4px">TICKER</div><div style="font-size:16px;font-weight:700;color:#e5e7eb">${t.ticker}</div></div>
      <div><div style="font-size:10px;color:var(--muted);margin-bottom:4px">ENTRY DATE</div><div style="font-size:14px;color:#e5e7eb">${t.entry_date || 'pending fill'}</div></div>
      <div><div style="font-size:10px;color:var(--muted);margin-bottom:4px">ENTRY PRICE</div><div style="font-size:14px;font-family:monospace;color:#e5e7eb">${t.entry_price ? t.entry_price.toFixed(4) : '—'}</div></div>
      <div><div style="font-size:10px;color:var(--muted);margin-bottom:4px">SIZE</div><div style="font-size:14px;font-family:monospace;color:#e5e7eb">$${t.size_aud?.toLocaleString() ?? '—'} AUD</div></div>
      <div><div style="font-size:10px;color:var(--muted);margin-bottom:4px">STATUS</div><span style="font-size:11px;padding:2px 8px;border-radius:3px;background:rgba(245,165,32,0.12);border:1px solid rgba(245,165,32,0.3);color:var(--gold)">${t.status.toUpperCase()}</span></div>
      ${t.ig_deal_id ? `<div><div style="font-size:10px;color:var(--muted);margin-bottom:4px">IG DEAL ID</div><div style="font-size:11px;font-family:monospace;color:var(--muted)">${t.ig_deal_id}</div></div>` : ''}
    </div>`;
}

function _ptRenderSignalChart(d) {
  const signals = (d.signals || []).slice(0,60).reverse();
  const labels  = signals.map(s => s.signal_date);
  const vals    = signals.map(s => s.signal);
  const colors  = vals.map(v => v === 1 ? hexA(GREEN,0.7) : v === -1 ? hexA(RED,0.7) : hexA(GREY,0.4));
  const ctx = document.getElementById('pt-signal-chart').getContext('2d');
  if (_ptChart) _ptChart.destroy();
  _ptChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderRadius: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => _ptSigLabel(ctx.raw) } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 10 } } },
        y: { min: -1.5, max: 1.5, grid: { color: '#1a1a1a' },
             ticks: { stepSize: 1, callback: v => _ptSigLabel(v) } }
      }
    }
  });
}

function _ptRenderTrades(d) {
  const trades = d.trades || [];
  const tbody  = document.getElementById('pt-trades-tbody');
  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:16px;color:var(--muted);text-align:center">No closed trades yet</td></tr>';
    return;
  }
  tbody.innerHTML = trades.map((t,i) => {
    const bg  = i%2===0 ? '' : 'background:#111';
    const dirC = t.direction === 'long' ? 'var(--green)' : 'var(--red)';
    const dirLabel = t.direction === 'long' ? '▲ Long' : '▼ Short';
    const pnl  = t.pnl_aud != null ? t.pnl_aud : null;
    const pnlC = pnl == null ? 'var(--muted)' : pnl >= 0 ? 'var(--green)' : 'var(--red)';
    const pnlStr = pnl != null ? (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2) : '—';
    const pnlPct = t.pnl_pct != null ? (t.pnl_pct >= 0 ? '+' : '') + t.pnl_pct.toFixed(2) + '%' : '—';
    return `<tr style="border-bottom:1px solid #1a1a1a;${bg}">
      <td style="padding:6px 10px;color:${dirC};font-weight:700">${dirLabel}</td>
      <td style="padding:6px 10px;color:var(--muted)">${t.entry_date || '—'}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${t.entry_price ? t.entry_price.toFixed(4) : '—'}</td>
      <td style="padding:6px 10px;color:var(--muted)">${t.exit_date || '—'}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace">${t.exit_price ? t.exit_price.toFixed(4) : '—'}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:${pnlC}">${pnlStr}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:${pnlC}">${pnlPct}</td>
      <td style="padding:6px 10px;text-align:center"><span style="font-size:10px;padding:1px 6px;border-radius:3px;background:#1a1a1a;color:var(--muted)">${t.status}</span></td>
    </tr>`;
  }).join('');
}

function _ptRenderSignalLog(d) {
  const signals = d.signals || [];
  const tbody   = document.getElementById('pt-signals-tbody');
  if (!signals.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:16px;color:var(--muted);text-align:center">No signals logged yet</td></tr>';
    return;
  }
  tbody.innerHTML = signals.map((s,i) => {
    const bg = i%2===0 ? '' : 'background:#111';
    const sigC = s.signal === 1 ? 'var(--green)' : s.signal === -1 ? 'var(--red)' : 'var(--muted)';
    const prevC = s.prev_signal === 1 ? 'var(--green)' : s.prev_signal === -1 ? 'var(--red)' : 'var(--muted)';
    const changed = s.prev_signal !== null && s.signal !== s.prev_signal;
    const action = changed ? `<span style="color:var(--gold);font-weight:700">→ ${_ptSigLabel(s.signal)}</span>` : '<span style="color:#333">hold</span>';
    return `<tr style="border-bottom:1px solid #1a1a1a;${bg}">
      <td style="padding:6px 10px;color:var(--muted)">${s.signal_date}</td>
      <td style="padding:6px 10px;text-align:center;font-weight:700;color:${sigC}">${_ptSigLabel(s.signal)}</td>
      <td style="padding:6px 10px;text-align:center;color:${prevC}">${s.prev_signal != null ? _ptSigLabel(s.prev_signal) : '—'}</td>
      <td style="padding:6px 10px;text-align:right;font-family:monospace;color:var(--muted)">${s.close_price ? s.close_price.toFixed(4) : '—'}</td>
      <td style="padding:6px 10px">${action}</td>
    </tr>`;
  }).join('');
}

function _ptSigLabel(v) {
  return v === 1 ? 'LONG' : v === -1 ? 'SHORT' : v === 0 ? 'FLAT' : '—';
}
