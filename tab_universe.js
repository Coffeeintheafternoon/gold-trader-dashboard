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

let _modelIndex = null; // {ticker: [{safe_name, label, file, is_pf, ...}]}
let _tickerNotes = {}; // {ticker: {label, note}}

async function loadFullScreenerPanel() {
  let data;
  try { const res=await fetch(`screener_full.json?v=${_CV}`); if(!res.ok)return; data=await res.json(); } catch(e){return;}
  const tickers=data.tickers||[];if(!tickers.length)return;

  // Load model index and ticker notes, attach to each ticker row
  try {
    const mi=await fetch(`model_index.json?v=${_CV}`);
    if(mi.ok){ const midx=await mi.json(); _modelIndex=midx.models||{}; }
  } catch(_){}
  try {
    const nr=await fetch(`ticker_notes.json?v=${_CV}`);
    if(nr.ok){ const nd=await nr.json(); _tickerNotes=nd||{}; }
  } catch(_){}
  tickers.forEach(t=>{ t._models=(_modelIndex&&_modelIndex[t.ticker])||[]; t._note=_tickerNotes[t.ticker]||null; });

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
}

function _notesBadge(note) {
  if(!note) return '<span style="color:#333;font-size:10px">—</span>';
  const cfg = {
    'BANKRUPT':   { bg:'rgba(220,38,38,0.15)',  border:'rgba(220,38,38,0.5)',  color:'#f87171' },
    'DO NOT USE': { bg:'rgba(234,88,12,0.15)',  border:'rgba(234,88,12,0.5)',  color:'#fb923c' },
    'DELIST RISK':{ bg:'rgba(234,179,8,0.12)',  border:'rgba(234,179,8,0.4)', color:'#fbbf24' },
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
    const bg=isDefault?'rgba(245,165,32,0.12)':'rgba(0,255,65,0.08)';
    const border=isDefault?'rgba(245,165,32,0.35)':'rgba(0,255,65,0.25)';
    const color=isDefault?'var(--gold)':'var(--green)';
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
  let rows=_fullScreenerData.slice();
  if(tickerQ)rows=rows.filter(t=>t.ticker&&t.ticker.toUpperCase().includes(tickerQ));
  if(sectorF)rows=rows.filter(t=>t.sector===sectorF);
  if(modelF)rows=rows.filter(t=>t._models&&t._models.some(m=>m.label===modelF));
  if(showF==='edge')rows=rows.filter(t=>t.pf&&t.pf>=1.10);
  else if(showF==='valid')rows=rows.filter(t=>!t.error);
  else if(showF==='models')rows=rows.filter(t=>t._models&&t._models.length>0);
  if(sortF==='pf_desc')rows.sort((a,b)=>(b.pf||0)-(a.pf||0));
  else if(sortF==='sharpe_desc')rows.sort((a,b)=>(b.sharpe||0)-(a.sharpe||0));
  else if(sortF==='mean_desc')rows.sort((a,b)=>(b.mean_ann_pct||0)-(a.mean_ann_pct||0));
  else if(sortF==='oos_desc')rows.sort((a,b)=>(b.oos_bars||0)-(a.oos_bars||0));
  else if(sortF==='ticker_asc')rows.sort((a,b)=>a.ticker.localeCompare(b.ticker));
  _filteredRows=rows;
  document.getElementById('full-screener-count').textContent=`Showing ${rows.length} of ${_fullScreenerData.length} tickers`;
  document.getElementById('full-screener-tbody').innerHTML=rows.map((t,i)=>{
    const rowBg=i%2===0?'':'background:#111';
    // Default model to open on row click: first model if any, else derived safe
    const defaultSafe=t._models&&t._models.length?t._models[0].safe_name:null;
    const clickable=`onclick="openTickerInModelLab('${t.ticker}',{},${defaultSafe?`'${defaultSafe}'`:'null'})" onmouseover="this.style.background='#1a1a1a'" onmouseout="this.style.background=''"`;
    const badges=_modelBadges(t._models, t.ticker);
    const noteBadge=_notesBadge(t._note);
    if(t.error)return`<tr ${clickable} style="border-bottom:1px solid #1a1a1a;${rowBg};cursor:pointer"><td style="padding:6px 10px;color:#6b7280;font-size:12px">${t.ticker}</td><td style="padding:6px 10px;color:#4b5563;font-size:11px">${t.sector||'—'}</td><td colspan="5" style="padding:6px 10px;color:#4b5563;font-size:11px">No data</td><td style="padding:6px 10px">${badges}</td><td style="padding:6px 10px">${noteBadge}</td></tr>`;
    const pfC=t.pf===null?'var(--muted)':t.pf>=1.10?'var(--green)':t.pf>=1.05?'#fbbf24':'var(--muted)';
    const shC=t.sharpe===null?'var(--muted)':t.sharpe>=0.5?'var(--green)':t.sharpe>=0.25?'#fbbf24':'var(--muted)';
    const retC=t.mean_ann_pct===null?'var(--muted)':t.mean_ann_pct>=20?'var(--green)':t.mean_ann_pct>=10?'#fbbf24':'var(--muted)';
    const ciC=t.ci95_lower===null?'var(--muted)':t.ci95_lower>0?'var(--green)':'var(--red)';
    return`<tr ${clickable} style="border-bottom:1px solid #1a1a1a;${rowBg};cursor:pointer"><td style="padding:6px 10px;font-weight:600;color:#e5e7eb;font-size:12px">${t.ticker} <span style="font-size:10px;color:#444">→</span></td><td style="padding:6px 10px;color:var(--muted);font-size:11px">${t.sector||'—'}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;color:${pfC}">${t.pf!=null?t.pf.toFixed(3):'—'}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;color:${shC}">${t.sharpe!=null?t.sharpe.toFixed(2):'—'}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;color:${retC}">${t.mean_ann_pct!=null?(t.mean_ann_pct>=0?'+':'')+t.mean_ann_pct.toFixed(1)+'%':'—'}</td><td style="padding:6px 10px;text-align:right;font-family:monospace;color:${ciC}">${t.ci95_lower!=null?(t.ci95_lower>=0?'+':'')+t.ci95_lower.toFixed(1)+'%':'—'}</td><td style="padding:6px 10px;text-align:right;color:var(--muted)">${t.oos_bars?.toLocaleString()??'—'}</td><td style="padding:6px 10px">${badges}</td><td style="padding:6px 10px">${noteBadge}</td></tr>`;
  }).join('');
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
  const borderColors=chartTickers.map(t=>t.verdict==='ACCEPT'?GREEN:t.verdict==='BORDERLINE'?'#fbbf24':RED);
  const pCtx=document.getElementById('screener-pval-chart').getContext('2d');
  if(_screenerPvalChart)_screenerPvalChart.destroy();
  _screenerPvalChart=new Chart(pCtx,{type:'bar',data:{labels,datasets:[{data:pvals,backgroundColor:barColors,borderColor:borderColors,borderWidth:1,borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>{const t=chartTickers[ctx.dataIndex];return[` p = ${ctx.raw.toFixed(3)}  →  ${t.verdict}`,` PF = ${t.lr_pf?.toFixed(3)??'—'}`,` ${t.note}`];}}},annotation:{annotations:{threshold:{type:'line',value:0.05,scaleID:'x',borderColor:'rgba(212,160,23,0.7)',borderWidth:2,borderDash:[5,4],label:{content:'p=0.05',display:true,position:'start',color:'#d4a017',font:{size:10}}}}}},scales:{x:{min:0,max:1,grid:{color:'#222'},ticks:{callback:v=>v.toFixed(2)}},y:{grid:{display:false},ticks:{font:{size:11}}}}}});
  const pfCtx=document.getElementById('screener-pf-chart').getContext('2d');
  if(_screenerPfChart)_screenerPfChart.destroy();
  _screenerPfChart=new Chart(pfCtx,{type:'bar',data:{labels,datasets:[{data:pfs,backgroundColor:barColors,borderColor:borderColors,borderWidth:1,borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>{const t=chartTickers[ctx.dataIndex];return[` PF = ${ctx.raw?.toFixed(3)}`,` p = ${t.lr_p?.toFixed(3)??'—'}`,` ${t.note}`];}}}},scales:{x:{min:0.9,grid:{color:'#222'},ticks:{callback:v=>v.toFixed(2)}},y:{grid:{display:false},ticks:{font:{size:11}}}}}});
  const VERDICT_STYLE={'ACCEPT':{bg:GREEN_12,border:GREEN_4,color:GREEN,label:'ACCEPT ✓'},'BORDERLINE':{bg:'rgba(251,191,36,0.12)',border:'rgba(251,191,36,0.4)',color:'#fbbf24',label:'BORDERLINE ~'},'REJECT':{bg:RED_08,border:RED_3,color:RED,label:'REJECT ✗'},'ERROR':{bg:'rgba(107,114,128,0.08)',border:'rgba(107,114,128,0.3)',color:'#6b7280',label:'NO DATA'}};
  document.getElementById('screener-tbody').innerHTML=tickers.map((t,i)=>{
    const vs=VERDICT_STYLE[t.verdict]||VERDICT_STYLE.REJECT;
    const pvalC=t.lr_p!==null?(t.lr_p<0.01?'var(--green)':t.lr_p<0.05?'#86efac':t.lr_p<0.10?'#fbbf24':'var(--muted)'):'var(--muted)';
    const rowBg=i%2===0?'':'background:#111';
    const se=t.lr_se_ann,seC=se===null?'var(--muted)':se<2?'var(--green)':se<5?'#fbbf24':'var(--red)',seStr=se!==null?se.toFixed(2)+'%':'—';
    const ci=t.lr_ci95_lower,ciC=ci===null?'var(--muted)':ci>0?'var(--green)':'var(--red)',ciStr=ci!==null?(ci>=0?'+':'')+ci.toFixed(2)+'%':'—';
    const sharpe=t.lr_sharpe,sharpeStr=sharpe!==null?sharpe.toFixed(2):'—',sharpeC=sharpe===null?'var(--muted)':sharpe>0.5?'var(--green)':sharpe>0.25?'#fbbf24':'var(--muted)';
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
    const pvalC=t.mcpt_p<0.01?'var(--green)':t.mcpt_p<0.05?'#86efac':'#fbbf24';
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

// ── Model Glossary ─────────────────────────────────────────────────────────────
function _renderModelGlossary() {
  const el = document.getElementById('universe-glossary');
  if (!el) return;

  const models = [
    {
      name: 'Ridge Regression',
      badge: 'Ridge (1yr)',
      badgeColor: 'var(--gold)',
      icon: '📈',
      desc: 'The primary walk-forward linear model. Trained on 18 months of daily price and macro data using ridge-regularised linear regression. At each step the model learns feature weights on the in-sample period, then makes predictions on the next 3-month out-of-sample window.',
      params: [
        { label: 'IS window',       value: '18 months (rolling)' },
        { label: 'OOS step',        value: '3 months' },
        { label: 'Regularisation',  value: 'Ridge (L2), alpha auto-tuned' },
        { label: 'Feature count',   value: '33 base features + macro' },
        { label: 'Validation',      value: 'MCPT (Monte Carlo Permutation Test)' },
        { label: 'Data history',    value: '~5 years minimum (~1,260 bars)' },
      ],
      tip: 'Best for: stable-regime stocks where features maintain consistent direction over 18+ months. Not suitable for tickers with structural breaks or sharp macro regime changes — use Regime Similarity model instead.',
    },
    {
      name: 'Regime Similarity (3M)',
      badge: 'Regime (3M)',
      badgeColor: 'var(--green)',
      icon: '🔀',
      desc: 'Walk-forward model using Gaussian kernel weighting to up-weight IS training windows where macro conditions were similar to the most recent 3 months. Trains on ~18 years of daily data but gives far more weight to historically similar macro environments.',
      params: [
        { label: 'IS period',       value: '18 years (full history ~4,500 bars)' },
        { label: 'OOS step',        value: '63 days (≈ 3 months)' },
        { label: 'Reference window', value: '3-month rolling macro average' },
        { label: 'Kernel sigma',    value: '1.5 (z-score units)' },
        { label: 'Regime variables', value: 'VIX, DXY, US10yr, AUD/USD, Gold' },
        { label: 'Validation',      value: 'Weighted t-test per feature' },
      ],
      tip: 'Best for: identifying which features have edge specifically in today\'s macro environment. The 3M reference window is more responsive to recent shifts but can be noisy in fast-changing regimes.',
    },
    {
      name: 'Regime Similarity (1Y)',
      badge: 'Regime (1Y)',
      badgeColor: 'var(--green)',
      icon: '🔀',
      desc: 'Same as the 3M Regime model but uses a 12-month rolling average as the macro reference point. Produces a more stable, lower-noise regime classification at the cost of slower response to new regime transitions.',
      params: [
        { label: 'IS period',       value: '18 years (full history ~4,500 bars)' },
        { label: 'OOS step',        value: '63 days (≈ 3 months)' },
        { label: 'Reference window', value: '12-month rolling macro average' },
        { label: 'Kernel sigma',    value: '1.5 (z-score units)' },
        { label: 'Regime variables', value: 'VIX, DXY, US10yr, AUD/USD, Gold' },
        { label: 'Validation',      value: 'Weighted t-test per feature' },
      ],
      tip: 'Best for: confirming regime signals from the 3M model. If 3M and 1Y agree on a feature\'s significance, treat it as high-confidence. Disagreement may indicate a regime transition in progress.',
    },
  ];

  el.innerHTML = `
    <div class="section-divider" style="margin-top:40px">
      <div class="section-divider-line"></div>
      <span class="section-divider-label tip" data-tip="Descriptions of each model type used in this system, including their architecture, key parameters, and best-use cases.">Model Glossary</span>
      <div class="section-divider-line"></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px;margin-bottom:40px">
      ${models.map(m => `
        <div class="chart-card" style="padding:20px;display:flex;flex-direction:column;gap:14px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="font-size:20px">${m.icon}</span>
            <span style="font-size:14px;font-weight:700;color:#e5e7eb">${m.name}</span>
            <span style="font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid ${m.badgeColor};color:${m.badgeColor};background:rgba(0,0,0,0.4)">${m.badge}</span>
          </div>
          <p style="font-size:12px;color:var(--muted);line-height:1.6;margin:0">${m.desc}</p>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            ${m.params.map(p => `
              <tr style="border-bottom:1px solid #1a1a1a">
                <td style="padding:5px 0;color:var(--muted);width:45%">${p.label}</td>
                <td style="padding:5px 0;font-family:monospace;color:#d1d5db">${p.value}</td>
              </tr>
            `).join('')}
          </table>
          <div class="tip" style="font-size:11px;color:#60a5fa;line-height:1.5;cursor:help;border-left:2px solid #1e40af;padding-left:8px" data-tip="${m.tip}">
            💡 ${m.tip}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
