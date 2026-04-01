async function initModelLabTab() {
  await Promise.all([loadGoldScreener(), loadQuantPanels()]);
}



// ── loadQuantPanels — legacy gold model panels removed ────────────────────────
async function loadQuantPanels() {
  // Legacy adaptive model panels have been removed.
  // ASX tickers use model_lab_*.json via renderTickerDetail().
}

// ── Open ticker in Model Lab ──────────────────────────────────────────────────
async function openTickerInModelLab(ticker, data, safeName) {
  // safeName: explicit safe_name override (e.g. 'mek_6monthroll'); null = derive from ticker
  const safe=safeName||ticker.toLowerCase().replace(/\./g,'_');
  // ── Priority 1: new model_lab_*.json detail view ─────────────────────
  // Try to load the rich per-ticker model lab file first
  const mlRes=await fetch(`./model_lab_${safe}.json?_=${Date.now()}`).catch(()=>null);
  if(mlRes&&mlRes.ok){
    switchTab('modellab');
    // Ensure screener is loaded so back button works
    if(!_mlSummary) await loadGoldScreener();
    // Hide screener grid, show detail
    document.getElementById('ml-gold-screener').style.display='none';
    document.getElementById('ml-ticker-detail').style.display='';
    document.querySelectorAll('[id^="quant-"]').forEach(el=>el.style.display='none');
    document.getElementById('ml-screener-stats').style.display='none';
    let mlData;
    try { mlData=await mlRes.json(); } catch(e) { alert('JSON parse error for '+ticker+': '+e.message); return; }
    _mlTickerCache[safe]=mlData;
    _mlCurrentSafe=safe;
    try { renderTickerDetail(mlData); } catch(e) { console.error('renderTickerDetail error:',e); document.getElementById('ml-detail-title').textContent=ticker+' — render error: '+e.message; }
    document.getElementById('ml-ticker-detail').scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }
  // ── Priority 2: legacy quant_data_*.json (gold/oil adaptive model) ───
  const tickerId=ticker.replace(/\.AX$/i,'').toLowerCase();
  if(!_allAssets.length){
    try{const r=await fetch(`./quant_data_index.json?v=${_CV}`);if(r.ok){const idx=await r.json();_allAssets=idx.assets||[];}}catch(_){}
  }
  const match=_allAssets.find(a=>a.id===tickerId||a.ticker===ticker);
  if(match){
    const sp=new URLSearchParams(window.location.search);
    sp.set('asset',match.id);sp.set('interval',match.interval);
    history.replaceState(null,'','?'+sp.toString()+'#modellab');
    document.querySelectorAll('[id^="quant-"]').forEach(el=>el.style.display='none');
    document.getElementById('ml-screener-stats').style.display='none';
    switchTab('modellab');
    loadQuantPanels();
    return;
  }
  // ── Priority 3: screener-only fallback (no model data at all) ────────
  _tabInit.add('modellab');
  switchTab('modellab');
  // Hide every quant panel so gold data doesn't bleed through
  document.querySelectorAll('[id^="quant-"]').forEach(el=>el.style.display='none');
  document.querySelectorAll('[id^="quant-"]').forEach(el=>el.style.display='none');
  const statsDiv=document.getElementById('ml-screener-stats');
  statsDiv.style.display='block';
  document.getElementById('ml-stats-title').textContent=`${ticker} — Screener Results (no full backtest yet)`;
  const pf=data.pf,sh=data.sharpe,ret=data.mean_ann_pct,ci=data.ci95_lower,oos=data.oos_bars;
  const pfC=pf===null?'var(--muted)':pf>=1.10?'var(--green)':pf>=1.05?SQ.amber:'var(--muted)';
  const shC=sh===null?'var(--muted)':sh>=0.5?'var(--green)':sh>=0.25?SQ.amber:'var(--muted)';
  const retC=ret===null?'var(--muted)':ret>=20?'var(--green)':ret>=10?SQ.amber:'var(--muted)';
  const ciC=ci===null?'var(--muted)':ci>0?'var(--green)':'var(--red)';
  document.getElementById('ml-stats-heroes').innerHTML=`
    <div class="hero-card" style="min-width:140px"><div class="hero-label">Sector</div><div class="hero-value color-gold" style="font-size:16px">${data.sector||'—'}</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Profit Factor</div><div class="hero-value" style="color:${pfC}">${pf!=null?pf.toFixed(3):'—'}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">LR walk-forward</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Sharpe</div><div class="hero-value" style="color:${shC}">${sh!=null?sh.toFixed(2):'—'}</div></div>
    <div class="hero-card" style="min-width:160px"><div class="hero-label">Ann Return (mean)</div><div class="hero-value" style="color:${retC}">${ret!=null?(ret>=0?'+':'')+ret.toFixed(1)+'%':'—'}</div></div>
    <div class="hero-card" style="min-width:180px"><div class="hero-label" title="95% CI lower bound on annual return">95% CI Low</div><div class="hero-value" style="color:${ciC}">${ci!=null?(ci>=0?'+':'')+ci.toFixed(1)+'%':'—'}</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">OOS Bars</div><div class="hero-value" style="font-size:20px">${oos!=null?oos.toLocaleString():'—'}</div></div>`;
  document.getElementById('ml-stats-note').textContent=`No full backtest run for ${ticker} yet. To generate: python quant/run_backtest.py --asset-class ${tickerId} --ticker ${ticker} --interval 1d`;
  document.getElementById('ml-screener-stats').scrollIntoView({behavior:'smooth',block:'start'});
}


// ══════════════════════════════════════════════════════════════════════════════
// MODEL LAB — GOLD SCREENER + PER-TICKER DETAIL
// ══════════════════════════════════════════════════════════════════════════════
let _mlSummary = null;          // screener_full.json (filtered to model lab tickers)
let _mlSortKey = 'is_sharpe';   // current sort column
let _mlTickerCache = {};         // model_lab_*.json cache
let _mlEquityChart = null;
let _mlRollingChart = null;
let _mlPriceChart  = null;
let _mlPriceLabels = [];
let _mlPriceDateToY = {};
let _mlActiveTradeRow = null;
let _mlFeatChart = null;
let _mlStabilityChart = null;
let _mlCurrentFeatures = [];    // full feature list for current ticker
let _mlCurrentWH = [];          // weight_history for current ticker
let _mlCurrentSafe = null;      // safe_name of currently displayed model
let _modelIndex    = null;      // ticker → [{safe_name, label, model_type}] — populated if model_index.json exists
let _mlStabShow     = { weight: true, cum_avg: true, cum_pval: true }; // which metrics visible
let _mlStabAdded    = [];       // [{name,slotIdx}] — user-added features beyond top 6

const _ML_CAT_COLORS = {
  momentum:      SQ.cat.momentum,   // warm amber
  volume:        SQ.cat.volume,   // retro green
  volatility:    SQ.cat.volatility,   // orange
  trend:         SQ.cat.trend,   // teal
  macro:         SQ.cat.macro,   // darker amber
  announcement:  SQ.cat.announcement,   // gold
  candle:        SQ.cat.candle,   // soft purple
  short_interest:'#f87171',   // coral red
  interaction:   SQ.cat.interaction,   // cyan — cross-asset products
  other:         SQ.neutral,   // muted grey
};
const _ML_OVERFIT_LABELS = {
  LOW:           { color:'#00ff41', text:'LOW — consistent edge IS + holdout' },
  MEDIUM:        { color:SQ.green, text:'MEDIUM — some degradation on holdout' },
  HIGH:          { color:'#ff2020', text:'HIGH — IS good, holdout fails (overfit)' },
  NO_EDGE:       { color:'#4b5563', text:'NO EDGE — weak across both periods' },
  REGIME_CHANGE: { color:SQ.amber, text:'REGIME SHIFT — holdout beats IS' },
  UNKNOWN:       { color:'#4b5563', text:'UNKNOWN' },
};

async function loadGoldScreener() {
  try {
    const res = await fetch(`./screener_full.json?v=${_CV}`);
    if (!res.ok) { document.getElementById('ml-grid-spinner').textContent='No screener data yet.'; return; }
    const sf = await res.json();
    // Only show tickers that have been run through the model lab pipeline
    const tickers = (sf.tickers || []).filter(t => t.models && t.models.length > 0);
    _mlSummary = { tickers };
    buildScreenerGrid(tickers);
  } catch(e) {
    document.getElementById('ml-grid-spinner').textContent = 'Screener data unavailable.';
  }
}

function mlSortGrid(key) {
  _mlSortKey = key;
  document.querySelectorAll('.ml-sort-btn[id^="ml-sort-"]').forEach(b => b.classList.remove('ml-sort-active'));
  const btn = document.getElementById('ml-sort-' + key);
  if (btn) btn.classList.add('ml-sort-active');
  if (_mlSummary) buildScreenerGrid(_mlSummary.tickers || []);
}

function buildScreenerGrid(tickers) {
  document.getElementById('ml-grid-spinner').style.display = 'none';
  document.getElementById('ml-grid-wrap').style.display = '';
  // screener_full uses pf/sharpe/overfit; sort keys map accordingly
  const _keyMap = { is_pf:'pf', is_sharpe:'sharpe', ho_pf:'ho_pf', ho_sharpe:'ho_sharpe' };
  const sortKey = _keyMap[_mlSortKey] || _mlSortKey;
  const sorted = [...tickers].filter(t => !t.error).sort((a,b) => {
    const av = a[sortKey] ?? -99, bv = b[sortKey] ?? -99;
    return bv - av;
  });
  const grid = document.getElementById('ml-ticker-grid');
  grid.innerHTML = sorted.map(t => {
    const ov = t.overfit || 'UNKNOWN';
    const cardClass = { LOW:'ml-card-low', MEDIUM:'ml-card-medium', HIGH:'ml-card-high', NO_EDGE:'ml-card-noedge', REGIME_CHANGE:'ml-card-regime', UNKNOWN:'ml-card-noedge' }[ov] || 'ml-card-noedge';
    const isPF = t.pf != null ? t.pf.toFixed(3) : '—';
    const isSh = t.sharpe != null ? (t.sharpe >= 0 ? '+' : '') + t.sharpe.toFixed(2) : '—';
    const hoSh = t.ho_sharpe != null ? (t.ho_sharpe >= 0 ? '+' : '') + t.ho_sharpe.toFixed(2) : '—';
    const hoPF = t.ho_pf != null ? t.ho_pf.toFixed(3) : '—';
    const isSc = t.sharpe >= 0.5 ? 'var(--green)' : t.sharpe > 0 ? SQ.amber : 'var(--red)';
    const hoSc = (t.ho_sharpe||0) >= 0.5 ? 'var(--green)' : (t.ho_sharpe||0) > 0 ? SQ.amber : 'var(--red)';
    // Pick highest model version available for click routing and badge
    const modelsSorted = (t.models || []).slice().sort((a,b) => {
      const ver = s => { const m = s.safe_name.match(/v(\d+)/); return m ? +m[1] : 0; };
      return ver(b) - ver(a);
    });
    const safe = modelsSorted.length ? modelsSorted[0].safe_name : t.ticker.toLowerCase().replace(/\./g,'_');
    const topVersion = modelsSorted.length ? (modelsSorted[0].safe_name.match(/v(\d+)/)||[])[1] : null;
    const vBadge = topVersion ? `<span style="background:${topVersion==='6'?'rgba(245,165,32,0.2)':topVersion==='5'?'rgba(99,102,241,0.2)':'rgba(55,65,81,0.4)'};color:${topVersion==='6'?'var(--gold)':topVersion==='5'?'#a5b4fc':'#9ca3af'};border:1px solid ${topVersion==='6'?'var(--gold)':topVersion==='5'?'#6366f1':'#374151'};border-radius:3px;padding:1px 5px;font-size:9px;font-weight:700">v${topVersion}</span>` : '';
    const ovLabel = { LOW:'✓ LOW', MEDIUM:'~ MED', HIGH:'⚠ HIGH', NO_EDGE:'✕ NONE', REGIME_CHANGE:'↑ SHIFT', UNKNOWN:'? UNK' }[ov] || ov;
    const ovColor = (_ML_OVERFIT_LABELS[ov]||{}).color || '#4b5563';
    return `<div class="ml-ticker-card ${cardClass}" onclick="openModelLabTicker('${safe}')" title="${t.ticker} — ${ov}">
      <div style="font-size:15px;font-weight:800;color:#e5e7eb;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center"><span>${t.ticker}</span>${vBadge}</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
        <span style="color:var(--muted)">IS PF</span><span style="font-family:monospace;font-weight:600">${isPF}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
        <span style="color:var(--muted)">IS Shr</span><span style="font-family:monospace;color:${isSc};font-weight:600">${isSh}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
        <span style="color:var(--muted)">HO PF</span><span style="font-family:monospace;font-weight:600">${hoPF}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px">
        <span style="color:var(--muted)">HO Shr</span><span style="font-family:monospace;color:${hoSc};font-weight:600">${hoSh}</span>
      </div>
      <div style="font-size:10px;font-weight:700;color:${ovColor};letter-spacing:0.5px">${ovLabel}</div>
    </div>`;
  }).join('');
}

async function openModelLabTicker(safe) {
  let data = _mlTickerCache[safe];
  if (!data) {
    try {
      const res = await fetch(`./model_lab_${safe}.json?v=${_CV}`);
      if (!res.ok) { alert('No model lab data for ' + safe + '. Run: python scripts/run_ridge_v3.py --tickers TICKER.AX'); return; }
      data = await res.json();
      _mlTickerCache[safe] = data;
    } catch(e) { console.error(e); return; }
  }
  _mlCurrentSafe = safe;
  document.getElementById('ml-gold-screener').style.display = 'none';
  document.getElementById('ml-ticker-detail').style.display = '';
  renderTickerDetail(data);
  document.getElementById('ml-ticker-detail').scrollIntoView({behavior:'smooth',block:'start'});
}

function mlBackToGrid() {
  document.getElementById('ml-ticker-detail').style.display = 'none';
  document.getElementById('ml-gold-screener').style.display = '';
}

function renderTickerDetail(d) {
  _mlCurrentData = d;
  _mlCurrentFeatures = d.features || [];
  _mlCurrentWH = d.weight_history || [];
  _mlCorrData = d.correlations || null;
  if (_mlRollingChart) { _mlRollingChart.destroy(); _mlRollingChart = null; }
  if (_mlPriceChart)  { _mlPriceChart.destroy();  _mlPriceChart  = null; }
  _mlHeatmapBuilt = false; _mlDendroBuilt = false; _mlForceBuilt = false;
  _mlForceAnim = null;
  _mlStabAdded = [];
  _mlStabShow  = { weight: true, cum_avg: true, cum_pval: true };
  _mlStabSyncButtons();
  // d.ticker may be a full label like "WBC.AX (Regime-Weighted 1Y)" for regime models.
  // Resolve the canonical ticker key used in _modelIndex by scanning for the safe_name match.
  const tickerRaw = d.ticker || '—';
  let ticker = tickerRaw;
  if (_modelIndex && _mlCurrentSafe) {
    const found = Object.keys(_modelIndex).find(k =>
      _modelIndex[k].some(m => m.safe_name === _mlCurrentSafe)
    );
    if (found) ticker = found;
  }
  // Enrich d.model_type from _modelIndex before we use it for title/display
  const currentSafeEarly = _mlCurrentSafe || ticker.toLowerCase().replace(/\./g,'_');
  const tickerModels = (_modelIndex && _modelIndex[ticker]) || [];
  if (!d.model_type && tickerModels.length) {
    const idxEntry = tickerModels.find(m => m.safe_name === currentSafeEarly);
    if (idxEntry) d.model_type = idxEntry.model_type || '';
  }

  // Derive display title
  function _modelLabel(mt) {
    if (!mt) return 'Linear Regression Model';
    if (mt === 'regime_similarity') return 'Regime Similarity Model';
    if (mt.includes('v6')) return 'Ridge v6 Model';
    if (mt.includes('v5')) return 'Ridge v5 Model';
    if (mt.includes('v4')) return 'Ridge v4 Model';
    if (mt.includes('v3')) return 'Ridge v3 Model';
    if (mt.includes('v2')) return 'Ridge v2 Model';
    if (mt.includes('v1') || mt.startsWith('ridge_')) return 'Ridge v1 Model';
    return 'Linear Regression Model';
  }
  const modelLabel = _modelLabel(d.model_type);
  document.getElementById('ml-detail-title').textContent = ticker + ' — ' + modelLabel;
  document.getElementById('ml-detail-period').textContent = `${d.period_start} → ${d.period_end}  (${d.bars} bars  |  ${d.ann_count} announcements)`;

  // Model switcher — show all available models for this ticker
  const switcherEl = document.getElementById('ml-model-switcher');
  if (tickerModels.length > 1) {
    switcherEl.style.display = 'flex';
    const currentSafe = currentSafeEarly;
    switcherEl.innerHTML = '<span style="font-size:11px;color:var(--muted);letter-spacing:0.5px">MODELS:</span>' +
      tickerModels.map(m => {
        const active = m.safe_name === currentSafe;
        const isRegime = m.model_type === 'regime_similarity';
        const bg     = active ? (isRegime ? 'rgba(124,58,237,0.25)' : 'rgba(245,165,32,0.2)') : '#111';
        const border = active ? (isRegime ? '#7c3aed' : 'var(--gold)') : '#333';
        const color  = active ? (isRegime ? '#c4b5fd' : 'var(--gold)') : 'var(--muted)';
        return `<button onclick="openTickerInModelLab('${ticker}',{},'${m.safe_name}')"
          style="background:${bg};border:1px solid ${border};color:${color};border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;white-space:nowrap"
          ${active ? 'disabled' : ''}>${m.label}</button>`;
      }).join('');
  } else {
    switcherEl.style.display = 'none';
  }

  // v6 variant toggle — only shown for v6 models
  const v6ToggleEl = document.getElementById('ml-v6-toggle');
  if (d.v6 && d.variants && v6ToggleEl) {
    const FORWARD_BARS = [3, 5, 10];
    const WINDOWS = [
      { key: '6m',  label: '6m train' },
      { key: '1yr', label: '1yr train' },
      { key: '2yr', label: '2yr train' },
    ];
    let html = '<div style="margin-bottom:12px">';
    html += '<div style="font-size:11px;color:var(--muted);letter-spacing:0.5px;margin-bottom:6px">V6 VARIANT — FORWARD BARS × TRAINING WINDOW</div>';
    html += '<table style="border-collapse:collapse;font-size:11px">';
    // Header row
    html += '<tr><td style="padding:3px 8px;color:var(--muted)"></td>';
    WINDOWS.forEach(w => { html += `<td style="padding:3px 10px;color:var(--muted);text-align:center">${w.label}</td>`; });
    html += '</tr>';
    // Data rows
    FORWARD_BARS.forEach(fb => {
      html += `<tr><td style="padding:3px 8px;color:var(--muted);white-space:nowrap">${fb}-bar</td>`;
      WINDOWS.forEach(w => {
        const vkey = `fb${fb}_${w.key}`;
        const v = d.variants[vkey];
        if (!v) { html += '<td></td>'; return; }
        const isBest = v.is_best;
        const shr = v.is_sharpe;
        const shrColor = shr > 0.4 ? 'var(--green)' : shr > 0 ? SQ.amber : 'var(--red)';
        const isActive = (d._active_variant || d.best_variant) === vkey;
        const border = isActive ? '2px solid var(--gold)' : '1px solid #333';
        const bg = isActive ? 'rgba(245,165,32,0.15)' : '#111';
        html += `<td style="padding:2px 4px;text-align:center">
          <button onclick="_mlSwitchV6Variant('${vkey}')"
            style="background:${bg};border:${border};border-radius:4px;padding:4px 8px;cursor:pointer;min-width:60px">
            <div style="color:${shrColor};font-weight:700;font-size:12px">${shr >= 0 ? '+' : ''}${shr.toFixed(3)}</div>
            <div style="color:var(--muted);font-size:10px">${v.n_features}f/${v.n_windows}w</div>
            ${isBest ? '<div style="color:var(--gold);font-size:9px">&#9733; best IS</div>' : ''}
          </button>
        </td>`;
      });
      html += '</tr>';
    });
    html += '</table></div>';
    v6ToggleEl.innerHTML = html;
    v6ToggleEl.style.display = '';
  } else if (v6ToggleEl) {
    v6ToggleEl.style.display = 'none';
  }

  // IS metrics
  const isM = d.is_model || {};
  const hoM = d.holdout  || {};
  const ov  = d.overfit_signal || 'UNKNOWN';
  const ovInfo = _ML_OVERFIT_LABELS[ov] || _ML_OVERFIT_LABELS.UNKNOWN;

  function fmt(v, decimals=3) { return v != null ? (v >= 0 ? '+' : '') + v.toFixed(decimals) : '—'; }
  function pfColor(v)  { return v > 1.1 ? 'var(--green)' : v > 1.0 ? SQ.amber : 'var(--red)'; }
  function shrColor(v) { return v > 0.5 ? 'var(--green)' : v > 0 ? SQ.amber : 'var(--red)'; }

  document.getElementById('ml-is-pf').innerHTML    = `<span style="color:${pfColor(isM.pf||0)}">${(isM.pf||0).toFixed(3)}</span>`;
  document.getElementById('ml-is-sharpe').innerHTML = `<span style="color:${shrColor(isM.sharpe||0)}">${fmt(isM.sharpe)}</span>`;
  document.getElementById('ml-is-windows').textContent = isM.n_windows || '—';
  document.getElementById('ml-ho-pf').innerHTML    = `<span style="color:${pfColor(hoM.pf||0)}">${hoM.pf != null ? hoM.pf.toFixed(3) : '—'}</span>`;
  document.getElementById('ml-ho-sharpe').innerHTML = `<span style="color:${shrColor(hoM.sharpe||0)}">${fmt(hoM.sharpe)}</span>`;
  document.getElementById('ml-overfit-badge').innerHTML = `<span style="color:${ovInfo.color};font-size:14px;font-weight:700">${ov}</span>`;
  if (hoM.period_start) {
    document.getElementById('ml-detail-period').textContent +=
      `  |  Holdout: ${hoM.period_start} → ${hoM.period_end}`;
  }

  // Overfit explanation
  const explEl = document.getElementById('ml-overfit-explain');
  const explMap = {
    HIGH:          { bg:'rgba(220,38,38,0.08)', border:'var(--red)',   text:`⚠️ HIGH OVERFIT — the model shows a Sharpe of ${fmt(isM.sharpe,2)} in-sample but ${fmt(hoM.sharpe,2)} on held-out data. The model memorised the training windows rather than learning genuine price patterns. Use cautiously.` },
    LOW:           { bg:'rgba(22,163,74,0.08)',  border:'#16a34a',     text:`✓ LOW OVERFIT — consistent performance: IS Sharpe ${fmt(isM.sharpe,2)}, holdout Sharpe ${fmt(hoM.sharpe,2)}. The model generalises well.` },
    MEDIUM:        { bg:'rgba(180,83,9,0.08)',   border:'#b45309',     text:`~ MEDIUM OVERFIT — some performance degradation on holdout (IS ${fmt(isM.sharpe,2)} → HO ${fmt(hoM.sharpe,2)}). Monitor closely.` },
    NO_EDGE:       { bg:'rgba(55,65,81,0.08)',   border:'#374151',     text:`✕ NO EDGE — weak performance across both IS and holdout. This stock may not have a modelable pattern with these features.` },
    REGIME_CHANGE: { bg:'rgba(124,58,237,0.08)', border:'#7c3aed',     text:`↑ REGIME SHIFT — holdout (${fmt(hoM.sharpe,2)}) significantly outperforms IS (${fmt(isM.sharpe,2)}). The recent regime may be more favourable than the historical period.` },
  };
  const expl = explMap[ov];
  if (expl) {
    explEl.style.display = '';
    explEl.style.background = expl.bg;
    explEl.style.borderColor = expl.border;
    explEl.textContent = expl.text;
  } else {
    explEl.style.display = 'none';
  }

  // For regime_similarity models, use regime-filtered IS data where available
  const isRegimeModel = d.model_type === 'regime_similarity';
  const equityIS  = (isRegimeModel && d.equity_is_regime  && d.equity_is_regime.length)  ? d.equity_is_regime  : (d.equity_is  || []);
  const tradesIS  = (isRegimeModel && d.trades_is_regime  && d.trades_is_regime.length)  ? d.trades_is_regime  : (d.trades_is  || []);
  const isWtd     = (isRegimeModel && d.is_model_weighted) ? d.is_model_weighted : isM;

  // Override displayed IS PF / Sharpe with weighted versions for regime models
  if (isRegimeModel && d.is_model_weighted) {
    document.getElementById('ml-is-pf').innerHTML    = `<span style="color:${pfColor(isWtd.pf||0)}">${(isWtd.pf||0).toFixed(3)}</span><span style="font-size:10px;color:#7c3aed;margin-left:4px">regime-wtd</span>`;
    document.getElementById('ml-is-sharpe').innerHTML = `<span style="color:${shrColor(isWtd.sharpe||0)}">${fmt(isWtd.sharpe)}</span><span style="font-size:10px;color:#7c3aed;margin-left:4px">regime-wtd</span>`;
  }

  // Equity curves
  buildMLEquityChart(equityIS, d.equity_holdout || [], hoM.period_start);

  // Feature chart
  mlFilterFeats('all');

  // Announcement table
  buildAnnTable(_mlCurrentFeatures);

  // Weight cross-correlations
  buildWeightCorrPanel(_mlCurrentFeatures, _mlCurrentWH);

  // Data coverage timeline
  buildDataTimeline(d);

  // Weight stability
  buildMLStabilityChart(_mlCurrentFeatures, _mlCurrentWH);

  // Correlation analysis
  const corrCard  = document.getElementById('ml-corr-card');
  const corrEmpty = document.getElementById('ml-corr-empty');
  if (_mlCorrData) {
    corrCard.style.display  = '';
    corrEmpty.style.display = 'none';
    mlCorrTab('heatmap');
  } else {
    corrEmpty.style.display = '';
    document.getElementById('ml-corr-heatmap-wrap').style.display = 'none';
    document.getElementById('ml-corr-dendro-wrap').style.display  = 'none';
    document.getElementById('ml-corr-force-wrap').style.display   = 'none';
  }

  // Feature table
  mlRenderFeatTable();

  // Pruning roadmap (embedded in model_lab_{safe}.json as "pruning" key)
  renderPruningRoadmap(d.ticker_raw || d.ticker || '');

  // Rolling performance chart
  buildMLRollingPerf(equityIS);

  // Key metrics summary
  buildMLMetrics(equityIS, tradesIS, d.equity_holdout || [], d.trades_ho || [],
                 isWtd.pf || (d.is_model || {}).pf, (d.holdout || {}).pf);

  // Price chart with trade signals (IS + HO trades)
  buildMLPriceChart(d.price_is || [], d.price_holdout || [], tradesIS, d.trades_ho || []);

  // Model info header + health checks
  buildMLInfoHeader(d);
  buildMLHealthChecks(d);
  buildMLRegimePanel(d);

  // Trade analytics + log table
  _mlTradesIS = tradesIS;
  _mlTradesHO = d.trades_ho || [];
  buildMLTradeAnalytics(_mlTradesIS, _mlTradesHO, (d.holdout || {}).period_start);
  buildMLTradeLog(_mlTradesIS, 'is');
}

function buildMLEquityChart(equityIS, equityHO, hoStart) {
  const ctx = document.getElementById('ml-equity-chart').getContext('2d');
  if (_mlEquityChart) _mlEquityChart.destroy();

  // Build a single merged label set (sorted union of IS + HO dates)
  const isMap = {}, hoMap = {};
  equityIS.forEach(e => { isMap[e.date] = +((Math.exp(e.cum_ret||0)-1)*100).toFixed(4); });
  // HO resets to 0 at its own start — already the case from the data, displayed on right axis
  equityHO.forEach(e => { hoMap[e.date] = +((Math.exp(e.cum_ret||0)-1)*100).toFixed(4); });
  const allDates = [...new Set([...Object.keys(isMap), ...Object.keys(hoMap)])].sort();

  const isVals = allDates.map(d => isMap[d] != null ? isMap[d] : null);
  const hoVals = allDates.map(d => hoMap[d] != null ? hoMap[d] : null);

  const hasHO = equityHO.length > 0;

  _mlEquityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: allDates,
      datasets: [
        { label: 'IS Walk-Forward',      data: isVals, borderColor: SQ.cyan, backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0.2, spanGaps: false, yAxisID: 'yIS' },
        { label: 'Holdout (never seen)', data: hoVals, borderColor: '#f5a520', backgroundColor: 'transparent', borderWidth: 2,   pointRadius: 0, tension: 0.2, borderDash: [5,3], spanGaps: false, yAxisID: 'yHO' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color:'#aaa', font:{size:11} } },
        tooltip: {
          mode:'index', intersect:false,
          callbacks: {
            label: c => c.raw != null ? ` ${c.dataset.label}: ${c.raw >= 0 ? '+' : ''}${c.raw.toFixed(2)}%` : null,
            filter: c => c.raw != null
          }
        }
      },
      scales: {
        x:   { grid: {color:SQ.grid}, ticks: {color:SQ.muted, maxTicksLimit:8, font:{size:10}} },
        yIS: { position: 'left',  grid: {color:SQ.grid}, ticks: {color:SQ.cyan, font:{size:10}, callback: v => (v>=0?'+':'')+v.toFixed(0)+'%'},
               title: { display: true, text: 'IS %', color: SQ.cyan, font:{size:10} } },
        yHO: { position: 'right', grid: {drawOnChartArea: false}, ticks: {color:SQ.green, font:{size:10}, callback: v => (v>=0?'+':'')+v.toFixed(0)+'%'},
               title: { display: hasHO, text: 'HO %', color: '#f5a520', font:{size:10} },
               display: hasHO },
      }
    }
  });
}

// ── Rolling Performance from equity_is ────────────────────────────────────────
function buildMLRollingPerf(equityIS) {
  const card = document.getElementById('ml-rolling-card');
  const ctx  = document.getElementById('ml-rolling-chart').getContext('2d');
  if (_mlRollingChart) { _mlRollingChart.destroy(); _mlRollingChart = null; }
  const WINDOW = 90;
  if (!equityIS || equityIS.length < WINDOW + 10) { if (card) card.style.display='none'; return; }
  if (card) card.style.display='';

  // Daily returns from cum_ret
  const rets = [];
  for (let i = 1; i < equityIS.length; i++) {
    rets.push((equityIS[i].cum_ret || 0) - (equityIS[i-1].cum_ret || 0));
  }

  // Rolling Sharpe and drawdown
  const labels=[]; const sharpes=[]; const dds=[];
  let peak = equityIS[0].cum_ret || 0;
  for (let i = WINDOW; i < rets.length; i++) {
    const window = rets.slice(i - WINDOW, i);
    const mean = window.reduce((a,b)=>a+b,0)/WINDOW;
    const std  = Math.sqrt(window.reduce((a,r)=>a+(r-mean)**2,0)/WINDOW);
    sharpes.push(std > 0 ? +(mean/std * Math.sqrt(252)).toFixed(3) : null);
    const cumAtI = equityIS[i+1] ? (equityIS[i+1].cum_ret||0) : (equityIS[i].cum_ret||0);
    if (cumAtI > peak) peak = cumAtI;
    dds.push(+((Math.exp(cumAtI - peak) - 1)*100).toFixed(2));
    labels.push(equityIS[i+1] ? equityIS[i+1].date : equityIS[i].date);
  }

  _mlRollingChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Rolling 90d Sharpe', data: sharpes, borderColor: '#f5a520', borderWidth: 2, pointRadius: 0, tension: 0.2, fill: false, yAxisID: 'ySharpe' },
      { label: 'Drawdown %',         data: dds,     borderColor: '#ff2020', borderWidth: 1.5, pointRadius: 0, tension: 0.1,
        fill: { target: 'origin', above: 'transparent', below: 'rgba(255,32,32,0.15)' }, yAxisID: 'yDD' },
      { label: '_zero', data: labels.map(()=>0), borderColor:SQ.grid, borderWidth:1, borderDash:[4,4], pointRadius:0, fill:false, yAxisID:'ySharpe' }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, labels: { filter: item => !item.text.startsWith('_'), boxWidth:14, font:{size:11}, color:SQ.muted } },
        tooltip: { callbacks: { label: item => {
          if (item.datasetIndex===0) return ` Sharpe (90d): ${(item.raw||0).toFixed(2)}`;
          if (item.datasetIndex===1) return ` Drawdown: ${(item.raw||0).toFixed(2)}%`;
          return null;
        }, filter: item => item.datasetIndex < 2 } }
      },
      scales: {
        x:       { ticks:{maxTicksLimit:10,color:'#555',font:{size:10}}, grid:{color:SQ.grid} },
        ySharpe: { position:'left',  grid:{color:SQ.grid}, ticks:{color:SQ.muted,font:{size:10}}, title:{display:true,text:'Sharpe (90d)',font:{size:10},color:SQ.green} },
        yDD:     { position:'right', grid:{drawOnChartArea:false}, ticks:{color:SQ.muted,font:{size:10},callback:v=>v+'%'}, title:{display:true,text:'Drawdown %',font:{size:10},color:'#ff2020'} }
      }
    }
  });
}

// ── Key Metrics Summary ────────────────────────────────────────────────────────
function buildMLMetrics(equityIS, tradesIS, equityHO, tradesHO, isPF, hoPF) {
  const wrap = document.getElementById('ml-metrics-table-wrap');
  if (!wrap) return;

  // ── Compute equity + trade stats for one period ──────────────────────────
  function calcEquityStats(equity) {
    const s = { totalRet:0, annRet:0, ret1Y:0, sharpe:0, sortino:0, calmar:0,
                ulcer:0, serenity:0, annVol:0, upVol:0, downVol:0, skew:0, kurt:0, maxDD:0 };
    if (!equity || equity.length < 2) return s;
    const last  = equity[equity.length - 1];
    s.totalRet  = (Math.exp(last.cum_ret || 0) - 1) * 100;
    const years = (equity.length - 1) / 252;
    s.annRet    = years > 0 ? ((Math.exp((last.cum_ret||0) / years) - 1) * 100) : 0;
    const y1start  = Math.max(0, equity.length - 252);
    const ret1YLog = (equity[equity.length-1].cum_ret||0) - (equity[y1start].cum_ret||0);
    s.ret1Y = (Math.exp(ret1YLog) - 1) * 100;
    const rets = [];
    for (let i = 1; i < equity.length; i++)
      rets.push((equity[i].cum_ret||0) - (equity[i-1].cum_ret||0));
    const n = rets.length, mean = rets.reduce((a,b)=>a+b,0)/n;
    const std = Math.sqrt(rets.reduce((a,r)=>a+(r-mean)**2,0)/n);
    s.sharpe = std > 0 ? mean/std*Math.sqrt(252) : 0;
    s.annVol = std * Math.sqrt(252) * 100;
    const upRets = rets.filter(r=>r>0), downRets = rets.filter(r=>r<0);
    s.upVol   = upRets.length>1   ? Math.sqrt(upRets.reduce((a,r)=>a+r**2,0)/upRets.length)*Math.sqrt(252)*100   : 0;
    s.downVol = downRets.length>1 ? Math.sqrt(downRets.reduce((a,r)=>a+r**2,0)/downRets.length)*Math.sqrt(252)*100 : 0;
    const dStd = downRets.length>1 ? Math.sqrt(downRets.reduce((a,r)=>a+r**2,0)/downRets.length) : 0;
    s.sortino = dStd > 0 ? mean/dStd*Math.sqrt(252) : 0;
    let peak = -Infinity; const dds = [];
    for (const e of equity) {
      const v = e.cum_ret||0; if (v>peak) peak=v;
      const dd = (Math.exp(v-peak)-1)*100; dds.push(dd); if (dd<s.maxDD) s.maxDD=dd;
    }
    s.ulcer    = Math.sqrt(dds.reduce((a,d)=>a+d**2,0)/dds.length);
    s.calmar   = s.maxDD<0 ? s.annRet/Math.abs(s.maxDD) : 0;
    s.serenity = s.ulcer>0 ? s.annRet/s.ulcer : 0;
    if (std>0 && n>2) {
      s.skew = rets.reduce((a,r)=>a+((r-mean)/std)**3,0)/n;
      s.kurt = rets.reduce((a,r)=>a+((r-mean)/std)**4,0)/n - 3;
    }
    return s;
  }

  function calcTradeStats(trades, equityLen) {
    const s = { nTrades:0, winRate:0, avgWin:0, avgLoss:0, avgBars:0,
                profitFactor:0, expectancy:0, bestTrade:0, worstTrade:0,
                maxCW:0, maxCL:0, tradesPerYear:0 };
    if (!trades || trades.length === 0) return s;
    s.nTrades = trades.length;
    const wins = trades.filter(t=>t.win), losses = trades.filter(t=>!t.win);
    s.winRate  = s.nTrades > 0 ? wins.length/s.nTrades*100 : 0;
    s.avgWin   = wins.length   > 0 ? wins.reduce((a,t)=>a+t.return_pct,0)/wins.length   : 0;
    s.avgLoss  = losses.length > 0 ? losses.reduce((a,t)=>a+t.return_pct,0)/losses.length : 0;
    s.avgBars  = trades.reduce((a,t)=>a+(t.bars||0),0)/s.nTrades;
    s.profitFactor = losses.length > 0
      ? Math.abs(wins.reduce((a,t)=>a+t.return_pct,0)) / Math.abs(losses.reduce((a,t)=>a+t.return_pct,0))
      : (wins.length > 0 ? 99 : 0);
    s.expectancy = (s.winRate/100)*s.avgWin + (1-s.winRate/100)*s.avgLoss;
    s.bestTrade  = Math.max(...trades.map(t=>t.return_pct));
    s.worstTrade = Math.min(...trades.map(t=>t.return_pct));
    let cW=0, cL=0;
    for (const t of trades) {
      if (t.win) { cW++; cL=0; s.maxCW=Math.max(s.maxCW,cW); }
      else        { cL++; cW=0; s.maxCL=Math.max(s.maxCL,cL); }
    }
    s.tradesPerYear = equityLen > 0 ? s.nTrades/(equityLen/252) : 0;
    return s;
  }

  const is = calcEquityStats(equityIS);
  const ho = calcEquityStats(equityHO);
  const isTr = calcTradeStats(tradesIS, equityIS.length);
  const hoTr = calcTradeStats(tradesHO, equityHO.length);
  const hasHO = equityHO && equityHO.length > 1;

  // ── Render helpers ───────────────────────────────────────────────────────
  const pct  = (v,d=1) => (v>=0?'+':'')+v.toFixed(d)+'%';
  const posC = v => v>=0 ? '#00ff41' : '#ff6b6b';
  const ratC = (v,good,ok) => v>=good ? '#00ff41' : v>=ok ? '#f5a520' : '#ff6b6b';
  const ddC  = v => v < -15 ? '#ff2020' : v < -8 ? '#f5a520' : '#00ff41';
  const ulcC = v => v<3 ? '#00ff41' : v<8 ? '#f5a520' : '#ff6b6b';
  const na   = `<span style="color:#333">—</span>`;

  // 3-column table: Metric | IS | HO
  // rows: [label, isVal, isColor, hoVal, hoColor, tip]
  function tbl(title, rows) {
    const subHdr = hasHO ? `
      <tr style="background:#161616;border-bottom:1px solid #222">
        <td style="padding:3px 12px;font-size:9px;color:#444;text-transform:uppercase;letter-spacing:1px;width:50%"></td>
        <td style="padding:3px 8px;font-size:9px;color:#4fc3f7;text-align:right;letter-spacing:1px;text-transform:uppercase">IS</td>
        <td style="padding:3px 8px;font-size:9px;color:#f5a520;text-align:right;letter-spacing:1px;text-transform:uppercase">HO</td>
      </tr>` : '';
    const body = rows.map(([lbl,isV,isC,hoV,hoC,tip],i) => {
      const tipAttr = tip ? `data-tip="${tip.replace(/"/g,"'")}"` : '';
      const cursor  = tip ? 'cursor:help;' : '';
      const bg = i%2 ? '#0d0d0d' : '#111';
      const TD = `padding:5px 8px;font-size:12px;border-bottom:1px solid rgba(0,255,136,0.08);text-align:right;font-family:monospace;font-weight:700`;
      return `<tr style="background:${bg}">
        <td style="padding:5px 12px;font-size:12px;border-bottom:1px solid rgba(0,255,136,0.08);color:#6b7280;${cursor}" ${tipAttr}>${lbl}${tip?` <span style="color:#333;font-size:10px">ⓘ</span>`:''}</td>
        <td style="${TD};color:${isC||'var(--gold)'}">${isV}</td>
        ${hasHO ? `<td style="${TD};color:${hoC||'#9ca3af'}">${hoV??na}</td>` : ''}
      </tr>`;
    }).join('');
    const cols = hasHO ? 3 : 2;
    return `<table style="width:100%;border-collapse:collapse;border:1px solid #222;border-radius:6px;overflow:hidden;margin-bottom:0">
      <thead>
        <tr style="background:#001a0a"><th colspan="${cols}" style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--gold);border-bottom:1px solid rgba(0,255,136,0.15);font-weight:600">${title}</th></tr>
        ${subHdr}
      </thead>
      <tbody>${body}</tbody></table>`;
  }

  const perf = tbl('Performance', [
    ['Total Return',
      pct(is.totalRet,1)+` (${equityIS.length}d)`, posC(is.totalRet),
      hasHO ? pct(ho.totalRet,1)+` (${equityHO.length}d)` : na, posC(ho.totalRet),
      'Total cumulative return over the period.\nFormula: (exp(final_log_ret) − 1) × 100'],
    ['Ann. Return',
      pct(is.annRet,1)+' p.a.', posC(is.annRet),
      hasHO ? pct(ho.annRet,1)+' p.a.' : na, posC(ho.annRet),
      'Constant annual rate that produces the total return over the period.\nFormula: (exp(total_log_ret / years) − 1) × 100'],
    ['Profit Factor',
      isPF != null ? isPF.toFixed(3) : isTr.profitFactor.toFixed(3), ratC(isPF ?? isTr.profitFactor,1.3,1.0),
      hasHO ? (hoPF != null ? hoPF.toFixed(3) : hoTr.profitFactor.toFixed(3)) : na, ratC(hoPF ?? hoTr.profitFactor,1.3,1.0),
      'Gross winning daily returns ÷ gross losing daily returns (bar-level, consistent with hero card).\n> 1.0 = profitable  |  > 1.3 = good  |  > 1.5 = strong.'],
    ['Sharpe Ratio',
      is.sharpe.toFixed(2), ratC(is.sharpe,1.0,0.5),
      hasHO ? ho.sharpe.toFixed(2) : na, ratC(ho.sharpe,1.0,0.5),
      'Annualised return per unit of total volatility.\nFormula: mean(daily_log_ret) / std(daily_log_ret) × √252\n> 0.5 decent  |  > 1.0 good  |  > 2.0 exceptional.'],
    ['Sortino Ratio',
      is.sortino.toFixed(2), ratC(is.sortino,1.5,0.8),
      hasHO ? ho.sortino.toFixed(2) : na, ratC(ho.sortino,1.5,0.8),
      'Like Sharpe but only penalises downside volatility.\nFormula: mean(daily_log_ret) / std(negative_rets) × √252'],
    ['Expectancy / Trade',
      pct(isTr.expectancy,2), posC(isTr.expectancy),
      hasHO ? pct(hoTr.expectancy,2) : na, posC(hoTr.expectancy),
      'Expected average return per trade.\nFormula: (Win Rate × Avg Win) + ((1 − Win Rate) × Avg Loss)'],
    ['Win Rate',
      isTr.winRate.toFixed(0)+'%  ('+tradesIS.filter(t=>t.win).length+'W/'+tradesIS.filter(t=>!t.win).length+'L)',
      ratC(isTr.winRate,55,45),
      hasHO ? hoTr.winRate.toFixed(0)+'%  ('+(tradesHO||[]).filter(t=>t.win).length+'W/'+(tradesHO||[]).filter(t=>!t.win).length+'L)' : na,
      ratC(hoTr.winRate,55,45),
      'Percentage of closed trades that were profitable.'],
  ]);

  const risk = tbl('Risk', [
    ['Max DrawDown',
      is.maxDD.toFixed(1)+'%', ddC(is.maxDD),
      hasHO ? ho.maxDD.toFixed(1)+'%' : na, ddC(ho.maxDD),
      'Largest peak-to-trough decline.\nFormula: min(exp(cum_ret − running_peak) − 1) × 100'],
    ['Calmar Ratio',
      is.calmar.toFixed(2)+'×', ratC(is.calmar,2.0,1.0),
      hasHO ? ho.calmar.toFixed(2)+'×' : na, ratC(ho.calmar,2.0,1.0),
      'Ann. Return ÷ |Max DrawDown|.\n> 1.0 decent  |  > 2.0 strong.'],
    ['Ulcer Index',
      is.ulcer.toFixed(2)+'%', ulcC(is.ulcer),
      hasHO ? ho.ulcer.toFixed(2)+'%' : na, ulcC(ho.ulcer),
      'RMS of all drawdowns — average pain, not just the worst event.\n< 3% excellent  |  < 8% acceptable.'],
    ['Serenity Ratio',
      is.serenity.toFixed(2), ratC(is.serenity,2.0,1.0),
      hasHO ? ho.serenity.toFixed(2) : na, ratC(ho.serenity,2.0,1.0),
      'Ann. Return ÷ Ulcer Index. Favours consistently smooth equity curves.'],
    ['Ann. Volatility',
      is.annVol.toFixed(1)+'%', '#9ca3af',
      hasHO ? ho.annVol.toFixed(1)+'%' : na, '#9ca3af',
      'Annualised std of daily log-returns.\nFormula: std(daily_log_rets) × √252 × 100'],
    ['Skewness',
      (is.skew>=0?'+':'')+is.skew.toFixed(2), is.skew>=0?'#00ff41':'#ff6b6b',
      hasHO ? (ho.skew>=0?'+':'')+ho.skew.toFixed(2) : na, ho.skew>=0?'#00ff41':'#ff6b6b',
      'Positive = occasional large wins (desirable). Negative = occasional large losses.'],
  ]);

  const trades = tbl('Trade Statistics', [
    ['Total Trades',
      isTr.nTrades+'  ('+isTr.tradesPerYear.toFixed(0)+'/yr)', '#9ca3af',
      hasHO ? hoTr.nTrades+'' : na, '#9ca3af',
      'Completed round-trip trades and annualised frequency.'],
    ['Avg Win',
      pct(isTr.avgWin,2), '#00ff41',
      hasHO ? pct(hoTr.avgWin,2) : na, '#00ff41',
      'Average return of all winning trades.'],
    ['Avg Loss',
      pct(isTr.avgLoss,2), '#ff6b6b',
      hasHO ? pct(hoTr.avgLoss,2) : na, '#ff6b6b',
      'Average return of all losing trades.'],
    ['Best Trade',
      pct(isTr.bestTrade,2), '#00ff41',
      hasHO ? pct(hoTr.bestTrade,2) : na, '#00ff41',
      'Single largest winning trade in the period.'],
    ['Worst Trade',
      pct(isTr.worstTrade,2), '#ff6b6b',
      hasHO ? pct(hoTr.worstTrade,2) : na, '#ff6b6b',
      'Single largest losing trade in the period.'],
    ['Avg Hold',
      isTr.avgBars.toFixed(1)+' bars (~'+(isTr.avgBars/5).toFixed(1)+'wk)', '#9ca3af',
      hasHO ? hoTr.avgBars.toFixed(1)+' bars' : na, '#9ca3af',
      'Average number of bars a trade is held open.'],
    ['Max Consec. Losses',
      isTr.maxCL.toString(), '#9ca3af',
      hasHO ? hoTr.maxCL.toString() : na, '#9ca3af',
      'Longest unbroken losing streak. Key for position sizing.'],
  ]);

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
      <div style="display:flex;flex-direction:column;gap:10px">${perf}</div>
      <div style="display:flex;flex-direction:column;gap:10px">${risk}${trades}</div>
    </div>`;
}

// ── Price Chart with trade signals ────────────────────────────────────────────
function buildMLPriceChart(priceIS, priceHO, tradesIS, tradesHO) {
  const card = document.getElementById('ml-price-card');
  if (!card) return;
  if (_mlPriceChart) { _mlPriceChart.destroy(); _mlPriceChart = null; }

  if (!priceIS || priceIS.length === 0) { card.style.display = 'none'; return; }
  card.style.display = '';

  const ctx = document.getElementById('ml-price-chart').getContext('2d');

  // Build label set: IS dates first, then HO dates
  const isLabels = priceIS.map(p => p.date);
  const hoLabels = priceHO.map(p => p.date);
  const allLabels = [...isLabels, ...hoLabels];
  _mlPriceLabels = allLabels;
  _mlPriceDateToY = {};
  priceIS.forEach(p => { _mlPriceDateToY[p.date] = p.close; });
  priceHO.forEach(p => { _mlPriceDateToY[p.date] = p.close; });
  const hoStartDate = priceHO.length > 0 ? priceHO[0].date : null;

  // IS price dataset (index-aligned to allLabels)
  const isClose = allLabels.map((l, i) => i < priceIS.length ? priceIS[i].close : null);
  // HO price dataset
  const hoClose = allLabels.map((l, i) => {
    const hi = i - priceIS.length;
    return (hi >= 0 && hi < priceHO.length) ? priceHO[hi].close : null;
  });

  // Holdout boundary start index
  const hoStartIdx = hoStartDate ? allLabels.indexOf(hoStartDate) : -1;

  // Trade entry/exit scatter points
  // Use date strings as x so Chart.js category scale locates them correctly
  const dateToIdx = {};
  allLabels.forEach((l, i) => { dateToIdx[l] = i; });
  const idxToISPrice  = Object.fromEntries(priceIS.map((p,i) => [i, p.close]));
  const idxToHOPrice  = Object.fromEntries(priceHO.map((p,i) => [priceIS.length + i, p.close]));

  const longEntries = [], shortEntries = [], winExits = [], lossExits = [];
  const hoLongEntries = [], hoShortEntries = [], hoWinExits = [], hoLossExits = [];
  function addTradeMarkers(trades, longArr, shortArr, winArr, lossArr) {
    for (const t of trades) {
      const ei = dateToIdx[t.entry_date];
      const xi = dateToIdx[t.exit_date];
      const entryClose = ei !== undefined ? (_mlPriceDateToY[t.entry_date] ?? null) : null;
      const exitClose  = xi !== undefined ? (_mlPriceDateToY[t.exit_date]  ?? null) : null;
      if (ei !== undefined && entryClose != null) {
        if (t.direction === 'long') longArr.push({x: t.entry_date, y: entryClose});
        else                        shortArr.push({x: t.entry_date, y: entryClose});
      }
      if (xi !== undefined && exitClose != null) {
        if (t.win) winArr.push({x: t.exit_date, y: exitClose});
        else       lossArr.push({x: t.exit_date, y: exitClose});
      }
    }
  }
  addTradeMarkers(tradesIS, longEntries, shortEntries, winExits, lossExits);
  addTradeMarkers(tradesHO || [], hoLongEntries, hoShortEntries, hoWinExits, hoLossExits);

  // Inline plugin to shade holdout region and draw boundary line
  const hoShadePlugin = {
    id: 'hoShade',
    beforeDraw(chart) {
      if (hoStartIdx < 0) return;
      const xAxis = chart.scales.x;
      const xStart = xAxis.getPixelForValue(hoStartIdx);
      const xEnd   = xAxis.right;
      const {ctx: c, chartArea: {top, bottom}} = chart;
      c.save();
      // Shaded region
      c.fillStyle = 'rgba(245,165,32,0.06)';
      c.fillRect(xStart, top, xEnd - xStart, bottom - top);
      // Boundary line
      c.strokeStyle = 'rgba(245,165,32,0.5)';
      c.lineWidth = 1.5;
      c.setLineDash([6,3]);
      c.beginPath(); c.moveTo(xStart, top); c.lineTo(xStart, bottom); c.stroke();
      c.setLineDash([]);
      // Label
      c.fillStyle = '#f5a520';
      c.font = '10px sans-serif';
      c.fillText('Holdout ▶', xStart + 4, top + 14);
      c.restore();
    }
  };

  _mlPriceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        // IS price line
        { label: 'IS Price', data: isClose, borderColor: '#4fc3f7', borderWidth: 1.5,
          pointRadius: 0, tension: 0, fill: false, spanGaps: false },
        // Holdout price line
        { label: 'Holdout Price', data: hoClose, borderColor: '#f5a520', borderWidth: 2,
          pointRadius: 0, tension: 0, fill: false, spanGaps: false, borderDash: [4,3] },
        // Long entries
        { label: 'Long Entry', data: longEntries, type: 'scatter',
          borderColor: '#00ff41', backgroundColor: '#00ff41',
          pointStyle: 'triangle', pointRadius: 6, pointHoverRadius: 8, showLine: false },
        // Short entries
        { label: 'Short Entry', data: shortEntries, type: 'scatter',
          borderColor: '#ff6b6b', backgroundColor: '#ff6b6b',
          pointStyle: 'triangle', rotation: 180, pointRadius: 6, pointHoverRadius: 8, showLine: false },
        // Win exits
        { label: 'Win Exit', data: winExits, type: 'scatter',
          borderColor: '#00ff41', backgroundColor: 'transparent',
          pointStyle: 'circle', borderWidth: 2, pointRadius: 4, showLine: false },
        // Loss exits
        { label: 'Loss Exit', data: lossExits, type: 'scatter',
          borderColor: '#ff2020', backgroundColor: 'transparent',
          pointStyle: 'crossRot', borderWidth: 2, pointRadius: 5, showLine: false },
        // HO trade markers (amber/purple tones to distinguish from IS)
        { label: 'HO Long Entry', data: hoLongEntries, type: 'scatter',
          borderColor: '#34d399', backgroundColor: '#34d399',
          pointStyle: 'triangle', pointRadius: 7, pointHoverRadius: 9, showLine: false },
        { label: 'HO Short Entry', data: hoShortEntries, type: 'scatter',
          borderColor: '#fb923c', backgroundColor: '#fb923c',
          pointStyle: 'triangle', rotation: 180, pointRadius: 7, pointHoverRadius: 9, showLine: false },
        { label: 'HO Win Exit', data: hoWinExits, type: 'scatter',
          borderColor: '#34d399', backgroundColor: 'transparent',
          pointStyle: 'circle', borderWidth: 2, pointRadius: 5, showLine: false },
        { label: 'HO Loss Exit', data: hoLossExits, type: 'scatter',
          borderColor: '#fb923c', backgroundColor: 'transparent',
          pointStyle: 'crossRot', borderWidth: 2, pointRadius: 6, showLine: false },
        // Highlight rings — populated by mlZoomToTrade (datasets[10] entry, [11] exit)
        { label: '', data: [], type: 'scatter',
          borderColor: '#ffffff', backgroundColor: 'rgba(255,255,255,0.12)',
          pointStyle: 'circle', borderWidth: 2.5, pointRadius: 14, pointHoverRadius: 14,
          showLine: false, order: -1 },
        { label: '', data: [], type: 'scatter',
          borderColor: '#f5a520', backgroundColor: 'rgba(245,165,32,0.18)',
          pointStyle: 'circle', borderWidth: 2.5, pointRadius: 14, pointHoverRadius: 14,
          showLine: false, order: -1 },
      ]
    },
    plugins: [hoShadePlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: SQ.muted, font: {size:11}, boxWidth: 12 } },
        tooltip: { callbacks: { label: c => {
          if (c.datasetIndex === 0) return ` IS: $${(c.parsed.y||0).toFixed(3)}`;
          if (c.datasetIndex === 1) return ` HO: $${(c.parsed.y||0).toFixed(3)}`;
          return ` ${c.dataset.label}: $${(c.parsed.y||0).toFixed(3)}`;
        }}},
        zoom: {
          pan:  { enabled: true, mode: 'x' },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
        }
      },
      scales: {
        x: { ticks: {maxTicksLimit:12, color:'#555', font:{size:10}}, grid: {color:SQ.grid} },
        y: { ticks: {color:SQ.muted, font:{size:10}, callback: v => '$'+v.toFixed(2)}, grid: {color:SQ.grid} }
      }
    }
  });
}

// ── Trade Analytics ────────────────────────────────────────────────────────────
let _mlMonthlyChart = null, _mlRetDistChart = null, _mlDurRetChart = null, _mlConcChart = null, _mlLsChart = null, _mlLsScatter = null, _mlDirectionChart = null;
let _mlMonthlyChartHO = null, _mlRetDistChartHO = null, _mlDurRetChartHO = null;
let _mlRegimeChart = null; // owned by buildMLRegimePanel, not trade analytics
let _mlTradesIS = [], _mlTradesHO = [];
let _mlScoreBucketsChart = null;
let _mlScoreDistChart    = null;
let _mlWindowSharpeChart = null;
let _mlCurrentData = null;

function _mlSwitchV6Variant(variantKey) {
  if (!_mlCurrentData || !_mlCurrentData.variants) return;
  const v = _mlCurrentData.variants[variantKey];
  if (!v) return;
  _mlCurrentData._active_variant = variantKey;
  // Swap active data
  _mlCurrentData.features        = v.features       || [];
  _mlCurrentData.weight_history  = v.weight_history  || [];
  _mlCurrentData.equity_is       = v.equity_is       || [];
  _mlCurrentData.equity_holdout  = v.equity_ho       || [];
  _mlCurrentData.is_model = {
    pf:           v.is_pf,
    sharpe:       v.is_sharpe,
    n_windows:    v.n_windows,
    forward_bars: v.forward_bars,
    train_days:   v.train_days,
  };
  _mlCurrentData.holdout = v.ho_sharpe != null ? {
    pf:           v.ho_pf,
    sharpe:       v.ho_sharpe,
    period_start: v.ho_period_start,
    period_end:   v.ho_period_end,
  } : null;
  _mlCurrentData.overfit_signal = (v.ho_sharpe == null) ? 'UNKNOWN'
    : (v.ho_sharpe >= 0.3 && v.ho_sharpe >= (v.is_sharpe || 0) * 0.5) ? 'CLEAN'
    : (v.ho_sharpe >= 0.0) ? 'CAUTION' : 'OVERFIT';
  _mlCurrentData.pruning = {
    mode:           'ridge_v6',
    hard_pruned:    v.hard_pruned    || [],
    dormant_pool:   v.dormant_pool   || [],
    final_excluded: v.final_excluded || [],
    final_features: v.n_features,
  };
  // Re-render
  renderTickerDetail(_mlCurrentData);
}

function mlSwitchTATab(tab) {
  const isIS = tab === 'is';
  const btnIS = document.getElementById('ml-ta-btn-is');
  const btnHO = document.getElementById('ml-ta-btn-ho');
  if (!btnIS || !btnHO) return;

  document.querySelectorAll('.ml-ta-is').forEach(el => { el.style.display = isIS ? '' : 'none'; });
  document.querySelectorAll('.ml-ta-ho').forEach(el => { el.style.display = isIS ? 'none' : ''; });

  if (isIS) {
    btnIS.style.cssText = `font-size:11px;padding:4px 14px;border-radius:3px;border:1px solid ${SQ.green};background:${hexA(SQ.green,0.13)};color:${SQ.green};cursor:pointer;font-family:'Courier New',monospace;font-weight:700;letter-spacing:1px;text-transform:uppercase`;
    btnHO.style.cssText = `font-size:11px;padding:4px 14px;border-radius:3px;border:1px solid #333;background:transparent;color:${SQ.muted};cursor:pointer;font-family:'Courier New',monospace;font-weight:700;letter-spacing:1px;text-transform:uppercase`;
  } else {
    btnHO.style.cssText = `font-size:11px;padding:4px 14px;border-radius:3px;border:1px solid ${SQ.green};background:${hexA(SQ.green,0.13)};color:${SQ.green};cursor:pointer;font-family:'Courier New',monospace;font-weight:700;letter-spacing:1px;text-transform:uppercase`;
    btnIS.style.cssText = `font-size:11px;padding:4px 14px;border-radius:3px;border:1px solid #333;background:transparent;color:${SQ.muted};cursor:pointer;font-family:'Courier New',monospace;font-weight:700;letter-spacing:1px;text-transform:uppercase`;
  }

  // Resize whichever charts just became visible (responsive canvas needs nudge)
  setTimeout(() => {
    const visible = isIS
      ? [_mlMonthlyChart, _mlRetDistChart, _mlDurRetChart]
      : [_mlMonthlyChartHO, _mlRetDistChartHO, _mlDurRetChartHO];
    visible.forEach(c => c && c.resize());
  }, 20);
}

function mlSwitchTradeTab(tab) {
  const btnIS = document.getElementById('ml-tl-btn-is');
  const btnHO = document.getElementById('ml-tl-btn-ho');
  if (tab === 'is') {
    btnIS.style.background=hexA(SQ.green,0.13); btnIS.style.borderColor=SQ.green; btnIS.style.color=SQ.green;
    btnHO.style.background='transparent'; btnHO.style.borderColor=SQ.neutral; btnHO.style.color=SQ.muted;
    buildMLTradeLog(_mlTradesIS, 'is');
  } else {
    btnHO.style.background=hexA(SQ.cyan,0.13); btnHO.style.borderColor=SQ.cyan; btnHO.style.color=SQ.cyan;
    btnIS.style.background='transparent'; btnIS.style.borderColor=SQ.neutral; btnIS.style.color=SQ.muted;
    buildMLTradeLog(_mlTradesHO, 'ho');
  }
}

function buildMLTradeAnalytics(tradesIS, tradesHO, hoStart) {
  const card = document.getElementById('ml-trade-analytics-card');
  if (!card || !tradesIS || tradesIS.length < 3) return;
  card.style.display = '';

  // Destroy previous instances
  if (_mlMonthlyChart)    { _mlMonthlyChart.destroy();    _mlMonthlyChart    = null; }
  if (_mlMonthlyChartHO)  { _mlMonthlyChartHO.destroy();  _mlMonthlyChartHO  = null; }
  if (_mlRetDistChart)    { _mlRetDistChart.destroy();    _mlRetDistChart    = null; }
  if (_mlRetDistChartHO)  { _mlRetDistChartHO.destroy();  _mlRetDistChartHO  = null; }
  if (_mlDurRetChart)     { _mlDurRetChart.destroy();     _mlDurRetChart     = null; }
  if (_mlDurRetChartHO)   { _mlDurRetChartHO.destroy();   _mlDurRetChartHO   = null; }
  if (_mlConcChart)      { _mlConcChart.destroy();      _mlConcChart      = null; }
  if (_mlLsChart)        { _mlLsChart.destroy();        _mlLsChart        = null; }
  if (_mlLsScatter)      { _mlLsScatter.destroy();      _mlLsScatter      = null; }
  if (_mlDirectionChart) { _mlDirectionChart.destroy(); _mlDirectionChart = null; }
  if (_mlScoreBucketsChart) { _mlScoreBucketsChart.destroy(); _mlScoreBucketsChart = null; }
  if (_mlScoreDistChart)    { _mlScoreDistChart.destroy();    _mlScoreDistChart    = null; }
  if (_mlWindowSharpeChart) { _mlWindowSharpeChart.destroy(); _mlWindowSharpeChart = null; }
  // _mlRegimeChart is owned by buildMLRegimePanel — do not destroy it here

  const axStyle = { color: SQ.muted, font: { size: 10 } };
  const gridStyle = { color: SQ.grid };

  // ── 1. Monthly P&L — IS chart + HO chart (separate) ─────────────────────────
  const mthLabelFn = k => { const [y,m]=k.split('-'); return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]} ${y.slice(2)}`; };
  const mMonthlyOpts = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { ...axStyle, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
      y: { ticks: { ...axStyle, callback: v => `${v>0?'+':''}${v.toFixed(0)}%` }, grid: gridStyle, border: { display: false } }
    }
  };

  // IS monthly map
  const isMonthlyMap = {};
  tradesIS.forEach(t => {
    const key = (t.exit_date || t.entry_date || '').slice(0,7);
    if (!key) return;
    isMonthlyMap[key] = (isMonthlyMap[key] || 0) + (t.return_pct || 0);
  });
  const isMKeys = Object.keys(isMonthlyMap).sort();
  const isMVals = isMKeys.map(k => +isMonthlyMap[k].toFixed(2));
  _mlMonthlyChart = new Chart(document.getElementById('ml-monthly-pnl-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: isMKeys.map(mthLabelFn),
      datasets: [{ data: isMVals,
        backgroundColor:      isMVals.map(v => v >= 0 ? hexA(SQ.green, 0.70) : hexA(SQ.red, 0.70)),
        borderColor:          isMVals.map(v => v >= 0 ? SQ.green : SQ.red),
        hoverBackgroundColor: isMVals.map(v => v >= 0 ? hexA(SQ.green, 1.0) : hexA(SQ.red, 1.0)),
        hoverBorderColor:     isMVals.map(v => v >= 0 ? SQ.green : SQ.red),
        hoverBorderWidth: 2,
        borderWidth: 1, borderRadius: 3 }]
    },
    options: { ...mMonthlyOpts, plugins: { ...mMonthlyOpts.plugins,
      tooltip: { callbacks: { label: ctx => `IS ${ctx.raw >= 0 ? '+' : ''}${ctx.raw.toFixed(2)}%` }}
    }}
  });

  // HO monthly map
  const hoMonthlyMap = {};
  (tradesHO || []).forEach(t => {
    const key = (t.exit_date || t.entry_date || '').slice(0,7);
    if (!key) return;
    hoMonthlyMap[key] = (hoMonthlyMap[key] || 0) + (t.return_pct || 0);
  });
  const hoMKeys = Object.keys(hoMonthlyMap).sort();
  const hoMVals = hoMKeys.map(k => +hoMonthlyMap[k].toFixed(2));
  const hoMCanvas = document.getElementById('ml-monthly-pnl-chart-ho');
  if (hoMCanvas && hoMKeys.length) {
    _mlMonthlyChartHO = new Chart(hoMCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: hoMKeys.map(mthLabelFn),
        datasets: [{ data: hoMVals,
          backgroundColor:      hoMVals.map(v => v >= 0 ? hexA(SQ.green, 0.70) : hexA(SQ.red, 0.70)),
          borderColor:          hoMVals.map(v => v >= 0 ? SQ.green : SQ.red),
          hoverBackgroundColor: hoMVals.map(v => v >= 0 ? hexA(SQ.green, 1.0) : hexA(SQ.red, 1.0)),
          hoverBorderColor:     hoMVals.map(v => v >= 0 ? SQ.green : SQ.red),
          hoverBorderWidth: 2,
          borderWidth: 1, borderRadius: 3 }]
      },
      options: { ...mMonthlyOpts, plugins: { ...mMonthlyOpts.plugins,
        tooltip: { callbacks: { label: ctx => `HO ${ctx.raw >= 0 ? '+' : ''}${ctx.raw.toFixed(2)}%` }}
      }}
    });
  } else if (hoMCanvas) {
    hoMCanvas.style.display = 'none';
  }

  // ── 2. Return Distribution — IS chart + HO chart (separate) ─────────────────
  const retsIS  = tradesIS.map(t => t.return_pct || 0);
  const retsHO  = (tradesHO || []).map(t => t.return_pct || 0);
  // Build bins from IS range (so IS and HO share same x-axis scale)
  const rMin = retsIS.length ? Math.min(...retsIS) : -5;
  const rMax = retsIS.length ? Math.max(...retsIS) :  5;
  const nBins = Math.min(12, Math.max(6, Math.round(Math.sqrt(retsIS.length))));
  const binW  = (rMax - rMin) / nBins || 1;
  const isBins = Array.from({length: nBins}, (_,i) => ({ lo: rMin + i*binW, hi: rMin + (i+1)*binW, cnt: 0, wins: 0 }));
  retsIS.forEach((r, ri) => {
    const bi = Math.max(0, Math.min(nBins-1, Math.floor((r - rMin) / binW)));
    isBins[bi].cnt++; if (tradesIS[ri].win) isBins[bi].wins++;
  });
  const hoBins = Array.from({length: nBins}, (_,i) => ({ lo: rMin + i*binW, hi: rMin + (i+1)*binW, cnt: 0, wins: 0 }));
  retsHO.forEach((r, ri) => {
    const bi = Math.max(0, Math.min(nBins-1, Math.floor((r - rMin) / binW)));
    hoBins[bi].cnt++; if ((tradesHO||[])[ri]?.win) hoBins[bi].wins++;
  });
  const binLabels = isBins.map(b => `${b.lo.toFixed(1)}%`);
  const retDistScales = {
    x: { ticks: { ...axStyle, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
    y: { ticks: { ...axStyle, stepSize: 1 }, grid: gridStyle, border: { display: false },
         title: { display: true, text: 'Count', color: SQ.muted, font: { size: 10 } } }
  };

  _mlRetDistChart = new Chart(document.getElementById('ml-ret-dist-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: binLabels,
      datasets: [{ label: 'IS', data: isBins.map(b => b.cnt),
        backgroundColor:      isBins.map(b => b.lo >= 0 ? hexA(SQ.green, 0.65) : hexA(SQ.red, 0.65)),
        borderColor:          isBins.map(b => b.lo >= 0 ? SQ.green : SQ.red),
        hoverBackgroundColor: isBins.map(b => b.lo >= 0 ? hexA(SQ.green, 1.0) : hexA(SQ.red, 1.0)),
        hoverBorderWidth: 2,
        borderWidth: 1, borderRadius: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: ctx => { const b = isBins[ctx[0].dataIndex]; return `${b.lo.toFixed(2)}% to ${b.hi.toFixed(2)}%`; },
          label: ctx => { const b = isBins[ctx.dataIndex]; return `IS: ${b.cnt} trade${b.cnt!==1?'s':''} (${b.wins} W)`; }
        }}
      },
      scales: retDistScales
    }
  });

  const rdHOCanvas = document.getElementById('ml-ret-dist-chart-ho');
  if (rdHOCanvas && retsHO.length) {
    _mlRetDistChartHO = new Chart(rdHOCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: binLabels,
        datasets: [{ label: 'HO', data: hoBins.map(b => b.cnt),
          backgroundColor:      hoBins.map(b => b.lo >= 0 ? hexA(SQ.green, 0.65) : hexA(SQ.red, 0.65)),
          borderColor:          hoBins.map(b => b.lo >= 0 ? SQ.green : SQ.red),
          hoverBackgroundColor: hoBins.map(b => b.lo >= 0 ? hexA(SQ.green, 1.0) : hexA(SQ.red, 1.0)),
          hoverBorderWidth: 2,
          borderWidth: 1, borderRadius: 2 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: ctx => { const b = hoBins[ctx[0].dataIndex]; return `${b.lo.toFixed(2)}% to ${b.hi.toFixed(2)}%`; },
            label: ctx => { const b = hoBins[ctx.dataIndex]; return `HO: ${b.cnt} trade${b.cnt!==1?'s':''} (${b.wins} W)`; }
          }}
        },
        scales: retDistScales
      }
    });
  } else if (rdHOCanvas) {
    rdHOCanvas.style.display = 'none';
  }

  // ── 3. Duration vs Return — IS chart + HO chart (separate) ──────────────────
  const isWins3  = tradesIS.filter(t =>  t.win).map(t => ({ x: t.bars||0, y: +(t.return_pct||0).toFixed(2) }));
  const isLoss3  = tradesIS.filter(t => !t.win).map(t => ({ x: t.bars||0, y: +(t.return_pct||0).toFixed(2) }));
  const hoWins3  = (tradesHO||[]).filter(t =>  t.win).map(t => ({ x: t.bars||0, y: +(t.return_pct||0).toFixed(2) }));
  const hoLoss3  = (tradesHO||[]).filter(t => !t.win).map(t => ({ x: t.bars||0, y: +(t.return_pct||0).toFixed(2) }));
  const durRetScales = {
    x: { ticks: axStyle, grid: gridStyle, title: { display: true, text: 'Bars Held', color: SQ.muted, font:{size:10} } },
    y: { ticks: { ...axStyle, callback: v => `${v>0?'+':''}${v.toFixed(0)}%` }, grid: gridStyle, border:{display:false},
         title: { display: true, text: 'Return %', color: SQ.muted, font:{size:10} } }
  };

  _mlDurRetChart = new Chart(document.getElementById('ml-dur-ret-chart').getContext('2d'), {
    type: 'scatter',
    data: { datasets: [
      { label: 'Win',  data: isWins3, backgroundColor: hexA(SQ.green, 0.55), borderColor: SQ.green, pointRadius: 4, pointHoverRadius: 8 },
      { label: 'Loss', data: isLoss3, backgroundColor: hexA(SQ.red,   0.55), borderColor: SQ.red,   pointRadius: 4, pointHoverRadius: 8 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { color:SQ.muted, font:{size:9}, boxWidth:8, padding:5 } },
        tooltip: { callbacks: { label: ctx => `IS ${ctx.dataset.label}: ${ctx.raw.x} bars, ${ctx.raw.y>=0?'+':''}${ctx.raw.y.toFixed(2)}%` }}
      },
      scales: durRetScales
    }
  });

  const drHOCanvas = document.getElementById('ml-dur-ret-chart-ho');
  if (drHOCanvas && (hoWins3.length || hoLoss3.length)) {
    _mlDurRetChartHO = new Chart(drHOCanvas.getContext('2d'), {
      type: 'scatter',
      data: { datasets: [
        { label: 'Win',  data: hoWins3, backgroundColor: hexA(SQ.green, 0.55), borderColor: SQ.green, pointRadius: 4, pointHoverRadius: 8 },
        { label: 'Loss', data: hoLoss3, backgroundColor: hexA(SQ.red,   0.55), borderColor: SQ.red,   pointRadius: 4, pointHoverRadius: 8 }
      ]},
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: true, position: 'top', labels: { color:SQ.muted, font:{size:9}, boxWidth:8, padding:5 } },
          tooltip: { callbacks: { label: ctx => `HO ${ctx.dataset.label}: ${ctx.raw.x} bars, ${ctx.raw.y>=0?'+':''}${ctx.raw.y.toFixed(2)}%` }}
        },
        scales: durRetScales
      }
    });
  } else if (drHOCanvas) {
    drHOCanvas.style.display = 'none';
  }

  // ── 4. P&L Concentration — IS period only ────────────────────────────────────
  const sorted = [...tradesIS].sort((a,b) => Math.abs(b.return_pct) - Math.abs(a.return_pct));
  const totalGross = sorted.reduce((a,t) => a + Math.abs(t.return_pct), 0);

  // Composition bar: each trade = a colored segment, width ∝ % of gross P&L
  const concBar = document.getElementById('ml-conc-bar');
  if (concBar && totalGross > 0) {
    concBar.innerHTML = sorted.map((t, i) => {
      const pct  = (Math.abs(t.return_pct) / totalGross * 100).toFixed(2);
      const col  = t.win ? SQ.green : SQ.red;
      const tip  = `#${i+1}: ${t.entry_date} → ${t.exit_date}  ${t.return_pct >= 0 ? '+' : ''}${t.return_pct.toFixed(2)}%  (${pct}% of gross)`;
      return `<div data-tip="${tip}" style="flex:${pct};background:${col};opacity:${0.35 + 0.65*(Math.abs(t.return_pct)/Math.abs(sorted[0].return_pct))};min-width:1px;cursor:pointer" title=""></div>`;
    }).join('');
  }

  // Concentration summary label
  let cumAbs2 = 0;
  const cumPcts = sorted.map(t => { cumAbs2 += Math.abs(t.return_pct); return cumAbs2 / totalGross * 100; });
  const top80 = cumPcts.findIndex(v => v >= 80) + 1;
  const top1Pct = totalGross > 0 ? (Math.abs(sorted[0].return_pct) / totalGross * 100).toFixed(0) : 0;
  const concLabelEl = document.getElementById('ml-conc-label');
  if (concLabelEl) {
    const flag = top80 <= 3 ? '⚠ concentrated' : top80 <= Math.round(tradesIS.length * 0.2) ? 'moderate' : 'well spread';
    concLabelEl.textContent = `Top ${top80} trade${top80>1?'s':''} = 80% of gross  ·  biggest = ${top1Pct}%  ·  ${flag}`;
    concLabelEl.style.color = top80 <= 3 ? SQ.red : top80 <= 5 ? SQ.amber : SQ.muted;
  }

  // Bubble chart: x=chrono index, y=return%, radius ∝ abs magnitude
  const maxAbs = Math.abs(sorted[0].return_pct) || 1;
  const bubbleData = tradesIS.map((t, i) => ({
    x: i + 1,
    y: +(t.return_pct).toFixed(2),
    r: Math.max(3, Math.sqrt(Math.abs(t.return_pct) / maxAbs) * 18)
  }));
  const bubbleWins   = bubbleData.filter((_,i) => tradesIS[i].win);
  const bubbleLosses = bubbleData.filter((_,i) => !tradesIS[i].win);
  const winIdxs      = tradesIS.map((t,i) => t.win ? i : -1).filter(i => i >= 0);
  const lossIdxs     = tradesIS.map((t,i) => !t.win ? i : -1).filter(i => i >= 0);

  _mlConcChart = new Chart(document.getElementById('ml-conc-chart').getContext('2d'), {
    type: 'bubble',
    data: { datasets: [
      { label: 'Win',  data: bubbleWins,   backgroundColor: hexA(SQ.green, 0.50), borderColor: SQ.green, borderWidth: 1, hoverBorderWidth: 2 },
      { label: 'Loss', data: bubbleLosses, backgroundColor: hexA(SQ.red,   0.50), borderColor: SQ.red,   borderWidth: 1, hoverBorderWidth: 2 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { color: SQ.muted, font: { size: 10 }, boxWidth: 10, padding: 6 } },
        tooltip: { callbacks: { label: ctx => {
          const allIdx = ctx.dataset.label === 'Win' ? winIdxs[ctx.dataIndex] : lossIdxs[ctx.dataIndex];
          const t = tradesIS[allIdx];
          return t ? ` Trade ${ctx.raw.x}: ${t.entry_date} → ${t.exit_date}  ${t.return_pct >= 0 ? '+' : ''}${t.return_pct.toFixed(2)}%` : '';
        }}}
      },
      scales: {
        x: { ticks: { ...axStyle, callback: v => `T${v}` }, grid: gridStyle, title: { display: true, text: 'Trade # (chronological)', color: SQ.muted, font: { size: 10 } } },
        y: { ticks: { ...axStyle, callback: v => `${v>0?'+':''}${v.toFixed(0)}%` }, grid: gridStyle, title: { display: true, text: 'Return %', color: SQ.muted, font: { size: 10 } } }
      }
    }
  });

  // ── 5. Long vs Short comparison ──────────────────────────────────────────────
  // Chart uses combined IS+HO; stats tile shows IS and HO breakdown
  const allTrades = [...tradesIS, ...(tradesHO || [])];
  const longs  = allTrades.filter(t => t.direction === 'long');
  const shorts = allTrades.filter(t => t.direction === 'short');
  const isLongsD  = tradesIS.filter(t => t.direction === 'long');
  const isShortsD = tradesIS.filter(t => t.direction === 'short');
  const hoLongsD  = (tradesHO||[]).filter(t => t.direction === 'long');
  const hoShortsD = (tradesHO||[]).filter(t => t.direction === 'short');

  function tradeStats(arr) {
    if (!arr.length) return null;
    const wins  = arr.filter(t => t.win);
    const loss  = arr.filter(t => !t.win);
    const wr    = wins.length / arr.length * 100;
    const avg   = arr.reduce((a,t) => a + t.return_pct, 0) / arr.length;
    const grossW = Math.abs(wins.reduce((a,t) => a + t.return_pct, 0));
    const grossL = Math.abs(loss.reduce((a,t) => a + t.return_pct, 0));
    const pf    = grossL > 0 ? grossW / grossL : null;
    const avgBars = arr.reduce((a,t) => a + (t.bars||0), 0) / arr.length;
    return { n: arr.length, wr, avg, pf, avgBars };
  }

  const lstats = tradeStats(longs);
  const sstats = tradeStats(shorts);

  // ── Grouped bar chart: Win Rate, Avg Return, Profit Factor ─────────────────
  const lsChartEl = document.getElementById('ml-ls-chart');
  if (lsChartEl && (lstats || sstats)) {
    const lColor = hexA(SQ.green, 0.70), lBorder = SQ.green;
    const sColor = hexA(SQ.red,   0.70), sBorder = SQ.red;
    const metrics = ['Win Rate %', 'Avg Return %', 'Profit Factor', 'Avg Bars'];
    const lVals = lstats ? [+lstats.wr.toFixed(1), +lstats.avg.toFixed(2), lstats.pf!=null?+lstats.pf.toFixed(2):0, +lstats.avgBars.toFixed(1)] : [0,0,0,0];
    const sVals = sstats ? [+sstats.wr.toFixed(1), +sstats.avg.toFixed(2), sstats.pf!=null?+sstats.pf.toFixed(2):0, +sstats.avgBars.toFixed(1)] : [0,0,0,0];

    _mlLsChart = new Chart(lsChartEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels: metrics,
        datasets: [
          { label: '▲ Long',  data: lVals, backgroundColor: lColor, borderColor: lBorder, hoverBackgroundColor: hexA(SQ.green, 1.0), hoverBorderWidth: 2, borderWidth: 1, borderRadius: 3 },
          { label: '▼ Short', data: sVals, backgroundColor: sColor, borderColor: sBorder, hoverBackgroundColor: hexA(SQ.red,   1.0), hoverBorderWidth: 2, borderWidth: 1, borderRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: true, position: 'top', labels: { color: SQ.muted, font: { size: 10 }, boxWidth: 10, padding: 8 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}` } }
        },
        scales: {
          x: { ticks: { ...axStyle }, grid: { display: false } },
          y: { ticks: { ...axStyle }, grid: gridStyle, border: { display: false } }
        }
      }
    });
  }

  // ── Return distribution scatter by direction ────────────────────────────────
  const lsScEl = document.getElementById('ml-ls-scatter');
  if (lsScEl) {
    const longPts  = longs.map((t,i)  => ({ x: i+1, y: +(t.return_pct).toFixed(2) }));
    const shortPts = shorts.map((t,i) => ({ x: i+1, y: +(t.return_pct).toFixed(2) }));
    _mlLsScatter = new Chart(lsScEl.getContext('2d'), {
      type: 'scatter',
      data: { datasets: [
        { label: '▲ Long',  data: longPts,  backgroundColor: hexA(SQ.green, 0.60), borderColor: SQ.green, pointRadius: 5, pointHoverRadius: 9 },
        { label: '▼ Short', data: shortPts, backgroundColor: hexA(SQ.red,   0.60), borderColor: SQ.red,   pointRadius: 5, pointHoverRadius: 9 }
      ]},
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: true, position: 'top', labels: { color: SQ.muted, font: { size: 10 }, boxWidth: 10, padding: 8 } },
          tooltip: { callbacks: { label: ctx => {
            const arr = ctx.dataset.label.includes('Long') ? longs : shorts;
            const t = arr[ctx.dataIndex];
            return t ? ` ${ctx.dataset.label}: ${t.entry_date}  ${t.return_pct >= 0 ? '+' : ''}${t.return_pct.toFixed(2)}%` : '';
          }}}
        },
        scales: {
          x: { display: false },
          y: { ticks: { ...axStyle, callback: v => `${v>0?'+':''}${v.toFixed(0)}%` }, grid: gridStyle,
               title: { display: true, text: 'Return %', color: SQ.muted, font: { size: 10 } } }
        }
      }
    });
  }

  // ── Stats tile summary ──────────────────────────────────────────────────────
  const lsWrap = document.getElementById('ml-ls-wrap');
  if (lsWrap) {
    const isLstats = tradeStats(isLongsD), isSstats = tradeStats(isShortsD);
    const hoLstats = tradeStats(hoLongsD), hoSstats = tradeStats(hoShortsD);
    const tile = (s, label, col, period) => !s ? '' : `
      <span style="color:${col};font-weight:700">${label}</span>
      <span style="color:var(--muted);font-size:10px;margin-left:4px">${period}</span>
      <span style="color:${SQ.muted};margin-left:8px">${s.n} trades</span>
      <span style="color:${+s.wr>=50?SQ.green:SQ.red};margin-left:10px">${s.wr.toFixed(0)}% WR</span>
      <span style="color:${s.avg>=0?SQ.green:SQ.red};margin-left:10px">${s.avg>=0?'+':''}${s.avg.toFixed(2)}% avg</span>
      <span style="color:${s.pf>=1.2?SQ.green:s.pf>=1?SQ.amber:SQ.red};margin-left:10px">PF ${s.pf!=null?s.pf.toFixed(2):'—'}</span>`;
    const row = (s1, s2, label, col) => (s1||s2) ? `
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px;background:#0c0c0c;border-radius:5px;padding:6px 10px;border:1px solid #1a1a1a;font-size:11px">${tile(s1,label,col,'IS')}</div>
        <div style="flex:1;min-width:200px;background:#0c0c0c;border-radius:5px;padding:6px 10px;border:1px solid #1a1a1a;font-size:11px">${tile(s2,label,col,'HO')}</div>
      </div>` : '';
    lsWrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
      ${row(isLstats, hoLstats, '▲ Long',  SQ.green)}
      ${row(isSstats, hoSstats, '▼ Short', SQ.red)}
    </div>`;
  }

  // ── 6. Trade Direction Timeline ──────────────────────────────────────────────
  const dirChartEl = document.getElementById('ml-direction-chart');
  if (dirChartEl && (tradesIS.length || (tradesHO && tradesHO.length))) {
    if (_mlDirectionChart) { _mlDirectionChart.destroy(); _mlDirectionChart = null; }

    // Build a continuous bar-by-bar position series from IS + HO trades
    const allTrades6 = [
      ...(tradesIS  || []).map(t => ({...t, _seg: 'is'})),
      ...(tradesHO  || []).map(t => ({...t, _seg: 'ho'})),
    ].sort((a,b) => a.entry_date.localeCompare(b.entry_date));

    // Collect all dates
    const allDatesSet = new Set();
    allTrades6.forEach(t => { allDatesSet.add(t.entry_date); if (t.exit_date) allDatesSet.add(t.exit_date); });
    const allDates6 = [...allDatesSet].sort();

    // Build position value per date: 1 = long, -1 = short, 0 = flat
    const posMap = {};
    allDates6.forEach(d => { posMap[d] = 0; });
    allTrades6.forEach(t => {
      if (!t.entry_date || !t.exit_date) return;
      const val = t.direction === 'long' ? 1 : -1;
      // Mark dates from entry to exit (exclusive of exit since that's when we close)
      let active = false;
      for (const d of allDates6) {
        if (d === t.entry_date) active = true;
        if (active) posMap[d] = val;
        if (d === t.exit_date) { active = false; break; }
      }
    });

    const posVals = allDates6.map(d => posMap[d]);
    const barColors = posVals.map(v => v > 0 ? hexA(SQ.green, 0.75) : v < 0 ? hexA(SQ.red, 0.75) : hexA(SQ.neutral, 0.35));

    // IS/HO boundary annotation
    const annotations6 = {};
    if (hoStart) {
      const hoIdx = allDates6.findIndex(d => d >= hoStart);
      if (hoIdx > 0) {
        annotations6.hoLine = {
          type: 'line', xMin: hoIdx - 0.5, xMax: hoIdx - 0.5,
          borderColor: SQ.amber, borderWidth: 1.5, borderDash: [6, 3],
          label: { content: 'HO', display: true, color: SQ.amber, font: { size: 9 }, position: 'start', backgroundColor: 'transparent' }
        };
      }
    }

    _mlDirectionChart = new Chart(dirChartEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels: allDates6,
        datasets: [{ data: posVals, backgroundColor: barColors, borderColor: 'transparent', barPercentage: 1.0, categoryPercentage: 1.0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => {
            const v = ctx.raw; const d = allDates6[ctx.dataIndex];
            return `${d}: ${v > 0 ? '▲ Long' : v < 0 ? '▼ Short' : '— Flat'}`;
          }}},
          annotation: Object.keys(annotations6).length ? { annotations: annotations6 } : undefined
        },
        scales: {
          x: { ticks: { color: SQ.muted, maxTicksLimit: 10, font: { size: 9 } }, grid: { display: false } },
          y: {
            min: -1.2, max: 1.2,
            ticks: { color: SQ.muted, font: { size: 9 }, callback: v => v === 1 ? '▲' : v === -1 ? '▼' : '—', stepSize: 1 },
            grid: { color: SQ.grid }, border: { display: false }
          }
        }
      }
    });
  }

  // ── v4: Score magnitude vs win rate ──────────────────────────────────────────
  const mqIS = (_mlCurrentData || {}).model_quality || {};
  const buckets = mqIS.score_buckets || [];
  const bucketsCanvas = document.getElementById('ml-score-buckets-chart');
  if (bucketsCanvas && buckets.length) {
    const bLabels = buckets.map(b => b.label);
    const bWR     = buckets.map(b => b.win_rate != null ? +(b.win_rate * 100).toFixed(1) : null);
    const bN      = buckets.map(b => b.n);
    _mlScoreBucketsChart = new Chart(bucketsCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: bLabels,
        datasets: [{
          label: 'Win Rate %',
          data: bWR,
          backgroundColor:      bWR.map(v => v == null ? hexA(SQ.neutral, 0.30) : v >= 50 ? hexA(SQ.green, 0.65) : hexA(SQ.red, 0.65)),
          borderColor:          bWR.map(v => v == null ? SQ.neutral : v >= 50 ? SQ.green : SQ.red),
          hoverBackgroundColor: bWR.map(v => v == null ? hexA(SQ.neutral, 0.55) : v >= 50 ? hexA(SQ.green, 1.0) : hexA(SQ.red, 1.0)),
          hoverBorderWidth: 2,
          borderWidth: 1, borderRadius: 3,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `Win: ${ctx.raw}%  (n=${bN[ctx.dataIndex]})` } }
        },
        scales: {
          x: { ticks: { ...axStyle, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
          y: { min: 0, max: 100, ticks: { ...axStyle, callback: v => v + '%' }, grid: gridStyle, border: { display: false } }
        }
      }
    });
  }

  // Score distribution histogram (entry_score values, colored by win/loss)
  const scoresIS = tradesIS.filter(t => t.entry_score != null);
  const scDistCanvas = document.getElementById('ml-score-dist-chart');
  if (scDistCanvas && scoresIS.length >= 3) {
    const allScores = scoresIS.map(t => t.entry_score);
    const sMin = Math.min(...allScores), sMax = Math.max(...allScores);
    const nB   = Math.min(12, Math.max(5, Math.round(Math.sqrt(allScores.length))));
    const bW   = (sMax - sMin) / nB || 0.01;
    const bins = Array.from({length: nB}, (_, i) => ({
      lo: sMin + i * bW, hi: sMin + (i + 1) * bW, wins: 0, losses: 0
    }));
    scoresIS.forEach(t => {
      const bi = Math.min(nB - 1, Math.floor((t.entry_score - sMin) / bW));
      if (t.win) bins[bi].wins++; else bins[bi].losses++;
    });
    const bLabels2 = bins.map(b => b.lo.toFixed(3));
    _mlScoreDistChart = new Chart(scDistCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: bLabels2,
        datasets: [
          { label: 'Win',  data: bins.map(b => b.wins),   backgroundColor: hexA(SQ.green, 0.65), hoverBackgroundColor: hexA(SQ.green, 1.0), stack: 'a' },
          { label: 'Loss', data: bins.map(b => b.losses), backgroundColor: hexA(SQ.red,   0.65), hoverBackgroundColor: hexA(SQ.red,   1.0), stack: 'a' },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: true, labels: { color: SQ.muted, font: { size: 9 } } } },
        scales: {
          x: { stacked: true, ticks: { ...axStyle, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
          y: { stacked: true, ticks: { ...axStyle, stepSize: 1 }, grid: gridStyle, border: { display: false } }
        }
      }
    });
  }

  // ── v4: Per-window OOS Sharpe degradation ────────────────────────────────────
  const wh = (_mlCurrentData || {}).weight_history || [];
  const whWithSharpe = wh.filter(w => w.oos_sharpe != null);
  const wSharpeCanvas = document.getElementById('ml-window-sharpe-chart');
  if (wSharpeCanvas && whWithSharpe.length >= 2) {
    const wLabels = whWithSharpe.map(w => (w.window_end || '').slice(0, 7));
    const wVals   = whWithSharpe.map(w => w.oos_sharpe);
    _mlWindowSharpeChart = new Chart(wSharpeCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: wLabels,
        datasets: [{
          data: wVals,
          borderColor: hexA(GOLD, 0.8),
          backgroundColor: hexA(GOLD, 0.06),
          fill: true, tension: 0.3,
          pointRadius: wVals.length > 20 ? 0 : 3,
          pointHoverRadius: 6,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `OOS Sharpe: ${ctx.raw}` } },
          annotation: {
            annotations: {
              zeroLine: { type: 'line', yMin: 0, yMax: 0, borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1 }
            }
          }
        },
        scales: {
          x: { ticks: { ...axStyle, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
          y: { ticks: { ...axStyle }, grid: gridStyle, border: { display: false } }
        }
      }
    });
  }
}

// ── Regime Similarity Panel ────────────────────────────────────────────────────
function buildMLRegimePanel(d) {
  const card = document.getElementById('ml-regime-card');
  if (!card) return;

  // Only show for regime similarity models
  const isRegime = d.model_type === 'regime_similarity';
  card.style.display = isRegime ? '' : 'none';
  if (!isRegime) return;

  const regimeWeights = d.regime_weights || [];
  const regimeVars    = d.regime_vars    || {};
  const sigma         = d.sigma          || 1.5;
  const stepDays      = d.step_days      || 63;

  if (!regimeWeights.length || !regimeWeights[0].weight) {
    card.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:12px;text-align:center">Regime similarity data not available for this model variant.<br><span style="font-size:11px">Re-export via <code>export_regime_model.py</code> to populate.</span></div>';
    return;
  }

  // ── Bar chart: window weights ────────────────────────────────────────────
  const el = document.getElementById('ml-regime-chart');
  if (el) {
    if (_mlRegimeChart) { _mlRegimeChart.destroy(); _mlRegimeChart = null; }

    const labels  = regimeWeights.map(m => m.window_end || m.window_start || '');
    const weights = regimeWeights.map(m => m.weight || 0);
    const maxW    = Math.max(...weights, 0.001);

    // Color: lerp from dark grey to gold based on normalised weight
    const barColors = weights.map(w => {
      const t = w / maxW;
      const r = Math.round(40  + t * (245 - 40));
      const g = Math.round(40  + t * (165 - 40));
      const b = Math.round(40  + t * (32  - 40));
      return `rgba(${r},${g},${b},${0.4 + t * 0.6})`;
    });
    const borderColors = weights.map(w => {
      const t = w / maxW;
      return t > 0.5 ? '#f5a520' : '#333';
    });

    _mlRegimeChart = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data: weights, backgroundColor: barColors, borderColor: borderColors, borderWidth: 1, borderRadius: 2 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => {
            const m = regimeWeights[ctx.dataIndex];
            if (!m) return '';
            const z = m.macro_state_z || {};
            const lines = [`Weight: ${(m.weight * 100).toFixed(1)}%  (dist²=${m.sq_distance?.toFixed(2)})`];
            const colLabels = { macro_vix: 'VIX', macro_dxy: 'DXY', macro_us10yr: 'US10yr', macro_audusd: 'AUD/USD', macro_gold: 'Gold' };
            Object.entries(z).forEach(([k, v]) => {
              const raw = m.macro_state?.[k];
              const label = colLabels[k] || k;
              lines.push(`  ${label}: ${raw?.toFixed(1) ?? '—'}  (z=${v >= 0 ? '+' : ''}${v})`);
            });
            return lines;
          }}}
        },
        scales: {
          x: { ticks: { color: '#555', maxTicksLimit: 12, font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
          y: { ticks: { color: '#555', font: { size: 9 }, callback: v => `${(v*100).toFixed(0)}%` },
               grid: { color: '#1e1e1e' }, border: { display: false } }
        }
      }
    });
  }

  // ── Bottom: current regime vars + top windows ────────────────────────────
  const bottomEl = document.getElementById('ml-regime-bottom');
  if (!bottomEl) return;

  const colLabels = { macro_vix: 'VIX', macro_dxy: 'DXY', macro_us10yr: 'US 10yr Yield', macro_audusd: 'AUD/USD', macro_gold: 'Gold (USD)' };

  // Current regime state table
  const varRows = Object.entries(regimeVars).map(([k, v]) => {
    const label = colLabels[k] || k;
    return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #141414;font-size:12px">
      <span style="color:var(--muted)">${label}</span>
      <span style="font-family:'SF Mono','Fira Mono',monospace;color:var(--text);font-weight:600">${typeof v === 'number' ? v.toFixed(2) : v}</span>
    </div>`;
  }).join('');

  // Top 5 most similar windows
  const top5 = [...regimeWeights].sort((a, b) => b.weight - a.weight).slice(0, 5);
  const windowRows = top5.map((m, i) => {
    const wPct = (m.weight * 100).toFixed(1);
    const col  = i === 0 ? 'var(--gold)' : i <= 1 ? '#b07818' : 'var(--muted)';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #141414;font-size:12px">
      <span style="color:${col};font-family:'SF Mono','Fira Mono',monospace">${m.window_end || '—'}</span>
      <span style="color:${col};font-weight:700">${wPct}%</span>
    </div>`;
  }).join('');

  // Effective sample size
  const sumW2 = regimeWeights.reduce((s, m) => s + (m.weight || 0) ** 2, 0);
  const nEff  = sumW2 > 0 ? (1 / sumW2).toFixed(1) : '—';

  bottomEl.innerHTML = `
    <div>
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold);margin-bottom:8px">
        Current Macro State (Live — Regime Anchor)
      </div>
      ${varRows}
      <div style="margin-top:8px;font-size:11px;color:var(--muted)">
        σ = ${sigma}  ·  step = ${stepDays} bars  ·  n<sub>eff</sub> = ${nEff} effective windows
      </div>
    </div>
    <div>
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold);margin-bottom:8px">
        Most Similar Historical Windows
      </div>
      ${windowRows}
      <div style="margin-top:8px;font-size:11px;color:var(--muted)">
        These periods drove feature significance the most
      </div>
    </div>`;
}

// ── Model Info Header ──────────────────────────────────────────────────────────
function buildMLInfoHeader(d) {
  const el = document.getElementById('ml-info-grid');
  if (!el) return;
  const hoM = d.holdout || {};
  const isM = d.is_model || {};
  const totalBars = d.bars || 0;
  const hoBars    = hoM.bars || 180;
  const isBars    = totalBars - hoBars;

  // Approximate years from bar count (assume ~252 trading days/year)
  const totalYrs = (totalBars / 252).toFixed(1);
  const isYrs    = (isBars   / 252).toFixed(1);
  const hoYrs    = (hoBars   / 252).toFixed(1);

  const featTotal   = (d.features || []).length;
  const featPruned  = d.pruned_feature_count || 0;
  const featKept    = featTotal;

  function stat(label, value, muted) {
    const col = muted ? 'var(--muted)' : 'var(--text)';
    return `<div style="display:flex;flex-direction:column;gap:2px;min-width:110px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px">${label}</div>
      <div style="font-size:13px;font-weight:600;color:${col};font-family:'SF Mono','Fira Mono',monospace">${value}</div>
    </div>`;
  }

  // Format market cap: A$X.XB or A$XXXm, with as-at date
  let mktCapStr = '—';
  if (d.market_cap) {
    const cap = d.market_cap;
    const fmt = cap >= 1e9 ? `A$${(cap/1e9).toFixed(2)}B` : `A$${(cap/1e6).toFixed(0)}m`;
    mktCapStr = d.market_cap_date ? `${fmt} (${d.market_cap_date})` : fmt;
  }

  el.innerHTML = [
    stat('Data Period',   `${d.period_start} → ${d.period_end}`),
    stat('Total Bars',    `${totalBars} (${totalYrs}yr)`),
    stat('IS Period',     `${d.period_start} → ${hoM.period_start || '—'}`),
    stat('IS Bars',       `${isBars} (${isYrs}yr)`),
    stat('HO Period',     `${hoM.period_start || '—'} → ${hoM.period_end || '—'}`),
    stat('HO Bars',       `${hoBars} (${hoYrs}yr)`),
    stat('IS Windows',    `${isM.n_windows || '—'}`),
    stat('Features Kept', `${featKept}`),
    stat('Features Pruned', `${featPruned}`),
    stat('Market Cap',    mktCapStr),
  ].join('');
}

// ── Health Check Flags ─────────────────────────────────────────────────────────
function buildMLHealthChecks(d) {
  const el = document.getElementById('ml-health-flags');
  if (!el) return;
  const tradesHO  = d.trades_ho || [];
  const isRegime  = d.model_type === 'regime_similarity';
  const tradesIS  = (isRegime && d.trades_is_regime && d.trades_is_regime.length) ? d.trades_is_regime : (d.trades_is || []);
  const allTrades = [...tradesIS, ...tradesHO];
  const hoM = d.holdout || {};
  const isM = (isRegime && d.is_model_weighted) ? d.is_model_weighted : (d.is_model || {});
  const flags = [];

  function flag(label, value, status, tip) {
    // status: 'ok' | 'warn' | 'fail' | 'info'
    const colors = { ok: '#16a34a', warn: '#b45309', fail: '#991b1b', info: '#1d4ed8' };
    const icons  = { ok: '✓', warn: '~', fail: '✕', info: 'ℹ' };
    const bgs    = { ok: 'rgba(22,163,74,0.1)', warn: 'rgba(180,83,9,0.1)', fail: 'rgba(153,27,27,0.1)', info: 'rgba(29,78,216,0.1)' };
    const col = colors[status] || colors.info;
    const bg  = bgs[status]   || bgs.info;
    return `<div data-tip="${tip}" style="display:inline-flex;align-items:center;gap:5px;background:${bg};border:1px solid ${col}33;border-radius:4px;padding:4px 10px;font-size:11px;cursor:default">
      <span style="color:${col};font-weight:700">${icons[status]}</span>
      <span style="color:var(--muted)">${label}:</span>
      <span style="color:${col};font-weight:600;font-family:'SF Mono','Fira Mono',monospace">${value}</span>
    </div>`;
  }

  // 1. Data sufficiency — need at least 3yr for meaningful IS
  const totalYrs = (d.bars || 0) / 252;
  if      (totalYrs >= 5)  flags.push(flag('Data', `${totalYrs.toFixed(1)}yr`, 'ok',  'At least 5yr of data — good for walk-forward.'));
  else if (totalYrs >= 3)  flags.push(flag('Data', `${totalYrs.toFixed(1)}yr`, 'warn','3–5yr data: IS windows may be thin.'));
  else                      flags.push(flag('Data', `${totalYrs.toFixed(1)}yr`, 'fail','Less than 3yr — insufficient for reliable walk-forward.'));

  // 2. Liquidity — % non-zero return trades in HO
  if (tradesHO.length >= 3) {
    const nonZero = tradesHO.filter(t => Math.abs(t.return_pct || 0) > 0.001).length;
    const pct = nonZero / tradesHO.length * 100;
    if      (pct >= 90) flags.push(flag('Liquidity', `${pct.toFixed(0)}%`, 'ok',   'Proportion of HO trades with non-zero returns. >90% = liquid.'));
    else if (pct >= 70) flags.push(flag('Liquidity', `${pct.toFixed(0)}%`, 'warn', 'Some zero-return trades — check stock liquidity.'));
    else                 flags.push(flag('Liquidity', `${pct.toFixed(0)}%`, 'fail', 'Many zero-return trades — stock may be illiquid. Results unreliable.'));
  }

  // 3. Thrashing — avg hold bars in HO (short = churning)
  if (tradesHO.length >= 3) {
    const avgHold = tradesHO.reduce((a,t) => a + (t.bars || 0), 0) / tradesHO.length;
    if      (avgHold >= 8)  flags.push(flag('Avg Hold (HO)', `${avgHold.toFixed(1)} bars`, 'ok',   'Average bars held per HO trade. <4 = thrashing.'));
    else if (avgHold >= 4)  flags.push(flag('Avg Hold (HO)', `${avgHold.toFixed(1)} bars`, 'warn', 'Short average hold — marginal thrashing risk.'));
    else                     flags.push(flag('Avg Hold (HO)', `${avgHold.toFixed(1)} bars`, 'fail', 'Very short hold — model is thrashing. Signals likely noise.'));
  }

  // 4. IS windows — need ≥10 for statistical confidence
  const nWin = isM.n_windows || 0;
  if      (nWin >= 10) flags.push(flag('IS Windows', `${nWin}`, 'ok',   '≥10 walk-forward windows — statistically robust.'));
  else if (nWin >= 6)  flags.push(flag('IS Windows', `${nWin}`, 'warn', '6–9 windows — moderate confidence.'));
  else                  flags.push(flag('IS Windows', `${nWin}`, 'fail', '<6 windows — very few samples, low confidence.'));

  // 5. Overfit gap — IS vs HO Sharpe delta
  const isShr = isM.sharpe || 0;
  const hoShr = hoM.sharpe || 0;
  const shrDelta = isShr - hoShr;
  if      (shrDelta < 0.3) flags.push(flag('IS→HO Gap', `${shrDelta.toFixed(2)} Sharpe`, 'ok',   'Small IS→HO Sharpe drop — low overfit risk.'));
  else if (shrDelta < 0.8) flags.push(flag('IS→HO Gap', `${shrDelta.toFixed(2)} Sharpe`, 'warn', 'Moderate performance degradation from IS to holdout.'));
  else                      flags.push(flag('IS→HO Gap', `${shrDelta.toFixed(2)} Sharpe`, 'fail', 'Large IS→HO gap — likely overfit. Do not trade.'));

  // 6. HO trade count — need enough trades for meaningful stats
  const nHO = tradesHO.length;
  if      (nHO >= 15) flags.push(flag('HO Trades', `${nHO}`, 'ok',   '≥15 HO trades — enough for meaningful stats.'));
  else if (nHO >= 8)  flags.push(flag('HO Trades', `${nHO}`, 'warn', '8–14 HO trades — borderline sample size.'));
  else                 flags.push(flag('HO Trades', `${nHO}`, 'fail', '<8 HO trades — too few to measure edge reliably.'));

  el.innerHTML = flags.join('');
}

// ── Trade Log Table ────────────────────────────────────────────────────────────
function buildMLTradeLog(trades, tab) {
  const card    = document.getElementById('ml-trade-log-card');
  const tbody   = document.getElementById('ml-trade-log-tbody');
  const summary = document.getElementById('ml-trade-log-summary');
  if (!card || !tbody) return;

  const isHO = tab === 'ho';
  const rowHoverBg = isHO ? '#1e2a1a' : '#1a2030';
  const activeBg   = isHO ? '#1a2a1a' : '#1e2d1e';

  if (!trades || trades.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="padding:16px;text-align:center;color:#6b7280;font-size:12px">${isHO ? 'No holdout trades available.' : 'No trades.'}</td></tr>`;
    if (summary) summary.innerHTML = '';
    card.style.display = '';
    return;
  }
  card.style.display = '';

  const wins   = trades.filter(t => t.win).length;
  const losses = trades.length - wins;
  const totRet = trades.reduce((a,t) => a + t.return_pct, 0);
  const badge  = isHO ? '<span style="background:#34d39922;color:#34d399;border:1px solid #34d399;border-radius:3px;padding:1px 6px;font-size:10px;margin-right:6px">HO</span>' : '';
  if (summary) summary.innerHTML = `${badge}<span style="color:#00ff41">${wins}W</span> / <span style="color:#ff6b6b">${losses}L</span> &nbsp;·&nbsp; Total: <span style="color:${totRet>=0?'#00ff41':'#ff6b6b'}">${totRet>=0?'+':''}${totRet.toFixed(2)}%</span>`;

  tbody.innerHTML = trades.map((t, i) => {
    const dirColor = t.direction === 'long' ? (isHO ? '#34d399' : '#4fc3f7') : (isHO ? '#fb923c' : '#ff6b6b');
    const dirIcon  = t.direction === 'long' ? '▲' : '▼';
    const retColor = t.win ? '#00ff41' : '#ff6b6b';
    const wl       = t.win ? '<span style="color:#00ff41">✓ W</span>' : '<span style="color:#ff2020">✗ L</span>';
    const bg       = isHO ? (i%2===0?'#0a1210':'#0c150d') : (i%2===0?'#0d0d0d':'transparent');
    return `<tr data-entry="${t.entry_date}" data-exit="${t.exit_date}"
      onclick="mlZoomToTrade(this,'${t.entry_date}','${t.exit_date}')"
      style="border-bottom:1px solid #1e1e1e;background:${bg};cursor:pointer"
      onmouseover="this.style.background='${rowHoverBg}'" onmouseout="if(!this.classList.contains('ml-trade-active'))this.style.background='${bg}'">
      <td style="padding:5px 8px;color:var(--muted)">${i+1}</td>
      <td style="padding:5px 8px;font-family:monospace;font-size:11px">${t.entry_date}</td>
      <td style="padding:5px 8px;font-family:monospace;font-size:11px">${t.exit_date}</td>
      <td style="padding:5px 8px;color:${dirColor};font-weight:700">${dirIcon} ${t.direction}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace;font-size:11px">$${(t.entry_price||0).toFixed(3)}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace;font-size:11px">$${(t.exit_price||0).toFixed(3)}</td>
      <td style="padding:5px 8px;text-align:right;color:var(--muted)">${t.bars}</td>
      <td style="padding:5px 8px;text-align:right;font-weight:700;color:${retColor}">${t.return_pct>=0?'+':''}${t.return_pct.toFixed(2)}%</td>
      <td style="padding:5px 8px;text-align:center">${wl}</td>
    </tr>`;
  }).join('');
}

// ── Trade zoom: click row → zoom + highlight trade on price chart ─────────────
function _mlClearTradeHighlight() {
  if (!_mlPriceChart) return;
  _mlPriceChart.data.datasets[10].data = [];
  _mlPriceChart.data.datasets[11].data = [];
  _mlPriceChart.update('none');
}

function mlZoomToTrade(row, entryDate, exitDate) {
  // Deactivate previous row
  if (_mlActiveTradeRow && _mlActiveTradeRow !== row) {
    _mlActiveTradeRow.classList.remove('ml-trade-active');
    _mlActiveTradeRow.style.background = _mlActiveTradeRow._origBg || '';
  }
  // Toggle: click same row again → deselect
  if (_mlActiveTradeRow === row) {
    row.classList.remove('ml-trade-active');
    row.style.background = row._origBg || '';
    _mlActiveTradeRow = null;
    if (_mlPriceChart) { _mlPriceChart.resetZoom(); _mlClearTradeHighlight(); }
    return;
  }
  row._origBg = row.style.background;
  row.classList.add('ml-trade-active');
  row.style.background = '#1e2d1e';
  _mlActiveTradeRow = row;

  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  if (!_mlPriceChart || !_mlPriceLabels.length) return;

  // Highlight entry ring (dataset 6) and exit ring (dataset 7)
  const entryY = _mlPriceDateToY[entryDate];
  const exitY  = _mlPriceDateToY[exitDate];
  _mlPriceChart.data.datasets[10].data = entryY != null ? [{x: entryDate, y: entryY}] : [];
  _mlPriceChart.data.datasets[11].data = exitY  != null ? [{x: exitDate,  y: exitY}]  : [];
  _mlPriceChart.update('none');

  // Zoom to trade window
  const ei = _mlPriceLabels.indexOf(entryDate);
  const xi = _mlPriceLabels.indexOf(exitDate);
  if (ei < 0) return;
  const tradeLen = xi >= 0 ? xi - ei : 0;
  const pad = Math.max(20, Math.round(tradeLen * 0.6) + 15);
  const minIdx = Math.max(0, ei - pad);
  const maxIdx = Math.min(_mlPriceLabels.length - 1, (xi >= 0 ? xi : ei) + pad);
  _mlPriceChart.zoomScale('x', { min: minIdx, max: maxIdx }, 'none');
}

let _mlFeatFilter = 'all';
function mlFilterFeats(cat) {
  _mlFeatFilter = cat;
  document.querySelectorAll('#ml-cat-filters .ml-sort-btn').forEach(b => b.classList.remove('ml-sort-active'));
  const btn = document.getElementById('ml-cat-' + cat);
  if (btn) btn.classList.add('ml-sort-active');
  buildMLFeatChart(_mlCurrentFeatures, cat);
}

function buildMLFeatChart(features, filterCat) {
  const el = document.getElementById('ml-feat-chart');
  if (!el) return;
  const ctx = el.getContext('2d');
  if (_mlFeatChart) _mlFeatChart.destroy();
  let feats = [...features];
  if (filterCat !== 'all') feats = feats.filter(f => f.category === filterCat);
  feats = feats.slice(0, 20);
  // Dynamically size container: 28px per bar + 40px header/footer
  const wrap = document.getElementById('ml-feat-chart-wrap');
  if (!wrap) return;
  wrap.style.height = Math.max(280, feats.length * 28 + 40) + 'px';
  const labels = feats.map(f => f.name.replace('ann_', '★ ann_'));
  const vals   = feats.map(f => +(f.avg_weight * 1000).toFixed(4));
  const colors = feats.map(f => (_ML_CAT_COLORS[f.category] || '#4b5563') + 'cc');
  const borders= feats.map(f =>  _ML_CAT_COLORS[f.category] || '#4b5563');
  const max = Math.max(...vals, 0.001);
  _mlFeatChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderColor: borders, borderWidth: 1, borderRadius: 3, barThickness: 18 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 10 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => {
          const f = feats[c.dataIndex];
          const instLabel = f.stability < 1 ? '✓ stable' : f.stability < 2 ? '~ moderate' : '⚠ unstable';
          return [` Weight ×1k: ${c.raw.toFixed(3)}`, ` Rank: #${f.rank} / ${features.length}`,
                  ` Category: ${f.category}`, ` Instability: ${f.stability.toFixed(2)}  ${instLabel}`];
        }}}
      },
      scales: {
        x: { grid:{color:'#1e1e1e'}, ticks:{color:'#6b7060', font:{size:10}}, max: max * 1.18,
             title:{display:true, text:'Avg |weight| × 1000', color:'#5a5040', font:{size:10}} },
        y: { grid:{display:false},
             ticks:{ color:'#c8b89a', font:{size:11}, padding:6,
               callback: (val, idx) => {
                 const lbl = labels[idx] || '';
                 return lbl.length > 28 ? lbl.slice(0, 27) + '…' : lbl;
               }
             }
           }
      }
    }
  });
}

function buildAnnTable(features) {
  const annFeats = features.filter(f => f.category === 'announcement');
  const wrap = document.getElementById('ml-ann-table-wrap');
  if (!wrap) return;
  if (!annFeats.length) { wrap.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px">No announcement features in model (no announcement data for this ticker).</div>'; return; }
  const rows = annFeats.map(f => {
    const wc = f.avg_signed >= 0 ? 'var(--green)' : 'var(--red)';
    const rc = f.rank <= 20 ? 'var(--green)' : f.rank <= 35 ? SQ.amber : 'var(--muted)';
    const instC = f.stability < 1 ? 'var(--green)' : f.stability < 2 ? SQ.amber : 'var(--red)';
    const nameClean = f.name.replace('ann_','').replace(/_/g,' ');
    return `<tr style="border-bottom:1px solid rgba(0,255,136,0.08)">
      <td style="padding:7px 10px;font-weight:600;color:var(--gold)">${f.name}</td>
      <td style="padding:7px 10px;font-size:12px;color:#9ca3af">${nameClean}</td>
      <td style="padding:7px 10px;text-align:right;font-family:monospace;color:${rc};font-weight:600">#${f.rank}</td>
      <td style="padding:7px 10px;text-align:right;font-family:monospace">${(f.avg_weight*1000).toFixed(3)}</td>
      <td style="padding:7px 10px;text-align:right;font-family:monospace;color:${wc}">${f.avg_signed >= 0 ? '+' : ''}${(f.avg_signed*1000).toFixed(3)}</td>
      <td style="padding:7px 10px;text-align:right;font-family:monospace;color:${instC}">${f.stability.toFixed(2)}</td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="color:var(--muted);border-bottom:1px solid var(--border);font-size:11px;text-transform:uppercase">
      <th style="text-align:left;padding:6px 10px">Feature</th>
      <th style="text-align:left;padding:6px 10px">Description</th>
      <th style="text-align:right;padding:6px 10px">Rank</th>
      <th style="text-align:right;padding:6px 10px" title="Average absolute weight ×1000">Avg |W| ×1k</th>
      <th style="text-align:right;padding:6px 10px" title="Average signed weight ×1000. + = bullish predictor.">Avg Signed ×1k</th>
      <th style="text-align:right;padding:6px 10px" title="Weight instability across windows. >2 = unreliable.">Instability</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── t-test helpers (one-sample, H0=0, two-tailed) ─────────────────────────────
function _lgamma(x) {
  const c = [76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.001208650973866179,-5.395239384953e-6];
  let y = x, tmp = x + 5.5, ser = 1.000000000190015;
  tmp = (x + 0.5) * Math.log(tmp) - tmp;
  for (let j=0; j<6; j++) { y++; ser += c[j]/y; }
  return tmp + Math.log(2.5066282746310005 * ser / x);
}
function _betaInc(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const lbeta = _lgamma(a) + _lgamma(b) - _lgamma(a+b);
  const prefix = Math.exp(a*Math.log(x) + b*Math.log(1-x) - lbeta) / a;
  let C=1, D=1-(a+b)*x/(a+1); if(Math.abs(D)<1e-30)D=1e-30; D=1/D; let res=D;
  for (let m=1; m<=150; m++) {
    let am = m*(b-m)*x/((a+2*m-1)*(a+2*m));
    D=1+am*D; if(Math.abs(D)<1e-30)D=1e-30; D=1/D; C=1+am/C; if(Math.abs(C)<1e-30)C=1e-30; res*=C*D;
    am=-(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1));
    D=1+am*D; if(Math.abs(D)<1e-30)D=1e-30; D=1/D; C=1+am/C; if(Math.abs(C)<1e-30)C=1e-30; res*=C*D;
    if(Math.abs(C*D-1)<1e-10) break;
  }
  return prefix * res;
}
function _tPval(vals) {
  const n = vals.length;
  if (n < 3) return 1.0;
  const mean = vals.reduce((a,b)=>a+b,0)/n;
  const s2 = vals.reduce((a,b)=>a+(b-mean)**2,0)/(n-1);
  if (s2 < 1e-20) return mean===0 ? 1.0 : 0.001;
  const t = Math.abs(mean)/Math.sqrt(s2/n);
  const df = n-1;
  return Math.min(1, 2 * 0.5 * _betaInc(df/(df+t*t), df/2, 0.5));
}

// Extended palette: 6 fixed + 6 extras for user-added features
const _STAB_PALETTE = ['#00ff41','#00c832',SQ.amber,SQ.amber,'#ff2020','#ff6b6b',
                       '#38bdf8','#7dd3fc','#c084fc','#e879f9','#fb923c','#a3e635'];

function _mlStabSyncButtons() {
  ['weight','cum_avg','cum_pval'].forEach(k => {
    const b = document.getElementById(`ml-stab-m-${k}`);
    if (!b) return;
    const on = _mlStabShow[k];
    b.style.background  = on ? '#f59e0b22' : 'transparent';
    b.style.color       = on ? SQ.amber   : '#6b7280';
    b.style.borderColor = on ? SQ.amber   : '#374151';
    b.style.opacity     = on ? '1'         : '0.45';
  });
}

function mlStabToggle(m) {
  _mlStabShow[m] = !_mlStabShow[m];
  _mlStabSyncButtons();
  _mlStabApplyMetricVisibility();
}

function mlStabAdd(name) {
  const top6names = _mlCurrentFeatures.slice(0,6).map(f=>f.name);
  if (top6names.includes(name) || _mlStabAdded.find(s=>s.name===name)) return;
  _mlStabAdded.push({ name, slotIdx: 6 + _mlStabAdded.length });
  buildMLStabilityChart(_mlCurrentFeatures, _mlCurrentWH);
}

function mlStabRemove(name) {
  _mlStabAdded = _mlStabAdded.filter(s=>s.name!==name);
  _mlStabAdded.forEach((s,i) => s.slotIdx = 6+i);
  buildMLStabilityChart(_mlCurrentFeatures, _mlCurrentWH);
}

function mlStabSearchUpdate(val) {
  const drop = document.getElementById('ml-stab-drop');
  if (!drop) return;
  if (!val) { drop.style.display='none'; return; }
  const top6 = _mlCurrentFeatures.slice(0,6).map(f=>f.name);
  const added = _mlStabAdded.map(s=>s.name);
  const matches = _mlCurrentFeatures
    .filter(f => !top6.includes(f.name) && !added.includes(f.name) && f.name.toLowerCase().includes(val.toLowerCase()))
    .slice(0, 10);
  if (!matches.length) { drop.style.display='none'; return; }
  drop.innerHTML = matches.map(f => {
    const col = _ML_CAT_COLORS[f.category]||'#aaa';
    return `<div onmousedown="mlStabAdd('${f.name}')" style="padding:5px 10px;cursor:pointer;font-size:10px;font-family:monospace;color:${col};display:flex;justify-content:space-between;align-items:center">
      <span>${f.name.replace('ann_','★ ')}</span>
      <span style="color:#555;font-size:9px">#${f.rank}</span>
    </div>`;
  }).join('');
  drop.style.display = '';
}

// ── Weight Cross-Correlation Panel ───────────────────────────────────────────
let _mlWeightCorrChart = null;

// Pearson of two equal-length arrays
function _pearsonArr(xs, ys) {
  const n = xs.length;
  if (n < 4) return null;
  const mx = xs.reduce((a,b)=>a+b,0)/n, my = ys.reduce((a,b)=>a+b,0)/n;
  let num=0,dx2=0,dy2=0;
  for(let i=0;i<n;i++){num+=(xs[i]-mx)*(ys[i]-my);dx2+=(xs[i]-mx)**2;dy2+=(ys[i]-my)**2;}
  const d=Math.sqrt(dx2*dy2); return d<1e-10?null:+(num/d).toFixed(3);
}

// Full-history Pearson between two feature weight series
function _pearsonWeights(nameA, nameB, wh) {
  const xs=[],ys=[];
  wh.forEach(w=>{const a=(w.weights||{})[nameA],b=(w.weights||{})[nameB];if(a!=null&&b!=null){xs.push(a);ys.push(b);}});
  return _pearsonArr(xs,ys);
}

// Rolling Pearson of two pre-extracted series (null-safe)
function _rollingPearson(sA, sB, roll) {
  return sA.map((_,idx)=>{
    const xs=[],ys=[];
    for(let k=Math.max(0,idx-roll+1);k<=idx;k++){if(sA[k]!=null&&sB[k]!=null){xs.push(sA[k]);ys.push(sB[k]);}}
    return _pearsonArr(xs,ys);
  });
}

// Cosine similarity between two weight dicts
function _cosineSim(wA, wB) {
  const keys=Object.keys(wA);
  let dot=0,nA=0,nB=0;
  keys.forEach(k=>{const a=wA[k]||0,b=wB[k]||0;dot+=a*b;nA+=a*a;nB+=b*b;});
  const d=Math.sqrt(nA)*Math.sqrt(nB); return d<1e-10?0:dot/d;
}

function buildWeightCorrPanel(features, wh) {
  const el      = document.getElementById('ml-wcorr-body');
  const strip   = document.getElementById('ml-wcorr-regime-strip');
  const legend  = document.getElementById('ml-wcorr-regime-legend');
  const toggles = document.getElementById('ml-wcorr-toggles');
  const ctxEl   = document.getElementById('ml-wcorr-chart');

  if (_mlWeightCorrChart) { _mlWeightCorrChart.destroy(); _mlWeightCorrChart=null; }
  if (toggles) toggles.innerHTML='';
  if (strip)   strip.innerHTML='';
  if (legend)  legend.innerHTML='';

  if (!el) return;
  if (!wh.length || features.length < 2) {
    el.innerHTML='<div style="color:var(--muted);font-size:12px;padding:12px 0">Insufficient windows for weight correlation.</div>';
    return;
  }

  // Sort windows by date
  const sorted = [...wh].sort((a,b)=>(a.window_end||'').localeCompare(b.window_end||''));
  const dates  = sorted.map(w=>w.window_end||w.train_start||'');
  const n      = sorted.length;

  // ── All-history pairwise correlations ──────────────────────────────────────
  const pairs=[];
  for(let i=0;i<features.length;i++)
    for(let j=i+1;j<features.length;j++){
      const r=_pearsonWeights(features[i].name,features[j].name,sorted);
      if(r!==null) pairs.push({a:features[i],b:features[j],r});
    }
  pairs.sort((x,y)=>Math.abs(y.r)-Math.abs(x.r));

  const topPairs = pairs.filter(p=>Math.abs(p.r)>=0.40).slice(0,6);

  // ── Regime detection — cosine similarity between consecutive windows ────────
  const REGIME_COLORS = [
    'rgba(245,165,32,0.55)',   // amber
    'rgba(99,102,241,0.55)',   // indigo
    'rgba(34,211,238,0.55)',   // cyan
    'rgba(239,68,68,0.55)',    // red
    'rgba(52,211,153,0.55)',   // green
  ];
  const REGIME_NAMES = ['Regime A','Regime B','Regime C','Regime D','Regime E'];
  const TRANSITION_THRESH = 0.25;

  const sims = sorted.map((w,i)=>i===0?1:_cosineSim(w.weights||{},sorted[i-1].weights||{}));
  let regime=0;
  const regimeIdx = sims.map((s,i)=>{ if(i>0&&s<TRANSITION_THRESH) regime=(regime+1)%REGIME_COLORS.length; return regime; });

  // Regime strip (one coloured block per window, positioned by date)
  if (strip && n>0) {
    const t0=new Date(dates[0]).getTime(), t1=new Date(dates[n-1]).getTime(), span=t1-t0||1;
    sorted.forEach((w,i)=>{
      const ws = w.window_start||w.train_start;
      if(!ws||!w.window_end) return;
      const l=((new Date(ws).getTime()-t0)/span*100).toFixed(2);
      const ww=((new Date(w.window_end).getTime()-new Date(ws).getTime())/span*100).toFixed(2);
      const div=document.createElement('div');
      div.title=`${ws} → ${w.window_end}  sim=${sims[i].toFixed(2)}  ${REGIME_NAMES[regimeIdx[i]]}`;
      div.style.cssText=`position:absolute;left:${l}%;width:${ww}%;height:100%;background:${REGIME_COLORS[regimeIdx[i]]};box-sizing:border-box;${sims[i]<TRANSITION_THRESH?'border-left:2px solid #fff3':''}`;
      strip.appendChild(div);
    });
    // Count windows per regime
    const regimeCounts={};
    regimeIdx.forEach(r=>regimeCounts[r]=(regimeCounts[r]||0)+1);
    if(legend) legend.innerHTML=Object.entries(regimeCounts).map(([r,c])=>
      `<span><span style="display:inline-block;width:10px;height:10px;background:${REGIME_COLORS[r]};border-radius:2px;margin-right:4px;vertical-align:middle"></span>${REGIME_NAMES[r]}: ${c} windows</span>`
    ).join('') + `<span style="color:#555;font-size:10px">· White line = transition (cosine sim &lt; ${TRANSITION_THRESH})</span>`;
  }

  // ── Line chart — rolling correlation per pair ─────────────────────────────
  const ROLL   = Math.max(6, Math.floor(n/8));
  const COLORS = Array.from({length:6},(_,i)=>sqColor(i));

  if (ctxEl && topPairs.length) {
    function fmtShort(name){ return name.replace('macro_','').replace('ann_','★').replace(/_z$/,'ᶻ').replace('_mom','↑'); }
    function catC(f){ return _ML_CAT_COLORS[f.category]||'#4b5563'; }

    const datasets = topPairs.map((p,i)=>{
      const sA=sorted.map(w=>(w.weights||{})[p.a.name]??null);
      const sB=sorted.map(w=>(w.weights||{})[p.b.name]??null);
      return {
        label:  `${fmtShort(p.a.name)} ↔ ${fmtShort(p.b.name)}`,
        _pair:  p,
        data:   _rollingPearson(sA,sB,ROLL),
        borderColor: COLORS[i%COLORS.length],
        backgroundColor:'transparent',
        borderWidth:1.5, pointRadius:2, tension:0.3, spanGaps:true,
      };
    });

    // Zero reference line
    datasets.push({label:'── zero',data:dates.map(()=>0),borderColor:'#333',borderDash:[4,4],borderWidth:1,pointRadius:0,spanGaps:true});

    _mlWeightCorrChart = new Chart(ctxEl.getContext('2d'),{
      type:'line',
      data:{labels:dates,datasets},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:c=>{
            if(c.dataset.label==='── zero') return null;
            const v=c.raw; if(v==null) return null;
            const type=v<-0.3?'substitute':v>0.3?'co-driver':'neutral';
            return ` ${c.dataset.label}: r=${v.toFixed(2)} (${type})`;
          }}}
        },
        scales:{
          x:{grid:{color:SQ.grid},ticks:{color:SQ.muted,font:{size:9},maxTicksLimit:8}},
          y:{min:-1,max:1,grid:{color:SQ.grid},ticks:{color:SQ.muted,font:{size:9},callback:v=>v.toFixed(1)},
             title:{display:true,text:'Weight correlation (rolling)',color:'#555',font:{size:9}}},
        }
      }
    });

    // Toggle buttons per pair
    if(toggles) {
      toggles.innerHTML='<span style="font-size:10px;color:var(--muted)">Pairs:</span>';
      topPairs.forEach((p,i)=>{
        const color=COLORS[i%COLORS.length];
        const btn=document.createElement('button');
        btn.dataset.active='true';
        btn.style.cssText=`display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:4px;border:1px solid ${color};background:${color}22;color:${color};font-size:10px;font-family:monospace;font-weight:600;cursor:pointer;transition:opacity 0.15s,background 0.15s;`;
        btn.innerHTML=`<span style="display:inline-block;width:12px;height:1.5px;background:${color};flex-shrink:0"></span>${fmtShort(p.a.name)} ↔ ${fmtShort(p.b.name)}`;
        btn.onclick=()=>{
          const active=btn.dataset.active==='true';
          const next=!active;
          btn.dataset.active=String(next);
          btn.style.background=next?`${color}22`:'transparent';
          btn.style.opacity=next?'1':'0.35';
          _mlWeightCorrChart.setDatasetVisibility(i,next);
          _mlWeightCorrChart.update();
        };
        toggles.appendChild(btn);
      });
      // Add rolling window note
      const note=document.createElement('span');
      note.style.cssText='font-size:9px;color:#555;align-self:center;margin-left:6px';
      note.textContent=`rolling ${ROLL}-window`;
      toggles.appendChild(note);
    }
  } else if(ctxEl) {
    ctxEl.parentElement.innerHTML='<div style="color:var(--muted);font-size:12px;padding:20px">No pairs with |r| ≥ 0.40 found.</div>';
  }

  // ── Static summary table ──────────────────────────────────────────────────
  function fmtName(n){ return n.replace('ann_','★ ').replace('macro_','').replace('_mom','↑').replace('_chg','Δ').replace('_z','ᶻ'); }
  function catColor(f){ return _ML_CAT_COLORS[f.category]||'#4b5563'; }

  const substitutes=pairs.filter(p=>p.r<=-0.45);
  const codrivers=pairs.filter(p=>p.r>=0.55);

  function pairRow(p,type){
    const bw=Math.abs(p.r)*100, bc=type==='sub'?'#f87171':'#34d399';
    const story=type==='sub'
      ?`When <b style="color:${catColor(p.a)}">${fmtName(p.a.name)}</b> rises, <b style="color:${catColor(p.b)}">${fmtName(p.b.name)}</b> falls — same driver, model picks one per window`
      :`<b style="color:${catColor(p.a)}">${fmtName(p.a.name)}</b> and <b style="color:${catColor(p.b)}">${fmtName(p.b.name)}</b> consistently rewarded together — independent signals`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #111">
      <div style="width:36px;flex-shrink:0;font-family:monospace;font-size:11px;color:${bc};text-align:right">${p.r.toFixed(2)}</div>
      <div style="flex:1"><div style="font-size:11px;margin-bottom:3px">${story}</div>
        <div style="height:4px;background:#1a1a1a;border-radius:2px"><div style="height:100%;width:${bw}%;background:${bc};border-radius:2px;opacity:0.6"></div></div>
      </div></div>`;
  }

  let html='';
  if(substitutes.length){html+=`<div style="font-size:9px;color:#f87171;text-transform:uppercase;letter-spacing:0.6px;margin:14px 0 6px">Substitutes (weight r ≤ −0.45)</div>`;html+=substitutes.map(p=>pairRow(p,'sub')).join('');}
  if(codrivers.length){html+=`<div style="font-size:9px;color:#34d399;text-transform:uppercase;letter-spacing:0.6px;margin:14px 0 6px">Co-drivers (weight r ≥ +0.55)</div>`;html+=codrivers.map(p=>pairRow(p,'co')).join('');}
  if(!substitutes.length&&!codrivers.length) html='<div style="color:var(--muted);font-size:12px;padding:12px 0">No strongly correlated weight pairs — features pulling independently.</div>';
  el.innerHTML=html;
}

// ── Data Coverage Timeline ────────────────────────────────────────────────────
function buildDataTimeline(d) {
  const el = document.getElementById('ml-timeline-body');
  if (!el) return;

  const wh = d.weight_history || [];
  if (!wh.length || !d.period_start || !d.period_end) {
    el.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:12px 0">No timeline data.</div>';
    return;
  }

  const t0   = new Date(d.period_start).getTime();
  const t1   = new Date(d.period_end).getTime();
  const span = t1 - t0 || 1;

  function left(dateStr)        { return ((new Date(dateStr).getTime() - t0) / span * 100).toFixed(2); }
  function width(s, e)          { return ((new Date(e).getTime()  - new Date(s).getTime()) / span * 100).toFixed(2); }
  function fmtD(dateStr)        { return dateStr ? dateStr.slice(0,7) : ''; }
  function bar(l, w, bg, title) {
    return `<div title="${title}" style="position:absolute;left:${l}%;width:${w}%;height:100%;background:${bg};border-radius:2px;box-sizing:border-box"></div>`;
  }

  const hoStart = (d.holdout || {}).period_start;
  const hoEnd   = (d.holdout || {}).period_end;

  // ── Row helper ──
  function row(label, content) {
    return `<div style="display:flex;align-items:center;margin-bottom:7px;gap:10px">
      <div style="width:110px;flex-shrink:0;font-size:10px;color:var(--muted);text-align:right;white-space:nowrap">${label}</div>
      <div style="flex:1;position:relative;height:16px;background:#111;border-radius:3px">${content}</div>
    </div>`;
  }

  // ── Row 1: IS vs Holdout ──
  const isW  = hoStart ? width(d.period_start, hoStart) : '100';
  const hoL  = hoStart ? left(hoStart) : '100';
  const hoW  = (hoStart && hoEnd) ? width(hoStart, hoEnd) : '0';
  const r1 = bar('0', isW, 'rgba(245,165,32,0.30)', `In-sample: ${fmtD(d.period_start)} → ${fmtD(hoStart)}`)
           + (hoStart ? bar(hoL, hoW, 'rgba(0,200,50,0.35)', `Holdout: ${fmtD(hoStart)} → ${fmtD(hoEnd)}`) : '');

  // ── Row 2: Walk-forward windows (coloured by OOS Sharpe) ──
  const palette = [SQ.amber,'#00c832','#2dd4bf','#a78bfa','#f97316','#f87171','#22d3ee','#d97706','#60a5fa','#34d399'];
  const r2 = wh.map((w, i) => {
    const ws = w.window_start || w.train_start;
    if (!ws || !w.window_end) return '';
    const l = left(ws), ww = width(ws, w.window_end);
    const shr = w.oos_sharpe;
    const bg = shr == null ? '#333' : shr >= 0.5 ? 'rgba(0,200,50,0.55)' : shr >= 0 ? 'rgba(245,165,32,0.45)' : 'rgba(220,38,38,0.45)';
    return bar(l, ww, bg, `W${i+1}: ${fmtD(w.window_start)} → ${fmtD(w.window_end)}  OOS Shr=${shr != null ? shr.toFixed(2) : '—'}`);
  }).join('');

  // ── Row 3+: Feature presence per window ──
  // Build feature list (top features + any announcement features)
  const features = (d.features || []).slice(0, 20);
  const annFeats = (d.features || []).filter(f => f.category === 'announcement');
  const showFeats = features;

  const featRows = showFeats.map(f => {
    const cells = wh.map((w, i) => {
      const ws = w.window_start || w.train_start;
      if (!ws || !w.window_end) return '';
      const wt = (w.weights || {})[f.name];
      if (wt == null || wt === 0) return bar(left(ws), width(ws, w.window_end), '#1a1a1a', `${f.name} absent W${i+1}`);
      const bg = wt > 0 ? 'rgba(0,200,50,0.55)' : 'rgba(220,38,38,0.50)';
      return bar(left(ws), width(ws, w.window_end), bg, `${f.name} W${i+1}: ${wt>0?'+':''}${(wt*1000).toFixed(1)}×1k`);
    }).join('');
    const catColor = _ML_CAT_COLORS[f.category] || '#4b5563';
    const shortName = f.name.replace('ann_','★ ').replace('macro_','').replace('_mom','↑').replace('_chg','Δ');
    return `<div style="display:flex;align-items:center;margin-bottom:4px;gap:10px">
      <div style="width:110px;flex-shrink:0;font-size:9px;color:${catColor};text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${f.name}">${shortName}</div>
      <div style="flex:1;position:relative;height:10px;background:#111;border-radius:2px">${cells}</div>
    </div>`;
  }).join('');

  // ── X-axis tick labels ──
  const tickCount = Math.min(wh.length, 8);
  const step = Math.floor(wh.length / tickCount) || 1;
  const ticks = wh.filter((_, i) => i % step === 0 || i === wh.length - 1);
  const tickHtml = `<div style="display:flex;align-items:center;margin-bottom:4px;gap:10px">
    <div style="width:110px;flex-shrink:0"></div>
    <div style="flex:1;position:relative;height:14px">` +
    ticks.map(w => { const ws=w.window_start||w.train_start; return ws ? `<div style="position:absolute;left:${left(ws)}%;transform:translateX(-50%);font-size:8px;color:#555;white-space:nowrap">${fmtD(ws)}</div>` : ''; }).join('') +
    `</div></div>`;

  // ── Legend ──
  const legend = `<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:10px;color:var(--muted);margin-top:10px;padding-top:10px;border-top:1px solid #1a1a1a">
    <span><span style="display:inline-block;width:10px;height:10px;background:rgba(245,165,32,0.30);border-radius:2px;margin-right:4px;vertical-align:middle"></span>In-sample</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:rgba(0,200,50,0.35);border-radius:2px;margin-right:4px;vertical-align:middle"></span>Holdout</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:rgba(0,200,50,0.55);border-radius:2px;margin-right:4px;vertical-align:middle"></span>Window (OOS Shr ≥0.5)</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:rgba(245,165,32,0.45);border-radius:2px;margin-right:4px;vertical-align:middle"></span>Window (OOS 0–0.5)</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:rgba(220,38,38,0.45);border-radius:2px;margin-right:4px;vertical-align:middle"></span>Window (OOS <0)</span>
    <span>Feature rows: <span style="color:rgba(0,200,50,0.8)">■ positive weight</span> · <span style="color:rgba(220,38,38,0.8)">■ negative</span> · <span style="color:#333">■ absent</span></span>
  </div>`;

  el.innerHTML =
    `<div style="margin-bottom:14px">` +
      row('IS / Holdout', r1) +
      row('Walk-forward', r2) +
    `</div>` +
    `<div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Feature presence per window (top ${showFeats.length})</div>` +
    featRows +
    tickHtml +
    legend;
}

function _stabDataSeries(fname, weightHistory, metric) {
  const cum = [];
  return weightHistory.map(w => {
    const v = w.weights ? (w.weights[fname] ?? null) : null;
    if (v != null) cum.push(v);
    if (metric === 'weight')   return v != null ? +(v*1000).toFixed(4) : null;
    if (metric === 'cum_avg')  return cum.length ? +(cum.reduce((a,b)=>a+b,0)/cum.length*1000).toFixed(4) : null;
    if (metric === 'cum_pval') return cum.length >= 3 ? +_tPval(cum).toFixed(4) : null;
    return null;
  });
}

function buildMLStabilityChart(features, weightHistory) {
  const ctx = document.getElementById('ml-stability-chart').getContext('2d');
  if (_mlStabilityChart) _mlStabilityChart.destroy();
  const toggleWrap = document.getElementById('ml-stability-toggles');
  toggleWrap.innerHTML = '';

  if (!weightHistory.length || !features.length) {
    ctx.canvas.parentElement.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:20px">No weight history available.</div>';
    return;
  }

  const top6     = features.slice(0, 6);
  const allFeats = [
    ...top6.map((f,i) => ({...f, slotIdx:i})),
    ..._mlStabAdded.map(s => { const f=features.find(x=>x.name===s.name); return f?{...f,slotIdx:s.slotIdx}:null; }).filter(Boolean),
  ];
  const labels = weightHistory.map((w,i) => w.window_end || `W${i+1}`);

  // Each feature produces up to 3 datasets (one per metric), stored as flat list.
  // datasetIdx = featIdx*3 + metricOffset (0=weight,1=cum_avg,2=cum_pval)
  const REF_LABELS = new Set(['── zero','p=0.05','p=0.20']);
  const METRICS = [
    { key:'weight',   dash:[],     yAxis:'y',    label:'wt' },
    { key:'cum_avg',  dash:[6,3],  yAxis:'y',    label:'avg' },
    { key:'cum_pval', dash:[2,3],  yAxis:'yPval',label:'p' },
  ];

  const datasets = [];
  allFeats.forEach((f, fi) => {
    const color = _STAB_PALETTE[f.slotIdx % _STAB_PALETTE.length];
    METRICS.forEach((m, mi) => {
      datasets.push({
        label:           `${f.name}__${m.key}`,  // internal key, not shown
        _featName:       f.name,
        _metric:         m.key,
        _featIdx:        fi,
        data:            _stabDataSeries(f.name, weightHistory, m.key),
        borderColor:     color,
        backgroundColor: 'transparent',
        borderWidth:     1.5,
        borderDash:      m.dash,
        pointRadius:     mi === 0 ? 2 : 0,   // dots only on weight line
        tension:         0.3,
        spanGaps:        true,
        yAxisID:         m.yAxis,
        hidden:          !_mlStabShow[m.key],
      });
    });
  });

  // Reference lines
  datasets.push({ label:'── zero', data:labels.map(()=>0), borderColor:'#333', borderDash:[4,4], borderWidth:1, pointRadius:0, spanGaps:true, yAxisID:'y',     order:99 });
  datasets.push({ label:'p=0.05',  data:labels.map(()=>0.05), borderColor:'#00c83266', borderDash:[3,3], borderWidth:1, pointRadius:0, spanGaps:true, yAxisID:'yPval', order:99, hidden:!_mlStabShow.cum_pval });
  datasets.push({ label:'p=0.20',  data:labels.map(()=>0.20), borderColor:'#f59e0b66', borderDash:[3,3], borderWidth:1, pointRadius:0, spanGaps:true, yAxisID:'yPval', order:99, hidden:!_mlStabShow.cum_pval });

  _mlStabilityChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => {
              if (REF_LABELS.has(c.dataset.label)) return null;
              const v = c.raw; if (v == null) return null;
              const fname = c.dataset._featName;
              const m     = c.dataset._metric;
              if (m === 'cum_pval') return ` ${fname} p-val: ${v.toFixed(3)}${v<0.05?' ✓':v<0.20?' ~':' ✗'}`;
              return ` ${fname} ${m==='weight'?'wt':'avg'}: ${v>=0?'+':''}${v.toFixed(3)} ×1k`;
            }
          }
        }
      },
      scales: {
        x:     { grid:{color:SQ.grid}, ticks:{color:SQ.muted, font:{size:9}, maxTicksLimit:8} },
        y:     { position:'left',  grid:{color:SQ.grid}, ticks:{color:SQ.muted,font:{size:9}}, title:{display:true,text:'Weight ×1000',color:'#555',font:{size:9}} },
        yPval: { position:'right', grid:{drawOnChartArea:false}, min:0, max:1, ticks:{color:SQ.muted,font:{size:9},callback:v=>v.toFixed(2)}, title:{display:true,text:'p-value',color:'#555',font:{size:9}} },
      }
    }
  });

  // ── Feature toggle buttons (each hides/shows all 3 metric lines for that feature)
  allFeats.forEach((f, fi) => {
    const color   = _STAB_PALETTE[f.slotIdx % _STAB_PALETTE.length];
    const isAdded = f.slotIdx >= 6;
    const label   = f.name.replace('ann_','★ ');
    const btn = document.createElement('button');
    btn.dataset.featIdx = fi;
    btn.dataset.active  = 'true';
    btn.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:4px;border:1px solid ${color};background:${color}22;color:${color};font-size:10px;font-family:monospace;font-weight:600;cursor:pointer;transition:opacity 0.15s,background 0.15s;`;
    // Mini legend showing the 3 line styles
    btn.innerHTML = `
      <span style="display:inline-flex;flex-direction:column;gap:2px;margin-right:1px">
        <span style="width:12px;height:1.5px;background:${color}"></span>
        <span style="width:12px;height:1.5px;background:${color};opacity:.7;border-top:1.5px dashed ${color};height:0"></span>
        <span style="width:12px;height:0;border-top:1.5px dotted ${color};opacity:.5"></span>
      </span>
      ${label}
      ${isAdded ? `<span onmousedown="mlStabRemove('${f.name}')" style="margin-left:3px;opacity:0.6;font-size:11px">×</span>` : ''}
    `;
    btn.onclick = (e) => {
      if (e.target.textContent === '×') return;
      const active = btn.dataset.active === 'true';
      const next   = !active;
      btn.dataset.active  = String(next);
      btn.style.background = next ? `${color}22` : 'transparent';
      btn.style.opacity    = next ? '1' : '0.35';
      // Hide/show all 3 metric datasets for this feature
      datasets.forEach((ds, di) => {
        if (ds._featIdx === fi) {
          const shouldShow = next && _mlStabShow[ds._metric];
          _mlStabilityChart.setDatasetVisibility(di, shouldShow);
        }
      });
      _mlStabilityChart.update();
    };
    toggleWrap.appendChild(btn);
  });

  // Search box
  const sw = document.createElement('div');
  sw.style.cssText = 'position:relative;display:inline-flex;align-items:center';
  sw.innerHTML = `
    <input id="ml-stab-search" placeholder="+ add feature…"
      style="background:#141414;border:1px dashed #374151;color:#aaa;padding:3px 9px;border-radius:4px;font-size:10px;font-family:monospace;width:140px;outline:none"
      oninput="mlStabSearchUpdate(this.value)"
      onblur="setTimeout(()=>{const d=document.getElementById('ml-stab-drop');if(d)d.style.display='none'},200)"
      onfocus="mlStabSearchUpdate(this.value)">
    <div id="ml-stab-drop" style="display:none;position:absolute;top:calc(100%+3px);left:0;background:#141414;border:1px solid #374151;border-radius:4px;min-width:220px;max-height:220px;overflow-y:auto;z-index:200"></div>
  `;
  toggleWrap.appendChild(sw);
}

// When a metric button is toggled, update visibility of ALL matching datasets without rebuilding
function _mlStabApplyMetricVisibility() {
  if (!_mlStabilityChart) return;
  _mlStabilityChart.data.datasets.forEach((ds, di) => {
    if (ds._metric) {
      // Only show if metric is on AND the feature toggle is active
      const btn = document.querySelector(`[data-feat-idx="${ds._featIdx}"]`);
      const featOn = !btn || btn.dataset.active === 'true';
      _mlStabilityChart.setDatasetVisibility(di, _mlStabShow[ds._metric] && featOn);
    }
    // p-val reference lines
    if (ds.label === 'p=0.05' || ds.label === 'p=0.20') {
      _mlStabilityChart.setDatasetVisibility(di, _mlStabShow.cum_pval);
    }
  });
  _mlStabilityChart.update();
}

// ── Feature glossary — full name + one-line description for every feature ──────
const _FEAT_GLOSSARY = {
  // ── Momentum / Price ──────────────────────────────────────────────────────
  rsi_14:              ["RSI 14",               "Relative Strength Index (14-bar). Momentum oscillator 0–100. >70 = overbought, <30 = oversold."],
  ret_1d:              ["Return 1-day",          "Yesterday's log return. Immediate short-term price change."],
  ret_5d:              ["Return 5-day",          "5-day (1-week) log return. Short-term momentum."],
  ret_20d:             ["Return 20-day",         "20-day (1-month) log return. Medium-term trend direction."],
  ret_60d:             ["Return 60-day",         "60-day (3-month) log return. Intermediate trend."],
  ret_126d:            ["Return 126-day",        "126-day (6-month) log return. Classic momentum factor used in factor investing."],
  ret_252d:            ["Return 252-day",        "252-day (1-year) log return. Full-year price momentum."],
  price_fd_short:      ["Price Frac-Diff Short", "Fractionally-differenced log price (d=0.3). Long memory (~100-bar decay) short-term signal. Replaces ret_2d / ret_7d."],
  price_fd_long:       ["Price Frac-Diff Long",  "Fractionally-differenced log price (d=0.5). Medium memory (~50-bar decay) signal. Replaces ret_6bar."],
  close_vs_ma50:       ["Close vs MA50",         "How far today's close sits above/below the 50-day moving average, as a %. Trend positioning."],
  close_vs_ma200:      ["Close vs MA200",        "How far today's close sits above/below the 200-day moving average. Long-run trend positioning."],
  ma50_vs_ma200:       ["MA50 vs MA200",         "Gap between 50-day and 200-day MA. Positive = golden cross (uptrend), negative = death cross."],
  bb_zscore:           ["Bollinger Z-Score",     "How many standard deviations price is from its 20-day mean. +2 = upper band, −2 = lower band."],
  bb_width_20:         ["Bollinger Width",       "Width of Bollinger Bands relative to centre. High = volatile expanding range, low = tight coil before breakout."],
  donchian_pos_20:     ["Donchian Position",     "Where today's price sits in the 20-day highest-high / lowest-low channel. 1 = at the high, 0 = at the low."],
  slope_5d:            ["Price Slope 5-day",     "Linear regression slope of price over last 5 bars, normalised. Direction and steepness of very recent move."],
  slope_20d:           ["Price Slope 20-day",    "Linear regression slope of price over last 20 bars, normalised. Direction and steepness of medium-term move."],
  ma_cross_sig:        ["MA Cross Signal",       "Binary: +1 when 50-day MA is above 200-day MA (uptrend), −1 when below (downtrend). Golden/death cross detector."],
  hurst_20:            ["Hurst 20-bar",          "Hurst exponent over 20 bars. >0.5 = trending (momentum works), <0.5 = mean-reverting, =0.5 = random walk."],
  hurst_100:           ["Hurst 100-bar",         "Hurst exponent over 100 bars. Longer-term measure of whether the stock trends or oscillates."],
  eff_ratio_20:        ["Efficiency Ratio 20",   "Kaufman Efficiency Ratio (20-bar). How efficiently price moved in one direction. 1 = perfectly trended, 0 = pure noise."],
  eff_ratio_60:        ["Efficiency Ratio 60",   "Kaufman Efficiency Ratio (60-bar). Same measure over a longer horizon."],
  eff_ratio_short:     ["Efficiency Ratio Short","Efficiency Ratio short window. Captures short-horizon trend quality."],
  eff_ratio_long:      ["Efficiency Ratio Long", "Efficiency Ratio long window. Captures sustained trend quality."],
  season_score:        ["Seasonality Score",     "Gold-specific seasonal bias score based on calendar month. E.g. gold tends to be stronger in Q1."],
  season_gold:         ["Seasonality Gold",      "Gold calendar seasonality factor. Higher = historically bullish month for gold."],
  adx_14:              ["ADX 14",                "Average Directional Index (14-bar). Measures TREND STRENGTH, not direction. >25 = strong trend, <20 = ranging/choppy market."],
  trend_signed_adx:    ["Signed ADX",            "ADX × sign(+DI − −DI). Combines trend strength with direction: positive = strong uptrend, negative = strong downtrend, near zero = ranging. Fixes ADX's direction-blindness."],
  trend_regime:        ["Trend Regime",          "Composite trend label from ADX + MA alignment. Encodes whether market is trending or range-bound."],
  // ── Volatility ───────────────────────────────────────────────────────────
  atr_14_pct:          ["ATR 14 %",              "Average True Range over 14 bars as % of price. How much the stock moves day-to-day. High = bigger swings."],
  vol_fd:              ["Volatility Frac-Diff",  "Fractionally-differenced log realised volatility (d=0.4). Replaces vol_5d and vol_20d — single feature with power-law memory decay."],
  vol_ratio:           ["Vol Ratio Short/Long",  "Ratio of 5-day to 20-day realised volatility. >1 = volatility expanding (regime change), <1 = contracting (calm)."],
  vol_60d:             ["Volatility 60-day",     "Realised volatility (annualised) over 60 trading days. Medium-term vol level."],
  vol_252d:            ["Volatility 252-day",    "Realised volatility (annualised) over 1 year. The long-run baseline vol for this stock."],
  vol_z_score:         ["Volatility Z-Score",    "How unusual today's short-term vol is versus the 1-year baseline. +2 = stress event, −2 = unusually calm."],
  vol_zscore_20:       ["Volume Z-Score 20",     "How unusual today's traded VOLUME is versus its 20-day average. High = abnormal activity / news event."],
  vol_ratio_5_20:      ["Volume Ratio 5/20",     "5-day average volume divided by 20-day average volume. >1 = volume picking up, <1 = drying up."],
  vol_trend_60d:       ["Volume Trend 60-day",   "Normalised slope of volume over 60 days. Is liquidity structurally growing or shrinking in this stock?"],
  vol_cv_20d:          ["Volume CV 20-day",      "Coefficient of variation of volume (std/mean). High = erratic volume pattern, often signals informed trading."],
  // ── Volume & Order Flow ───────────────────────────────────────────────────
  volume_ratio:        ["Volume Ratio",          "Today's volume divided by its rolling average. >1 = unusually active day."],
  up_vol_ratio_20d:    ["Up-Volume Ratio 20d",   "% of 20-day total volume that occurred on up-bars (close ≥ open). High = buying dominates."],
  dollar_vol_zscore:   ["Dollar Volume Z-Score", "Z-score of price × volume over 60 days. Captures size-adjusted trading activity — useful for small-caps."],
  buy_vol_fd:          ["Buy Volume Frac-Diff",  "Fractionally-differenced log buyer volume (d=0.4). Buyer vol = close-position × volume. Replaces buy_vol_5/10/20d."],
  sell_vol_fd:         ["Sell Volume Frac-Diff", "Fractionally-differenced log seller volume (d=0.4). Seller vol = (1 − close-position) × volume. Replaces sell_vol_5/10/20d."],
  buy_vol_chg_fd:      ["Buy Vol Change FD",     "Frac-diff of log(short-term buy vol / 20d baseline). Is buying pressure accelerating? Replaces buy_vol_chg_5/10d."],
  sell_vol_chg_fd:     ["Sell Vol Change FD",    "Frac-diff of log(short-term sell vol / 20d baseline). Is selling pressure accelerating? Replaces sell_vol_chg_5/10d."],
  buy_sell_ratio_5d:   ["Buy/Sell Ratio 5d",     "5-day buyer volume ÷ 5-day seller volume. >1 = buyers winning the day, <1 = sellers dominating."],
  buy_sell_ratio_chg:  ["Buy/Sell Ratio Change", "5-day buy/sell ratio ÷ 20-day ratio − 1. Is the balance of power shifting toward buyers or sellers?"],
  distribution_signal: ["Distribution Signal",   "Large volume + price gave back most of its range. High = sellers absorbed buyers = possible pullback ahead."],
  cmf_20:              ["Chaikin Money Flow 20", "Standard institutional buy/sell pressure indicator over 20 days. +1 = sustained buying, −1 = sustained distribution."],
  mfi_14:              ["Money Flow Index 14",   "Volume-weighted RSI over 14 bars. >80 = overbought with high volume, <20 = oversold with high volume."],
  // ── Candle Structure ──────────────────────────────────────────────────────
  candle_body_pct:     ["Candle Body %",         "Body size (|Open−Close|) as % of the full candle range. Small = indecision / doji. Large = conviction."],
  candle_upper_shadow: ["Upper Shadow",          "Upper wick length as % of range. Large = price tried to go higher but was rejected (bearish resistance)."],
  candle_lower_shadow: ["Lower Shadow",          "Lower wick length as % of range. Large = price tested lower but recovered (bullish support)."],
  candle_close_pos:    ["Close Position",        "Where the close sits within the day's high−low range (0=at low, 1=at high). High = bullish close."],
  // ── Macro / DXY / Gold drivers ───────────────────────────────────────────
  beta_dxy_30:         ["Beta to DXY 30d",       "30-day rolling beta of this stock vs US Dollar Index. Negative = stock rises when USD falls (gold-positive regime)."],
  macro_dxy_5d:        ["DXY 5-day Return",      "5-day return of the US Dollar Index. Falling USD = tailwind for gold and gold miners."],
  macro_dxy_20d:       ["DXY 20-day Return",     "20-day return of the US Dollar Index. Longer-term USD trend direction."],
  macro_gold_usd_5d:   ["Gold USD 5-day",        "5-day return of spot gold in USD terms (GC=F). Direct commodity price input."],
  macro_gold_usd_20d:  ["Gold USD 20-day",       "20-day return of spot gold in USD. Captures the medium-term gold price cycle."],
  macro_oil_5d:        ["Oil 5-day Return",      "5-day return of crude oil. Correlated with gold via inflation expectations and risk appetite."],
  macro_copper_5d:     ["Copper 5-day Return",   "5-day return of copper. Often a leading indicator of global economic activity ('Dr Copper')."],
  macro_copper_mom5d:  ["Copper Momentum 5d",    "Short-term copper momentum. Copper and gold are both commodity plays — copper leads risk-on."],
  macro_commodity_tailwind: ["Commodity Tailwind","Composite score of gold, copper, oil all moving in same direction. Strong = favourable macro environment for miners."],
  macro_audusd_5d:     ["AUD/USD 5-day",         "5-day return of the Australian Dollar. Miners report in AUD — rising AUD compresses AUD gold price."],
  macro_audusd_20d:    ["AUD/USD 20-day",        "20-day return of AUD/USD. Medium-term FX trend affecting all ASX gold miners' revenue in AUD."],
  // ── Candle Structure ─────────────────────────────────────────────────────
  candle_body_pct:     ["Candle Body %",          "Body size (|Open−Close|) as % of the full High−Low range. Small = indecision / doji. Large = conviction."],
  candle_upper_shadow: ["Upper Shadow",           "Upper wick length as % of range. Large upper wick = price tested higher but was rejected (bearish resistance)."],
  candle_lower_shadow: ["Lower Shadow",           "Lower wick length as % of range. Large lower wick = price tested lower but recovered (bullish support)."],
  candle_close_pos:    ["Candle Close Position",  "Where the close sits in today's High−Low range (0=at low, 1=at high). High = bullish close, low = bearish close."],
  body_pct:            ["Candle Body %",          "Body size (|Open−Close|) as % of the full candle range. Small = indecision. Large = conviction close."],
  upper_wick_pct:      ["Upper Wick %",           "Upper wick as % of candle range. Large = price rejected at highs (bearish resistance overhead)."],
  lower_wick_pct:      ["Lower Wick %",           "Lower wick as % of candle range. Large = price found support at lows (bullish buying tail)."],
  close_position:      ["Close Position",         "Where close sits in the High−Low range (0=at low, 1=at high). High = bullish close, low = bearish."],
  bar_range_pct:       ["Bar Range %",            "Today's High−Low range as % of close. Proxy for intraday volatility and market indecision."],
  // ── Short Interest (ASIC) ─────────────────────────────────────────────────
  si_chg_5d:           ["Short Interest Chg 5d",  "5-day change in ASIC-reported short interest %. Rising = increasing bearish conviction from institutional shorts."],
  si_zscore_120d:      ["Short Interest Z-Score", "Current short interest vs its 120-day mean/std. High = unusually crowded short — potential short squeeze fuel."],
  si_squeeze_flag:     ["Short Squeeze Flag",     "Binary: 1 when price is rising AND short interest is at a high z-score. Classic short-squeeze setup."],
  // ── Bonds & Rates ─────────────────────────────────────────────────────────
  macro_au10yr_mom5d:    ["AU 10yr Yield Mom 5d",  "5-day % change in Australian 10-year government bond yield. Rising yields = tightening financial conditions."],
  macro_au10yr_mom20d:   ["AU 10yr Yield Mom 20d", "20-day % change in AU 10yr yield. Medium-term direction of Australian interest rates."],
  macro_au2yr_mom5d:     ["AU 2yr Yield Mom 5d",   "5-day % change in Australian 2-year bond yield. Short-rate movements reflect RBA expectations."],
  macro_yield_curve:     ["AU Yield Curve",         "AU 10yr yield minus AU 2yr yield. Positive = normal (upward sloping). Negative = inverted = recession signal."],
  macro_yield_curve_acc5:["Yield Curve Acceleration","5-day change in the AU yield curve slope. Steepening = economic optimism, flattening = concern."],
  macro_au_us_spread:    ["AU-US 10yr Spread",      "AU 10yr bond yield minus US 10yr Treasury yield. Positive = AU rates attractive vs US = AUD capital inflow."],
  macro_us10yr_mom5d:    ["US 10yr Yield Mom 5d",   "5-day % change in US 10-year Treasury yield. Rising US yields = USD strength = headwind for gold."],
  macro_us10yr_mom20d:   ["US 10yr Yield Mom 20d",  "20-day % change in US Treasury yield. Medium-term US rates direction — key driver of gold price."],
  // ── FX ────────────────────────────────────────────────────────────────────
  macro_dxy_mom5d:       ["DXY Momentum 5d",        "5-day % change in the US Dollar Index. Dollar strengthening = gold headwind. Falling dollar = tailwind."],
  macro_dxy_mom20d:      ["DXY Momentum 20d",       "20-day % change in the US Dollar Index. Medium-term USD direction."],
  macro_aud_mom5d:       ["AUD/USD Momentum 5d",    "5-day return of AUD/USD. Rising AUD compresses the AUD gold price — reduces miner revenue in AUD terms."],
  macro_aud_mom20d:      ["AUD/USD Momentum 20d",   "20-day return of AUD/USD. Longer-term FX trend affecting all ASX miners' revenues."],
  macro_aud_vol20d:      ["AUD/USD Volatility 20d", "20-day annualised volatility of AUD/USD. High FX vol = uncertainty for miners with USD revenues."],
  macro_audjpy_mom5d:    ["AUD/JPY Momentum 5d",    "5-day return of AUD/JPY. Classic risk-on/risk-off barometer. Rising = risk-on, falling = flight to safety."],
  // ── Commodities extended ──────────────────────────────────────────────────
  macro_gold_mom5d:      ["Gold USD Momentum 5d",   "5-day return of spot gold in USD (GC=F). The most direct driver of all ASX gold miner prices."],
  macro_gold_mom20d:     ["Gold USD Momentum 20d",  "20-day return of USD gold. Medium-term gold price cycle."],
  macro_gold_vol20d:     ["Gold Volatility 20d",    "20-day annualised vol of gold price. High = uncertain commodity environment, model may struggle."],
  macro_oil_mom5d:       ["Oil Momentum 5d",        "5-day return of Brent crude. Affects mining energy costs and broader inflation/commodity sentiment."],
  macro_oil_mom20d:      ["Oil Momentum 20d",       "20-day return of Brent crude. Longer-term oil trend — sustained high oil = margin pressure for miners."],
  macro_oil_vol20d:      ["Oil Volatility 20d",     "20-day annualised volatility of Brent crude. High oil vol often co-occurs with macro stress events."],
  macro_copper_mom20d:   ["Copper Momentum 20d",    "20-day return of copper. Medium-term industrial demand proxy."],
  macro_gold_oil_ratio:  ["Gold/Oil Ratio",         "Spot gold price divided by Brent crude oil price. High ratio = gold outperforming energy costs = miner margin expansion."],
  macro_gold_oil_mom5d:  ["Gold/Oil Ratio Mom 5d",  "5-day change in the gold/oil ratio. Rising = improving miner profit margins (revenue up, cost input down)."],
  macro_copper_gold_ratio:  ["Copper/Gold Ratio",      "Copper price divided by gold price. High = risk-on (growth expected), low = risk-off (safe-haven demand)."],
  macro_copper_gold_mom5d:  ["Copper/Gold Ratio Mom 5d","5-day change in copper/gold ratio. Useful regime signal — miners often outperform when this ratio rises."],
  // ── VIX ───────────────────────────────────────────────────────────────────
  macro_vix_mom5d:       ["VIX Momentum 5d",        "5-day % change in CBOE VIX. Rising VIX = accelerating fear — usually negative for risk assets including miners."],
  macro_vix_regime_20:   ["VIX > 20 Flag",          "Binary: 1 when VIX is above 20 (elevated fear). Market in cautious / defensive mode."],
  macro_vix_regime_30:   ["VIX > 30 Flag",          "Binary: 1 when VIX is above 30 (crisis threshold). Extreme stress — historically gold bullish but miners volatile."],
  // ── Interaction features ──────────────────────────────────────────────────
  ix_yield_gold:        ["Yield × Gold (US)",     "US 10yr yield momentum × gold momentum. Both falling = max tailwind. Yields up + gold down = max headwind. Captures the inverse yield-gold relationship."],
  ix_yield_gold_au:     ["AU Yield × Gold",       "AU 10yr yield momentum × gold momentum. RBA tightening squeezes miners on both the cost of capital side and the revenue side simultaneously."],
  ix_curve_gold:        ["Yield Curve × Gold",    "AU yield curve level × gold momentum. Inverted curve + rising gold = recession fear driving safe-haven demand. Normal curve + rising gold = inflation trade. Different regimes."],
  ix_yield_oil:         ["US Yield × Oil",        "US 10yr yield momentum × oil momentum. Both rising = stagflation signal — bad for growth and margins. Yields up + oil down = deflationary collapse."],
  ix_curve_oil:         ["Yield Curve × Oil",     "Yield curve slope × oil momentum. Steepening + oil rising = reflation trade (miner tailwind). Inverted + oil rising = stagflation (miner headwind)."],
  ix_gold_vix:          ["Gold × VIX",            "Gold momentum × VIX momentum. Gold up + VIX rising = fear-driven safe-haven demand (durable signal). Gold up + VIX falling = risk-on gold (weaker, more speculative)."],
  ix_crisis_gold:       ["Crisis Flag × Gold",    "VIX>30 binary × gold momentum. Gold behaviour in full crisis conditions is structurally different from normal. Captures the tail-risk flight-to-safety regime."],
  ix_vix_volume:        ["VIX × Volume",          "VIX momentum × volume z-score. High VIX + volume spike = panic selling / capitulation. High volume on a calm day = accumulation. Very different market states."],
  ix_vix_dollar_vol:    ["VIX Regime × $ Volume", "VIX>20 flag × dollar volume z-score. Large trades in a fear environment = forced selling / margin calls. Same large trades in calm = institutional positioning."],
  ix_vix_vol:           ["VIX × Realised Vol",    "VIX momentum × stock realised volatility (frac-diff). Market fear amplifying stock-specific vol = stress compounding. VIX elevated but stock vol contained = resilience signal."],
  ix_vix_vol_regime:    ["VIX Regime × Vol Ratio","VIX>20 flag × vol ratio (short/long). Is short-term stock volatility expanding during a fear spike? Captures whether macro stress is spilling into this specific stock."],
  ix_gold_aud:          ["Gold × AUD (5d)",       "Gold momentum × AUD/USD momentum. Gold up 2% but AUD up 2% = zero net revenue gain for miners. Negative product = FX tailwind (gold up, AUD down = revenue expansion)."],
  ix_gold_aud_20d:      ["Gold × AUD (20d)",      "Same gold/AUD squeeze measured medium-term (20d). Persistent AUD strength erodes the benefit of rising USD gold prices for ASX miners."],
  ix_curve_vix:         ["Yield Curve × VIX",     "Yield curve level × VIX momentum. Inverted curve + VIX surging = double-barrel recession fear signal. Gold bullish but miners operationally stressed."],
  ix_copper_gold_curve: ["Cu/Au Ratio × Curve",   "Copper/gold ratio × yield curve slope. Both positive = growth expansion = miners outperform. Both negative = risk-off + recession = miners underperform. Regime confirmation."],
  ix_spread_aud:        ["AU-US Spread × AUD",    "AU-US 10yr rate spread × AUD momentum. High AU rate premium + rising AUD = strong capital inflow into ASX assets. The carry-trade tailwind for Australian equities."],
  ix_momentum_vol:      ["Momentum × Vol Regime", "Price frac-diff (short) × vol ratio. Momentum in contracting volatility = clean, reliable trend. Momentum in expanding vol = noisy, whipsaw-prone. Vol regime gates the momentum signal."],
  ix_trend_momentum:    ["Trend × Momentum",      "Signed ADX × price momentum. Both pointing same direction = high-conviction trend. ADX strong but price momentum diverging = trend exhaustion signal."],
  ix_vix_momentum:      ["VIX Regime × Momentum", "VIX>20 flag × price momentum. Upward price momentum in a high-fear environment = buying into fear = institutional conviction. Stronger signal than momentum in calm markets."],
  ix_ann_volume:        ["Ann × Volume",          "Sensitive announcement binary × volume z-score. Announcement + abnormal volume = confirmed catalyst (market reacting). Announcement on thin volume = already priced in / not impactful."],
  ix_ann_gold:          ["Ann × Gold",            "Positive announcement impact × gold momentum. Company positive news aligned with rising gold price = both tailwinds simultaneously. Multiplicative effect on miner returns."],
  // ── Composite scores ──────────────────────────────────────────────────────
  macro_stress_composite:  ["Macro Stress Composite", "Z-score composite of VIX + inverted yield curve + DXY. High = broad market stress. Useful regime signal."],
  macro_riskoff_momentum:  ["Risk-Off Momentum",      "Composite of VIX acceleration + rising yields + rising USD, all z-scored. Captures fear accelerating across multiple markets simultaneously."],
  macro_commodity_tailwind:["Commodity Tailwind",     "Composite: gold rising + copper rising + oil stable/falling. High = favourable macro backdrop for gold miners."],
  // ── Announcement features ─────────────────────────────────────────────────
  ann_days_since_drilling:  ["Days Since Drilling",  "Calendar days since the last drilling result announcement. Fresh results = higher information value."],
  ann_days_since_capital:   ["Days Since Capital",   "Days since last capital raise (placement / rights issue). Recent raises can dilute or signal confidence."],
  ann_days_since_quarterly: ["Days Since Quarterly", "Days since last quarterly report. Quarterlies move small-cap miners significantly."],
  ann_days_since_sensitive: ["Days Since Sensitive", "Days since last market-sensitive announcement (ASX flagged). These are the announcements that move price."],
  ann_drilling_today:       ["Drilling Today",       "Binary: drilling result announced today or yesterday. Highest-impact category for junior miners."],
  ann_capital_today:        ["Capital Raise Today",  "Binary: capital raise announced today/yesterday. Dilutive = often negative short-term."],
  ann_quarterly_today:      ["Quarterly Today",      "Binary: quarterly report released today/yesterday. Beat/miss expectations = strong 1–2 day move."],
  ann_sensitive_today:      ["Sensitive Ann Today",  "Binary: any market-sensitive announcement today/yesterday. Catches all ASX-flagged high-impact releases."],
  ann_impact_pos_5d:        ["Positive Impact 5d",   "Max positive impact_score in last 5 bars. Recent strongly positive announcements in the window."],
  ann_impact_neg_5d:        ["Negative Impact 5d",   "Max negative impact_score in last 5 bars. Recent negative/dilutive announcements in the window."],
  ann_neg_kw_today:         ["Negative Keyword",     "Binary: headline contains words like defer / delay / withdraw / halt. Red-flag language in today's announcement."],
};

function _featTip(name) {
  const g = _FEAT_GLOSSARY[name];
  if (!g) return null;
  return g[0] + '\n' + g[1];
}

let _mlSortCol = 'rank', _mlSortAsc = true;

function mlSortTable(col) {
  if (_mlSortCol === col) { _mlSortAsc = !_mlSortAsc; }
  else { _mlSortCol = col; _mlSortAsc = col === 'name' || col === 'category'; }
  // Update sort icons
  document.querySelectorAll('.ml-sort-th').forEach(th => {
    const icon = th.querySelector('.ml-sort-icon');
    if (!icon) return;
    if (th.dataset.col === col) icon.textContent = _mlSortAsc ? '↑' : '↓';
    else icon.textContent = '↕';
  });
  mlRenderFeatTable();
}

function _mlSortValue(f, col) {
  switch (col) {
    case 'rank':       return f.rank;
    case 'name':       return f.name;
    case 'category':   return f.category;
    case 'avg_weight': return f.avg_weight;
    case 'avg_signed': return f.avg_signed;
    case 'p_value':    return f.p_value != null ? f.p_value : 1;
    case 'active_pct': return (f.n_windows_active ?? 0) / (f.n_windows_total ?? 1);
    case 'sign_pct':   return f.sign_pct ?? 0;
    case 'std_err':    return f.std_err ?? 0;
    case 'stability':  return f.stability;
    default:           return f.rank;
  }
}

function mlRenderFeatTable() {
  const annOnly = document.getElementById('ml-ann-only')?.checked;
  let feats = annOnly ? _mlCurrentFeatures.filter(f => f.category === 'announcement') : _mlCurrentFeatures;
  feats = [...feats].sort((a, b) => {
    const av = _mlSortValue(a, _mlSortCol), bv = _mlSortValue(b, _mlSortCol);
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return _mlSortAsc ? cmp : -cmp;
  });

  // Build short(6m) and long(2yr) weight lookups from sibling variants
  const activeKey = _mlCurrentData?._active_variant || _mlCurrentData?.best_variant || '';
  const fbMatch   = activeKey.match(/^(fb\d+)_/);
  const fbPrefix  = fbMatch ? fbMatch[1] : null;
  const shortKey  = fbPrefix ? `${fbPrefix}_6m`  : null;
  const longKey   = fbPrefix ? `${fbPrefix}_2yr` : null;
  const shortWts  = {};   // name → avg_signed
  const longWts   = {};
  const shortFeats = {};  // name → full feature object
  const longFeats  = {};
  if (shortKey && _mlCurrentData?.variants?.[shortKey]) {
    (_mlCurrentData.variants[shortKey].features || []).forEach(f => { shortWts[f.name] = f.avg_signed; shortFeats[f.name] = f; });
  }
  if (longKey && _mlCurrentData?.variants?.[longKey]) {
    (_mlCurrentData.variants[longKey].features || []).forEach(f => { longWts[f.name] = f.avg_signed; longFeats[f.name] = f; });
  }

  // If we have sibling data, show union of both models — not just current variant's features
  const isV6 = !!(_mlCurrentData?.variants);
  if (isV6 && (Object.keys(shortFeats).length || Object.keys(longFeats).length)) {
    const allNames = new Set([...feats.map(f => f.name), ...Object.keys(shortFeats), ...Object.keys(longFeats)]);
    feats = [...allNames].map(name => {
      const base = feats.find(f => f.name === name) || shortFeats[name] || longFeats[name] || { name };
      return { ...base };
    }).sort((a, b) => {
      const av = _mlSortValue(a, _mlSortCol), bv = _mlSortValue(b, _mlSortCol);
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av ?? 999) - (bv ?? 999);
      return _mlSortAsc ? cmp : -cmp;
    });
  }

  const tbody = document.getElementById('ml-feat-tbody');
  const totalFeats = feats.length;
  tbody.innerHTML = feats.map((f, idx) => {
    // Fix category: look up from map if not stored on the feature object
    const cat      = f.category || _FEAT_CAT_MAP[f.name] || 'other';
    const catColor = _ML_CAT_COLORS[cat] || '#6b7280';
    const rankColor  = f.rank <= 10 ? 'var(--green)' : f.rank <= 25 ? SQ.amber : 'var(--muted)';
    const instColor  = f.stability < 1 ? 'var(--green)' : f.stability < 2 ? SQ.amber : 'var(--red)';
    const signColor  = f.avg_signed >= 0 ? 'var(--green)' : 'var(--red)';
    const isAnn      = cat === 'announcement';
    const nameColor  = isAnn ? 'var(--gold)' : '#e5e7eb';
    const nameFW     = isAnn ? '600' : '400';
    const rowBg      = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';
    // p-value colour
    const pv         = f.p_value != null ? f.p_value : 1.0;
    const pvColor    = pv < 0.05 ? 'var(--green)' : pv < 0.20 ? SQ.amber : 'var(--red)';
    const pvStr      = f.p_value != null ? pv.toFixed(3) : '—';
    // active windows
    const nActive    = f.n_windows_active ?? f.n_windows ?? '?';
    const nTotal     = f.n_windows_total  ?? f.n_windows ?? '?';
    const activeColor= (nActive / nTotal) >= 0.75 ? '#e5e7eb' : (nActive / nTotal) >= 0.5 ? SQ.amber : 'var(--red)';
    // sign consistency
    const sp         = f.sign_pct != null ? f.sign_pct : null;
    const spColor    = sp == null ? 'var(--muted)' : sp >= 80 ? 'var(--green)' : sp >= 60 ? SQ.amber : 'var(--red)';
    const spStr      = sp != null ? sp + '%' : '—';
    // short/long weights
    const sw = shortWts[f.name];
    const lw = longWts[f.name];
    const inShort = sw != null, inLong = lw != null;
    const srcBadge = (inShort && inLong)
      ? `<span style="color:#60a5fa;font-size:9px">S</span><span style="color:#f97316;font-size:9px">L</span>`
      : inShort ? `<span style="color:#60a5fa;font-size:9px">S</span>`
      : inLong  ? `<span style="color:#f97316;font-size:9px">L</span>` : '';
    const fmtW = v => {
      if (v == null) return '<span style="color:#555">—</span>';
      const num = Number(v);
      if (isNaN(num)) return '<span style="color:#f97316">ERR</span>';
      const s = (num >= 0 ? '+' : '') + (num * 1000).toFixed(2);
      return `<span style="color:${num >= 0 ? '#00c832' : '#ef4444'}">${s}</span>`;
    };
    const _p = 'padding:5px 8px;overflow:hidden;white-space:nowrap;';
    const rank = f.rank ?? '?';
    return `<tr style="background:${rowBg};border-bottom:1px solid #141414">
      <td style="${_p}font-family:monospace;font-size:11px;color:${rankColor};font-weight:600">${srcBadge} #${rank}/${totalFeats}</td>
      <td style="${_p}font-size:11px;color:${nameColor};font-weight:${nameFW};text-overflow:ellipsis;cursor:${_featTip(f.name)?'help':'default'}"${_featTip(f.name)?` data-tip="${_featTip(f.name)}"`:''}>${f.name}</td>
      <td style="${_p}font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:${catColor}">${cat}</td>
      <td style="${_p}text-align:right;font-family:monospace;font-size:11px;color:#e5e7eb">${(f.avg_weight * 1000).toFixed(3)}</td>
      <td style="${_p}text-align:right;font-family:monospace;font-size:11px;color:${signColor}">${f.avg_signed >= 0 ? '+' : ''}${(f.avg_signed * 1000).toFixed(3)}</td>
      <td style="${_p}text-align:right;font-family:monospace;font-size:11px;color:${pvColor};font-weight:${pv < 0.05 ? '600' : '400'}">${pvStr}</td>
      <td style="${_p}text-align:right;font-family:monospace;font-size:11px;color:${activeColor}">${nActive}/${nTotal}</td>
      <td style="${_p}text-align:right;font-family:monospace;font-size:11px;color:${spColor}">${spStr}</td>
      <td style="${_p}text-align:right;font-family:monospace;font-size:11px;color:#9ca3af">${f.std_err != null ? (f.std_err * 1000).toFixed(3) : '—'}</td>
      <td style="${_p}text-align:right;font-family:monospace;font-size:11px;color:${instColor}">${f.stability.toFixed(2)}</td>
      <td style="${_p}text-align:center;font-family:monospace;font-size:11px">${fmtW(sw)}</td>
      <td style="${_p}text-align:center;font-family:monospace;font-size:11px">${fmtW(lw)}</td>
    </tr>`;
  }).join('');
}

// ── Correlation Analysis ───────────────────────────────────────────────────────
let _mlCorrData = null;
let _mlHeatmapBuilt = false, _mlDendroBuilt = false, _mlForceBuilt = false;
let _mlForceAnim = null;   // RAF handle — cancel if tab switches away
let _mlForceZoom = 1.0;
let _mlForcePanX = 0, _mlForcePanY = 0;
let _mlForceDrag = false, _mlForceDragLast = null;
let _mlForceWinMM = null, _mlForceWinMU = null;  // window-level pan listeners

function _corrCatColor(name) {
  const f = _mlCurrentFeatures.find(f => f.name === name);
  return f ? (_ML_CAT_COLORS[f.category] || '#6b7280') : '#6b7280';
}

function mlCorrTab(name) {
  ['heatmap','dendro','force'].forEach(t => {
    const wrap = document.getElementById(`ml-corr-${t}-wrap`);
    if (wrap) wrap.style.display = t === name ? '' : 'none';
    const btn = document.getElementById(`ml-corr-tab-${t}`);
    if (btn) {
      const on = t === name;
      btn.style.background   = on ? '#f59e0b22' : 'transparent';
      btn.style.color        = on ? SQ.amber   : '#6b7280';
      btn.style.borderColor  = on ? SQ.amber   : '#374151';
    }
  });
  // Threshold slider only relevant for force graph
  const thresh = document.getElementById('ml-corr-threshold-wrap');
  if (thresh) thresh.style.display = name === 'force' ? 'inline-flex' : 'none';
  // Heatmap legend only for heatmap
  const legend = document.getElementById('ml-heatmap-legend');
  if (legend) legend.style.display = name === 'heatmap' ? '' : 'none';

  // Cancel any running force animation when leaving that tab
  if (name !== 'force' && _mlForceAnim) { cancelAnimationFrame(_mlForceAnim); _mlForceAnim = null; }

  if (!_mlCorrData) return;
  if (name === 'heatmap' && !_mlHeatmapBuilt) { buildMLHeatmap(_mlCorrData); _mlHeatmapBuilt = true; }
  if (name === 'dendro'  && !_mlDendroBuilt)  { buildMLDendro(_mlCorrData);  _mlDendroBuilt  = true; }
  if (name === 'force'   && !_mlForceBuilt)   { buildMLForce(_mlCorrData);   _mlForceBuilt   = true; }
}

function mlForceThresholdChange(val) {
  document.getElementById('ml-force-threshold-val').textContent = (val / 100).toFixed(2);
  // Rebuild force graph with new threshold
  _mlForceBuilt = false;
  if (_mlForceAnim) { cancelAnimationFrame(_mlForceAnim); _mlForceAnim = null; }
  if (_mlCorrData) { buildMLForce(_mlCorrData); _mlForceBuilt = true; }
}

function mlForceZoomChange(val) {
  _mlForceZoom = val / 100;
  document.getElementById('ml-force-zoom-val').textContent = _mlForceZoom.toFixed(1) + '×';
  // Redraw immediately if simulation has settled
  const canvas = document.getElementById('ml-corr-force');
  if (canvas && canvas._mlForceNodes) _mlForceDraw(canvas, canvas._mlForceNodes, canvas._mlForceEdges);
}

// ── Heatmap ────────────────────────────────────────────────────────────────────
function buildMLHeatmap(cd) {
  const canvas = document.getElementById('ml-corr-heatmap');
  const features = cd.cluster_order;
  const orig     = cd.features;
  const matrix   = cd.matrix;
  const n        = features.length;

  const CELL   = Math.max(9, Math.min(18, Math.floor(560 / n)));
  const LPAD   = 130;
  const TPAD   = 130;
  const W      = LPAD + n * CELL;
  const H      = TPAD + n * CELL;
  canvas.width  = W;
  canvas.height = H;

  const ctx   = canvas.getContext('2d');
  const fsize = Math.min(11, CELL);

  function getCorr(fa, fb) {
    const ia = orig.indexOf(fa), ib = orig.indexOf(fb);
    return (ia < 0 || ib < 0) ? 0 : matrix[ia][ib];
  }
  function corrColor(v) {
    if (v >= 0) {
      const t = Math.min(v, 1);
      return `rgb(${Math.round(t*0)},${Math.round(30+t*225)},${Math.round(30+t*35)})`;
    } else {
      const t = Math.min(-v, 1);
      return `rgb(${Math.round(30+t*225)},${Math.round(30*t)},${Math.round(30*t)})`;
    }
  }

  function drawBase(hoverRow=-1, hoverCol=-1) {
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    // Cells
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = getCorr(features[i], features[j]);
        ctx.fillStyle = i === j ? '#2a2a2a' : corrColor(v);
        ctx.fillRect(LPAD + j*CELL, TPAD + i*CELL, CELL-1, CELL-1);
      }
    }

    // Highlight strips
    if (hoverRow >= 0 && hoverCol >= 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(LPAD, TPAD + hoverRow*CELL, n*CELL, CELL);      // row strip
      ctx.fillRect(LPAD + hoverCol*CELL, TPAD, CELL, n*CELL);      // col strip
      // Hovered cell border
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(LPAD + hoverCol*CELL + 0.5, TPAD + hoverRow*CELL + 0.5, CELL-1, CELL-1);
    }

    // Row labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    features.forEach((name, i) => {
      const active = i === hoverRow;
      ctx.font = (active ? 'bold ' : '') + `${fsize}px monospace`;
      ctx.fillStyle = active ? '#ffffff' : _corrCatColor(name);
      const label = name.replace('ann_','★ ');
      ctx.fillText(label.length > 20 ? label.slice(0,19)+'…' : label,
                   LPAD - 5, TPAD + i*CELL + CELL/2);
    });

    // Column labels (rotated)
    ctx.textAlign = 'left';
    features.forEach((name, j) => {
      const active = j === hoverCol;
      ctx.save();
      ctx.translate(LPAD + j*CELL + CELL/2, TPAD - 5);
      ctx.rotate(-Math.PI / 2);
      ctx.font = (active ? 'bold ' : '') + `${fsize}px monospace`;
      ctx.fillStyle = active ? '#ffffff' : _corrCatColor(name);
      const label = name.replace('ann_','★ ');
      ctx.fillText(label.length > 20 ? label.slice(0,19)+'…' : label, 0, 0);
      ctx.restore();
    });
  }

  drawBase();

  // Floating tooltip div
  let tipDiv = document.getElementById('ml-heatmap-tip');
  if (!tipDiv) {
    tipDiv = document.createElement('div');
    tipDiv.id = 'ml-heatmap-tip';
    tipDiv.style.cssText = 'position:fixed;background:#001a0a;border:1px solid #333;border-radius:5px;padding:7px 11px;font-size:11px;color:#e5e7eb;pointer-events:none;z-index:9999;display:none;line-height:1.6;box-shadow:0 4px 12px #000a';
    document.body.appendChild(tipDiv);
  }

  canvas.onmousemove = function(e) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top)  * scaleY;
    const col = Math.floor((cx - LPAD) / CELL);
    const row = Math.floor((cy - TPAD) / CELL);
    if (col >= 0 && col < n && row >= 0 && row < n) {
      drawBase(row, col);
      const v = getCorr(features[row], features[col]);
      const vStr  = (v >= 0 ? '+' : '') + v.toFixed(3);
      const vCol  = v > 0.6 ? '#00ff41' : v < -0.6 ? '#ff6b6b' : v > 0.3 ? '#f5a520' : '#9ca3af';
      tipDiv.innerHTML =
        `<div><span style="color:#6b7280">Row:</span> <span style="color:#e5e7eb;font-weight:600">${features[row]}</span></div>` +
        `<div><span style="color:#6b7280">Col:</span> <span style="color:#e5e7eb;font-weight:600">${features[col]}</span></div>` +
        `<div style="margin-top:3px"><span style="color:#6b7280">Correlation:</span> <span style="color:${vCol};font-weight:700;font-family:monospace">${vStr}</span></div>`;
      tipDiv.style.display = 'block';
      tipDiv.style.left = (e.clientX + 16) + 'px';
      tipDiv.style.top  = (e.clientY - 10) + 'px';
    } else {
      drawBase();
      tipDiv.style.display = 'none';
    }
  };

  canvas.onmouseleave = function() {
    drawBase();
    tipDiv.style.display = 'none';
  };
}

// ── Dendrogram ────────────────────────────────────────────────────────────────
function buildMLDendro(cd) {
  const canvas   = document.getElementById('ml-corr-dendro');
  const features = cd.cluster_order;
  const orig     = cd.features;
  const Z        = cd.linkage;   // [[left, right, dist, count], ...]
  const n        = features.length;

  const ROW_H  = 15;
  const LPAD   = 140;  // left label area
  const RPAD   = 20;
  const TPAD   = 10;
  const W      = LPAD + 500 + RPAD;
  const H      = TPAD + n * ROW_H;
  canvas.width  = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  // Leaf y positions (based on cluster order)
  const leafY = {};
  features.forEach((name, i) => { leafY[name] = TPAD + i * ROW_H + ROW_H / 2; });

  // Node y and x (rightmost reach per node index)
  const nodeY = new Array(n + Z.length);
  const nodeX = new Array(n + Z.length);
  orig.forEach((name, i) => { nodeY[i] = leafY[name]; nodeX[i] = LPAD; });

  const maxDist = Math.max(...Z.map(r => r[2])) || 1;
  const distScale = 490 / maxDist;

  Z.forEach(([left, right, dist, count], k) => {
    const mergeIdx = n + k;
    const x        = LPAD + dist * distScale;
    const ly       = nodeY[left];
    const ry       = nodeY[right];
    const lx       = nodeX[left];
    const rx       = nodeX[right];

    // Color: green for close clusters (correlated), amber/red for far (independent)
    const t = dist / maxDist;
    ctx.strokeStyle = t < 0.33 ? '#00c832' : t < 0.66 ? SQ.amber : '#ff6b6b';
    ctx.lineWidth   = 1;

    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(x, ly); ctx.stroke();  // left arm
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(x, ry); ctx.stroke();  // right arm
    ctx.beginPath(); ctx.moveTo(x, ly);  ctx.lineTo(x, ry); ctx.stroke();  // vertical join

    nodeY[mergeIdx] = (ly + ry) / 2;
    nodeX[mergeIdx] = x;
  });

  // Leaf labels
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  features.forEach(name => {
    ctx.fillStyle = _corrCatColor(name);
    const label = name.replace('ann_','★ ');
    ctx.fillText(label.length > 20 ? label.slice(0,19)+'…' : label, LPAD - 5, leafY[name]);
  });

  // Distance axis (top)
  ctx.font = '9px monospace';
  ctx.fillStyle = '#444';
  ctx.textAlign = 'center';
  [0, 0.25, 0.5, 0.75, 1.0].forEach(frac => {
    const x = LPAD + frac * 490;
    ctx.fillText((frac * maxDist).toFixed(2), x, TPAD - 2);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, TPAD); ctx.lineTo(x, H); ctx.stroke();
  });
}

// ── Force Graph ────────────────────────────────────────────────────────────────
function _mlForceDraw(canvas, nodes, edges) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const zoom = _mlForceZoom;
  const px = _mlForcePanX, py = _mlForcePanY;

  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  // Apply zoom + pan transform centred on canvas midpoint
  ctx.save();
  ctx.translate(W/2 + px, H/2 + py);
  ctx.scale(zoom, zoom);
  ctx.translate(-W/2, -H/2);

  function nodeRadius(name) {
    const idx = _mlCurrentFeatures.findIndex(f => f.name === name);
    return idx < 0 ? 5 : Math.max(4, 12 - idx * 0.18);
  }

  // Edges
  edges.forEach(({i, j, corr}) => {
    const alpha = 0.15 + Math.min(Math.abs(corr), 1) * 0.55;
    ctx.strokeStyle = corr > 0 ? `rgba(0,200,50,${alpha})` : `rgba(255,40,40,${alpha})`;
    ctx.lineWidth   = Math.abs(corr) * 2.5;
    ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
  });

  // Nodes
  nodes.forEach(nd => {
    const r   = nodeRadius(nd.name);
    const col = _corrCatColor(nd.name);
    ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, Math.PI*2);
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = '#0d0d0d'; ctx.lineWidth = 1; ctx.stroke();
  });

  // Labels — all features, scaled inversely so they stay readable when zoomed
  const labelSize = Math.max(7, Math.min(11, 9 / zoom));
  ctx.font = `${labelSize}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  nodes.forEach(nd => {
    const r = nodeRadius(nd.name);
    // Brighter for high-ranked features, dimmer for low-ranked
    const idx = _mlCurrentFeatures.findIndex(f => f.name === nd.name);
    const alpha = idx < 0 ? 0.5 : idx < 20 ? 0.9 : 0.6;
    ctx.fillStyle = `rgba(200,200,200,${alpha})`;
    ctx.fillText(nd.name.replace('ann_','★ '), nd.x, nd.y + r + 2);
  });

  ctx.restore();
}

function buildMLForce(cd) {
  const canvas = document.getElementById('ml-corr-force');
  const W = canvas.offsetWidth || 700;
  const H = 560;
  canvas.width  = W;
  canvas.height = H;

  // Reset zoom/pan on rebuild
  _mlForcePanX = 0; _mlForcePanY = 0;
  _mlForceZoom = 1.0;
  const zSlider = document.getElementById('ml-force-zoom');
  const zLabel  = document.getElementById('ml-force-zoom-val');
  if (zSlider) zSlider.value = 100;
  if (zLabel)  zLabel.textContent = '1.0×';

  const features = cd.features;
  const matrix   = cd.matrix;
  const n        = features.length;
  const THRESHOLD = (parseInt(document.getElementById('ml-force-threshold')?.value || 40) / 100);

  // Build edges
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = matrix[i][j];
      if (Math.abs(v) > THRESHOLD) edges.push({i, j, corr: v});
    }
  }

  // Init nodes in circle
  const nodes = features.map((name, i) => {
    const angle = (2 * Math.PI * i) / n;
    const r = Math.min(W, H) * 0.32;
    return { name, i, x: W/2 + r * Math.cos(angle), y: H/2 + r * Math.sin(angle), vx: 0, vy: 0 };
  });

  // Attach to canvas so zoom slider can redraw after settle
  canvas._mlForceNodes = nodes;
  canvas._mlForceEdges = edges;

  const REPEL  = 1200;
  const K      = 0.018;
  const DAMP   = 0.84;
  const DT     = 0.5;
  let frame    = 0;
  const MAX_F  = 180;

  function tick() {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const d  = Math.sqrt(dx*dx + dy*dy) + 0.5;
        const f  = REPEL / (d * d);
        nodes[i].vx += (dx/d)*f; nodes[i].vy += (dy/d)*f;
        nodes[j].vx -= (dx/d)*f; nodes[j].vy -= (dy/d)*f;
      }
    }
    edges.forEach(({i, j, corr}) => {
      const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
      const d  = Math.sqrt(dx*dx + dy*dy) + 0.5;
      const targetLen = 20 + (1 - Math.abs(corr)) * 140;
      const f  = K * (d - targetLen);
      nodes[i].vx += (dx/d)*f; nodes[i].vy += (dy/d)*f;
      nodes[j].vx -= (dx/d)*f; nodes[j].vy -= (dy/d)*f;
    });
    nodes.forEach(nd => {
      nd.vx += (W/2 - nd.x) * 0.004;
      nd.vy += (H/2 - nd.y) * 0.004;
      nd.vx *= DAMP; nd.vy *= DAMP;
      nd.x = Math.max(20, Math.min(W-20, nd.x + nd.vx * DT));
      nd.y = Math.max(20, Math.min(H-20, nd.y + nd.vy * DT));
    });
  }

  function animate() {
    const c = document.getElementById('ml-corr-force');
    if (!c) return;
    if (frame < MAX_F) {
      tick(); frame++;
      _mlForceDraw(c, nodes, edges);
      _mlForceAnim = requestAnimationFrame(animate);
    } else {
      _mlForceDraw(c, nodes, edges);  // final static frame
    }
  }
  frame = 0;
  animate();

  // ── Pan (drag) + scroll-wheel zoom ─────────────────────────────────────────
  const wrap = document.getElementById('ml-corr-force-wrap');

  // Remove stale window-level listeners from previous build
  if (_mlForceWinMM) window.removeEventListener('mousemove', _mlForceWinMM);
  if (_mlForceWinMU) window.removeEventListener('mouseup',   _mlForceWinMU);

  canvas.onmousedown = function(e) {
    _mlForceDrag = true;
    _mlForceDragLast = {x: e.clientX, y: e.clientY};
    wrap.style.cursor = 'grabbing';
  };

  _mlForceWinMM = function(e) {
    if (!_mlForceDrag) return;
    _mlForcePanX += e.clientX - _mlForceDragLast.x;
    _mlForcePanY += e.clientY - _mlForceDragLast.y;
    _mlForceDragLast = {x: e.clientX, y: e.clientY};
    const c = document.getElementById('ml-corr-force');
    if (c) _mlForceDraw(c, nodes, edges);
  };
  _mlForceWinMU = function() {
    if (_mlForceDrag) { _mlForceDrag = false; wrap.style.cursor = 'grab'; }
  };
  window.addEventListener('mousemove', _mlForceWinMM);
  window.addEventListener('mouseup',   _mlForceWinMU);

  // Scroll-wheel zoom (onwheel = single handler, no stacking on rebuild)
  canvas.onwheel = function(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    _mlForceZoom = Math.max(0.5, Math.min(3.0, _mlForceZoom + delta));
    const slider = document.getElementById('ml-force-zoom');
    if (slider) slider.value = Math.round(_mlForceZoom * 100);
    const label = document.getElementById('ml-force-zoom-val');
    if (label) label.textContent = _mlForceZoom.toFixed(1) + '×';
    const c = document.getElementById('ml-corr-force');
    if (c) _mlForceDraw(c, nodes, edges);
  };
}

// ── Feature Panel ─────────────────────────────────────────────────────────────
let _featContribChart=null;
let _tradeSignalChart=null;
function resetTradeChartZoom(){if(_tradeSignalChart)_tradeSignalChart.resetZoom();}

async function loadFeaturePanel(ticker='waf_ax') {
  const safe=ticker.replace(/\./g,'_').toLowerCase();
  let data;
  try { const res=await fetch(`feature_data_${safe}.json?v=${_CV}`); if(!res.ok)return; data=await res.json(); } catch(e){return;}
  document.getElementById('feature-model-section').style.display='';
  const signal=data.signal===1?'BUY':'SELL',sigColor=data.signal===1?'var(--green)':'var(--red)';
  const predColor=data.predicted_5bar_pct>=0?'var(--green)':'var(--red)',predSign=data.predicted_5bar_pct>=0?'+':'';
  const tickerLabel=data.ticker||ticker.toUpperCase();
  document.getElementById('feat-hero-row').innerHTML=`
    <div class="hero-card" style="min-width:140px"><div class="hero-label">${tickerLabel} Close</div><div class="hero-value color-gold">A$${data.close.toFixed(2)}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${data.bar_date}</div></div>
    <div class="hero-card" style="min-width:170px"><div class="hero-label tip" data-tip="Ridge regression prediction: expected 5-bar (1-week) return.\nIntercept: ${data.intercept>=0?'+':''}${data.intercept?.toFixed(3)}%\nFeature sum: ${data.feature_sum>=0?'+':''}${data.feature_sum?.toFixed(3)}%">Predicted 5-Bar Return</div><div class="hero-value" style="color:${predColor}">${predSign}${data.predicted_5bar_pct?.toFixed(2)}%</div><div style="font-size:11px;color:var(--muted);margin-top:2px">~1 week horizon</div></div>
    <div class="hero-card" style="min-width:120px"><div class="hero-label">Signal</div><div class="hero-value" style="color:${sigColor};font-size:22px;font-weight:800">${signal}</div></div>
    <div class="hero-card" style="min-width:150px"><div class="hero-label tip" data-tip="Features with Spearman p &lt; 0.05 vs 5-bar forward return.\nOut of ${data.n_features} total features tested.">Significant Features</div><div class="hero-value color-gold">${data.n_significant} / ${data.n_features}</div></div>
    <div class="hero-card" style="min-width:150px"><div class="hero-label tip" data-tip="Train window: last ${data.train_days} bars.\nForward horizon: ${data.forward_bars} bars.\nModel: Ridge regression α=1.0">Training Window</div><div class="hero-value" style="font-size:16px">${data.train_days}d</div><div style="font-size:11px;color:var(--muted);margin-top:2px">fwd ${data.forward_bars} bars</div></div>`;
  const intercept=data.intercept??0,featSum=data.feature_sum??0;
  const equation=`${intercept>=0?'+':''}${intercept.toFixed(3)}% (intercept) + ${featSum>=0?'+':''}${featSum.toFixed(3)}% (features) = ${predSign}${data.predicted_5bar_pct?.toFixed(3)}%`;
  const sigFeats=(data.features||[]).filter(f=>f.significant).slice(0,8);
  let summHTML=`<div style="margin-bottom:14px"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">PREDICTION EQUATION</div><div style="font-size:12px;color:#e5e7eb;font-family:monospace;background:#111;padding:8px 10px;border-radius:6px;border:1px solid var(--border)">${equation}</div></div><div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Top Significant Features</div>`;
  sigFeats.forEach(f=>{const isPos=f.contribution_pct>=0;const barW=Math.min(100,Math.abs(f.contribution_pct)/Math.max(...(data.features||[]).map(x=>Math.abs(x.contribution_pct)),1)*100);summHTML+=`<div style="margin-bottom:8px" title="${f.tip}"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span style="color:#e5e7eb">${f.name}</span><span style="color:${isPos?'var(--green)':'var(--red)'}">${isPos?'+':''}${f.contribution_pct.toFixed(3)}%</span></div><div style="height:4px;background:#1a1a1a;border-radius:2px"><div style="height:100%;width:${barW}%;background:${isPos?'var(--green)':'var(--red)'};border-radius:2px"></div></div></div>`;});
  document.getElementById('feat-model-summary').innerHTML=summHTML;
  const top15=(data.features||[]).slice(0,15);
  const flabels=top15.map(f=>f.name),values=top15.map(f=>f.contribution_pct);
  const colors=values.map(v=>v>=0?GREEN_75:RED_75);
  const borderC=values.map(v=>v>=0?GREEN:RED);
  const ctx=document.getElementById('feat-contrib-chart').getContext('2d');
  if(_featContribChart)_featContribChart.destroy();
  _featContribChart=new Chart(ctx,{type:'bar',data:{labels:flabels,datasets:[{data:values,backgroundColor:colors,borderColor:borderC,borderWidth:1,borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>{const f=top15[ctx.dataIndex];return[` Contribution: ${ctx.raw>=0?'+':''}${ctx.raw.toFixed(4)}%`,` Ridge weight: ${f.ridge_weight>=0?'+':''}${f.ridge_weight.toFixed(4)}`,` Std value: ${f.standardized>=0?'+':''}${f.standardized.toFixed(4)}`,` Spearman r: ${f.spearman_r>=0?'+':''}${f.spearman_r.toFixed(4)}  p=${f.p_value.toFixed(4)}`];}}}},scales:{x:{grid:{color:'#222'},ticks:{callback:v=>(v>=0?'+':'')+v.toFixed(2)+'%'}},y:{grid:{display:false},ticks:{font:{size:11}}}}}});
  let allFeatures=[...(data.features||[])];let sortCol='contribution_pct';let sortDir=-1;let sigOnly=false;
  function renderTable(){const rows=allFeatures.filter(f=>!sigOnly||f.significant).sort((a,b)=>{const av=a[sortCol],bv=b[sortCol];if(typeof av==='boolean')return sortDir*(av===bv?0:av?-1:1);if(av==null)return 1;if(bv==null)return -1;return sortDir*(typeof av==='string'?av.localeCompare(bv):av-bv);});
  const tbody=document.getElementById('feat-tbody');tbody.innerHTML=rows.map(f=>{const cColor=f.contribution_pct>=0?'var(--green)':'var(--red)';const rColor=f.spearman_r>=0?'var(--green)':'var(--red)';const pColor=f.p_value<0.01?'var(--green)':f.p_value<0.05?'#86efac':f.p_value<0.10?SQ.amber:'var(--muted)';const sigBadge=f.significant?'<span style="color:var(--green);font-size:13px" title="p < 0.05">✓</span>':'<span style="color:#374151;font-size:13px">—</span>';const rawFmt=f.raw_value!=null?f.raw_value.toFixed(4):'—';const stdFmt=f.standardized!=null?(f.standardized>=0?'+':'')+f.standardized.toFixed(4):'—';const contFmt=(f.contribution_pct>=0?'+':'')+f.contribution_pct.toFixed(4)+'%';const wFmt=(f.ridge_weight>=0?'+':'')+f.ridge_weight.toFixed(5);const rFmt=(f.spearman_r>=0?'+':'')+f.spearman_r.toFixed(4);const pFmt=f.p_value.toFixed(4);return`<tr style="border-bottom:1px solid rgba(0,255,136,0.08)" title="${f.tip}"><td style="padding:6px 10px;font-family:monospace;font-size:11px;color:#e5e7eb">${f.name}</td><td style="padding:6px 10px;font-size:11px;color:var(--muted)">${f.group}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;font-size:11px">${rawFmt}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;font-size:11px">${stdFmt}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;font-size:11px">${wFmt}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;font-size:11px;color:${cColor}">${contFmt}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;font-size:11px;color:${rColor}">${rFmt}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;font-size:11px;color:${pColor}">${pFmt}</td><td style="padding:6px 10px;text-align:center">${sigBadge}</td></tr>`;}).join('');}
  document.querySelectorAll('#feat-table thead th[data-col]').forEach(th=>{th.addEventListener('click',()=>{const col=th.getAttribute('data-col');if(sortCol===col)sortDir*=-1;else{sortCol=col;sortDir=col==='contribution_pct'?-1:(col==='p_value'?1:-1);}document.querySelectorAll('#feat-table thead th[data-col]').forEach(h=>{const base=h.textContent.replace(/ [↑↓]$/,'').replace(/ ↕$/,'');h.textContent=base+(h.getAttribute('data-col')===sortCol?(sortDir===-1?' ↓':' ↑'):' ↕');});renderTable();});});
  document.getElementById('feat-sig-only').addEventListener('change',e=>{sigOnly=e.target.checked;renderTable();});
  renderTable();
}

// ── Feature Pruning Roadmap ────────────────────────────────────────────────────
// Category membership for every known feature — mirrors export_model._FEAT_CATEGORIES
const _FEAT_CAT_MAP = {
  rsi_14:'momentum',ret_1d:'momentum',ret_5d:'momentum',ret_20d:'momentum',ret_60d:'momentum',ret_126d:'momentum',ret_252d:'momentum',
  close_vs_ma50:'momentum',close_vs_ma200:'momentum',ma50_vs_ma200:'momentum',ma_cross_sig:'momentum',
  hurst_20:'momentum',hurst_100:'momentum',eff_ratio_20:'momentum',eff_ratio_60:'momentum',eff_ratio_short:'momentum',eff_ratio_long:'momentum',
  donchian_pos_20:'momentum',bb_zscore:'momentum',slope_5d:'momentum',slope_20d:'momentum',
  season_score:'momentum',season_gold:'momentum',price_fd_short:'momentum',price_fd_long:'momentum',
  volume_ratio:'volume',vol_zscore_20:'volume',vol_ratio_5_20:'volume',vol_trend_60d:'volume',vol_cv_20d:'volume',
  up_vol_ratio_20d:'volume',dollar_vol_zscore:'volume',buy_vol_fd:'volume',sell_vol_fd:'volume',
  buy_vol_chg_fd:'volume',sell_vol_chg_fd:'volume',buy_sell_ratio_5d:'volume',buy_sell_ratio_chg:'volume',
  distribution_signal:'volume',cmf_20:'volume',mfi_14:'volume',
  atr_14_pct:'volatility',vol_fd:'volatility',vol_ratio:'volatility',vol_60d:'volatility',vol_252d:'volatility',vol_z_score:'volatility',bb_width_20:'volatility',
  adx_14:'trend',trend_signed_adx:'trend',trend_regime:'trend',
  candle_body_pct:'candle',candle_upper_shadow:'candle',candle_lower_shadow:'candle',candle_close_pos:'candle',
  body_pct:'candle',upper_wick_pct:'candle',lower_wick_pct:'candle',close_position:'candle',bar_range_pct:'candle',
  si_chg_5d:'short_interest',si_zscore_120d:'short_interest',si_squeeze_flag:'short_interest',
  beta_dxy_30:'macro',macro_dxy_mom5d:'macro',macro_dxy_mom20d:'macro',
  macro_aud_mom5d:'macro',macro_aud_mom20d:'macro',macro_aud_vol20d:'macro',macro_audjpy_mom5d:'macro',
  macro_au10yr_mom5d:'macro',macro_au10yr_mom20d:'macro',macro_au2yr_mom5d:'macro',
  macro_yield_curve:'macro',macro_yield_curve_acc5:'macro',macro_us10yr_mom5d:'macro',macro_us10yr_mom20d:'macro',
  macro_au_us_spread:'macro',macro_gold_mom5d:'macro',macro_gold_mom20d:'macro',macro_gold_vol20d:'macro',
  macro_oil_mom5d:'macro',macro_oil_mom20d:'macro',macro_oil_vol20d:'macro',
  macro_copper_mom5d:'macro',macro_copper_mom20d:'macro',
  macro_gold_oil_ratio:'macro',macro_gold_oil_mom5d:'macro',macro_copper_gold_ratio:'macro',macro_copper_gold_mom5d:'macro',
  macro_vix_mom5d:'macro',macro_vix_regime_20:'macro',macro_vix_regime_30:'macro',
  macro_stress_composite:'macro',macro_riskoff_momentum:'macro',macro_commodity_tailwind:'macro',
  macro_dxy_5d:'macro',macro_dxy_20d:'macro',macro_gold_usd_5d:'macro',macro_gold_usd_20d:'macro',
  macro_oil_5d:'macro',macro_copper_5d:'macro',macro_audusd_5d:'macro',macro_audusd_20d:'macro',
  ix_yield_gold:'interaction',ix_yield_gold_au:'interaction',ix_curve_gold:'interaction',
  ix_yield_oil:'interaction',ix_curve_oil:'interaction',ix_gold_vix:'interaction',ix_crisis_gold:'interaction',
  ix_vix_volume:'interaction',ix_vix_dollar_vol:'interaction',ix_vix_vol:'interaction',ix_vix_vol_regime:'interaction',
  ix_gold_aud:'interaction',ix_gold_aud_20d:'interaction',ix_curve_vix:'interaction',
  ix_copper_gold_curve:'interaction',ix_spread_aud:'interaction',ix_momentum_vol:'interaction',
  ix_trend_momentum:'interaction',ix_vix_momentum:'interaction',ix_ann_volume:'interaction',ix_ann_gold:'interaction',
  ann_days_since_drilling:'announcement',ann_days_since_capital:'announcement',ann_days_since_quarterly:'announcement',
  ann_days_since_sensitive:'announcement',ann_drilling_today:'announcement',ann_capital_today:'announcement',
  ann_quarterly_today:'announcement',ann_sensitive_today:'announcement',ann_impact_pos_5d:'announcement',
  ann_impact_neg_5d:'announcement',ann_neg_kw_today:'announcement',
};

const _CAT_ORDER   = ['momentum','volume','volatility','trend','candle','short_interest','macro','interaction','announcement'];
const _CAT_COLOURS = {
  momentum:SQ.amber, volume:'#00c832', volatility:'#f97316', trend:'#2dd4bf',
  candle:'#a78bfa', short_interest:'#f472b6', macro:'#d97706', interaction:'#60a5fa', announcement:'#f5a520',
};

let _mlPruningCatsChart = null;
let _mlPruningChart = null;

async function renderPruningRoadmap(ticker) {
  const card        = document.getElementById('ml-pruning-card');
  const placeholder = document.getElementById('ml-pruning-placeholder');
  const cmd         = document.getElementById('ml-pruning-cmd');
  card.style.display        = 'none';
  placeholder.style.display = 'none';

  const safe = _mlCurrentSafe || ticker.toLowerCase().replace(/\./g, '_');
  if (cmd) cmd.textContent = `python scripts/run_ridge_v3.py --tickers ${ticker}`;

  const cached = _mlTickerCache[safe];
  const data = cached?.pruning || null;
  if (!data) { placeholder.style.display = ''; return; }

  const rounds = data.rounds || [];
  if (!rounds.length) { placeholder.style.display = ''; return; }

  // Filter feature table/chart/correlation to only show features surviving the final pruned model
  const finalExcluded = new Set(data.final_excluded || []);
  if (finalExcluded.size > 0) {
    // 1. Feature list + table + importance chart
    _mlCurrentFeatures = _mlCurrentFeatures.filter(f => !finalExcluded.has(f.name));
    mlRenderFeatTable();
    mlFilterFeats(_mlFeatFilter || 'all');

    // 2. Correlation matrix — filter rows/cols to surviving features only
    if (_mlCorrData) {
      const allFeats   = _mlCorrData.features || [];
      const surviving  = new Set(allFeats.filter(f => !finalExcluded.has(f)));
      const keepIdx    = allFeats.map((f,i) => surviving.has(f) ? i : -1).filter(i => i >= 0);
      const keepSet    = new Set(keepIdx);
      _mlCorrData = {
        features:      keepIdx.map(i => allFeats[i]),
        cluster_order: (_mlCorrData.cluster_order || []).filter(f => surviving.has(f)),
        matrix:        keepIdx.map(ri => keepIdx.map(ci => (_mlCorrData.matrix[ri]||[])[ci] ?? 0)),
        linkage:       null,   // linkage not recomputed — dendrogram will be skipped
      };
      // Reset built flags so charts rebuild with filtered data
      _mlHeatmapBuilt = false;
      _mlDendroBuilt  = false;
      _mlForceBuilt   = false;
      if (_mlForceAnim) { cancelAnimationFrame(_mlForceAnim); _mlForceAnim = null; }
      mlCorrTab('heatmap');
    }
  }

  card.style.display = '';

  // ── A. Metrics line chart ─────────────────────────────────────────────────
  const ctx = document.getElementById('ml-pruning-chart').getContext('2d');
  if (_mlPruningChart) _mlPruningChart.destroy();

  const labels   = rounds.map(r => `R${r.round}`);
  const isPF     = rounds.map(r => r.metrics?.is_pf          ?? null);
  const isShr    = rounds.map(r => r.metrics?.is_sharpe       ?? null);
  const pctSig   = rounds.map(r => r.feature_health?.pct_significant ?? null);
  const avgPval  = rounds.map(r => r.feature_health?.avg_pval        ?? null);

  // Mark best IS Sharpe round for annotation
  const bestShrIdx = isShr.reduce((bi, v, i) => (v != null && (isShr[bi] == null || v > isShr[bi]) ? i : bi), 0);

  _mlPruningChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'IS Profit Factor',
          data: isPF,
          borderColor: '#00c832', backgroundColor: 'transparent',
          borderWidth: 2, pointRadius: 3, tension: 0.2, yAxisID: 'y',
        },
        {
          label: 'IS Sharpe',
          data: isShr,
          borderColor: '#f5a520', backgroundColor: 'transparent',
          borderWidth: 2.5, pointRadius: isShr.map((_, i) => i === bestShrIdx ? 6 : 3),
          pointBackgroundColor: isShr.map((_, i) => i === bestShrIdx ? '#f5a520' : 'transparent'),
          tension: 0.2, yAxisID: 'yShr',
        },
        {
          label: '% Sig Features (p<0.05)',
          data: pctSig,
          borderColor: '#38bdf8', backgroundColor: 'transparent',
          borderWidth: 1.5, pointRadius: 2, borderDash: [4, 3], tension: 0.2, yAxisID: 'yPct',
        },
        {
          label: 'Avg p-value',
          data: avgPval,
          borderColor: '#f87171', backgroundColor: 'transparent',
          borderWidth: 1.5, pointRadius: 2, borderDash: [2, 4], tension: 0.2, yAxisID: 'yPval',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#aaa', font: { size: 10 }, boxWidth: 22 } },
        tooltip: {
          callbacks: {
            afterTitle: (items) => {
              const r = rounds[items[0].dataIndex];
              if (!r?.pruned_this_round?.length) return '';
              return 'Pruned: ' + r.pruned_this_round.map(p => p.name).join(', ');
            },
            label: (c) => {
              const v = c.raw;
              if (v == null) return null;
              const u = c.dataset.label.includes('%') ? '%' : c.dataset.label.includes('p-val') ? '' : '';
              return ` ${c.dataset.label}: ${v >= 0 && !c.dataset.label.includes('p-val') ? '' : ''}${typeof v === 'number' ? v.toFixed(3) : v}${u}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { color: '#1a1a1a' }, ticks: { color: '#555', font: { size: 10 } } },
        y: {
          position: 'left', grid: { color: '#1a1a1a' },
          ticks: { color: '#00c832', font: { size: 9 }, callback: v => v.toFixed(2) },
          title: { display: true, text: 'IS PF', color: '#00c832', font: { size: 9 } },
        },
        yShr: {
          position: 'right', grid: { drawOnChartArea: false },
          ticks: { color: '#f5a520', font: { size: 9 }, callback: v => (v >= 0 ? '+' : '') + v.toFixed(2) },
          title: { display: true, text: 'IS Sharpe', color: '#f5a520', font: { size: 9 } },
        },
        yPct: {
          position: 'right', grid: { drawOnChartArea: false },
          min: 0, max: 100,
          ticks: { color: '#38bdf8', font: { size: 9 }, callback: v => v + '%' },
          title: { display: true, text: '% Sig', color: '#38bdf8', font: { size: 9 } },
          display: pctSig.some(v => v != null),
        },
        yPval: {
          position: 'left', grid: { drawOnChartArea: false },
          min: 0, max: 1,
          ticks: { color: '#f87171', font: { size: 9 }, callback: v => 'p=' + v.toFixed(2) },
          title: { display: true, text: 'Avg p-val', color: '#f87171', font: { size: 9 } },
          display: avgPval.some(v => v != null),
        },
      },
    },
  });

  // ── B. Category composition chart ────────────────────────────────────────
  {
    const catCtx = document.getElementById('ml-pruning-cats-chart').getContext('2d');
    if (_mlPruningCatsChart) _mlPruningCatsChart.destroy();

    // Build category counts from current model features (_mlCurrentFeatures) + pruned list
    const finalExcluded = data.final_excluded || [];
    const surviving = _mlCurrentFeatures.map(f => f.name);

    // Count per category for: surviving, pruned
    const survCount   = {};
    const pruneCount  = {};
    _CAT_ORDER.forEach(c => { survCount[c] = 0; pruneCount[c] = 0; });

    surviving.forEach(name => {
      const cat = _FEAT_CAT_MAP[name] || 'other';
      if (survCount[cat] !== undefined) survCount[cat]++;
    });
    finalExcluded.forEach(name => {
      const cat = _FEAT_CAT_MAP[name] || 'other';
      if (pruneCount[cat] !== undefined) pruneCount[cat]++;
    });

    _mlPruningCatsChart = new Chart(catCtx, {
      type: 'bar',
      data: {
        labels: _CAT_ORDER.map(c => c.replace('_', ' ')),
        datasets: [
          {
            label: 'Surviving',
            data: _CAT_ORDER.map(c => survCount[c]),
            backgroundColor: _CAT_ORDER.map(c => (_CAT_COLOURS[c] || '#888') + 'cc'),
            borderColor:     _CAT_ORDER.map(c =>  _CAT_COLOURS[c] || '#888'),
            borderWidth: 1, borderRadius: 3,
          },
          {
            label: 'Pruned',
            data: _CAT_ORDER.map(c => pruneCount[c]),
            backgroundColor: '#ff202055',
            borderColor:     '#ff2020',
            borderWidth: 1, borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#aaa', font: { size: 10 }, boxWidth: 16 } },
          tooltip: {
            callbacks: {
              label: c => {
                const cat  = _CAT_ORDER[c.dataIndex];
                const tot  = (survCount[cat] || 0) + (pruneCount[cat] || 0);
                const pct  = tot ? Math.round(c.raw / tot * 100) : 0;
                return ` ${c.dataset.label}: ${c.raw} / ${tot}  (${pct}% of category)`;
              },
            },
          },
        },
        scales: {
          x: { stacked: false, grid: { color: '#1a1a1a' }, ticks: { color: '#aaa', font: { size: 10 } } },
          y: {
            stacked: false, grid: { color: '#1a1a1a' },
            ticks: { color: '#555', font: { size: 10 }, stepSize: 1 },
            title: { display: true, text: 'Feature count', color: '#555', font: { size: 9 } },
          },
        },
      },
    });
  }

  // Legend note below chart
  const chartNote = document.createElement('div');
  chartNote.style.cssText = 'font-size:10px;color:var(--muted);margin-top:6px;margin-bottom:14px;line-height:1.6';
  chartNote.innerHTML = `
    <span style="color:#00c832">■ IS PF</span> &amp;
    <span style="color:#f5a520">■ IS Sharpe</span> oscillate as Ridge redistributes weight after each removal — this is normal and expected.<br>
    Watch <span style="color:#38bdf8">╌ % Significant</span> (should rise) and <span style="color:#f87171">··· Avg p-val</span> (should fall) — these confirm the model is getting cleaner even when PF/Sharpe dip.
    <span style="color:#f5a520;font-weight:700"> ● = best IS Sharpe round.</span>
  `;
  document.getElementById('ml-pruning-chart').parentNode.after(chartNote);

  // ── B. Round cards ────────────────────────────────────────────────────────
  const container = document.getElementById('ml-pruning-rounds');
  container.innerHTML = '';

  const stopReason  = data.stop_reason || '';
  const baseFeats   = data.baseline_features || 0;
  const finalExcl   = (data.final_excluded || []).length;

  rounds.forEach((r, idx) => {
    const isBaseline = r.round === 0;
    const m  = r.metrics  || {};
    const d  = r.delta    || {};
    const pruned = r.pruned_this_round || [];

    function deltaSpan(val, invert = false) {
      if (val == null) return '<span style="color:var(--muted)">—</span>';
      const good = invert ? val < 0 : val > 0;
      const col  = good ? 'var(--green)' : val === 0 ? 'var(--muted)' : 'var(--red)';
      return `<span style="color:${col}">${val >= 0 ? '+' : ''}${val.toFixed(3)}</span>`;
    }

    let cardBorder = '#2a2a2a';
    if (isBaseline) cardBorder = '#444';
    else if (r.stopped) cardBorder = '#b45309';
    else if (d.is_sharpe > 0.01) cardBorder = '#16a34a';
    else if (d.is_sharpe < -0.15) cardBorder = '#991b1b';

    let prunedHtml = '';
    if (isBaseline) {
      prunedHtml = `<div style="font-size:11px;color:var(--muted);margin-bottom:6px">Baseline — all ${baseFeats} features</div>`;
    } else if (pruned.length) {
      prunedHtml = pruned.map(p => {
        const pColor = p.p_value > 0.5 ? 'var(--red)' : p.p_value > 0.2 ? SQ.amber : 'var(--muted)';
        return `<div style="display:flex;align-items:baseline;gap:6px;font-size:11px;margin-bottom:3px">
          <span style="color:#f87171">✂</span>
          <span style="color:#e5e7eb;font-family:monospace">${p.name}</span>
          <span style="color:${pColor};font-size:10px">p=${p.p_value.toFixed(2)}</span>
        </div>`;
      }).join('');
    }

    const h = r.feature_health || {};
    const pctSigColor = (h.pct_significant > 60) ? 'var(--green)' : (h.pct_significant > 40) ? SQ.amber : 'var(--red)';
    const avgPvalColor = (h.avg_pval < 0.2) ? 'var(--green)' : (h.avg_pval < 0.4) ? SQ.amber : 'var(--red)';
    const isBestShr = !isBaseline && idx === bestShrIdx;

    const metricsHtml = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;font-size:11px;margin-top:6px;border-top:1px solid #1e1e1e;padding-top:6px">
        <span style="color:var(--muted)">IS PF</span>
        <span style="font-family:monospace;color:var(--green);text-align:right">${m.is_pf?.toFixed(3) ?? '—'}${!isBaseline ? ' ' + deltaSpan(d.is_pf) : ''}</span>
        <span style="color:var(--muted)">IS Shr</span>
        <span style="font-family:monospace;color:#f5a520;text-align:right">${m.is_sharpe != null ? (m.is_sharpe >= 0 ? '+' : '') + m.is_sharpe.toFixed(3) : '—'}${!isBaseline ? ' ' + deltaSpan(d.is_sharpe) : ''}${isBestShr ? ' <span title="Best IS Sharpe round">★</span>' : ''}</span>
        <span style="color:#38bdf8;font-size:10px">% Sig</span>
        <span style="font-family:monospace;font-size:10px;color:${pctSigColor};text-align:right">${h.pct_significant != null ? h.pct_significant.toFixed(0) + '%' : '—'} <span style="color:var(--muted)">(${h.n_significant_p05 ?? '—'}/${h.n_features ?? '—'})</span></span>
        <span style="color:#f87171;font-size:10px">Avg p</span>
        <span style="font-family:monospace;font-size:10px;color:${avgPvalColor};text-align:right">${h.avg_pval != null ? h.avg_pval.toFixed(3) : '—'}</span>
        <span style="color:var(--muted);font-size:10px">Avg SE</span>
        <span style="font-family:monospace;font-size:10px;text-align:right;color:var(--muted)">${h.avg_std_err != null ? h.avg_std_err.toFixed(5) : '—'}</span>
      </div>`;

    let stopHtml = '';
    if (r.stopped) {
      const stopMsgs = {
        over_pruned:   'STOP — IS Sharpe dropped >0.30 from baseline. Pruning halted.',
        no_candidates: 'STOP — All remaining features are statistically protected.',
        max_rounds:    'STOP — Maximum rounds reached.',
      };
      stopHtml = `<div style="margin-top:8px;padding:5px 8px;background:rgba(180,83,9,0.1);border-left:2px solid #b45309;font-size:10px;color:#f59e0b">
        ${stopMsgs[stopReason] || 'STOP — ' + stopReason}
      </div>`;
    } else if (idx === rounds.length - 1 && !r.stopped && stopReason) {
      const stopMsgs = {
        no_candidates: 'All remaining features are statistically protected.',
        max_rounds:    'Maximum rounds reached.',
      };
      stopHtml = `<div style="margin-top:8px;font-size:10px;color:var(--muted)">${stopMsgs[stopReason] || stopReason}</div>`;
    }

    const card = document.createElement('div');
    card.style.cssText = [
      'min-width:190px', 'max-width:220px', 'flex-shrink:0',
      `border:1px solid ${cardBorder}`, 'border-radius:6px',
      'background:var(--card2)', 'padding:10px 12px',
    ].join(';');
    card.innerHTML = `
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${isBaseline ? 'var(--muted)' : 'var(--gold)'};margin-bottom:6px">
        ${isBaseline ? 'Baseline' : 'Round ' + r.round}
      </div>
      ${prunedHtml}
      ${metricsHtml}
      ${stopHtml}
    `;
    container.appendChild(card);
  });

  // Summary line
  if (finalExcl > 0) {
    const summary = document.createElement('div');
    summary.style.cssText = 'min-width:160px;max-width:200px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px;text-align:center;padding:10px';
    summary.innerHTML = `${finalExcl} feature${finalExcl !== 1 ? 's' : ''} pruned<br>${baseFeats - finalExcl} remaining`;
    container.appendChild(summary);
  }
}


