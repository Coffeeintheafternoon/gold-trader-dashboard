// ── Universe Tab ─────────────────────────────────────────────────────────────
async function initUniverseTab() {
  await Promise.all([
    loadScreenerPanel(),
    loadFullScreenerPanel(),
    loadComparisonPanel()
  ]);
  _renderModelGlossary();
}

// ── Full ASX Universe Screener (300 tickers) ──────────────────────────────────
let _fullScreenerData=null;
let _filteredRows=[];
let _metaTop20=[];
let _screenerPage=0;
const _SCREENER_PAGE_SIZE=20;

async function loadFullScreenerPanel() {
  let data;
  try { const res=await fetch(`screener_full.json?v=${_CV}`); if(!res.ok)return; data=await res.json(); } catch(e){return;}
  const tickers=data.tickers||[];if(!tickers.length)return;

  // models and notes are now embedded in each ticker row
  tickers.forEach(t=>{ t._models=t.models||[]; t._note=t.note||null; });

  _fullScreenerData=tickers;
  document.getElementById('full-screener-section').style.display='';
  const valid=tickers.filter(t=>!t.error);
  const edge=valid.filter(t=>t.pf&&t.pf>=1.10);
  document.getElementById('full-screener-hero-row').innerHTML=`
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Tickers Screened</div><div class="hero-value color-gold">${data.n_total}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">ASX equities</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Valid Results</div><div class="hero-value" style="color:var(--green)">${data.n_valid}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${data.n_error} no data</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">PF ≥ 1.10</div><div class="hero-value color-gold">${edge.length}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${Math.round(edge.length/valid.length*100)}% of valid</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Sectors</div><div class="hero-value" style="font-size:22px">${new Set(tickers.map(t=>t.sector)).size}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">sector coverage</div></div>`;
  const sectors=[...new Set(tickers.map(t=>t.sector).filter(Boolean))].sort();
  const sel=document.getElementById('full-screener-sector-filter');
  sectors.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o);});
  filterFullScreener();
  _populateModelFilter();
  _buildModelVsModel();
}

function _notesBadge(note) {
  if(!note) return '<span style="color:#333;font-size:10px">—</span>';
  const cfg = {
    'BANKRUPT':   { bg:'rgba(220,38,38,0.15)',  border:'rgba(220,38,38,0.5)',  color:'#f87171' },
    'DO NOT USE': { bg:'rgba(234,88,12,0.15)',  border:'rgba(234,88,12,0.5)',  color:'#fb923c' },
    'DELIST RISK':{ bg:'rgba(234,179,8,0.12)',  border:'rgba(234,179,8,0.4)', color:SQ.amber },
    'ILLIQUID':   { bg:'rgba(139,92,246,0.12)', border:'rgba(139,92,246,0.4)',color:'#a78bfa' },
    'MERGED':     { bg:'rgba(75,85,99,0.15)',   border:'rgba(75,85,99,0.5)',  color:'#9ca3af' },
    'NOTE':       { bg:'rgba(59,130,246,0.12)', border:'rgba(59,130,246,0.4)',color:'#60a5fa' },
  };
  const s = cfg[note.label] || cfg['NOTE'];
  const tip = note.note ? ` title="${note.note.replace(/"/g,'&quot;')}"` : '';
  return `<span${tip} style="display:inline-block;padding:2px 7px;border-radius:3px;border:1px solid ${s.border};background:${s.bg};color:${s.color};font-size:10px;font-weight:700;white-space:nowrap">${note.label}</span>`;
}

function _modelBadges(models, activeTicker) {
  if(!models||!models.length) return '<span style="color:#333;font-size:10px">—</span>';
  return models.map(m=>{
    const isDefault=m.label==='Ridge (1yr)';
    const isVc1=m.label==='VC1';
    const bg=isVc1?'rgba(139,92,246,0.16)':isDefault?'rgba(245,165,32,0.12)':'rgba(0,255,65,0.08)';
    const border=isVc1?'rgba(139,92,246,0.5)':isDefault?'rgba(245,165,32,0.35)':'rgba(0,255,65,0.25)';
    const color=isVc1?'#a78bfa':isDefault?'var(--gold)':'var(--green)';
    return `<span onclick="event.stopPropagation();openTickerInModelLab('${activeTicker}',{},'${m.safe_name}')" title="Open ${m.label}" style="display:inline-block;padding:2px 7px;margin:1px 2px;border-radius:3px;border:1px solid ${border};background:${bg};color:${color};font-size:10px;cursor:pointer;white-space:nowrap">${m.label}</span>`;
  }).join('');
}

function filterFullScreener() {
  if(!_fullScreenerData)return;
  const tickerQ=(document.getElementById('full-screener-ticker-search').value||'').trim().toUpperCase();
  const sectorF=document.getElementById('full-screener-sector-filter').value;
  const modelF=(document.getElementById('full-screener-model-filter')||{}).value||'';
  const showF=document.getElementById('full-screener-show').value;
  const sortF=document.getElementById('full-screener-sort').value;
  const minPF=parseFloat(document.getElementById('fs-filter-pf')?.value)||0;
  const minSh=parseFloat(document.getElementById('fs-filter-sharpe')?.value);
  const mcptF=document.getElementById('fs-filter-mcpt')?.value||'';
  const overfitF=document.getElementById('fs-filter-overfit')?.value||'';
  let rows=_fullScreenerData.slice();
  if(tickerQ)rows=rows.filter(t=>t.ticker&&t.ticker.toUpperCase().includes(tickerQ));
  if(sectorF)rows=rows.filter(t=>t.sector===sectorF);
  if(modelF)rows=rows.filter(t=>t._models&&t._models.some(m=>m.label===modelF));
  if(showF==='edge')rows=rows.filter(t=>t.pf&&t.pf>=1.10);
  else if(showF==='valid')rows=rows.filter(t=>!t.error);
  else if(showF==='models')rows=rows.filter(t=>t._models&&t._models.length>0);
  if(minPF)rows=rows.filter(t=>t.ho_pf!=null&&t.ho_pf>=minPF);
  if(!isNaN(minSh)&&document.getElementById('fs-filter-sharpe')?.value!=='')rows=rows.filter(t=>t.ho_sharpe!=null&&t.ho_sharpe>=minSh);
  if(mcptF)rows=rows.filter(t=>t.p_value!=null&&t.p_value<=parseFloat(mcptF));
  if(overfitF){const vals=overfitF.split('|');rows=rows.filter(t=>t.overfit&&vals.includes(t.overfit));}
  if(sortF==='pf_desc')rows.sort((a,b)=>(b.pf||0)-(a.pf||0));
  else if(sortF==='sharpe_desc')rows.sort((a,b)=>(b.sharpe||0)-(a.sharpe||0));
  else if(sortF==='mean_desc')rows.sort((a,b)=>(b.mean_ann_pct||0)-(a.mean_ann_pct||0));
  else if(sortF==='oos_desc')rows.sort((a,b)=>(b.oos_bars||0)-(a.oos_bars||0));
  else if(sortF==='ticker_asc')rows.sort((a,b)=>a.ticker.localeCompare(b.ticker));
  _filteredRows=rows;
  _screenerPage=0;
  _renderScreenerPage();
}

function _phaseBadge(t) {
  const phase = t.phase;
  if (!phase) return '';
  const styles = {
    'Explorer':  `color:${SQ.cyan};border-color:${hexA(SQ.cyan,0.4)};background:${hexA(SQ.cyan,0.10)}`,
    'Developer': `color:${SQ.amber};border-color:${hexA(SQ.amber,0.4)};background:${hexA(SQ.amber,0.10)}`,
    'Producer':  `color:${SQ.green};border-color:${hexA(SQ.green,0.4)};background:${hexA(SQ.green,0.10)}`,
  };
  const s = styles[phase] || `color:${SQ.neutral};border-color:${hexA(SQ.neutral,0.3)};background:transparent`;
  return `<span style="display:inline-block;margin-top:2px;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;border:1px solid;letter-spacing:0.04em;${s}">${phase.toUpperCase()}</span>`;
}

function _renderScreenerPage() {
  const total=_filteredRows.length;
  const totalPages=Math.max(1,Math.ceil(total/_SCREENER_PAGE_SIZE));
  if(_screenerPage>=totalPages)_screenerPage=totalPages-1;
  const start=_screenerPage*_SCREENER_PAGE_SIZE;
  const pageRows=_filteredRows.slice(start,start+_SCREENER_PAGE_SIZE);

  document.getElementById('full-screener-count').textContent=
    `Showing ${start+1}–${Math.min(start+_SCREENER_PAGE_SIZE,total)} of ${total} tickers`;

  document.getElementById('full-screener-tbody').innerHTML=pageRows.map((t,i)=>{
    const rowBg=i%2===0?'':'background:#111';
    const defaultSafe=t._models&&t._models.length?t._models[0].safe_name:null;
    const clickable=`onclick="openTickerInModelLab('${t.ticker}',{},${defaultSafe?`'${defaultSafe}'`:'null'})" onmouseover="this.style.background='#1a1a1a'" onmouseout="this.style.background=''"`;
    const badges=_modelBadges(t._models, t.ticker);
    const noteBadge=_notesBadge(t._note);
    const phase=_phaseBadge(t);
    const sectorCell=`<td style="padding:6px 10px;font-size:11px"><div style="color:var(--muted)">${t.sector||'—'}</div>${phase}</td>`;
    if(t.error)return`<tr ${clickable} style="border-bottom:1px solid #1a1a1a;${rowBg};cursor:pointer"><td style="padding:6px 10px;color:#6b7280;font-size:12px">${t.ticker}</td>${sectorCell}<td colspan="5" style="padding:6px 10px;color:#4b5563;font-size:11px">No data</td><td style="padding:6px 10px">${badges}</td><td style="padding:6px 10px">${noteBadge}</td></tr>`;
    const pfC=t.pf===null?'var(--muted)':t.pf>=1.10?'var(--green)':t.pf>=1.05?SQ.amber:'var(--muted)';
    const shC=t.sharpe===null?'var(--muted)':t.sharpe>=0.5?'var(--green)':t.sharpe>=0.25?SQ.amber:'var(--muted)';
    const retC=t.mean_ann_pct===null?'var(--muted)':t.mean_ann_pct>=20?'var(--green)':t.mean_ann_pct>=10?SQ.amber:'var(--muted)';
    const ciC=t.ci95_lower===null?'var(--muted)':t.ci95_lower>0?'var(--green)':'var(--red)';
    return`<tr ${clickable} style="border-bottom:1px solid #1a1a1a;${rowBg};cursor:pointer"><td style="padding:6px 10px;font-weight:600;color:#e5e7eb;font-size:12px">${t.ticker} <span style="font-size:10px;color:#444">→</span></td>${sectorCell}<td style="padding:6px 10px;text-align:right;font-family:monospace;color:${pfC}">${t.pf!=null?t.pf.toFixed(3):'—'}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;color:${shC}">${t.sharpe!=null?t.sharpe.toFixed(2):'—'}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;color:${retC}">${t.mean_ann_pct!=null?(t.mean_ann_pct>=0?'+':'')+t.mean_ann_pct.toFixed(1)+'%':'—'}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;color:${ciC}">${t.ci95_lower!=null?(t.ci95_lower>=0?'+':'')+t.ci95_lower.toFixed(1)+'%':'—'}</td><td style="padding:6px 10px;text-align:right;color:var(--muted)">${t.oos_bars?.toLocaleString()??'—'}</td><td style="padding:6px 10px">${badges}</td><td style="padding:6px 10px">${noteBadge}</td></tr>`;
  }).join('');

  // Pagination controls
  const pag=document.getElementById('full-screener-pagination');
  if(!pag)return;
  const btnStyle=(disabled,active)=>`style="padding:4px 10px;border-radius:3px;border:1px solid ${active?'var(--gold)':'#444'};background:${active?'rgba(245,165,32,0.15)':'#1a1a1a'};color:${active?'var(--gold)':'#aaa'};font-size:11px;cursor:${disabled?'default':'pointer'};opacity:${disabled?0.4:1}"`;
  let html=`<button ${btnStyle(_screenerPage===0,false)} onclick="_goScreenerPage(0)" ${_screenerPage===0?'disabled':''}>«</button>`;
  html+=`<button ${btnStyle(_screenerPage===0,false)} onclick="_goScreenerPage(${_screenerPage-1})" ${_screenerPage===0?'disabled':''}>‹</button>`;
  // Page number buttons — show up to 7 around current
  const wing=3;
  const lo=Math.max(0,_screenerPage-wing), hi=Math.min(totalPages-1,_screenerPage+wing);
  for(let p=lo;p<=hi;p++){
    html+=`<button ${btnStyle(false,p===_screenerPage)} onclick="_goScreenerPage(${p})">${p+1}</button>`;
  }
  html+=`<button ${btnStyle(_screenerPage>=totalPages-1,false)} onclick="_goScreenerPage(${_screenerPage+1})" ${_screenerPage>=totalPages-1?'disabled':''}>›</button>`;
  html+=`<button ${btnStyle(_screenerPage>=totalPages-1,false)} onclick="_goScreenerPage(${totalPages-1})" ${_screenerPage>=totalPages-1?'disabled':''}>»</button>`;
  html+=`<span style="font-size:11px;color:var(--muted);margin-left:4px">Page ${_screenerPage+1} of ${totalPages}</span>`;
  pag.innerHTML=html;
}

function _goScreenerPage(p) {
  _screenerPage=p;
  _renderScreenerPage();
  document.getElementById('full-screener-table')?.scrollIntoView({behavior:'smooth',block:'nearest'});
}

let _mvmSharpeChart=null,_mvmEdgeChart=null,_mvmScatterChart=null;
let _mvmAllLabels=[], _mvmActiveLabels=new Set(), _mvmByModel={};

function _toggleMvmModel(label) {
  if (_mvmActiveLabels.has(label)) {
    if (_mvmActiveLabels.size > 1) _mvmActiveLabels.delete(label);
  } else {
    _mvmActiveLabels.add(label);
  }
  _renderMvmCharts();
}

function _populateModelFilter() {
  if (!_fullScreenerData) return;
  const labels = [...new Set(_fullScreenerData.flatMap(t => (t._models||[]).map(m => m.label)))].sort();
  const sel = document.getElementById('full-screener-model-filter');
  if (!sel) return;
  // Keep the "All Models" option, replace the rest
  sel.innerHTML = '<option value="">All Models</option>' + labels.map(l => `<option value="${l}">${l}</option>`).join('');
}

const _MVM_PALETTE = ['#f5a520','#10b981','#a78bfa','#60a5fa','#fb923c','#f472b6','#34d399',SQ.amber];
const _mvmColFor = label => _MVM_PALETTE[_mvmAllLabels.indexOf(label) % _MVM_PALETTE.length];

function _buildModelVsModel() {
  if (!_fullScreenerData) return;

  // Group all model entries by label
  _mvmByModel = {};
  _fullScreenerData.forEach(t => {
    (t._models || []).forEach(m => {
      if (!_mvmByModel[m.label]) _mvmByModel[m.label] = [];
      _mvmByModel[m.label].push({ ticker: t.ticker, sector: t.sector, is_sharpe: m.is_sharpe, ho_sharpe: m.ho_sharpe, is_pf: m.is_pf, ho_pf: m.ho_pf, overfit: t.overfit, p_value: t.p_value });
    });
  });

  _mvmAllLabels = Object.keys(_mvmByModel).sort();
  if (!_mvmAllLabels.length) return;

  // Default: all models active
  _mvmActiveLabels = new Set(_mvmAllLabels);

  // Toggle bar
  const toggleBar = document.getElementById('mvm-toggle-bar');
  if (toggleBar) {
    toggleBar.innerHTML = _mvmAllLabels.map(label => {
      const col = _mvmColFor(label);
      return `<button id="mvmbtn-${label.replace(/\W/g,'_')}" onclick="_toggleMvmModel('${label.replace(/'/g,"&#39;")}')"
        style="padding:5px 14px;border-radius:3px;border:1px solid ${col};background:${col}22;color:${col};font-size:11px;font-weight:700;cursor:pointer;letter-spacing:0.4px">${label}</button>`;
    }).join('');
  }

  _renderMvmCharts();
  document.getElementById('model-vs-model-section').style.display = '';
}

function _mvmFilteredRows(label) {
  const minPF  = parseFloat(document.getElementById('mvm-filter-pf')?.value) || 0;
  const minShV = document.getElementById('mvm-filter-sharpe')?.value || '';
  const minSh  = minShV !== '' ? parseFloat(minShV) : null;
  const mcptF  = document.getElementById('mvm-filter-mcpt')?.value || '';
  const ovfF   = document.getElementById('mvm-filter-overfit')?.value || '';
  const ovfVals= ovfF ? ovfF.split('|') : null;
  return (_mvmByModel[label] || []).filter(m => {
    if (minPF  && (m.ho_pf   == null || m.ho_pf   < minPF))  return false;
    if (minSh  != null && (m.ho_sharpe == null || m.ho_sharpe < minSh))  return false;
    if (mcptF  && (m.p_value == null || m.p_value > parseFloat(mcptF))) return false;
    if (ovfVals && (!m.overfit || !ovfVals.includes(m.overfit))) return false;
    return true;
  });
}

function _renderMvmCharts() {
  const active = _mvmAllLabels.filter(l => _mvmActiveLabels.has(l));
  if (!active.length) return;

  // Update toggle button styles
  _mvmAllLabels.forEach(label => {
    const btn = document.getElementById('mvmbtn-' + label.replace(/\W/g,'_'));
    if (!btn) return;
    const col = _mvmColFor(label);
    const on = _mvmActiveLabels.has(label);
    btn.style.background = on ? col + '33' : 'transparent';
    btn.style.borderColor = on ? col : '#333';
    btn.style.color = on ? col : '#555';
  });

  // Total filtered ticker count for filter bar
  const totalFiltered = active.reduce((s, l) => s + _mvmFilteredRows(l).length, 0);
  const countEl = document.getElementById('mvm-filter-count');
  if (countEl) countEl.textContent = `${totalFiltered} model entries match`;

  // Hero cards (all labels, greyed if inactive) — stats based on filtered rows
  const heroEl = document.getElementById('mvm-hero-row');
  if (heroEl) {
    heroEl.innerHTML = _mvmAllLabels.map(label => {
      const on = _mvmActiveLabels.has(label);
      const ms = on ? _mvmFilteredRows(label) : _mvmByModel[label];
      const valid = ms.filter(m => m.ho_sharpe != null && m.ho_pf != null);
      const avgSh = valid.length ? valid.reduce((s, m) => s + m.ho_sharpe, 0) / valid.length : null;
      const edgePct = valid.length ? Math.round(valid.filter(m => m.ho_pf >= 1.10).length / valid.length * 100) : null;
      const col = _mvmColFor(label);
      const shC = !on ? '#333' : avgSh == null ? 'var(--muted)' : avgSh >= 0.5 ? 'var(--green)' : avgSh >= 0 ? SQ.amber : 'var(--red)';
      return `<div class="hero-card" onclick="_toggleMvmModel('${label.replace(/'/g,"&#39;")}')" style="min-width:150px;border-top:2px solid ${on?col:'#222'};cursor:pointer;opacity:${on?1:0.4}">
        <div class="hero-label" style="color:${on?col:'#444'}">${label}</div>
        <div class="hero-value" style="color:${shC};font-size:22px">${avgSh != null ? avgSh.toFixed(2) : '—'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${ms.length} tickers · avg HO Sharpe</div>
        <div style="font-size:11px;color:var(--muted)">${edgePct != null ? edgePct + '% PF ≥ 1.10' : '—'}</div>
      </div>`;
    }).join('');
  }

  const avgSharpes = active.map(label => {
    const valid = _mvmFilteredRows(label).filter(m => m.ho_sharpe != null);
    return valid.length ? +(valid.reduce((s, m) => s + m.ho_sharpe, 0) / valid.length).toFixed(3) : null;
  });
  const edgePcts = active.map(label => {
    const valid = _mvmFilteredRows(label).filter(m => m.ho_pf != null);
    return valid.length ? +(valid.filter(m => m.ho_pf >= 1.10).length / valid.length * 100).toFixed(1) : null;
  });
  const barColors = active.map(l => _mvmColFor(l));

  const shCtx = document.getElementById('mvm-sharpe-chart');
  if (shCtx) {
    if (_mvmSharpeChart) _mvmSharpeChart.destroy();
    _mvmSharpeChart = new Chart(shCtx, {
      type: 'bar',
      data: { labels: active, datasets: [{ data: avgSharpes, backgroundColor: barColors.map(c => c + '99'), borderColor: barColors, borderWidth: 2, borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `Avg HO Sharpe: ${c.raw?.toFixed(3) ?? '—'}` } } }, scales: { x: { grid: { color: '#1a1a1a' }, ticks: { color: '#9ca3af', font: { size: 11 } } }, y: { grid: { color: '#1a1a1a' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'HO Sharpe', color: '#6b7280', font: { size: 10 } } } } }
    });
  }

  const edCtx = document.getElementById('mvm-edge-chart');
  if (edCtx) {
    if (_mvmEdgeChart) _mvmEdgeChart.destroy();
    _mvmEdgeChart = new Chart(edCtx, {
      type: 'bar',
      data: { labels: active, datasets: [{ data: edgePcts, backgroundColor: barColors.map(c => c + '99'), borderColor: barColors, borderWidth: 2, borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.raw?.toFixed(1) ?? '—'}% of tickers PF ≥ 1.10` } } }, scales: { x: { grid: { color: '#1a1a1a' }, ticks: { color: '#9ca3af', font: { size: 11 } } }, y: { min: 0, max: 100, grid: { color: '#1a1a1a' }, ticks: { color: '#9ca3af', callback: v => v + '%' }, title: { display: true, text: '% tickers PF ≥ 1.10', color: '#6b7280', font: { size: 10 } } } } }
    });
  }

  const scCtx = document.getElementById('mvm-scatter-chart');
  if (scCtx) {
    if (_mvmScatterChart) _mvmScatterChart.destroy();
    const scatterDatasets = active.map(label => ({
      label,
      data: _mvmFilteredRows(label).filter(m => m.is_sharpe != null && m.ho_sharpe != null).map(m => ({ x: m.is_sharpe, y: m.ho_sharpe, ticker: m.ticker })),
      backgroundColor: _mvmColFor(label) + 'aa',
      borderColor: _mvmColFor(label),
      borderWidth: 1, pointRadius: 5, pointHoverRadius: 7, type: 'scatter',
    }));
    const allIS = active.flatMap(l => _mvmFilteredRows(l).map(m => m.is_sharpe)).filter(v => v != null);
    const allHO = active.flatMap(l => _mvmFilteredRows(l).map(m => m.ho_sharpe)).filter(v => v != null);
    const axMin = Math.min(...allIS, ...allHO, -0.5);
    const axMax = Math.max(...allIS, ...allHO, 1.5);
    scatterDatasets.push({ label: 'IS = HO', data: [{ x: axMin, y: axMin }, { x: axMax, y: axMax }], type: 'line', borderColor: 'rgba(255,255,255,0.15)', borderDash: [5,4], borderWidth: 1.5, pointRadius: 0, fill: false });
    _mvmScatterChart = new Chart(scCtx, {
      type: 'scatter',
      data: { datasets: scatterDatasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 10, padding: 8, filter: item => item.text !== 'IS = HO' } },
          tooltip: { callbacks: { label: c => c.raw.ticker ? `${c.raw.ticker}: IS ${c.raw.x?.toFixed(2)} → HO ${c.raw.y?.toFixed(2)}` : null } }
        },
        scales: {
          x: { grid: { color: '#1a1a1a' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'IS Sharpe', color: '#6b7280', font: { size: 11 } } },
          y: { grid: { color: '#1a1a1a' }, ticks: { color: '#9ca3af' }, title: { display: true, text: 'HO Sharpe', color: '#6b7280', font: { size: 11 } } }
        }
      }
    });
  }
}

// ── Screener Panel ────────────────────────────────────────────────────────────
let _screenerPvalChart=null,_screenerPfChart=null;

async function loadScreenerPanel() {
  let data;
  try { const res=await fetch(`screener_summary.json?v=${_CV}`); if(!res.ok)return; data=await res.json(); } catch(e){return;}
  const tickers=data.tickers||[];if(!tickers.length)return;
  _screenerData=data;
  document.getElementById('screener-section').style.display='';
  document.getElementById('screener-hero-row').innerHTML=`
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Tickers Screened</div><div class="hero-value color-gold">${data.n_total}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">ASX miners &amp; diversifieds</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Accepted</div><div class="hero-value" style="color:var(--green)">${data.n_accept}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">MCPT p &lt; 0.05</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Rejected</div><div class="hero-value" style="color:var(--red)">${data.n_reject}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">No validated edge</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">No Data</div><div class="hero-value" style="color:var(--muted)">${data.n_error}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Delisted / unavailable</div></div>
    <div class="hero-card" style="min-width:200px"><div class="hero-label tip" data-tip="${data.strategy_note||''}">Strategy Winner</div><div class="hero-value color-gold" style="font-size:14px">Linear Regression</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Donchian: 0/22 validated</div></div>`;
  const chartTickers=tickers.filter(t=>t.lr_p!==null&&t.lr_p!==undefined);
  const labels=chartTickers.map(t=>t.ticker),pvals=chartTickers.map(t=>t.lr_p),pfs=chartTickers.map(t=>t.lr_pf);
  const barColors=chartTickers.map(t=>t.verdict==='ACCEPT'?GREEN_75:t.verdict==='BORDERLINE'?'rgba(251,191,36,0.75)':RED_65);
  const borderColors=chartTickers.map(t=>t.verdict==='ACCEPT'?GREEN:t.verdict==='BORDERLINE'?SQ.amber:RED);
  const pCtx=document.getElementById('screener-pval-chart').getContext('2d');
  if(_screenerPvalChart)_screenerPvalChart.destroy();
  _screenerPvalChart=new Chart(pCtx,{type:'bar',data:{labels,datasets:[{data:pvals,backgroundColor:barColors,borderColor:borderColors,borderWidth:1,borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>{const t=chartTickers[ctx.dataIndex];return[` p = ${ctx.raw.toFixed(3)}  →  ${t.verdict}`,` PF = ${t.lr_pf?.toFixed(3)??'—'}`,` ${t.note}`];}}},annotation:{annotations:{threshold:{type:'line',value:0.05,scaleID:'x',borderColor:'rgba(212,160,23,0.7)',borderWidth:2,borderDash:[5,4],label:{content:'p=0.05',display:true,position:'start',color:'#d4a017',font:{size:10}}}}}},scales:{x:{min:0,max:1,grid:{color:'#222'},ticks:{callback:v=>v.toFixed(2)}},y:{grid:{display:false},ticks:{font:{size:11}}}}}});
  const pfCtx=document.getElementById('screener-pf-chart').getContext('2d');
  if(_screenerPfChart)_screenerPfChart.destroy();
  _screenerPfChart=new Chart(pfCtx,{type:'bar',data:{labels,datasets:[{data:pfs,backgroundColor:barColors,borderColor:borderColors,borderWidth:1,borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>{const t=chartTickers[ctx.dataIndex];return[` PF = ${ctx.raw?.toFixed(3)}`,` p = ${t.lr_p?.toFixed(3)??'—'}`,` ${t.note}`];}}}},scales:{x:{min:0.9,grid:{color:'#222'},ticks:{callback:v=>v.toFixed(2)}},y:{grid:{display:false},ticks:{font:{size:11}}}}}});
  const VERDICT_STYLE={'ACCEPT':{bg:GREEN_12,border:GREEN_4,color:GREEN,label:'ACCEPT ✓'},'BORDERLINE':{bg:'rgba(251,191,36,0.12)',border:'rgba(251,191,36,0.4)',color:SQ.amber,label:'BORDERLINE ~'},'REJECT':{bg:RED_08,border:RED_3,color:RED,label:'REJECT ✗'},'ERROR':{bg:'rgba(107,114,128,0.08)',border:'rgba(107,114,128,0.3)',color:'#6b7280',label:'NO DATA'}};
  document.getElementById('screener-tbody').innerHTML=tickers.map((t,i)=>{
    const vs=VERDICT_STYLE[t.verdict]||VERDICT_STYLE.REJECT;
    const pvalC=t.lr_p!==null?(t.lr_p<0.01?'var(--green)':t.lr_p<0.05?hexA(SQ.green,0.75):t.lr_p<0.10?SQ.amber:'var(--muted)'):'var(--muted)';
    const rowBg=i%2===0?'':'background:#111';
    const se=t.lr_se_ann,seC=se===null?'var(--muted)':se<2?'var(--green)':se<5?SQ.amber:'var(--red)',seStr=se!==null?se.toFixed(2)+'%':'—';
    const ci=t.lr_ci95_lower,ciC=ci===null?'var(--muted)':ci>0?'var(--green)':'var(--red)',ciStr=ci!==null?(ci>=0?'+':'')+ci.toFixed(2)+'%':'—';
    const sharpe=t.lr_sharpe,sharpeStr=sharpe!==null?sharpe.toFixed(2):'—',sharpeC=sharpe===null?'var(--muted)':sharpe>0.5?'var(--green)':sharpe>0.25?SQ.amber:'var(--muted)';
    return`<tr style="border-bottom:1px solid #1a1a1a;${rowBg}"><td style="padding:7px 10px;font-weight:600;color:#e5e7eb;font-size:13px">${t.ticker}</td><td style="padding:7px 10px;color:var(--muted);font-size:11px;white-space:nowrap">${t.sector}</td><td style="padding:7px 10px;text-align:center"><span style="font-size:11px;font-weight:700;color:${vs.color};background:${vs.bg};border:1px solid ${vs.border};padding:2px 8px;border-radius:4px;white-space:nowrap">${vs.label}</span></td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:${pvalC}">${t.lr_p!==null?t.lr_p.toFixed(3):'—'}</td><td style="padding:7px 10px;text-align:right;font-family:monospace">${t.lr_pf!==null?t.lr_pf?.toFixed(3):'—'}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:${sharpeC}">${sharpeStr}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:${seC}">${seStr}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:${ciC}">${ciStr}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:var(--muted)">${t.don_p!==null?t.don_p?.toFixed(3):'—'}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:var(--muted)">${t.don_pf!==null?t.don_pf?.toFixed(3):'—'}</td><td style="padding:7px 10px;text-align:right;color:var(--muted)">${t.oos_bars?.toLocaleString()??'—'}</td><td style="padding:7px 10px;color:#4b5563;font-size:11px">${t.note}</td></tr>`;
  }).join('');
}

// ── Comparison Panel ──────────────────────────────────────────────────────────
let _activeTicker='waf_ax';

async function loadComparisonPanel() {
  let data;
  if (_compData) { data = _compData; } else {
  try { const res=await fetch(`models_comparison.json?v=${_CV}`); if(!res.ok)return; data=await res.json(); } catch(e){return;}
  _compData = data;
  }
  const tickers=data.tickers||[];if(!tickers.length)return;
  _compData=data;
  document.getElementById('model-comparison-section').style.display='';
  const genAt=new Date(data.generated_at);
  document.getElementById('comp-generated-at').textContent='Updated '+genAt.toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'})+' '+genAt.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'});
  const buys=tickers.filter(t=>t.signal===1).length,sells=tickers.filter(t=>t.signal===-1).length;
  const avgSig=(tickers.reduce((s,t)=>s+t.n_significant,0)/tickers.length).toFixed(1);
  const bestPred=tickers.reduce((best,t)=>t.predicted_5bar_pct>best.predicted_5bar_pct?t:best,tickers[0]);
  document.getElementById('comp-hero-row').innerHTML=`
    <div class="hero-card" style="min-width:130px"><div class="hero-label">Models Tracked</div><div class="hero-value color-gold">${tickers.length}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">validated MCPT p&lt;0.05</div></div>
    <div class="hero-card" style="min-width:130px"><div class="hero-label">BUY Signals</div><div class="hero-value" style="color:var(--green)">${buys}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${sells} SELL${sells!==1?'s':''}</div></div>
    <div class="hero-card" style="min-width:160px"><div class="hero-label tip" data-tip="Ticker with the highest predicted 5-bar return right now.">Strongest BUY</div><div class="hero-value color-gold">${bestPred.ticker}</div><div style="font-size:11px;color:var(--green);margin-top:2px">+${bestPred.predicted_5bar_pct.toFixed(2)}% pred</div></div>
    <div class="hero-card" style="min-width:160px"><div class="hero-label tip" data-tip="Average number of features with Spearman p &lt; 0.05 across all models.">Avg Significant Features</div><div class="hero-value" style="font-size:18px">${avgSig} / 33</div></div>`;
  document.getElementById('comp-signal-cards').innerHTML=tickers.map(t=>{
    const isBuy=t.signal===1,sc=isBuy?'var(--green)':'var(--red)';
    const bg=isBuy?GREEN_08:RED_08;
    const border=isBuy?GREEN_3:RED_3;
    const predSign=t.predicted_5bar_pct>=0?'+':'';
    const safe=t.ticker.replace(/\./g,'_').toLowerCase();
    return`<div class="hero-card" style="cursor:pointer;border:1px solid ${border};background:${bg};padding:14px 16px" onclick="selectTicker('${safe}')" title="Click to view ${t.ticker} full feature breakdown"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px"><span style="font-size:15px;font-weight:700;color:#e5e7eb">${t.ticker}</span><span style="font-size:12px;font-weight:700;color:${sc};background:rgba(0,0,0,0.3);padding:2px 8px;border-radius:4px">${isBuy?'BUY':'SELL'}</span></div><div style="font-size:20px;font-weight:800;color:${sc};margin-bottom:4px">${predSign}${t.predicted_5bar_pct.toFixed(2)}%</div><div style="font-size:11px;color:var(--muted)">5-bar prediction</div><div style="margin-top:8px;display:flex;justify-content:space-between;font-size:11px;color:var(--muted)"><span>A$${t.close.toFixed(2)}</span><span>${t.n_significant}/${t.n_features} sig</span><span>p=${t.mcpt_p?.toFixed(3)??'—'}</span></div></div>`;
  }).join('');
  document.getElementById('comp-tbody').innerHTML=tickers.map(t=>{
    const isBuy=t.signal===1,sc=isBuy?'var(--green)':'var(--red)';
    const pc=t.predicted_5bar_pct>=0?'var(--green)':'var(--red)';
    const pvalC=t.mcpt_p<0.01?'var(--green)':t.mcpt_p<0.05?hexA(SQ.green,0.75):SQ.amber;
    const top=t.top_features?.[0];
    const topStr=top?`<span style="font-size:11px;font-family:monospace">${top.name}</span> <span style="color:${top.contribution_pct>=0?'var(--green)':'var(--red)'}">${top.contribution_pct>=0?'+':''}${top.contribution_pct.toFixed(3)}%</span>`:'—';
    const safe=t.ticker.replace(/\./g,'_').toLowerCase();
    return`<tr style="border-bottom:1px solid #1a1a1a;cursor:pointer" onclick="selectTicker('${safe}')" onmouseover="this.style.background='#1f1f1f'" onmouseout="this.style.background=''"><td style="padding:9px 12px;font-weight:600;color:#e5e7eb">${t.ticker}</td><td style="padding:9px 12px;color:var(--muted);font-size:12px">${t.sector??'—'}</td><td style="padding:9px 12px;text-align:right;font-family:monospace">A$${t.close.toFixed(2)}</td><td style="padding:9px 12px;text-align:center"><span style="color:${sc};font-weight:700;font-size:12px;background:${isBuy?GREEN_1:RED_1};padding:3px 10px;border-radius:4px">${isBuy?'BUY':'SELL'}</span></td><td style="padding:9px 12px;text-align:right;font-family:monospace;font-weight:600;color:${pc}">${t.predicted_5bar_pct>=0?'+':''}${t.predicted_5bar_pct.toFixed(2)}%</td><td style="padding:9px 12px;text-align:right;color:var(--muted)">${t.n_significant}/${t.n_features}</td><td style="padding:9px 12px;text-align:right;font-family:monospace;color:${pvalC}">${t.mcpt_p?.toFixed(3)??'—'}</td><td style="padding:9px 12px;text-align:right;font-family:monospace">${t.walk_fwd_pf?.toFixed(3)??'—'}</td><td style="padding:9px 12px">${topStr}</td></tr>`;
  }).join('');
}

function selectTicker(safe) {
  _activeTicker=safe;
  loadFeaturePanel(safe);
  document.getElementById('feature-model-section').scrollIntoView({behavior:'smooth',block:'start'});
  const divLabel=document.querySelector('#feature-model-section .section-divider-label');
  if(divLabel)divLabel.textContent=safe.replace('_ax','').toUpperCase()+'.AX — Ridge Regression Feature Model';
}

// ── Model & Tools Registry ─────────────────────────────────────────────────────
function _renderModelGlossary() {
  const el = document.getElementById('universe-glossary');
  if (!el) return;

  // ── Model registry ────────────────────────────────────────────────────────
  // Each row: name, badge, type, family, codeFile, pruning, tools[], validation, status, notes
  const MODELS = [
    // ── Ridge family ──────────────────────────────────────────────────────
    {
      name: 'Ridge (1yr)',        badge: 'Ridge (1yr)',     badgeColor: 'var(--gold)',
      type: 'ML · Regression',   family: 'Ridge',
      codeFile: 'quant/strategies/linear_regression.py',
      pruning: 'v1 — p-value + instability + active_pct (built into model)',
      tools: ['fetcher', 'macro_fetcher', 'feature_builder', 'asic_short_fetcher', 'announcement_store'],
      validation: 'MCPT p < 0.05',
      status: 'ACTIVE',
      statusColor: 'var(--green)',
      notes: 'Gold standard. 5yr IS window, 252-day train, 63-day step, 180-day holdout. Pruning logic lives inside the model.',
    },
    {
      name: 'Ridge v2',           badge: 'Ridge v2',        badgeColor: '#a78bfa',
      type: 'ML · Regression',   family: 'Ridge',
      codeFile: 'scripts/export_ridge_v2.py',
      pruning: 'v2 — removes sign_pct, adds correlation tiebreaker. score = p × (1+0.5×instab) × (1+0.3×corr)',
      tools: ['fetcher', 'macro_fetcher', 'feature_builder', 'asic_short_fetcher', 'announcement_store'],
      validation: 'MCPT p < 0.05',
      status: 'EXPERIMENTAL',
      statusColor: SQ.amber,
      notes: 'Improved prune formula. sign_pct removed — a feature predicting UP in bull and DOWN in bear is valid, not a sign-flipper.',
    },
    {
      name: 'Ridge v3',           badge: 'Ridge v3',        badgeColor: '#a78bfa',
      type: 'ML · Regression',   family: 'Ridge',
      codeFile: 'scripts/export_ridge_v3.py',
      pruning: 'v3 — v2 formula + OOS patience rollback. Stops pruning when holdout Sharpe fails to improve for N rounds.',
      tools: ['fetcher', 'macro_fetcher', 'feature_builder', 'asic_short_fetcher', 'announcement_store'],
      validation: 'MCPT p < 0.05',
      status: 'EXPERIMENTAL',
      statusColor: SQ.amber,
      notes: 'Best pruning strategy. Run via: python scripts/run_ridge_v3.py --tickers TICKER.AX',
    },
    // ── Regime-weighted ───────────────────────────────────────────────────
    {
      name: 'Regime Similarity (3M)', badge: 'Regime (3M)', badgeColor: 'var(--green)',
      type: 'ML · Weighted Regression', family: 'Regime',
      codeFile: 'scripts/export_regime_model.py + quant/regime_similarity.py',
      pruning: 'Regime-weighted p-values (weighted t-test). Standard pruning applied first, then regime-refine pass.',
      tools: ['fetcher', 'macro_fetcher', 'feature_builder'],
      validation: 'Weighted t-test per feature',
      status: 'ACTIVE',
      statusColor: 'var(--green)',
      notes: '18yr history. Gaussian kernel weights windows by similarity to today\'s VIX/DXY/US10yr/AUDUSD/Gold-mom. σ=1.5, 3-month reference.',
    },
    {
      name: 'Regime Similarity (1Y)', badge: 'Regime (1Y)', badgeColor: 'var(--green)',
      type: 'ML · Weighted Regression', family: 'Regime',
      codeFile: 'scripts/export_regime_model.py + quant/regime_similarity.py',
      pruning: 'Same as Regime (3M)',
      tools: ['fetcher', 'macro_fetcher', 'feature_builder'],
      validation: 'Weighted t-test per feature',
      status: 'ACTIVE',
      statusColor: 'var(--green)',
      notes: 'Smoother 12-month reference window. Use with Regime (3M) — agreement = high confidence, disagreement = regime transition.',
    },
    // ── Regression interpretable ──────────────────────────────────────────
    {
      name: 'OLS Regression',     badge: 'OLS',             badgeColor: '#60a5fa',
      type: 'Statistical',        family: 'Interpretable',
      codeFile: 'quant/strategies/ols_regression.py',
      pruning: 'None',
      tools: ['feature_builder'],
      validation: 'Coefficient p-values',
      status: 'DIAGNOSTIC',
      statusColor: '#60a5fa',
      notes: 'No regularisation. Readable coefficient + p-value per feature. Used for factor analysis, not live signals.',
    },
    {
      name: 'Bayesian Regression', badge: 'Bayesian',       badgeColor: '#60a5fa',
      type: 'Statistical',         family: 'Interpretable',
      codeFile: 'quant/strategies/bayesian_regression.py',
      pruning: 'None',
      tools: ['feature_builder'],
      validation: 'Credible intervals',
      status: 'DIAGNOSTIC',
      statusColor: '#60a5fa',
      notes: 'Coefficient distributions with 95% credible intervals. Shows uncertainty, not just point estimates.',
    },
    {
      name: 'VAR + Granger Causality', badge: 'Granger',    badgeColor: '#60a5fa',
      type: 'Statistical',            family: 'Interpretable',
      codeFile: 'scripts/run_interpretable_models.py',
      pruning: 'None',
      tools: ['feature_builder', 'macro_fetcher'],
      validation: 'Granger F-test p-value',
      status: 'DIAGNOSTIC',
      statusColor: '#60a5fa',
      notes: 'Tests which features Granger-cause the stock return. Directional causality, not correlation.',
    },
    {
      name: 'Markov Regime-Switching', badge: 'Markov',     badgeColor: '#60a5fa',
      type: 'Statistical',             family: 'Interpretable',
      codeFile: 'scripts/run_interpretable_models.py',
      pruning: 'None',
      tools: ['fetcher'],
      validation: 'AIC / BIC',
      status: 'DIAGNOSTIC',
      statusColor: '#60a5fa',
      notes: '2-state HMM on daily log returns (statsmodels). Identifies trending vs ranging regime with transition probabilities.',
    },
    // ── Rule-based ────────────────────────────────────────────────────────
    {
      name: 'Donchian Breakout',  badge: 'Donchian',        badgeColor: '#9ca3af',
      type: 'Rule-based',         family: 'Price',
      codeFile: 'quant/strategies/donchian.py',
      pruning: 'None — grid search over entry_lb, exit ratio, min_hold',
      tools: ['fetcher (OHLCV only)'],
      validation: 'MCPT p < 0.05',
      status: 'SCREENED — NO EDGE',
      statusColor: 'var(--red)',
      notes: '55-day entry / 20-day exit (Turtle System 2). MCPT: 0/22 validated tickers. Linear Regression dominates on ASX miners.',
    },
    {
      name: 'Donchian (Long Only)', badge: 'Donchian L',    badgeColor: '#9ca3af',
      type: 'Rule-based',           family: 'Price',
      codeFile: 'quant/strategies/donchian_long_only.py',
      pruning: 'None',
      tools: ['fetcher (OHLCV only)'],
      validation: 'MCPT p < 0.05',
      status: 'SCREENED — NO EDGE',
      statusColor: 'var(--red)',
      notes: 'Long-only variant. Same result — no validated edge on ASX miners universe.',
    },
    {
      name: 'Mean Reversion',     badge: 'MeanRev',         badgeColor: '#9ca3af',
      type: 'Rule-based',         family: 'Price',
      codeFile: 'quant/strategies/mean_reversion.py',
      pruning: 'None',
      tools: ['fetcher (OHLCV only)'],
      validation: 'MCPT p < 0.05',
      status: 'ACTIVE — REGIME CONDITIONAL',
      statusColor: SQ.amber,
      notes: 'Bollinger-band mean reversion. Best in QUIET_RANGE (PF=1.397). Bad in VOLATILE_CHOP (PF=0.459). Use regime-conditional weighting.',
    },
    {
      name: 'Ichimoku',           badge: 'Ichimoku',        badgeColor: '#9ca3af',
      type: 'Rule-based',         family: 'Price',
      codeFile: 'quant/strategies/ichimoku.py',
      pruning: 'None',
      tools: ['fetcher (OHLCV only)'],
      validation: 'MCPT p < 0.05',
      status: 'UNVALIDATED',
      statusColor: 'var(--muted)',
      notes: 'Cloud-based trend + momentum. Not in current batch pipeline.',
    },
    {
      name: 'ATR Breakout',       badge: 'ATR Break',       badgeColor: '#9ca3af',
      type: 'Rule-based',         family: 'Price',
      codeFile: 'quant/strategies/atr_breakout.py',
      pruning: 'None',
      tools: ['fetcher (OHLCV only)'],
      validation: 'MCPT p < 0.05',
      status: 'UNVALIDATED',
      statusColor: 'var(--muted)',
      notes: 'ATR-scaled volatility breakout. Not in current batch pipeline.',
    },
    {
      name: 'MA Crossover',       badge: 'MA Cross',        badgeColor: '#9ca3af',
      type: 'Rule-based',         family: 'Price',
      codeFile: 'quant/strategies/ma_crossover.py',
      pruning: 'None',
      tools: ['fetcher (OHLCV only)'],
      validation: 'MCPT p < 0.05',
      status: 'UNVALIDATED',
      statusColor: 'var(--muted)',
      notes: 'Simple moving average crossover. Baseline benchmark.',
    },
  ];

  // ── Tools registry ────────────────────────────────────────────────────────
  const TOOLS = [
    {
      name: 'fetcher.py',          codeFile: 'quant/data/fetcher.py',
      fetches: 'yfinance',
      api: 'fetch_ohlcv(), fetch_xauaud(), fetch_dxy()',
      usedBy: 'All models',
      notes: 'Primary price source. XAUAUD computed synthetically (GC=F / AUDUSD=X). No fallback if yfinance is down.',
    },
    {
      name: 'macro_fetcher.py',    codeFile: 'quant/data/macro_fetcher.py',
      fetches: 'yfinance + HTTP',
      api: 'fetch_macro(index)',
      usedBy: 'Ridge all variants, Regime Similarity, VAR+Granger',
      notes: 'Fetches VIX, DXY, US10yr, AU10yr, AUDUSD, gold ratio, yield curve, risk-off composite. Joins as extra columns on OHLCV index before model call.',
    },
    {
      name: 'feature_builder.py',  codeFile: 'quant/data/feature_builder.py',
      fetches: 'SQLite (announcement_store) + asic_short_fetcher cache',
      api: 'build_features(ohlcv)',
      usedBy: 'Ridge all variants, OLS, Bayesian, VAR+Granger',
      notes: '1,140 lines. Assembles 38+ engineered features: RSI, Hurst, ADX, vol ratios, MA slopes, macro momentum, short interest Z-score, announcement proximity flags.',
    },
    {
      name: 'asic_short_fetcher.py', codeFile: 'quant/data/asic_short_fetcher.py',
      fetches: 'ASIC HTTP → SQLite cache',
      api: 'refresh_cache(), get_short_features(ticker, dates)',
      usedBy: 'feature_builder (called internally)',
      notes: 'Downloads ASIC short-selling data, caches to SQLite. feature_builder calls get_short_features() to produce si_pct, si_chg_5d, si_zscore_120d, si_squeeze_flag columns.',
    },
    {
      name: 'announcement_store',  codeFile: 'storage/announcement_store.py',
      fetches: 'SQLite (gold_trader.db)',
      api: 'get_recent(ticker, days), count(ticker)',
      usedBy: 'feature_builder (called internally)',
      notes: 'Reads ASX earnings/dividend announcements. feature_builder uses this to build ann_days_since, ann_proximity, ann_surprise features.',
    },
  ];

  const STATUS_ORDER = ['ACTIVE','EXPERIMENTAL','ACTIVE — REGIME CONDITIONAL','DIAGNOSTIC','SCREENED — NO EDGE','UNVALIDATED'];

  el.innerHTML = `
    <!-- ── Model Registry ── -->
    <div class="section-divider" style="margin-top:40px">
      <div class="section-divider-line"></div>
      <span class="section-divider-label">Model Registry</span>
      <div class="section-divider-line"></div>
    </div>
    <p style="font-size:12px;color:var(--muted);margin:0 0 16px">All models in the system. Ridge (1yr) is the production standard — all others are experimental, diagnostic, or superseded.</p>
    <div class="chart-card" style="overflow-x:auto;margin-bottom:40px;padding:0">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:2px solid #2a2a2a;background:#111">
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">Model</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">Type</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">Family</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">Source File</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">Pruning</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">Data Tools</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">Validation</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">Status</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${MODELS.map((m, i) => {
            const isGold = m.badge === 'Ridge (1yr)';
            const rowBg = isGold ? 'background:rgba(245,165,32,0.04);' : (i % 2 === 0 ? '' : 'background:#0d0d0d;');
            const goldBorder = isGold ? 'border-left:2px solid var(--gold);' : '';
            return `<tr style="border-bottom:1px solid #1a1a1a;${rowBg}${goldBorder}">
              <td style="padding:9px 14px;white-space:nowrap">
                <span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid ${m.badgeColor};color:${m.badgeColor};background:rgba(0,0,0,0.4);font-weight:700">${m.badge}</span>
              </td>
              <td style="padding:9px 14px;color:var(--muted);font-size:11px;white-space:nowrap">${m.type}</td>
              <td style="padding:9px 14px;color:var(--muted);font-size:11px">${m.family}</td>
              <td style="padding:9px 14px;font-family:monospace;font-size:10px;color:#6b7280;white-space:nowrap">${m.codeFile.split(' + ')[0]}</td>
              <td style="padding:9px 14px;color:var(--muted);font-size:11px;max-width:220px">${m.pruning}</td>
              <td style="padding:9px 14px;font-size:10px;max-width:200px">
                ${m.tools.map(t => {
                  const c = t === 'fetcher' ? '#374151' : t.startsWith('feature') ? 'rgba(245,165,32,0.15)' : t.startsWith('macro') ? 'rgba(96,165,250,0.15)' : t.startsWith('asic') ? 'rgba(167,139,250,0.15)' : t.startsWith('announcement') ? 'rgba(52,211,153,0.15)' : '#1f2937';
                  return `<span style="display:inline-block;margin:1px 2px;padding:1px 6px;border-radius:3px;background:${c};color:#9ca3af;white-space:nowrap">${t}</span>`;
                }).join('')}
              </td>
              <td style="padding:9px 14px;color:var(--muted);font-size:11px;white-space:nowrap">${m.validation}</td>
              <td style="padding:9px 14px;white-space:nowrap">
                <span style="font-size:10px;font-weight:700;color:${m.statusColor}">${m.status}</span>
              </td>
              <td style="padding:9px 14px;color:#6b7280;font-size:11px;min-width:220px">${m.notes}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- ── Tools Registry ── -->
    <div class="section-divider" style="margin-top:20px">
      <div class="section-divider-line"></div>
      <span class="section-divider-label">Data Tools Registry</span>
      <div class="section-divider-line"></div>
    </div>
    <p style="font-size:12px;color:var(--muted);margin:0 0 16px">All data fetching and feature engineering tools. Tools are model-agnostic — they do not change when the model changes.</p>
    <div class="chart-card" style="overflow-x:auto;margin-bottom:40px;padding:0">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:2px solid #2a2a2a;background:#111">
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">Tool</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">Source File</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">External Source</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">Public API</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600;white-space:nowrap">Used By</th>
            <th style="padding:10px 14px;text-align:left;color:var(--muted);font-weight:600">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${TOOLS.map((t, i) => `
            <tr style="border-bottom:1px solid #1a1a1a;${i%2===0?'':'background:#0d0d0d'}">
              <td style="padding:9px 14px;font-weight:700;color:#e5e7eb;white-space:nowrap">${t.name}</td>
              <td style="padding:9px 14px;font-family:monospace;font-size:10px;color:#6b7280;white-space:nowrap">${t.codeFile}</td>
              <td style="padding:9px 14px;color:var(--muted);font-size:11px;white-space:nowrap">${t.fetches}</td>
              <td style="padding:9px 14px;font-family:monospace;font-size:10px;color:#9ca3af">${t.api}</td>
              <td style="padding:9px 14px;color:var(--muted);font-size:11px">${t.usedBy}</td>
              <td style="padding:9px 14px;color:#6b7280;font-size:11px;min-width:220px">${t.notes}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- ── Architecture note ── -->
    <div class="chart-card" style="padding:18px 22px;margin-bottom:40px;border-left:2px solid var(--gold)">
      <div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:8px">Architectural Principle</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.7">
        <b style="color:#d1d5db">Tools are model-agnostic.</b> Announcement fetching, ASIC short data, and macro series work the same regardless of which model is running — they belong in <code style="font-size:11px;color:#9ca3af">quant/data/</code>.<br>
        <b style="color:#d1d5db">Pruning is model-specific.</b> Different models have different feature sets and different pruning criteria — pruning logic belongs inside the model module (<code style="font-size:11px;color:#9ca3af">quant/strategies/</code>), not in standalone scripts.<br>
        <b style="color:#d1d5db">Scripts are thin CLI wrappers</b> — they fetch data, call the model, and write JSON. No business logic should live in <code style="font-size:11px;color:#9ca3af">scripts/</code>.
      </div>
    </div>
  `;
}
