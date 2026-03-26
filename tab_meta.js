// tab_meta.js — Rich meta analysis: screener_full.json + meta_features.json

const _CAT_COLOR={
  'macro':        'rgba(167,139,250,0.85)',
  'momentum':     'rgba(245,165,32,0.85)',
  'interaction':  'rgba(59,130,246,0.85)',
  'volume':       'rgba(52,211,153,0.85)',
  'announcement': 'rgba(248,113,113,0.80)',
  'volatility':   'rgba(251,191,36,0.75)',
  'candle':       'rgba(156,163,175,0.70)',
  'trend':        'rgba(110,231,183,0.75)',
  'other':        'rgba(107,114,128,0.60)',
};

const _MT_COLOR={
  'Ridge (v4)':         'rgba(16,185,129,0.85)',
  'Ridge (1yr)':        'rgba(245,165,32,0.75)',
  'Ridge (6mo)':        'rgba(251,191,36,0.55)',
  'Ridge (v2)':         'rgba(59,130,246,0.80)',
  'Ridge (v3)':         'rgba(96,165,250,0.80)',
  'Regime-Weighted 3M': 'rgba(167,139,250,0.85)',
  'Regime-Weighted 6M': 'rgba(139,92,246,0.85)',
  'Regime-Weighted 1Y': 'rgba(109,40,217,0.85)',
  '18yr · 1yr window':  'rgba(239,68,68,0.75)',
  '18yr · 6mo window':  'rgba(252,165,165,0.65)',
  '18yr · 2yr window':  'rgba(185,28,28,0.75)',
};
const _SEC_PAL=['rgba(245,165,32,0.75)','rgba(59,130,246,0.75)','rgba(16,185,129,0.75)','rgba(239,68,68,0.75)','rgba(167,139,250,0.8)','rgba(251,191,36,0.6)','rgba(52,211,153,0.75)','rgba(248,113,113,0.7)','rgba(196,181,253,0.7)','rgba(134,239,172,0.7)','rgba(253,186,116,0.7)','rgba(147,197,253,0.7)','rgba(216,180,254,0.7)','rgba(252,211,77,0.7)','rgba(110,231,183,0.7)'];

// Hard-coded market caps (USD) from yfinance — avoids a JSON fetch
const _MC={
'A2M.AX':6572361216,'AAJ.AX':6575479,'AGL.AX':6370916864,'ALK.AX':1858038528,
'ALL.AX':27669442560,'AMP.AX':3177333504,'ANN.AX':4058019840,'ANZ.AX':108757762048,
'ASM.AX':381781600,'ASX.AX':9704053760,'AUC.AX':443766368,'AZJ.AX':6531232256,
'BGL.AX':1885679360,'BHP.AX':246394830848,'BMN.AX':689466112,'BOE.AX':616458944,
'BPT.AX':3011360768,'BXB.AX':29734584320,'CAR.AX':8681271296,'CBA.AX':286133813248,
'CHN.AX':508297152,'CIA.AX':2703582720,'CMM.AX':4443872256,'COH.AX':10554039296,
'COL.AX':29339148288,'CPU.AX':16420408320,'CRN.AX':535293664,'CSL.AX':67648606208,
'CVN.AX':159228736,'CXO.AX':545815744,'CYL.AX':1529137792,'DMP.AX':1644185088,
'DTM.AX':6920384,'ENR.AX':136952752,'ERM.AX':220010400,'EVN.AX':24144089088,
'FEX.AX':248612976,'FMG.AX':60624822272,'GMD.AX':6534116864,'GMG.AX':51855953920,
'GML.AX':141691712,'GPT.AX':8696721408,'GRR.AX':225681056,'GTE.AX':12063052,
'HAS.AX':92081128,'HRN.AX':227298816,'HVN.AX':6192652800,'IEM.AX':59198140416,
'IGO.AX':5543200768,'ILU.AX':2539496448,'JBH.AX':8054634496,'KAL.AX':17323066,
'KAR.AX':1476499328,'KCN.AX':1165158912,'KNB.AX':22604120,'LCL.AX':9594057,
'LEX.AX':44715628,'LLC.AX':2252305408,'LTR.AX':4927621632,'LYC.AX':19687196672,
'MEK.AX':456612672,'MGR.AX':7043360256,'MGX.AX':430856480,'MML.AX':7644387,
'MQG.AX':74341048320,'NAB.AX':130625552384,'NAG.AX':11505403,'NHC.AX':4925291520,
'NIC.AX':3842613504,'NST.AX':25138020352,'OBM.AX':2019448192,'ORG.AX':21499889664,
'PDN.AX':4646366208,'PLS.AX':14623337472,'PME.AX':12487294976,'PRN.AX':1752876544,
'PRU.AX':6350309888,'QAN.AX':12620082176,'REA.AX':20283598848,'RIO.AX':239815458816,
'RMD.AX':47272640512,'RMS.AX':6555740672,'RRL.AX':4505650688,'RSG.AX':2671771904,
'RXL.AX':596951104,'S2R.AX':30300422,'S32.AX':17611622400,'SCG.AX':17914812416,
'SEK.AX':5104676352,'SFR.AX':7096431616,'SHG.AX':63137064,'SHL.AX':9711775744,
'SKY.AX':138373568,'SMR.AX':2478827008,'STN.AX':226927888,'STO.AX':25462540288,
'STX.AX':345542112,'SUN.AX':17847304192,'SVL.AX':322901344,'TCL.AX':42871324672,
'TG1.AX':22540214,'TLS.AX':60101369856,'TNE.AX':8979719168,'TPG.AX':7911008768,
'TWE.AX':2866402304,'VCX.AX':10901291008,'WAF.AX':3278728704,'WBC.AX':135778336768,
'WDS.AX':66025205760,'WES.AX':83023216640,'WGX.AX':4875330560,'WHC.AX':7690940416,
'WMG.AX':22749670,'WOW.AX':44441780224,'WTC.AX':13164738560,'XRO.AX':13014387712,
'YAL.AX':10959647744
};

let _metaFeatData=null;
let _metaDistSectorChart=null,_metaCatChart=null;
let _advCharts=new Array(10).fill(null);
let _trCharts=new Array(20).fill(null);
let _modelIndexData=null, _screenerFull=null;
let _modelIndexFlat=[];
let _activeModelFilter='All';
let _metaSectorChart=null,_metaPfHistChart=null,_metaScatterChart=null,_metaSharpeChart=null;

// ── Sector / MC toggle state ──────────────────────────────────────────────
const _GB={}; // groupBy state per chart id: 'sector' | 'mc'
const _GBfn={}; // rebuild functions registry

function _metaToggle(id,gb){
  _GB[id]=gb;
  document.querySelectorAll(`[data-gbid="${id}"]`).forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.gbval===gb);
  });
  _GBfn[id]?.(gb);
}

// ── Shared zoom / pan config ──────────────────────────────────────────────
const _zoom=(mode='xy')=>({
  zoom:{
    wheel:{enabled:true,speed:0.08},
    pinch:{enabled:true},
    mode,
  },
  pan:{enabled:true,mode},
  limits:{x:{minRange:0.5},y:{minRange:0.5}},
});

function _addResetZoom(canvas,chart){
  if(canvas&&chart)canvas.addEventListener('dblclick',()=>chart.resetZoom());
}

async function initMetaTab(){
  const loads=[];
  // model index data now embedded in screener_full.json — no separate fetch needed
  if(!_fullScreenerData) loads.push(fetch(`./screener_full.json?v=${_CV}`).then(r=>r.ok?r.json():null).then(d=>{if(d){_fullScreenerData=d.tickers||[];}}).catch(()=>{}));
  if(!_compData) loads.push(fetch(`./models_comparison.json?v=${_CV}`).then(r=>r.ok?r.json():null).then(d=>{if(d)_compData=d;}).catch(()=>{}));
  if(!_metaFeatData) loads.push(fetch(`./meta_features.json?v=${_CV}`).then(r=>r.ok?r.json():null).then(d=>{if(d)_metaFeatData=d;}).catch(()=>{}));
  await Promise.all(loads);
  _screenerFull=_fullScreenerData||[];

  // Build enrichment lookup: ticker → {sector, overfit, oos_bars, mean_ann_pct, ci95_lower}
  const secLookup={}, enrichLookup={};
  _screenerFull.forEach(t=>{
    if(!t.ticker)return;
    secLookup[t.ticker]=t.sector||'Other';
    enrichLookup[t.ticker]={overfit:t.overfit,p_value:t.p_value,oos_bars:t.oos_bars,mean_ann_pct:t.mean_ann_pct,ci95_lower:t.ci95_lower};
  });

  // Flatten screener_full.json tickers → one record per model entry
  _modelIndexFlat=[];
  _screenerFull.forEach(t=>{
    if(!t.ticker)return;
    const en=enrichLookup[t.ticker]||{};
    (t.models||[]).forEach(e=>{
      _modelIndexFlat.push({
        ticker:t.ticker, model_type:e.label||'Unknown', label:e.label||'Unknown', safe_name:e.safe_name||'',
        ho_pf:e.ho_pf, ho_sharpe:e.ho_sharpe, is_pf:e.is_pf, is_sharpe:e.is_sharpe,
        sector:secLookup[t.ticker]||'Other',
        overfit:en.overfit, p_value:en.p_value, oos_bars:en.oos_bars,
        mean_ann_pct:en.mean_ann_pct, ci95_lower:en.ci95_lower,
      });
    });
  });

  _buildFilterButtons();
  _buildMetaTab();
}

function _buildFilterButtons(){
  const c=document.getElementById('meta-filter-bar');
  if(!c)return;
  const types=[...new Set(_modelIndexFlat.map(r=>r.model_type))].sort();
  c.innerHTML=['All',...types].map(t=>`<button class="meta-filter-btn${t===_activeModelFilter?' active':''}" onclick="setMetaFilter('${t.replace(/'/g,"&#39;")}')">${t}</button>`).join('');
}

function setMetaFilter(label){_activeModelFilter=label;_buildFilterButtons();_buildMetaTab();}

function _applyMetaFilters(){_buildMetaTab();}

function _getMetaFiltered(){
  const minPF   = parseFloat(document.getElementById('meta-filter-pf')?.value) || 0;
  const minShV  = document.getElementById('meta-filter-sharpe')?.value || '';
  const minSh   = minShV !== '' ? parseFloat(minShV) : null;
  const mcptF   = document.getElementById('meta-filter-mcpt')?.value || '';
  const ovfF    = document.getElementById('meta-filter-overfit')?.value || '';
  const ovfVals = ovfF ? ovfF.split('|') : null;
  let rows = _activeModelFilter==='All' ? _modelIndexFlat : _modelIndexFlat.filter(r=>r.model_type===_activeModelFilter);
  if(minPF)   rows=rows.filter(r=>r.ho_pf!=null&&r.ho_pf>=minPF);
  if(minSh!=null) rows=rows.filter(r=>r.ho_sharpe!=null&&r.ho_sharpe>=minSh);
  if(mcptF)   rows=rows.filter(r=>r.p_value!=null&&r.p_value<=parseFloat(mcptF));
  if(ovfVals) rows=rows.filter(r=>r.overfit&&ovfVals.includes(r.overfit));
  return rows;
}

function _buildMetaTab(){
  document.getElementById('meta-spinner').style.display='none';
  document.getElementById('meta-content').style.display='';
  const el=id=>document.getElementById(id);

  const filtered=_getMetaFiltered();
  // Update count label
  const countEl=el('meta-filter-count');
  if(countEl) countEl.textContent=`${filtered.length} model${filtered.length!==1?'s':''} match`;
  const valid=filtered.filter(r=>r.ho_pf!=null);
  const edge=valid.filter(r=>r.ho_pf>=1.10);
  const nTickers=new Set(filtered.map(r=>r.ticker)).size;
  const avgHoPF=valid.length?valid.reduce((s,r)=>s+r.ho_pf,0)/valid.length:0;
  const shrArr=valid.filter(r=>r.ho_sharpe!=null);
  const avgHoShr=shrArr.length?shrArr.reduce((s,r)=>s+r.ho_sharpe,0)/shrArr.length:0;
  const best=valid.length?valid.reduce((b,r)=>r.ho_pf>b.ho_pf?r:b,valid[0]):null;

  if(el('meta-sector-label'))el('meta-sector-label').textContent=`Sector Analysis — ${nTickers} Tickers`;
  if(el('meta-hist-label'))el('meta-hist-label').textContent=`HO PF Distribution — ${valid.length} Models`;
  if(el('meta-strategy-label'))el('meta-strategy-label').textContent=`Model Summary — ${_activeModelFilter==='All'?'All Models':_activeModelFilter}`;

  // ── Hero ──────────────────────────────────────────────────────────────────
  el('meta-hero-row').innerHTML=`
    <div class="hero-card" style="min-width:120px"><div class="hero-label">Models</div><div class="hero-value color-gold">${filtered.length}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${nTickers} tickers · ${filtered.length-valid.length} no HO data</div></div>
    <div class="hero-card" style="min-width:120px"><div class="hero-label">HO PF ≥ 1.10</div><div class="hero-value" style="color:var(--green)">${edge.length}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${valid.length?Math.round(edge.length/valid.length*100):0}% pass rate</div></div>
    <div class="hero-card" style="min-width:120px"><div class="hero-label">Avg HO PF</div><div class="hero-value" style="color:${avgHoPF>=1.05?'var(--green)':'var(--muted)'};font-size:22px">${avgHoPF.toFixed(3)}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">holdout OOS</div></div>
    <div class="hero-card" style="min-width:120px"><div class="hero-label">Avg HO Sharpe</div><div class="hero-value" style="color:${avgHoShr>=0.5?'var(--green)':avgHoShr>=0.2?'#fbbf24':'var(--muted)'};font-size:22px">${avgHoShr.toFixed(2)}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">risk-adjusted OOS</div></div>
    <div class="hero-card" style="min-width:150px"><div class="hero-label">Top by HO PF</div><div class="hero-value color-gold">${best?best.ticker:'—'}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${best?'HO PF '+best.ho_pf.toFixed(3)+' · '+best.model_type:'—'}</div></div>`;

  // ── IS vs HO Scatter ──────────────────────────────────────────────────────
  const svld=filtered.filter(r=>r.is_pf!=null&&r.ho_pf!=null);
  let scDatasets=[];
  if(_activeModelFilter==='All'){
    const grps={};
    svld.forEach(r=>{if(!grps[r.model_type])grps[r.model_type]=[];grps[r.model_type].push({x:r.is_pf,y:r.ho_pf,ticker:r.ticker,mt:r.model_type,sec:r.sector});});
    scDatasets=Object.entries(grps).map(([mt,pts])=>({type:'scatter',label:mt,data:pts,backgroundColor:_MT_COLOR[mt]||'rgba(107,114,128,0.55)',pointRadius:4,pointHoverRadius:7}));
  } else {
    const grps={};
    svld.forEach(r=>{const s=r.sector||'Other';if(!grps[s])grps[s]=[];grps[s].push({x:r.is_pf,y:r.ho_pf,ticker:r.ticker,mt:r.model_type,sec:s});});
    const keys=Object.keys(grps).sort();
    scDatasets=keys.map((s,i)=>({type:'scatter',label:s,data:grps[s],backgroundColor:_SEC_PAL[i%_SEC_PAL.length],pointRadius:4,pointHoverRadius:7}));
  }
  const allPFs=svld.flatMap(r=>[r.is_pf,r.ho_pf]).filter(v=>v!=null);
  const pMin=allPFs.length?Math.max(0.70,Math.min(...allPFs)-0.05):0.80;
  const pMax=allPFs.length?Math.min(2.50,Math.max(...allPFs)+0.05):1.60;
  scDatasets.push({type:'line',label:'IS = HO (no decay)',data:[{x:pMin,y:pMin},{x:pMax,y:pMax}],borderColor:'rgba(255,255,255,0.18)',borderDash:[5,4],borderWidth:1.5,pointRadius:0,fill:false,tension:0,order:0});
  const scCtx=el('meta-scatter-chart')?.getContext('2d');
  if(scCtx){
    if(_metaScatterChart)_metaScatterChart.destroy();
    _metaScatterChart=new Chart(scCtx,{
      data:{datasets:scDatasets},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:7}},
          tooltip:{callbacks:{label:ctx=>{const p=ctx.raw;if(p?.ticker)return[`${p.ticker} · ${p.mt||p.sec}`,`IS: ${p.x?.toFixed(3)} → HO: ${p.y?.toFixed(3)}`];return'IS = HO line';}}},
          zoom:_zoom('xy'),
        },
        scales:{
          x:{title:{display:true,text:'IS Profit Factor',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',font:{size:10}}},
          y:{title:{display:true,text:'HO Profit Factor',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',font:{size:10}}},
        }
      }
    });
    _addResetZoom(_metaScatterChart.canvas,_metaScatterChart);
  }

  // ── Model Type Comparison Table ───────────────────────────────────────────
  // Always shows all model types regardless of active filter
  const mtStats={};
  _modelIndexFlat.filter(r=>r.ho_pf!=null).forEach(r=>{
    if(!mtStats[r.model_type])mtStats[r.model_type]={n:0,isPFsum:0,isPFn:0,hoPFsum:0,hoShrSum:0,hoShrN:0,edge:0};
    const s=mtStats[r.model_type];
    s.n++;s.hoPFsum+=r.ho_pf;if(r.ho_pf>=1.10)s.edge++;
    if(r.is_pf!=null){s.isPFsum+=r.is_pf;s.isPFn++;}
    if(r.ho_sharpe!=null){s.hoShrSum+=r.ho_sharpe;s.hoShrN++;}
  });
  const mtRows=Object.entries(mtStats).sort((a,b)=>(b[1].hoPFsum/b[1].n)-(a[1].hoPFsum/a[1].n));
  el('meta-model-type-tbody').innerHTML=mtRows.map(([mt,s])=>{
    const avgHo=s.hoPFsum/s.n, avgIs=s.isPFn?s.isPFsum/s.isPFn:null;
    const decay=avgIs?((avgIs-avgHo)/avgIs*100):null;
    const avgShr=s.hoShrN?s.hoShrSum/s.hoShrN:null;
    const isActive=mt===_activeModelFilter;
    const pfC=avgHo>=1.10?'var(--green)':avgHo>=1.05?'#fbbf24':'var(--muted)';
    const shC=avgShr!=null?(avgShr>=0.5?'var(--green)':avgShr>=0.2?'#fbbf24':'var(--muted)'):'var(--muted)';
    const dcC=decay!=null?(decay>20?RED:decay>8?'#fbbf24':'var(--green)'):'var(--muted)';
    const dot=`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${_MT_COLOR[mt]||'#6b7280'};margin-right:5px;flex-shrink:0"></span>`;
    return`<tr style="border-bottom:1px solid #1a1a1a;${isActive?'background:rgba(245,165,32,0.07)':''}">
      <td style="padding:5px 8px;font-weight:600;color:#e5e7eb;font-size:11px"><div style="display:flex;align-items:center">${dot}${mt}</div></td>
      <td style="padding:5px 8px;text-align:center;color:var(--muted);font-size:11px">${s.n}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace;color:#6b7280;font-size:11px">${avgIs!=null?avgIs.toFixed(3):'—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace;color:${pfC};font-size:11px;font-weight:700">${avgHo.toFixed(3)}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace;font-size:11px;color:${dcC}">${decay!=null?'−'+decay.toFixed(1)+'%':'—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace;color:${shC};font-size:11px">${avgShr!=null?avgShr.toFixed(2):'—'}</td>
    </tr>`;
  }).join('');

  // ── HO PF Histogram ───────────────────────────────────────────────────────
  const pfBins=[];for(let b=0.70;b<1.80;b+=0.05)pfBins.push(b);
  const pfHist=pfBins.map(b=>valid.filter(r=>r.ho_pf>=b&&r.ho_pf<b+0.05).length);
  const pfHC=pfBins.map(b=>b>=1.10?GREEN_7:b>=1.00?'rgba(251,191,36,0.6)':RED_6);
  const hCtx=el('meta-pf-hist-chart')?.getContext('2d');
  if(hCtx){if(_metaPfHistChart)_metaPfHistChart.destroy();_metaPfHistChart=new Chart(hCtx,{type:'bar',data:{labels:pfBins.map(b=>b.toFixed(2)),datasets:[{data:pfHist,backgroundColor:pfHC,borderColor:pfHC,borderWidth:1,borderRadius:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw} models`}}},scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',font:{size:9}},title:{display:true,text:'HO Profit Factor',color:'#6b7280',font:{size:10}}},y:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>Math.round(v)}}}}});}

  // ── HO Sharpe Histogram ───────────────────────────────────────────────────
  const shrBins=[];for(let b=-2.0;b<3.5;b+=0.25)shrBins.push(b);
  const shrHist=shrBins.map(b=>shrArr.filter(r=>r.ho_sharpe>=b&&r.ho_sharpe<b+0.25).length);
  const shrHC=shrBins.map(b=>b>=0.5?GREEN_7:b>=0.0?'rgba(251,191,36,0.6)':RED_6);
  const shCtx=el('meta-sharpe-hist-chart')?.getContext('2d');
  if(shCtx){if(_metaSharpeChart)_metaSharpeChart.destroy();_metaSharpeChart=new Chart(shCtx,{type:'bar',data:{labels:shrBins.map(b=>b.toFixed(2)),datasets:[{data:shrHist,backgroundColor:shrHC,borderColor:shrHC,borderWidth:1,borderRadius:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw} models`}}},scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',font:{size:9}},title:{display:true,text:'HO Sharpe',color:'#6b7280',font:{size:10}}},y:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>Math.round(v)}}}}}); }

  // ── Sector avg HO PF chart ────────────────────────────────────────────────
  const secMap={};
  filtered.forEach(r=>{
    const s=r.sector||'Other';
    if(!secMap[s])secMap[s]={total:0,valid:0,edge:0,pfSum:0,best:0};
    secMap[s].total++;
    if(r.ho_pf!=null){secMap[s].valid++;secMap[s].pfSum+=r.ho_pf;if(r.ho_pf>=1.10)secMap[s].edge++;if(r.ho_pf>secMap[s].best)secMap[s].best=r.ho_pf;}
  });
  const secEntries=Object.entries(secMap).sort((a,b)=>(b[1].valid?b[1].pfSum/b[1].valid:0)-(a[1].valid?a[1].pfSum/a[1].valid:0));
  const secLabels=secEntries.map(([s])=>s);
  const secAvgPF=secEntries.map(([,d])=>d.valid?+(d.pfSum/d.valid).toFixed(3):0);
  const secBC=secAvgPF.map(v=>v>=1.10?GREEN_7:v>=1.05?'rgba(251,191,36,0.7)':RED_55);
  const scSecCtx=el('meta-sector-pf-chart')?.getContext('2d');
  if(scSecCtx){if(_metaSectorChart)_metaSectorChart.destroy();_metaSectorChart=new Chart(scSecCtx,{type:'bar',data:{labels:secLabels,datasets:[{data:secAvgPF,backgroundColor:secBC,borderColor:secBC,borderWidth:1,borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>[` Avg HO PF: ${ctx.raw.toFixed(3)}`,` ${secEntries[ctx.dataIndex][1].edge}/${secEntries[ctx.dataIndex][1].valid} with HO PF≥1.10`]}}},scales:{x:{min:0.90,grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v.toFixed(2)}},y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}}}); }

  // ── Sector pass rate table ────────────────────────────────────────────────
  el('meta-sector-tbody').innerHTML=secEntries.map(([name,d])=>{
    const avgP=d.valid?d.pfSum/d.valid:0, pass=d.valid?Math.round(d.edge/d.valid*100):0;
    const barC=pass>=30?GREEN:pass>=10?'#f59e0b':RED;
    const avgC=avgP>=1.10?'var(--green)':avgP>=1.05?'#fbbf24':'var(--muted)';
    return`<tr style="border-bottom:1px solid #1a1a1a"><td style="padding:7px 12px;font-weight:600;color:#e5e7eb">${name}</td><td style="padding:7px 12px;text-align:center;color:var(--muted)">${d.total}</td><td style="padding:7px 12px;text-align:center;color:var(--muted)">${d.valid}</td><td style="padding:7px 12px;text-align:center;color:${GREEN}">${d.edge}</td><td style="padding:7px 12px;text-align:right;font-family:monospace;color:${avgC}">${d.valid?avgP.toFixed(3):'—'}</td><td style="padding:7px 12px;text-align:right;font-family:monospace;color:var(--green)">${d.best?d.best.toFixed(3):'—'}</td><td style="padding:7px 12px;min-width:120px"><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:6px;background:#222;border-radius:3px"><div style="height:100%;width:${pass}%;background:${barC};border-radius:3px"></div></div><span style="font-size:11px;color:${barC};min-width:26px">${pass}%</span></div></td></tr>`;
  }).join('');

  // ── Sector × Model Type Heatmap ───────────────────────────────────────────
  const hmWrap=el('meta-heatmap-wrap');
  if(hmWrap){
    const allMTs=[...new Set(filtered.map(r=>r.model_type))].sort();
    const allSecs=[...new Set(filtered.map(r=>r.sector||'Other'))].sort();
    // Only model types with ≥ 2 models total (in filtered set)
    const validMTs=_activeModelFilter==='All'
      ? allMTs.filter(mt=>filtered.filter(r=>r.model_type===mt&&r.ho_pf!=null).length>=2)
      : allMTs;
    const pfBg=pf=>{if(pf==null)return'';if(pf>=1.15)return'background:rgba(16,185,129,0.25)';if(pf>=1.10)return'background:rgba(34,197,94,0.15)';if(pf>=1.05)return'background:rgba(251,191,36,0.15)';if(pf>=1.00)return'background:rgba(251,191,36,0.07)';return'background:rgba(239,68,68,0.12)';};
    const pfTxt=pf=>pf>=1.10?'var(--green)':pf>=1.00?'#fbbf24':RED;
    let html=`<div style="overflow-x:auto"><table class="meta-table" style="font-size:11px"><thead><tr><th style="white-space:nowrap">Sector</th>`;
    validMTs.forEach(mt=>{const dot=`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${_MT_COLOR[mt]||'#6b7280'};margin-right:4px"></span>`;html+=`<th style="text-align:center;white-space:nowrap">${dot}${mt}</th>`;});
    html+=`</tr></thead><tbody>`;
    allSecs.forEach(sec=>{
      const cells=validMTs.map(mt=>{const recs=filtered.filter(r=>r.sector===sec&&r.model_type===mt&&r.ho_pf!=null);return recs.length?{pf:recs.reduce((s,r)=>s+r.ho_pf,0)/recs.length,n:recs.length}:{pf:null,n:0};});
      if(cells.every(c=>c.n===0))return;
      html+=`<tr style="border-bottom:1px solid #1a1a1a"><td style="padding:6px 10px;font-weight:600;color:#e5e7eb;white-space:nowrap">${sec}</td>`;
      cells.forEach(c=>{
        if(!c.n){html+=`<td style="padding:6px 8px;text-align:center;color:#2a2a2a">·</td>`;return;}
        html+=`<td style="padding:6px 8px;text-align:center;${pfBg(c.pf)}"><span style="font-family:monospace;font-weight:700;color:${pfTxt(c.pf)}">${c.pf.toFixed(2)}</span><br><span style="color:#4b5563;font-size:9px">n=${c.n}</span></td>`;
      });
      html+=`</tr>`;
    });
    html+=`</tbody></table></div>`;
    hmWrap.innerHTML=html;
  }

  // ── Top 20 ────────────────────────────────────────────────────────────────
  const top20=[...valid].sort((a,b)=>(b.ho_pf||0)-(a.ho_pf||0)).slice(0,20);
  _metaTop20=top20.map(r=>({ticker:r.ticker,sector:r.sector,pf:r.ho_pf,sharpe:r.ho_sharpe,label:r.model_type}));
  el('meta-top20-tbody').innerHTML=top20.map((r,i)=>{
    const pfC=r.ho_pf>=1.10?'var(--green)':r.ho_pf>=1.05?'#fbbf24':'var(--muted)';
    const shC=r.ho_sharpe!=null?(r.ho_sharpe>=0.5?'var(--green)':r.ho_sharpe>=0.2?'#fbbf24':'var(--muted)'):'var(--muted)';
    const ofC=r.overfit==='LOW'?GREEN:r.overfit==='MEDIUM'?'#fbbf24':r.overfit==='HIGH'?RED:'var(--muted)';
    return`<tr style="border-bottom:1px solid #1a1a1a"><td style="padding:7px 10px;color:var(--muted);font-size:12px">${i+1}</td><td style="padding:7px 10px;font-weight:700;color:#e5e7eb">${r.ticker}</td><td style="padding:7px 10px;color:var(--muted);font-size:11px">${r.sector||'—'}</td><td style="padding:7px 10px;font-size:10px;color:#6b7280;white-space:nowrap">${r.model_type}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:${pfC};font-weight:700">${r.ho_pf.toFixed(3)}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:${shC}">${r.ho_sharpe!=null?r.ho_sharpe.toFixed(2):'—'}</td><td style="padding:7px 10px;text-align:right;font-size:11px;color:${ofC}">${r.overfit||'—'}</td></tr>`;
  }).join('');

  // ── Model Summary ─────────────────────────────────────────────────────────
  const isPFs=valid.filter(r=>r.is_pf!=null).map(r=>r.is_pf);
  const avgIs=isPFs.length?isPFs.reduce((a,b)=>a+b,0)/isPFs.length:0;
  const decay=avgIs>0?(avgIs-avgHoPF)/avgIs*100:0;
  el('meta-lr-stat').innerHTML=`<span style="font-size:28px;font-weight:800;color:${GREEN}">${edge.length}/${valid.length}</span><div style="font-size:13px;color:var(--muted);margin-top:2px">${valid.length?Math.round(edge.length/valid.length*100):0}% with HO PF ≥ 1.10</div><div style="font-size:12px;color:#4b5563;margin-top:6px">IS avg ${avgIs.toFixed(3)} → HO avg ${avgHoPF.toFixed(3)} (−${decay.toFixed(1)}% decay)</div>`;
  el('meta-don-stat').innerHTML=`<span style="font-size:28px;font-weight:800;color:${RED}">0/${valid.length}</span><div style="font-size:13px;color:var(--muted);margin-top:2px">0% pass rate</div><div style="font-size:12px;color:#4b5563;margin-top:6px">No validated edge found</div>`;

  // ── Portfolio alignment ───────────────────────────────────────────────────
  if(_compData&&_compData.tickers){
    const ct=_compData.tickers;
    const buys=ct.filter(t=>t.signal===1).length,sells=ct.filter(t=>t.signal===-1).length;
    const pct=ct.length?Math.round(buys/ct.length*100):0;
    el('meta-portfolio-bar').style.cssText+=`;width:${pct}%;background:${buys>sells?GREEN:RED}`;
    el('meta-portfolio-label').textContent=`${buys} BUY · ${sells} SELL`;
    el('meta-portfolio-tbody').innerHTML=ct.map(t=>{const isBuy=t.signal===1;const sc=isBuy?GREEN:RED;return`<tr style="border-bottom:1px solid #1a1a1a"><td style="padding:7px 12px;font-weight:600;color:#e5e7eb">${t.ticker}</td><td style="padding:7px 12px;color:var(--muted);font-size:12px">${t.sector||'—'}</td><td style="padding:7px 12px;text-align:center"><span style="font-size:11px;font-weight:700;color:${sc};background:${isBuy?GREEN_1:RED_1};padding:2px 8px;border-radius:4px">${isBuy?'BUY':'SELL'}</span></td><td style="padding:7px 12px;text-align:right;font-family:monospace;color:${t.predicted_5bar_pct>=0?GREEN:RED}">${t.predicted_5bar_pct>=0?'+':''}${t.predicted_5bar_pct.toFixed(2)}%</td><td style="padding:7px 12px;text-align:right;font-family:monospace">${t.walk_fwd_pf?.toFixed(3)??'—'}</td><td style="padding:7px 12px;text-align:right;color:var(--muted);font-size:11px">${t.mcpt_p?.toFixed(3)??'—'}</td></tr>`;}).join('');
    const featCount={};ct.forEach(t=>{(t.top_features||[]).forEach(f=>{featCount[f.name]=(featCount[f.name]||0)+1;});});
    const fsorted=Object.entries(featCount).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const mx=fsorted.length?fsorted[0][1]:1;
    el('meta-feature-freq').innerHTML=fsorted.map(([name,count])=>`<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:12px;font-family:monospace;color:#e5e7eb">${name}</span><span style="font-size:11px;color:var(--muted)">${count}/${ct.length} models</span></div><div style="height:6px;background:#222;border-radius:3px"><div style="height:100%;width:${Math.round(count/mx*100)}%;background:var(--gold);border-radius:3px"></div></div></div>`).join('');
  }

  // ── Feature Intelligence charts ───────────────────────────────────────────
  const _dbgEl=document.getElementById('meta-debug-status');
  if(_dbgEl){
    const _mi=_modelIndexFlat.length;
    const _mf=_metaFeatData?_metaFeatData.models.length:0;
    const _sf=_screenerFull.length;
    _dbgEl.innerHTML=`<span style="font-size:10px;color:#4b5563">data: model_index=${_mi} · meta_features=${_mf} · screener=${_sf}</span>`;
    _dbgEl.style.display='';
  }
  if(_metaFeatData){
    try{
      _buildFeatureCharts(filtered);
    }catch(err){
      console.error('_buildFeatureCharts error:',err);
      if(_dbgEl){_dbgEl.innerHTML+=`<br><span style="color:#f87171;font-size:11px">ERROR: ${err.message}</span>`;_dbgEl.style.display='';}
    }
  }else{
    if(_dbgEl){_dbgEl.innerHTML+=`<br><span style="color:#fbbf24;font-size:11px">meta_features.json not loaded — feature charts unavailable</span>`;_dbgEl.style.display='';}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Intelligence — comparative charts by sector and market cap tier
// ─────────────────────────────────────────────────────────────────────────────
const _MC_TIERS=[['Nano (<$100M)',0,1e8],['Micro ($100M–500M)',1e8,5e8],['Small ($500M–$2B)',5e8,2e9],['Mid ($2B–$20B)',2e9,2e10],['Large (>$20B)',2e10,Infinity]];

function _mcTier(mc){
  if(!mc||mc<=0)return null;
  const t=_MC_TIERS.find(([,lo,hi])=>mc>=lo&&mc<hi);
  return t?t[0]:null;
}

// Jitter-scatter distribution chart — one dot per model, grouped by category
// Defined at top level so both _buildFeatureCharts and _buildAdvancedCharts can use it
function _buildDistChart(canvasId, groups, order){
  const ctx=document.getElementById(canvasId)?.getContext('2d');if(!ctx)return null;
  const greenPts=[],amberPts=[],redPts=[],meanPts=[];
  order.forEach((grp,i)=>{
    const ms=(groups[grp]||[]).filter(m=>m.ho_pf!=null);
    ms.forEach((m,j)=>{
      const jit=(((j*7+3)%13)/13-0.5)*0.40;
      const pt={x:i+jit,y:m.ho_pf,ticker:m.ticker,grp};
      if(m.ho_pf>=1.10)greenPts.push(pt);else if(m.ho_pf>=1.00)amberPts.push(pt);else redPts.push(pt);
    });
    if(ms.length){const mean=ms.reduce((a,m)=>a+m.ho_pf,0)/ms.length;meanPts.push({x:i,y:mean,n:ms.length,grp});}
  });
  const _dc=new Chart(ctx,{data:{datasets:[
    {type:'scatter',label:'≥ 1.10',data:greenPts,backgroundColor:GREEN_7,pointRadius:5,pointHoverRadius:8},
    {type:'scatter',label:'1.0 – 1.10',data:amberPts,backgroundColor:'rgba(251,191,36,0.70)',pointRadius:5,pointHoverRadius:8},
    {type:'scatter',label:'< 1.0',data:redPts,backgroundColor:RED_55,pointRadius:5,pointHoverRadius:8},
    {type:'scatter',label:'Mean',data:meanPts,backgroundColor:'rgba(245,165,32,0.95)',pointStyle:'crossRot',pointRadius:12,pointHoverRadius:14,borderColor:'rgba(245,165,32,0.95)',borderWidth:2.5},
    {type:'line',label:'_edge',data:[{x:-0.5,y:1.10},{x:order.length-0.5,y:1.10}],borderColor:'rgba(16,185,129,0.20)',borderDash:[4,3],borderWidth:1.5,pointRadius:0,fill:false,tension:0,order:0},
  ]},options:{responsive:true,maintainAspectRatio:false,
    plugins:{
      legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6,filter:i=>!i.text.startsWith('_')}},
      tooltip:{callbacks:{label:ctx=>{const p=ctx.raw;if(p?.ticker)return[`${p.ticker} (${p.grp})`,`HO PF: ${p.y?.toFixed(3)}`];if(p?.grp&&p.n)return[`${p.grp} mean`,`Avg HO PF: ${p.y?.toFixed(3)} (n=${p.n})`];return[];}}},
      zoom:_zoom('xy'),
    },
    scales:{
      x:{min:-0.5,max:order.length-0.5,grid:{color:'#1a1a1a'},ticks:{color:'#9ca3af',font:{size:9},maxRotation:40,callback:(v)=>{const i=Math.round(v);return(Math.abs(v-i)<0.01&&i>=0&&i<order.length)?order[i]:null;}}},
      y:{title:{display:true,text:'HO Profit Factor',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}},
    },
  }});
  _addResetZoom(_dc.canvas,_dc);
  return _dc;
}

function _buildFeatureCharts(filtered){
  const el=id=>document.getElementById(id);
  if(!el('meta-feat-heatmap'))return;

  // Build lookup: "ticker|model_type" → feature record
  const featLookup={};
  (_metaFeatData.models||[]).forEach(m=>{featLookup[`${m.ticker}|${m.model_type}`]=m;});

  // Join filtered model list with feature data + hard-coded market cap
  const joined=filtered.map(r=>{
    const fd=featLookup[`${r.ticker}|${r.model_type}`];
    const mc=_MC[r.ticker]||null;
    // Spread all fd fields (includes trade stats) then override with r (primary source),
    // then pin features/feature_count/market_cap explicitly.
    return fd?{...fd,...r,features:fd.features,feature_count:fd.feature_count,market_cap:mc}:{...r,features:[],feature_count:0,market_cap:mc};
  }).filter(r=>r.ho_pf!=null);

  // ── Shared helpers ────────────────────────────────────────────────────────
  const featFreq={};
  joined.forEach(m=>m.features.forEach(f=>{featFreq[f.name]=(featFreq[f.name]||0)+1;}));
  const topFeats=Object.entries(featFreq).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([n])=>n);

  const featCat={};
  joined.forEach(m=>m.features.forEach(f=>{if(!featCat[f.name])featCat[f.name]={};featCat[f.name][f.category]=(featCat[f.name][f.category]||0)+1;}));
  const getFeatCat=n=>{const c=featCat[n];if(!c)return'other';return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];};

  const abbr=n=>n.replace('macro_','m_').replace('price_fd_','fd_').replace('ann_','an_').replace('vol_','v_').replace('_ratio','_r').replace('_pct','%').replace('_20d','20').replace('_10d','10').replace('_5d','5');

  function _cellVal(models,feat){
    const vals=models.flatMap(m=>m.features.filter(f=>f.name===feat).map(f=>f.signed));
    return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
  }

  // Builds a Feature × Group signed-weight heatmap into a div
  function _buildFeatHeatmap(containerId, groups, rowOrder, rowLabel){
    const cont=el(containerId);if(!cont)return;
    let maxAbs=0;
    rowOrder.forEach(r=>topFeats.forEach(f=>{const v=_cellVal(groups[r]||[],f);if(v!=null&&Math.abs(v)>maxAbs)maxAbs=Math.abs(v);}));
    if(maxAbs<1e-8)maxAbs=1;
    const cBg=v=>{if(v==null)return'background:#0e0e0e';const a=Math.min(0.9,0.12+0.78*Math.abs(v)/maxAbs);return v>0?`background:rgba(16,185,129,${a.toFixed(2)})`:`background:rgba(239,68,68,${a.toFixed(2)})`;};
    const cTxt=v=>{if(v==null)return'<span style="color:#222">·</span>';const c=v>0?'rgba(187,247,208,0.9)':'rgba(254,202,202,0.9)';return`<span style="color:${c};font-family:monospace;font-size:10px;font-weight:700">${v>0?'+':''}${(v*1000).toFixed(1)}<span style="font-size:8px">‰</span></span>`;};
    let htm=`<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:11px;width:100%"><thead><tr>`;
    htm+=`<th style="padding:5px 8px;text-align:left;color:var(--gold);font-size:10px;border-bottom:1px solid #2a2a2a;white-space:nowrap">${rowLabel}</th>`;
    topFeats.forEach(f=>{const cat=getFeatCat(f);const dot=`<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${_CAT_COLOR[cat]||'#6b7280'};margin-bottom:2px"></span>`;htm+=`<th style="padding:3px 4px;text-align:center;border-bottom:1px solid #2a2a2a;white-space:nowrap"><div style="writing-mode:vertical-rl;transform:rotate(180deg);height:70px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px"><span style="color:#9ca3af;font-size:9px">${abbr(f)}</span>${dot}</div></th>`;});
    htm+=`</tr></thead><tbody>`;
    rowOrder.forEach(row=>{
      const ms=groups[row]||[];if(!ms.length)return;
      const valid=ms.filter(m=>m.ho_pf!=null);
      const avgHo=valid.length?valid.reduce((a,m)=>a+m.ho_pf,0)/valid.length:null;
      const pfC=avgHo!=null?(avgHo>=1.10?'var(--green)':avgHo>=1.00?'#fbbf24':RED):'var(--muted)';
      htm+=`<tr><td style="padding:5px 8px;font-weight:600;color:#e5e7eb;white-space:nowrap;border-bottom:1px solid #1a1a1a">${row} ${avgHo!=null?`<span style="color:${pfC};font-size:10px;font-family:monospace">${avgHo.toFixed(2)}</span>`:''} <span style="color:#4b5563;font-size:9px">n=${ms.length}</span></td>`;
      topFeats.forEach(f=>{const v=_cellVal(ms,f);htm+=`<td style="padding:3px 4px;text-align:center;border-bottom:1px solid #1a1a1a;${cBg(v)}">${cTxt(v)}</td>`;});
      htm+=`</tr>`;
    });
    htm+=`</tbody></table></div><div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:10px">`;
    Object.entries(_CAT_COLOR).forEach(([cat,col])=>{htm+=`<span style="font-size:10px;display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col}"></span><span style="color:#9ca3af">${cat}</span></span>`;});
    htm+=`<span style="font-size:10px;color:#4b5563;margin-left:8px">values in ‰ · green=bullish · red=bearish</span></div>`;
    cont.innerHTML=htm;
  }


  // Builds a normalised 100% stacked bar (horizontal) for feature categories
  function _buildCatChart(canvasId){
    const ctx=el(canvasId)?.getContext('2d');if(!ctx)return null;
    const _cc=new Chart(ctx,{type:'bar',
      data:{labels:[],datasets:[]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6}},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`}}},
        scales:{x:{stacked:true,max:100,grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'}},y:{stacked:true,grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}}
    });
    return _cc;
  }
  function _fillCatChart(chart, groups, order){
    if(!chart)return;
    const cats=['macro','momentum','volume','interaction','announcement','volatility','candle','trend','other'];
    const validOrder=order.filter(g=>groups[g]&&groups[g].length>=1);
    chart.data.labels=validOrder;
    chart.data.datasets=cats.map(cat=>({
      label:cat,
      data:validOrder.map(g=>{const ms=groups[g];const tot=ms.reduce((a,m)=>a+m.features.length,0);const cnt=ms.reduce((a,m)=>a+m.features.filter(f=>f.category===cat).length,0);return tot?+(cnt/tot*100).toFixed(1):0;}),
      backgroundColor:_CAT_COLOR[cat]||'rgba(107,114,128,0.6)',borderWidth:0,
    }));
    chart.update();
  }

  // ── Build group data once ─────────────────────────────────────────────────
  const secGroups={};
  joined.forEach(m=>{const s=m.sector||'Other';if(!secGroups[s])secGroups[s]=[];secGroups[s].push(m);});
  const secs=Object.entries(secGroups).filter(([,ms])=>ms.length>=2).sort((a,b)=>b[1].length-a[1].length).map(([s])=>s);

  const mcGroups={};
  _MC_TIERS.forEach(([label])=>{mcGroups[label]=[];});
  joined.forEach(m=>{const t=_mcTier(m.market_cap);if(t)mcGroups[t].push(m);});
  const mcTierOrder=_MC_TIERS.filter(([label])=>mcGroups[label]&&mcGroups[label].length>=2).map(([label])=>label);

  // ── 1+2. Feature Heatmap (toggled) ───────────────────────────────────────
  _GBfn['heat']=function(gb){
    if(gb==='mc'){
      _buildFeatHeatmap('meta-feat-heatmap',mcGroups,mcTierOrder,'Market Cap Tier');
    }else{
      _buildFeatHeatmap('meta-feat-heatmap',secGroups,secs,'Sector');
    }
  };
  _GBfn['heat'](_GB['heat']||'sector');

  // ── 3+4. HO PF Distribution (toggled) ────────────────────────────────────
  _GBfn['dist']=function(gb){
    if(_metaDistSectorChart){_metaDistSectorChart.destroy();_metaDistSectorChart=null;}
    if(gb==='mc'){
      _metaDistSectorChart=_buildDistChart('meta-dist-sector-chart',mcGroups,mcTierOrder);
    }else{
      const secDistOrder=[...secs].sort((a,b)=>{
        const ga=secGroups[a].filter(m=>m.ho_pf!=null),gb2=secGroups[b].filter(m=>m.ho_pf!=null);
        const ma=ga.length?ga.reduce((s,m)=>s+m.ho_pf,0)/ga.length:0,mb=gb2.length?gb2.reduce((s,m)=>s+m.ho_pf,0)/gb2.length:0;
        return mb-ma;
      });
      _metaDistSectorChart=_buildDistChart('meta-dist-sector-chart',secGroups,secDistOrder);
    }
  };
  _GBfn['dist'](_GB['dist']||'sector');

  // ── 5+6. Feature Category Composition (toggled) ──────────────────────────
  _GBfn['cat']=function(gb){
    if(_metaCatChart){_metaCatChart.destroy();_metaCatChart=null;}
    _metaCatChart=_buildCatChart('meta-cat-chart');
    if(gb==='mc'){
      _fillCatChart(_metaCatChart,mcGroups,mcTierOrder);
    }else{
      _fillCatChart(_metaCatChart,secGroups,secs);
    }
  };
  _GBfn['cat'](_GB['cat']||'sector');

  const _safe=(fn,name)=>{try{fn();}catch(e){console.error(name+' failed:',e);}};

  // ── Advanced Analytics (10 charts) ───────────────────────────────────────
  _safe(()=>_buildAdvancedCharts(filtered, joined, topFeats, abbr),'advCharts');

  // ── Edge Intelligence (4 charts) ─────────────────────────────────────────
  _safe(()=>_buildEdgeIntelCharts(joined),'edgeIntel');

  // ── Feature Interaction Analysis ─────────────────────────────────────────
  _safe(()=>_buildFeatureInteractionCharts(joined, topFeats),'featInteraction');

  // ── Trade Mechanics Assessment ────────────────────────────────────────────
  _safe(()=>_buildTradeMechanicsCharts(joined),'tradeMechanics');

  // ── Trade & Model Analytics (20 charts) ──────────────────────────────────
  _safe(()=>_buildTradeCharts(filtered, joined),'tradeCharts');
}

// ─────────────────────────────────────────────────────────────────────────────
// Advanced Analytics — 10 diagnostic charts
// ─────────────────────────────────────────────────────────────────────────────
function _buildAdvancedCharts(filtered, joined, topFeats, abbr){
  const el=id=>document.getElementById(id);
  const D=i=>{if(_advCharts[i]){_advCharts[i].destroy();_advCharts[i]=null;}};

  // ── 1. IS→HO Decay by Sector ──────────────────────────────────────────────
  D(0);
  const decayMap={};
  filtered.filter(r=>r.is_pf>0&&r.ho_pf!=null).forEach(r=>{
    const s=r.sector||'Other';
    if(!decayMap[s])decayMap[s]={sum:0,n:0};
    decayMap[s].sum+=(r.is_pf-r.ho_pf)/r.is_pf*100;
    decayMap[s].n++;
  });
  const decayE=Object.entries(decayMap).map(([s,d])=>({s,avg:d.sum/d.n})).sort((a,b)=>b.avg-a.avg);
  const c1=el('meta-adv-decay-chart')?.getContext('2d');
  if(c1) _advCharts[0]=new Chart(c1,{type:'bar',
    data:{labels:decayE.map(e=>e.s),datasets:[{data:decayE.map(e=>+e.avg.toFixed(1)),backgroundColor:decayE.map(e=>e.avg>25?RED_55:e.avg>15?'rgba(251,191,36,0.65)':GREEN_7),borderWidth:0,borderRadius:3}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`IS→HO decay: ${c.raw.toFixed(1)}%`}}},
      scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'},title:{display:true,text:'Avg IS→HO Decay % (higher = more overfitting)',color:'#6b7280',font:{size:10}}},y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}}});

  // ── 2. Cumulative Pass Rate by PF threshold ────────────────────────────────
  D(1);
  const thresholds=[0.80,0.85,0.90,0.95,1.00,1.05,1.10,1.15,1.20,1.25,1.30,1.40,1.50];
  const v2=filtered.filter(r=>r.ho_pf!=null);
  const cumPass=thresholds.map(t=>v2.length?+(v2.filter(r=>r.ho_pf>=t).length/v2.length*100).toFixed(1):0);
  const c2=el('meta-adv-cumpass-chart')?.getContext('2d');
  if(c2) _advCharts[1]=new Chart(c2,{type:'line',
    data:{labels:thresholds.map(t=>t.toFixed(2)),datasets:[{label:'% models ≥ threshold',data:cumPass,borderColor:'rgba(245,165,32,0.85)',backgroundColor:'rgba(245,165,32,0.07)',borderWidth:2,fill:true,tension:0.3,pointRadius:5,pointHoverRadius:8,pointBackgroundColor:thresholds.map(t=>t>=1.10?GREEN_7:'rgba(245,165,32,0.85)')}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw}% of models pass HO PF ≥ ${thresholds[c.dataIndex].toFixed(2)}`}},zoom:_zoom('xy')},
      scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',font:{size:10}},title:{display:true,text:'HO PF Threshold',color:'#6b7280',font:{size:11}}},y:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'},title:{display:true,text:'% Models Passing',color:'#6b7280',font:{size:11}}}}}});
  _addResetZoom(_advCharts[1].canvas,_advCharts[1]);

  // ── 3. HO Sharpe vs HO PF scatter ─────────────────────────────────────────
  D(2);
  const v3=filtered.filter(r=>r.ho_pf!=null&&r.ho_sharpe!=null);
  const secs3=[...new Set(v3.map(r=>r.sector))].sort();
  const c3=el('meta-adv-sharpepf-chart')?.getContext('2d');
  if(c3){
    const ds3=secs3.map((s,i)=>({type:'scatter',label:s,data:v3.filter(r=>r.sector===s).map(r=>({x:r.ho_sharpe,y:r.ho_pf,ticker:r.ticker,sec:s})),backgroundColor:_SEC_PAL[i%_SEC_PAL.length],pointRadius:4,pointHoverRadius:7}));
    ds3.push({type:'line',label:'_h',data:[{x:-4,y:1.10},{x:6,y:1.10}],borderColor:'rgba(16,185,129,0.18)',borderDash:[4,3],borderWidth:1,pointRadius:0,fill:false,tension:0,order:0});
    ds3.push({type:'line',label:'_v',data:[{x:0.5,y:0.4},{x:0.5,y:2.8}],borderColor:'rgba(245,165,32,0.18)',borderDash:[4,3],borderWidth:1,pointRadius:0,fill:false,tension:0,order:0});
    _advCharts[2]=new Chart(c3,{data:{datasets:ds3},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const p=c.raw;if(p?.ticker)return[`${p.ticker} (${p.sec})`,`Sharpe: ${p.x?.toFixed(2)} · PF: ${p.y?.toFixed(3)}`];return[];}}},zoom:_zoom('xy')},
      scales:{x:{title:{display:true,text:'HO Sharpe',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}},y:{title:{display:true,text:'HO Profit Factor',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}}}}});
  _addResetZoom(_advCharts[2].canvas,_advCharts[2]);
  }

  // ── 4. Feature Count vs HO PF ─────────────────────────────────────────────
  D(3);
  const fcV=joined.filter(r=>r.feature_count>0&&r.ho_pf!=null);
  const mt4=[...new Set(fcV.map(r=>r.model_type))].sort();
  const c4=el('meta-adv-featcount-chart')?.getContext('2d');
  if(c4){
    const ds4=mt4.map(mt=>({type:'scatter',label:mt,data:fcV.filter(r=>r.model_type===mt).map(r=>({x:r.feature_count,y:r.ho_pf,ticker:r.ticker,mt})),backgroundColor:_MT_COLOR[mt]||'rgba(107,114,128,0.55)',pointRadius:4,pointHoverRadius:7}));
    ds4.push({type:'line',label:'_e',data:[{x:0,y:1.10},{x:120,y:1.10}],borderColor:'rgba(16,185,129,0.18)',borderDash:[4,3],borderWidth:1,pointRadius:0,fill:false,tension:0,order:0});
    _advCharts[3]=new Chart(c4,{data:{datasets:ds4},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6,filter:i=>!i.text.startsWith('_')}},tooltip:{callbacks:{label:c=>{const p=c.raw;if(p?.ticker)return[`${p.ticker} (${p.mt})`,`${p.x} features · HO PF: ${p.y?.toFixed(3)}`];return[];}}},zoom:_zoom('xy')},
      scales:{x:{title:{display:true,text:'Final feature count after pruning',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}},y:{title:{display:true,text:'HO Profit Factor',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}}}}});
  _addResetZoom(_advCharts[3].canvas,_advCharts[3]);
  }

  // ── 5. Avg Feature Stability vs HO PF ─────────────────────────────────────
  D(4);
  const stV=joined.filter(r=>r.features.length>0&&r.ho_pf!=null);
  const avgStab=feats=>{const v=feats.filter(f=>f.stability!=null).map(f=>f.stability);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
  const secs5=[...new Set(stV.map(r=>r.sector))].sort();
  const c5=el('meta-adv-stability-chart')?.getContext('2d');
  if(c5){
    const ds5=secs5.map((s,i)=>({type:'scatter',label:s,data:stV.filter(r=>r.sector===s).map(r=>{const st=avgStab(r.features);return st!=null?{x:+st.toFixed(3),y:r.ho_pf,ticker:r.ticker,sec:s}:null;}).filter(Boolean),backgroundColor:_SEC_PAL[i%_SEC_PAL.length],pointRadius:4,pointHoverRadius:7}));
    ds5.push({type:'line',label:'_e',data:[{x:0,y:1.10},{x:1,y:1.10}],borderColor:'rgba(16,185,129,0.18)',borderDash:[4,3],borderWidth:1,pointRadius:0,fill:false,tension:0,order:0});
    _advCharts[4]=new Chart(c5,{data:{datasets:ds5},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const p=c.raw;if(p?.ticker)return[`${p.ticker} (${p.sec})`,`Stability: ${p.x?.toFixed(3)} · HO PF: ${p.y?.toFixed(3)}`];return[];}}},zoom:_zoom('xy')},
      scales:{x:{min:0,max:1,title:{display:true,text:'Avg feature stability (0=random · 1=always same direction)',color:'#6b7280',font:{size:10}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}},y:{title:{display:true,text:'HO Profit Factor',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}}}}});
  _addResetZoom(_advCharts[4].canvas,_advCharts[4]);
  }

  // ── 6. Avg Sign Consistency vs HO PF ──────────────────────────────────────
  D(5);
  const scV=joined.filter(r=>r.features.length>0&&r.ho_pf!=null);
  const avgSP=feats=>{const v=feats.filter(f=>f.sign_pct!=null).map(f=>f.sign_pct);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
  const secs6=[...new Set(scV.map(r=>r.sector))].sort();
  const c6=el('meta-adv-signcon-chart')?.getContext('2d');
  if(c6){
    const ds6=secs6.map((s,i)=>({type:'scatter',label:s,data:scV.filter(r=>r.sector===s).map(r=>{const sp=avgSP(r.features);return sp!=null?{x:+sp.toFixed(3),y:r.ho_pf,ticker:r.ticker,sec:s}:null;}).filter(Boolean),backgroundColor:_SEC_PAL[i%_SEC_PAL.length],pointRadius:4,pointHoverRadius:7}));
    ds6.push({type:'line',label:'_e',data:[{x:0,y:1.10},{x:1,y:1.10}],borderColor:'rgba(16,185,129,0.18)',borderDash:[4,3],borderWidth:1,pointRadius:0,fill:false,tension:0,order:0});
    _advCharts[5]=new Chart(c6,{data:{datasets:ds6},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const p=c.raw;if(p?.ticker)return[`${p.ticker} (${p.sec})`,`Sign consistency: ${(p.x*100).toFixed(1)}% · HO PF: ${p.y?.toFixed(3)}`];return[];}}},zoom:_zoom('xy')},
      scales:{x:{min:0,max:1,title:{display:true,text:'Avg sign consistency % (features pointing same direction)',color:'#6b7280',font:{size:10}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>(v*100).toFixed(0)+'%'}},y:{title:{display:true,text:'HO Profit Factor',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}}}}});
  _addResetZoom(_advCharts[5].canvas,_advCharts[5]);
  }

  // ── 7. Overfit Flag distribution — 100% stacked by sector ─────────────────
  D(6);
  const ofSecs=[...new Set(filtered.map(r=>r.sector||'Other'))].sort();
  const ofPct=(s,flag)=>{const all=filtered.filter(r=>(r.sector||'Other')===s);const cnt=all.filter(r=>flag==='None'?!r.overfit:r.overfit===flag).length;return all.length?+(cnt/all.length*100).toFixed(1):0;};
  const c7=el('meta-adv-overfit-chart')?.getContext('2d');
  if(c7) _advCharts[6]=new Chart(c7,{type:'bar',
    data:{labels:ofSecs,datasets:[
      {label:'No Flag',data:ofSecs.map(s=>ofPct(s,'None')),backgroundColor:'rgba(107,114,128,0.55)',borderWidth:0},
      {label:'LOW',data:ofSecs.map(s=>ofPct(s,'LOW')),backgroundColor:GREEN_7,borderWidth:0},
      {label:'MEDIUM',data:ofSecs.map(s=>ofPct(s,'MEDIUM')),backgroundColor:'rgba(251,191,36,0.70)',borderWidth:0},
      {label:'HIGH',data:ofSecs.map(s=>ofPct(s,'HIGH')),backgroundColor:RED_55,borderWidth:0},
    ]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw.toFixed(1)}% of models`}}},
      scales:{x:{stacked:true,max:100,grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'}},y:{stacked:true,grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}}});

  // ── 8. Feature category directional bias — boxplots ───────────────────────
  D(7);
  const cats8=['macro','momentum','volume','interaction','announcement','volatility','candle','trend','other'];
  const _bpMed=arr=>{const s=[...arr].sort((x,y)=>x-y);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
  const catBox8=cats8.map(cat=>{
    const vals=joined.flatMap(m=>m.features.filter(f=>f.category===cat&&f.signed!=null)).map(f=>+(f.signed*1000).toFixed(4));
    return{cat,vals};
  }).filter(c=>c.vals.length>0).sort((a,b)=>_bpMed(b.vals)-_bpMed(a.vals));
  const c8=el('meta-adv-catweight-chart')?.getContext('2d');
  if(c8){
    const boxColors=catBox8.map(c=>_bpMed(c.vals)>=0?'rgba(16,185,129,0.45)':'rgba(239,68,68,0.45)');
    const borderColors=catBox8.map(c=>_bpMed(c.vals)>=0?'rgba(16,185,129,0.90)':'rgba(239,68,68,0.90)');
    _advCharts[7]=new Chart(c8,{
      type:'boxplot',
      data:{
        labels:catBox8.map(c=>c.cat),
        datasets:[{
          label:'Signed weight ‰',
          data:catBox8.map(c=>c.vals),
          backgroundColor:boxColors,
          borderColor:borderColors,
          borderWidth:1.5,
          outlierBackgroundColor:'rgba(156,163,175,0.45)',
          outlierBorderColor:'rgba(156,163,175,0.75)',
          outlierRadius:2,
          medianColor:'#f5a520',
        }]
      },
      options:{
        indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:c=>{
            const s=c.raw;if(!s)return[];
            return[
              `Median: ${s.median?.toFixed(2)}‰`,
              `IQR: ${s.q1?.toFixed(2)} → ${s.q3?.toFixed(2)}‰`,
              `Range: ${s.min?.toFixed(2)} → ${s.max?.toFixed(2)}‰`,
              `n=${catBox8[c.dataIndex]?.vals.length} appearances`,
            ];
          }}},
        },
        scales:{
          x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'‰'},title:{display:true,text:'Signed weight ‰  (+  bullish · −  bearish)',color:'#6b7280',font:{size:10}}},
          y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}
        }
      }
    });
  }

  // ── 9. HO PF Distribution by Model Type (reuse jitter helper) ─────────────
  D(8);
  const mtG={};
  filtered.forEach(r=>{const mt=r.model_type;if(!mtG[mt])mtG[mt]=[];mtG[mt].push(r);});
  const mtO=[...new Set(filtered.map(r=>r.model_type))].sort((a,b)=>{
    const ga=mtG[a].filter(m=>m.ho_pf!=null),gb=mtG[b].filter(m=>m.ho_pf!=null);
    const ma=ga.length?ga.reduce((s,m)=>s+m.ho_pf,0)/ga.length:0,mb=gb.length?gb.reduce((s,m)=>s+m.ho_pf,0)/gb.length:0;
    return mb-ma;
  });
  _advCharts[8]=_buildDistChart('meta-adv-mtdist-chart',mtG,mtO);

  // ── 10. Top 10 feature rank consistency ───────────────────────────────────
  D(9);
  const top10=topFeats.slice(0,10);
  const rankBands=[['Top 5',0,5,'rgba(16,185,129,0.80)'],['6–10',5,10,'rgba(245,165,32,0.75)'],['11–20',10,20,'rgba(59,130,246,0.65)'],['21+',20,999,'rgba(107,114,128,0.50)']];
  const c10=el('meta-adv-rankdist-chart')?.getContext('2d');
  if(c10) _advCharts[9]=new Chart(c10,{type:'bar',
    data:{labels:top10.map(f=>abbr(f)),datasets:rankBands.map(([label,lo,hi,col])=>({
      label,
      data:top10.map(feat=>{const models=joined.filter(m=>m.features.some(f=>f.name===feat));if(!models.length)return 0;const cnt=models.filter(m=>m.features.some(f=>f.name===feat&&f.rank>lo&&f.rank<=hi)).length;return+(cnt/models.length*100).toFixed(1);}),
      backgroundColor:col,borderWidth:0,
    }))},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw.toFixed(1)}% of models using this feature`}}},
      scales:{x:{stacked:true,max:100,grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'}},y:{stacked:true,grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}}});
}

// ─────────────────────────────────────────────────────────────────────────────
// Trade & Model Analytics — 20 charts (10 pairs × sector + market cap)
// Interactive: T1 threshold slider · T5 min-trades slider
//              M1 color toggle · M3 IS/HO toggle · M5 metric toggle
// ─────────────────────────────────────────────────────────────────────────────
function _buildTradeCharts(filtered,joined){
  const el=id=>document.getElementById(id);
  const DT=i=>{if(_trCharts[i]){_trCharts[i].destroy();_trCharts[i]=null;}};

  // Only models with HO trade data
  const trd=joined.filter(r=>r.n_trades_ho!=null&&r.n_trades_ho>0);

  // Group by sector and market cap tier
  const secGrp={},mcGrp={};
  _MC_TIERS.forEach(([l])=>{mcGrp[l]=[];});
  trd.forEach(m=>{
    const s=m.sector||'Other';
    if(!secGrp[s])secGrp[s]=[];
    secGrp[s].push(m);
    const t=_mcTier(m.market_cap);
    if(t)mcGrp[t].push(m);
  });
  // Sort sectors by avg win rate desc
  const secOrder=Object.keys(secGrp).sort((a,b)=>{
    const ga=secGrp[a].filter(m=>m.win_rate_ho!=null),gb=secGrp[b].filter(m=>m.win_rate_ho!=null);
    const ma=ga.length?ga.reduce((s,m)=>s+m.win_rate_ho,0)/ga.length:0,mb=gb.length?gb.reduce((s,m)=>s+m.win_rate_ho,0)/gb.length:0;
    return mb-ma;
  });
  const mcOrder=_MC_TIERS.filter(([l])=>(mcGrp[l]||[]).length>=2).map(([l])=>l);

  // ── T1: Win Rate jitter + threshold slider ────────────────────────────────
  function buildWinRateJitter(canvasId,groups,order,thrId){
    const ctx=el(canvasId)?.getContext('2d');if(!ctx)return null;
    const gPts=[],aPts=[],rPts=[],mPts=[];
    order.forEach((grp,i)=>{
      const ms=(groups[grp]||[]).filter(m=>m.win_rate_ho!=null);
      ms.forEach((m,j)=>{const jit=(((j*7+3)%13)/13-0.5)*0.40,wr=m.win_rate_ho*100;const pt={x:i+jit,y:wr,ticker:m.ticker,grp,n:m.n_trades_ho};if(wr>=55)gPts.push(pt);else if(wr>=45)aPts.push(pt);else rPts.push(pt);});
      if(ms.length){const mn=ms.reduce((a,m)=>a+m.win_rate_ho,0)/ms.length*100;mPts.push({x:i,y:mn,n:ms.length,grp});}
    });
    const chart=new Chart(ctx,{data:{datasets:[
      {type:'scatter',label:'≥ 55%',data:gPts,backgroundColor:GREEN_7,pointRadius:5,pointHoverRadius:8},
      {type:'scatter',label:'45–55%',data:aPts,backgroundColor:'rgba(251,191,36,0.70)',pointRadius:5,pointHoverRadius:8},
      {type:'scatter',label:'< 45%',data:rPts,backgroundColor:RED_55,pointRadius:5,pointHoverRadius:8},
      {type:'scatter',label:'Mean',data:mPts,backgroundColor:'rgba(245,165,32,0.95)',pointStyle:'crossRot',pointRadius:12,borderColor:'rgba(245,165,32,0.95)',borderWidth:2.5},
      {type:'line',label:'_thr',data:[{x:-0.5,y:50},{x:order.length-0.5,y:50}],borderColor:'rgba(245,165,32,0.35)',borderDash:[4,3],borderWidth:1.5,pointRadius:0,fill:false,tension:0,order:0},
    ]},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6,filter:i=>!i.text.startsWith('_')}},
        tooltip:{callbacks:{label:c=>{const p=c.raw;if(p?.ticker)return[`${p.ticker} (${p.grp})`,`Win rate: ${p.y?.toFixed(1)}% · ${p.n} trades`];if(p?.grp&&p.n)return[`${p.grp} mean`,`${p.y?.toFixed(1)}%`];return[];}}},zoom:_zoom('xy')},
      scales:{x:{min:-0.5,max:order.length-0.5,grid:{color:'#1a1a1a'},ticks:{color:'#9ca3af',font:{size:9},maxRotation:40,callback:v=>{const i=Math.round(v);return(Math.abs(v-i)<0.01&&i>=0&&i<order.length)?order[i]:null;}}},
        y:{min:0,max:100,title:{display:true,text:'Win Rate %',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'}}}}});
    const thr=el(thrId),thrv=el(thrId+'-val');
    if(thr){thr.addEventListener('input',()=>{const v=+thr.value;if(thrv)thrv.textContent=v+'%';chart.data.datasets[4].data=[{x:-0.5,y:v},{x:order.length-0.5,y:v}];chart.update('none');});}
    _addResetZoom(chart.canvas,chart);
    return chart;
  }
  _GBfn['tr1']=function(gb){
    DT(0);
    if(gb==='mc'){
      _trCharts[0]=buildWinRateJitter('meta-tr1a',mcGrp,mcOrder,'tr1a-thr');
    }else{
      _trCharts[0]=buildWinRateJitter('meta-tr1a',secGrp,secOrder,'tr1a-thr');
    }
  };
  _GBfn['tr1'](_GB['tr1']||'sector');

  // ── T2: Payoff Ratio by group (bar, sorted) ───────────────────────────────
  function buildPayoffBar(canvasId,groups,order){
    const ctx=el(canvasId)?.getContext('2d');if(!ctx)return null;
    const entries=order.map(g=>{const ms=(groups[g]||[]).filter(m=>m.payoff_ratio!=null);return ms.length?{g,avg:ms.reduce((a,m)=>a+m.payoff_ratio,0)/ms.length,n:ms.length}:null;}).filter(Boolean).sort((a,b)=>b.avg-a.avg);
    const colors=entries.map(e=>e.avg>=1.5?GREEN_7:e.avg>=1.0?'rgba(251,191,36,0.70)':RED_55);
    const _pb=new Chart(ctx,{type:'bar',
      data:{labels:entries.map(e=>e.g),datasets:[{data:entries.map(e=>+e.avg.toFixed(2)),backgroundColor:colors,borderColor:colors,borderWidth:1,borderRadius:3}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>[`Payoff: ${c.raw?.toFixed(2)}x`,`avg win ÷ avg |loss| · n=${entries[c.dataIndex].n} models`]}}},
        scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'x'},title:{display:true,text:'Payoff ratio (avg win ÷ avg |loss|)  ·  >1.0 = wins bigger than losses',color:'#6b7280',font:{size:10}}},y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}}});
    return _pb;
  }
  _GBfn['tr2']=function(gb){
    DT(2);
    if(gb==='mc'){
      _trCharts[2]=buildPayoffBar('meta-tr2a',mcGrp,mcOrder);
    }else{
      _trCharts[2]=buildPayoffBar('meta-tr2a',secGrp,secOrder);
    }
  };
  _GBfn['tr2'](_GB['tr2']||'sector');

  // ── T3: Direction Bias — % long vs short ─────────────────────────────────
  function buildDirBias(canvasId,groups,order){
    const ctx=el(canvasId)?.getContext('2d');if(!ctx)return null;
    const lp=order.map(g=>{const ms=(groups[g]||[]).filter(m=>m.long_pct!=null);return ms.length?+(ms.reduce((a,m)=>a+m.long_pct,0)/ms.length*100).toFixed(1):50;});
    const _db=new Chart(ctx,{type:'bar',
      data:{labels:order,datasets:[{label:'Long',data:lp,backgroundColor:'rgba(16,185,129,0.65)',borderWidth:0},{label:'Short',data:lp.map(v=>+(100-v).toFixed(1)),backgroundColor:'rgba(239,68,68,0.55)',borderWidth:0}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw.toFixed(1)}%`}}},
        scales:{x:{stacked:true,max:100,grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'},title:{display:true,text:'% of HO trades by direction',color:'#6b7280',font:{size:10}}},y:{stacked:true,grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}}});
    return _db;
  }
  _GBfn['tr3']=function(gb){
    DT(4);
    if(gb==='mc'){
      _trCharts[4]=buildDirBias('meta-tr3a',mcGrp,mcOrder);
    }else{
      _trCharts[4]=buildDirBias('meta-tr3a',secGrp,secOrder);
    }
  };
  _GBfn['tr3'](_GB['tr3']||'sector');

  // ── T4: Avg Trade Return % per group (bar, sorted) ───────────────────────
  function buildAvgTradeRet(canvasId,groups,order){
    const ctx=el(canvasId)?.getContext('2d');if(!ctx)return null;
    const entries=order.map(g=>{const ms=(groups[g]||[]).filter(m=>m.avg_trade_pct!=null);return ms.length?{g,avg:ms.reduce((a,m)=>a+m.avg_trade_pct,0)/ms.length,n:ms.length}:null;}).filter(Boolean).sort((a,b)=>b.avg-a.avg);
    const colors=entries.map(e=>e.avg>=1.0?GREEN_7:e.avg>=0?'rgba(251,191,36,0.65)':RED_55);
    const _ar=new Chart(ctx,{type:'bar',
      data:{labels:entries.map(e=>e.g),datasets:[{data:entries.map(e=>+e.avg.toFixed(3)),backgroundColor:colors,borderColor:colors,borderWidth:1,borderRadius:3}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>[`Avg trade: ${c.raw.toFixed(3)}%`,`n=${entries[c.dataIndex].n} models`]}}},
        scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'},title:{display:true,text:'Avg return per HO trade  ·  positive = net profitable per trade',color:'#6b7280',font:{size:10}}},y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}}});
    return _ar;
  }
  _GBfn['tr4']=function(gb){
    DT(6);
    if(gb==='mc'){
      _trCharts[6]=buildAvgTradeRet('meta-tr4a',mcGrp,mcOrder);
    }else{
      _trCharts[6]=buildAvgTradeRet('meta-tr4a',secGrp,secOrder);
    }
  };
  _GBfn['tr4'](_GB['tr4']||'sector');

  // ── T5: Trade Count vs HO PF scatter (interactive min-trades slider) ──────
  function buildTradeCountPF(canvasId,groups,order,minId){
    const ctx=el(canvasId)?.getContext('2d');if(!ctx)return null;
    const minEl=el(minId),minVEl=el(minId+'-val');
    const getMin=()=>minEl?+minEl.value:5;
    function makeDS(minN){
      return order.map((grp,i)=>({type:'scatter',label:grp,
        data:(groups[grp]||[]).filter(m=>m.n_trades_ho>=minN&&m.ho_pf!=null).map(m=>({x:m.n_trades_ho,y:m.ho_pf,ticker:m.ticker,grp,wr:m.win_rate_ho})),
        backgroundColor:_SEC_PAL[i%_SEC_PAL.length],pointRadius:5,pointHoverRadius:8}));
    }
    const datasets=makeDS(getMin());
    datasets.push({type:'line',label:'_e',data:[{x:0,y:1.10},{x:200,y:1.10}],borderColor:'rgba(16,185,129,0.18)',borderDash:[4,3],borderWidth:1.5,pointRadius:0,fill:false,tension:0,order:0});
    datasets.push({type:'line',label:'_r',data:[{x:15,y:0.4},{x:15,y:2.8}],borderColor:'rgba(245,165,32,0.18)',borderDash:[3,4],borderWidth:1,pointRadius:0,fill:false,tension:0,order:0});
    const chart=new Chart(ctx,{data:{datasets},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const p=c.raw;if(p?.ticker)return[`${p.ticker} (${p.grp})`,`${p.x} trades · HO PF: ${p.y?.toFixed(3)}`,`Win rate: ${p.wr!=null?(p.wr*100).toFixed(1)+'%':'n/a'}`];return[];}}},zoom:_zoom('xy')},
      scales:{x:{title:{display:true,text:'HO trade count',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}},y:{title:{display:true,text:'HO Profit Factor',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}}}}});
    if(minEl){minEl.addEventListener('input',()=>{const minN=+minEl.value;if(minVEl)minVEl.textContent='≥ '+minN;const nd=makeDS(minN);for(let i=0;i<order.length;i++)chart.data.datasets[i].data=nd[i].data;chart.update('none');});}
    _addResetZoom(chart.canvas,chart);
    return chart;
  }
  _GBfn['tr5']=function(gb){
    DT(8);
    if(gb==='mc'){
      _trCharts[8]=buildTradeCountPF('meta-tr5a',mcGrp,mcOrder,'tr5a-min');
    }else{
      _trCharts[8]=buildTradeCountPF('meta-tr5a',secGrp,secOrder,'tr5a-min');
    }
  };
  _GBfn['tr5'](_GB['tr5']||'sector');

  // ── M1: Win Rate vs Payoff scatter (interactive color toggle) ─────────────
  const m1Data=trd.filter(m=>m.win_rate_ho!=null&&m.payoff_ratio!=null&&m.n_trades_ho>=5);
  function buildM1(canvasId,mode){
    const ctx=el(canvasId)?.getContext('2d');if(!ctx)return null;
    let datasets;
    const mk=m=>({x:m.win_rate_ho*100,y:m.payoff_ratio,ticker:m.ticker,sec:m.sector,pf:m.ho_pf,n:m.n_trades_ho});
    if(mode==='pf'){
      datasets=[
        {type:'scatter',label:'HO PF ≥ 1.10',data:m1Data.filter(m=>m.ho_pf>=1.10).map(mk),backgroundColor:GREEN_7,pointRadius:5,pointHoverRadius:8},
        {type:'scatter',label:'1.0–1.10',data:m1Data.filter(m=>m.ho_pf>=1.0&&m.ho_pf<1.10).map(mk),backgroundColor:'rgba(251,191,36,0.70)',pointRadius:5,pointHoverRadius:8},
        {type:'scatter',label:'< 1.0',data:m1Data.filter(m=>m.ho_pf<1.0).map(mk),backgroundColor:RED_55,pointRadius:5,pointHoverRadius:8},
      ];
    }else if(mode==='sec'){
      const secs=[...new Set(m1Data.map(m=>m.sector))].sort();
      datasets=secs.map((s,i)=>({type:'scatter',label:s,data:m1Data.filter(m=>m.sector===s).map(mk),backgroundColor:_SEC_PAL[i%_SEC_PAL.length],pointRadius:5,pointHoverRadius:8}));
    }else{
      datasets=_MC_TIERS.map(([label],i)=>({type:'scatter',label,data:m1Data.filter(m=>_mcTier(m.market_cap)===label).map(mk),backgroundColor:_SEC_PAL[i%_SEC_PAL.length],pointRadius:5,pointHoverRadius:8}));
    }
    // Breakeven curve: win% * payoff = 100
    datasets.push({type:'line',label:'_be',data:[30,35,40,45,50,55,60,65,70,75,80].map(x=>({x,y:+(100/x).toFixed(2)})),borderColor:'rgba(255,255,255,0.12)',borderDash:[3,3],borderWidth:1,pointRadius:0,fill:false,tension:0.3,order:0});
    const _m1=new Chart(ctx,{data:{datasets},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6,filter:i=>!i.text.startsWith('_')}},
        tooltip:{callbacks:{label:c=>{const p=c.raw;if(p?.ticker)return[`${p.ticker} (${p.sec})`,`Win: ${p.x?.toFixed(1)}% · Payoff: ${p.y?.toFixed(2)}x`,`HO PF: ${p.pf?.toFixed(3)} · ${p.n} trades`];return[];}}},zoom:_zoom('xy')},
      scales:{x:{min:20,max:90,title:{display:true,text:'Win Rate % (HO)',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'}},
        y:{min:0,title:{display:true,text:'Payoff Ratio',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'x'}}}}});
    _addResetZoom(_m1.canvas,_m1);
    return _m1;
  }
  // m1 color mode state
  let _m1ColorMode='pf';
  _GBfn['m1']=function(gb){
    DT(10);_trCharts[10]=buildM1('meta-ma1a',_m1ColorMode);
  };
  window._m1aToggle=function(mode){
    _m1ColorMode=mode;
    ['pf','sec','mc'].forEach(m=>{const b=document.getElementById('m1a-'+m);if(b)b.className='meta-filter-btn'+(m===mode?' active':'');});
    DT(10);_trCharts[10]=buildM1('meta-ma1a',mode);
  };
  _GBfn['m1'](_GB['m1']||'sector');

  // ── M2: Avg Holding Period vs HO PF scatter ───────────────────────────────
  function buildHoldingPF(canvasId,colorMode){
    const ctx=el(canvasId)?.getContext('2d');if(!ctx)return null;
    const valid=trd.filter(m=>m.avg_bars_held!=null&&m.ho_pf!=null);
    let datasets;
    if(colorMode==='sec'){
      const secs=[...new Set(valid.map(m=>m.sector))].sort();
      datasets=secs.map((s,i)=>({type:'scatter',label:s,data:valid.filter(m=>m.sector===s).map(m=>({x:m.avg_bars_held,y:m.ho_pf,ticker:m.ticker,sec:s})),backgroundColor:_SEC_PAL[i%_SEC_PAL.length],pointRadius:4,pointHoverRadius:7}));
    }else{
      datasets=_MC_TIERS.map(([label],i)=>({type:'scatter',label,data:valid.filter(m=>_mcTier(m.market_cap)===label).map(m=>({x:m.avg_bars_held,y:m.ho_pf,ticker:m.ticker,sec:m.sector})),backgroundColor:_SEC_PAL[i%_SEC_PAL.length],pointRadius:4,pointHoverRadius:7}));
    }
    datasets.push({type:'line',label:'_e',data:[{x:0,y:1.10},{x:60,y:1.10}],borderColor:'rgba(16,185,129,0.18)',borderDash:[4,3],borderWidth:1.5,pointRadius:0,fill:false,tension:0,order:0});
    const _hc=new Chart(ctx,{data:{datasets},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const p=c.raw;if(p?.ticker)return[`${p.ticker} (${p.sec})`,`Avg hold: ${p.x?.toFixed(1)} bars · HO PF: ${p.y?.toFixed(3)}`];return[];}}},zoom:_zoom('xy')},
      scales:{x:{title:{display:true,text:'Avg holding period (bars per trade)',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}},y:{title:{display:true,text:'HO Profit Factor',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}}}}});
    _addResetZoom(_hc.canvas,_hc);
    return _hc;
  }
  _GBfn['m2']=function(gb){
    DT(12);
    _trCharts[12]=buildHoldingPF('meta-ma2a',gb==='mc'?'mc':'sec');
  };
  _GBfn['m2'](_GB['m2']||'sector');

  // ── M3: Best vs Worst Trade per group (bar, IS/HO toggle) ─────────────────
  function buildRangeBar(canvasId,groups,order,mode){
    const ctx=el(canvasId)?.getContext('2d');if(!ctx)return null;
    const bk=mode==='ho'?'best_trade':'best_trade_is',wk=mode==='ho'?'worst_trade':'worst_trade_is';
    const entries=order.map(g=>{const ms=(groups[g]||[]).filter(m=>m[bk]!=null&&m[wk]!=null);if(!ms.length)return null;return{g,best:+(ms.reduce((a,m)=>a+m[bk],0)/ms.length).toFixed(2),worst:+(ms.reduce((a,m)=>a+m[wk],0)/ms.length).toFixed(2),n:ms.length};}).filter(Boolean);
    const _rb=new Chart(ctx,{type:'bar',
      data:{labels:entries.map(e=>e.g),datasets:[
        {label:'Avg Worst Trade',data:entries.map(e=>e.worst),backgroundColor:'rgba(239,68,68,0.55)',borderColor:'rgba(239,68,68,0.7)',borderWidth:1,borderRadius:2},
        {label:'Avg Best Trade',data:entries.map(e=>e.best),backgroundColor:'rgba(16,185,129,0.55)',borderColor:'rgba(16,185,129,0.7)',borderWidth:1,borderRadius:2},
      ]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6}},tooltip:{callbacks:{label:c=>[`${c.dataset.label}: ${c.raw?.toFixed(2)}%`,`n=${entries[c.dataIndex].n} models`]}}},
        scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'},title:{display:true,text:`Avg ${mode==='ho'?'HO (holdout)':'IS (in-sample)'} trade extremes by group`,color:'#6b7280',font:{size:10}}},y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}}});
    return _rb;
  }
  let _m3HoIsMode='ho';
  _GBfn['m3']=function(gb){
    DT(14);
    if(gb==='mc'){
      _trCharts[14]=buildRangeBar('meta-ma3a',mcGrp,mcOrder,_m3HoIsMode);
    }else{
      _trCharts[14]=buildRangeBar('meta-ma3a',secGrp,secOrder,_m3HoIsMode);
    }
  };
  window._m3aToggle=function(mode){
    _m3HoIsMode=mode;
    ['ho','is'].forEach(m=>{const b=document.getElementById('m3a-'+m);if(b)b.className='meta-filter-btn'+(m===mode?' active':'');});
    DT(14);
    const gb=_GB['m3']||'sector';
    _trCharts[14]=buildRangeBar('meta-ma3a',gb==='mc'?mcGrp:secGrp,gb==='mc'?mcOrder:secOrder,mode);
  };
  _GBfn['m3'](_GB['m3']||'sector');

  // ── M4: IS vs HO Trade Frequency (grouped bar) ────────────────────────────
  function buildTradeFreqComp(canvasId,groups,order){
    const ctx=el(canvasId)?.getContext('2d');if(!ctx)return null;
    const hoAvg=order.map(g=>{const ms=(groups[g]||[]).filter(m=>m.n_trades_ho!=null);return ms.length?+(ms.reduce((a,m)=>a+m.n_trades_ho,0)/ms.length).toFixed(1):0;});
    const isAvg=order.map(g=>{const ms=(groups[g]||[]).filter(m=>m.n_trades_is!=null);return ms.length?+(ms.reduce((a,m)=>a+m.n_trades_is,0)/ms.length).toFixed(1):0;});
    const ratio=order.map((_,i)=>isAvg[i]>0?+(hoAvg[i]/isAvg[i]).toFixed(3):null);
    const _tf=new Chart(ctx,{type:'bar',
      data:{labels:order,datasets:[
        {label:'IS avg trades',data:isAvg,backgroundColor:'rgba(107,114,128,0.45)',borderWidth:0,borderRadius:2},
        {label:'HO avg trades',data:hoAvg,backgroundColor:'rgba(245,165,32,0.70)',borderWidth:0,borderRadius:2},
      ]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6}},tooltip:{callbacks:{label:c=>[`${c.dataset.label}: ${c.raw.toFixed(1)}`,`HO/IS ratio: ${ratio[c.dataIndex]!=null?ratio[c.dataIndex].toFixed(2)+'×':'n/a'}`]}}},
        scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'},title:{display:true,text:'Avg trade count  ·  tooltip shows HO÷IS ratio',color:'#6b7280',font:{size:10}}},y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}}});
    return _tf;
  }
  _GBfn['m4']=function(gb){
    DT(16);
    if(gb==='mc'){
      _trCharts[16]=buildTradeFreqComp('meta-ma4a',mcGrp,mcOrder);
    }else{
      _trCharts[16]=buildTradeFreqComp('meta-ma4a',secGrp,secOrder);
    }
  };
  _GBfn['m4'](_GB['m4']||'sector');

  // ── M5: Long vs Short performance (metric toggle) ─────────────────────────
  function buildLongShort(canvasId,groups,order,mode){
    const ctx=el(canvasId)?.getContext('2d');if(!ctx)return null;
    let lv,sv,xl;
    if(mode==='wr'){
      lv=order.map(g=>{const ms=(groups[g]||[]).filter(m=>m.long_win_rate!=null);return ms.length?+(ms.reduce((a,m)=>a+m.long_win_rate,0)/ms.length*100).toFixed(1):null;});
      sv=order.map(g=>{const ms=(groups[g]||[]).filter(m=>m.short_win_rate!=null);return ms.length?+(ms.reduce((a,m)=>a+m.short_win_rate,0)/ms.length*100).toFixed(1):null;});
      xl='Win rate % by direction';
    }else{
      lv=order.map(g=>{const ms=(groups[g]||[]).filter(m=>m.long_avg_ret!=null);return ms.length?+(ms.reduce((a,m)=>a+m.long_avg_ret,0)/ms.length).toFixed(3):null;});
      sv=order.map(g=>{const ms=(groups[g]||[]).filter(m=>m.short_avg_ret!=null);return ms.length?+(ms.reduce((a,m)=>a+m.short_avg_ret,0)/ms.length).toFixed(3):null;});
      xl='Avg return per trade (%) by direction';
    }
    const _ls=new Chart(ctx,{type:'bar',
      data:{labels:order,datasets:[
        {label:'Long',data:lv,backgroundColor:'rgba(16,185,129,0.65)',borderWidth:0,borderRadius:2},
        {label:'Short',data:sv,backgroundColor:'rgba(59,130,246,0.65)',borderWidth:0,borderRadius:2},
      ]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw!=null?c.raw.toFixed(mode==='wr'?1:3)+'%':'n/a'}`}}},
        scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'},title:{display:true,text:xl,color:'#6b7280',font:{size:10}}},y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}}});
    return _ls;
  }
  let _m5MetricMode='wr';
  _GBfn['m5']=function(gb){
    DT(18);
    if(gb==='mc'){
      _trCharts[18]=buildLongShort('meta-ma5a',mcGrp,mcOrder,_m5MetricMode);
    }else{
      _trCharts[18]=buildLongShort('meta-ma5a',secGrp,secOrder,_m5MetricMode);
    }
  };
  window._m5aToggle=function(mode){
    _m5MetricMode=mode;
    ['wr','ret'].forEach(m=>{const b=document.getElementById('m5a-'+m);if(b)b.className='meta-filter-btn'+(m===mode?' active':'');});
    DT(18);
    const gb=_GB['m5']||'sector';
    _trCharts[18]=buildLongShort('meta-ma5a',gb==='mc'?mcGrp:secGrp,gb==='mc'?mcOrder:secOrder,mode);
  };
  _GBfn['m5'](_GB['m5']||'sector');
}

// ─────────────────────────────────────────────────────────────────────────────
// Edge Intelligence — 4 synthesis charts
// A: 2D Sector × MC Tier edge map (HTML table)
// B: Feature discriminability (bar — which features predict good models?)
// C: Win rate → HO PF scatter (what trade stat predicts edge?)
// D: Per-ticker model consistency (floating bar — reliable tickers)
// ─────────────────────────────────────────────────────────────────────────────
function _buildEdgeIntelCharts(joined){
  const el=id=>document.getElementById(id);

  // ── A: 2D Sector × MC Tier Edge Map ──────────────────────────────────────
  (function buildEdgeMap(){
    const cont=el('meta-edge-map');if(!cont)return;
    const valid=joined.filter(m=>m.ho_pf!=null);
    const tiers=_MC_TIERS.map(([l])=>l);
    const grid={},secTotals={};
    valid.forEach(m=>{
      const s=m.sector||'Other';const t=_mcTier(m.market_cap);
      if(!secTotals[s])secTotals[s]=[];secTotals[s].push(m.ho_pf);
      if(t){if(!grid[s])grid[s]={};if(!grid[s][t])grid[s][t]=[];grid[s][t].push(m.ho_pf);}
    });
    const sortedSecs=Object.keys(secTotals).filter(s=>secTotals[s].length>=2).sort((a,b)=>{
      const ma=secTotals[a].reduce((x,v)=>x+v,0)/secTotals[a].length;
      const mb=secTotals[b].reduce((x,v)=>x+v,0)/secTotals[b].length;
      return mb-ma;
    });
    const activeTiers=tiers.filter(t=>valid.some(m=>_mcTier(m.market_cap)===t));
    const avg=arr=>arr.length?arr.reduce((a,v)=>a+v,0)/arr.length:null;
    const cell=(v,n,bold)=>{
      if(v==null)return`<td style="padding:5px 8px;text-align:center;color:#2a2a2a;border-bottom:1px solid #111">—</td>`;
      const bg=v>=1.10?'rgba(16,185,129,0.18)':v>=1.0?'rgba(251,191,36,0.12)':'rgba(239,68,68,0.12)';
      const tc=v>=1.10?'#6ee7b7':v>=1.0?'#fbbf24':'#f87171';
      const bdr=bold?'border-left:1px solid #222;':'';
      return`<td style="padding:5px 8px;text-align:center;background:${bg};border-bottom:1px solid #111;${bdr}"><span style="color:${tc};font-weight:700;font-family:monospace;font-size:11px">${v.toFixed(3)}</span><br><span style="color:#4b5563;font-size:9px">n=${n}</span></td>`;
    };
    let html=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">`;
    html+=`<thead><tr><th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #222;font-weight:600">Sector ↓ · MC Tier →</th>`;
    activeTiers.forEach(t=>{html+=`<th style="padding:6px 8px;text-align:center;color:#6b7280;border-bottom:1px solid #222;font-weight:600;min-width:80px;font-size:10px">${t}</th>`;});
    html+=`<th style="padding:6px 8px;text-align:center;color:var(--gold);border-bottom:1px solid #222;font-weight:600;min-width:75px;border-left:1px solid #222">All</th></tr></thead><tbody>`;
    sortedSecs.forEach((sec,ri)=>{
      const rowBg=ri%2===0?'#0d0d0d':'#080808';
      html+=`<tr style="background:${rowBg}"><td style="padding:6px 10px;color:#9ca3af;font-weight:600;border-bottom:1px solid #111">${sec}</td>`;
      activeTiers.forEach(t=>{const vals=(grid[sec]||{})[t]||[];html+=cell(avg(vals),vals.length,false);});
      const allVals=secTotals[sec]||[];html+=cell(avg(allVals),allVals.length,true);
      html+=`</tr>`;
    });
    html+=`</tbody></table></div>`;
    html+=`<div style="margin-top:10px;font-size:10px;color:#4b5563">Cell = avg HO PF · <span style="color:#6ee7b7">green ≥ 1.10</span> · <span style="color:#fbbf24">amber ≥ 1.0</span> · <span style="color:#f87171">red < 1.0</span> · "—" = no models in that cell</div>`;
    cont.innerHTML=html;
  })();

  // ── B: Feature Discriminability ───────────────────────────────────────────
  (function buildFeatDiscrim(){
    const ctx=el('meta-ei-discrim')?.getContext('2d');if(!ctx)return;
    const validPF=joined.filter(m=>m.ho_pf!=null);
    // Build include/exclude lists per feature
    const featInc={};
    validPF.forEach(m=>{
      const seen=new Set();
      (m.features||[]).forEach(f=>{if(f.name&&!seen.has(f.name)){seen.add(f.name);if(!featInc[f.name])featInc[f.name]=[];featInc[f.name].push(m);}});
    });
    const avg=arr=>arr.length?arr.reduce((a,v)=>a+v,0)/arr.length:null;
    const entries=Object.entries(featInc)
      .filter(([,ms])=>ms.length>=8)
      .map(([name,incMs])=>{
        const excMs=validPF.filter(m=>!(m.features||[]).some(f=>f.name===name));
        const incAvg=avg(incMs.map(m=>m.ho_pf));
        const excAvg=avg(excMs.map(m=>m.ho_pf));
        const diff=incAvg!=null&&excAvg!=null?incAvg-excAvg:null;
        return{name,incAvg,excAvg,diff,n:incMs.length};
      })
      .filter(e=>e.diff!=null)
      .sort((a,b)=>b.diff-a.diff);
    const show=[...entries.slice(0,15),...entries.filter(e=>e.diff<0).slice(-5)];
    const abbr2=s=>s.length>24?s.slice(0,22)+'…':s;
    const _eiB=new Chart(ctx,{type:'bar',
      data:{labels:show.map(e=>abbr2(e.name)),datasets:[
        {label:'Avg HO PF when included',data:show.map(e=>+e.incAvg.toFixed(4)),backgroundColor:show.map(e=>e.diff>=0?GREEN_7:RED_55),borderWidth:0,borderRadius:3},
        {label:'Avg HO PF when excluded',data:show.map(e=>+e.excAvg.toFixed(4)),backgroundColor:'rgba(107,114,128,0.38)',borderWidth:0,borderRadius:3},
      ]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6}},
          tooltip:{callbacks:{label:c=>{const e=show[c.dataIndex];return c.datasetIndex===0?[`Included (n=${e.n}): ${c.raw?.toFixed(4)}`,`Δ vs excluded: ${e.diff>=0?'+':''}${e.diff.toFixed(4)}`]:[`Excluded: ${c.raw?.toFixed(4)}`];}}}},
        },
        scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'},title:{display:true,text:'Avg HO Profit Factor  ·  gap = alpha contribution of this feature',color:'#6b7280',font:{size:10}}},y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}});
  })();

  // ── C: Win Rate → HO PF + Payoff → HO PF scatter ─────────────────────────
  ['wr','payoff'].forEach(mode=>{
    const ctx=el(mode==='wr'?'meta-ei-wr-pf':'meta-ei-payoff-pf')?.getContext('2d');if(!ctx)return;
    const valid=joined.filter(m=>m.ho_pf!=null&&(mode==='wr'?m.win_rate_ho!=null:m.payoff_ratio!=null));
    const secs=[...new Set(valid.map(m=>m.sector||'Other'))].sort();
    const datasets=secs.map((s,i)=>({type:'scatter',label:s,
      data:valid.filter(m=>(m.sector||'Other')===s).map(m=>({x:mode==='wr'?m.win_rate_ho*100:m.payoff_ratio,y:m.ho_pf,ticker:m.ticker})),
      backgroundColor:_SEC_PAL[i%_SEC_PAL.length],pointRadius:4,pointHoverRadius:7}));
    datasets.push({type:'line',label:'_e',data:[{x:mode==='wr'?0:0,y:1.10},{x:mode==='wr'?100:6,y:1.10}],borderColor:'rgba(16,185,129,0.18)',borderDash:[4,3],borderWidth:1.5,pointRadius:0,fill:false,tension:0,order:0});
    const _eiC=new Chart(ctx,{data:{datasets},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:c=>{const p=c.raw;if(p?.ticker)return[`${p.ticker}`,mode==='wr'?`Win rate: ${p.x.toFixed(1)}%`:`Payoff: ${p.x.toFixed(2)}x`,`HO PF: ${p.y.toFixed(3)}`];return[];}}},zoom:_zoom('xy')},
      scales:{x:{title:{display:true,text:mode==='wr'?'Win Rate % (HO)':'Payoff Ratio (HO)',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>mode==='wr'?v+'%':v+'x'}},y:{title:{display:true,text:'HO Profit Factor',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'}}}}});
    _addResetZoom(_eiC.canvas,_eiC);
  });

  // ── D: Per-Ticker Model Consistency (floating bar) ────────────────────────
  (function buildTickerConsistency(){
    const ctx=el('meta-ei-ticker-consist')?.getContext('2d');if(!ctx)return;
    const valid=joined.filter(m=>m.ho_pf!=null);
    const tg={};
    valid.forEach(m=>{if(!tg[m.ticker])tg[m.ticker]=[];tg[m.ticker].push(m.ho_pf);});
    const entries=Object.entries(tg).filter(([,pfs])=>pfs.length>=2).map(([ticker,pfs])=>{
      const a=pfs.reduce((x,v)=>x+v,0)/pfs.length;
      return{ticker,avg:a,min:Math.min(...pfs),max:Math.max(...pfs),n:pfs.length,
        allGood:pfs.every(v=>v>=1.10),someGood:pfs.some(v=>v>=1.10)};
    }).sort((a,b)=>b.avg-a.avg).slice(0,35);
    const colors=entries.map(e=>e.allGood?GREEN_7:e.someGood?'rgba(251,191,36,0.65)':RED_55);
    const _eiD=new Chart(ctx,{type:'bar',
      data:{labels:entries.map(e=>e.ticker),datasets:[
        {label:'HO PF range',data:entries.map(e=>[e.min,e.max]),backgroundColor:colors,borderColor:colors,borderWidth:1,borderRadius:2},
        {type:'scatter',label:'Avg HO PF',data:entries.map((e,i)=>({x:i,y:e.avg,n:e.n,ticker:e.ticker})),backgroundColor:'rgba(245,165,32,0.95)',pointStyle:'crossRot',pointRadius:9,borderColor:'rgba(245,165,32,0.95)',borderWidth:2.5},
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6}},
          tooltip:{callbacks:{label:c=>{if(c.datasetIndex===0){const e=entries[c.dataIndex];return[`${e.ticker} · ${e.n} variants`,`Range: ${e.min.toFixed(3)} → ${e.max.toFixed(3)}`,`Avg: ${e.avg.toFixed(3)} · ${e.allGood?'✓ all pass':e.someGood?'~ mixed':'✗ none pass'}`];}const p=c.raw;return[`Avg HO PF: ${p.y?.toFixed(3)}`];}}}},
        },
        scales:{x:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:9},maxRotation:45}},y:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'},title:{display:true,text:'HO Profit Factor',color:'#6b7280',font:{size:11}}}}});
  })();
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Interaction Analysis
// FI-1: Top feature co-occurrence pairs in passing models (heatmap table)
// FI-2: Feature pair avg HO PF — top 20 pairs sorted by combined edge
// FI-3: Feature category co-occurrence — which category combos work best
// ─────────────────────────────────────────────────────────────────────────────
function _buildFeatureInteractionCharts(joined,topFeats){
  const el=id=>document.getElementById(id);

  // Models with HO PF and features
  const valid=joined.filter(m=>m.ho_pf!=null&&m.features&&m.features.length>0);
  const passing=valid.filter(m=>m.ho_pf>=1.10);

  // ── FI-1: Co-occurrence heatmap — how often do top features appear together? ──
  (function buildCoHeatmap(){
    const cont=el('meta-fi-coheatmap');if(!cont)return;
    const topN=topFeats.slice(0,18);
    // Build co-occurrence matrix (count of models where both features appear)
    const coAll={},coPass={};
    topN.forEach(a=>topN.forEach(b=>{coAll[a+'|'+b]=0;coPass[a+'|'+b]=0;}));
    [valid,passing].forEach((arr,pi)=>{
      arr.forEach(m=>{
        const mFeats=new Set((m.features||[]).map(f=>f.name));
        topN.forEach(a=>topN.forEach(b=>{
          if(a!==b&&mFeats.has(a)&&mFeats.has(b)){
            if(pi===0)coAll[a+'|'+b]++;else coPass[a+'|'+b]++;
          }
        }));
      });
    });
    // Max for normalisation
    let maxCo=1;topN.forEach(a=>topN.forEach(b=>{if(a!==b)maxCo=Math.max(maxCo,coAll[a+'|'+b]);}));
    const abbr3=n=>n.replace('macro_','m_').replace('price_fd_','fd_').replace('ann_','an_').replace('vol_','v_').replace('_ratio','_r').replace('_pct','%').replace('_20d','20').replace('_10d','10').replace('_5d','5');
    let htm=`<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px">`;
    htm+=`<thead><tr><th style="padding:3px 8px;color:var(--gold);font-size:10px;border-bottom:1px solid #222;text-align:left">Feature</th>`;
    topN.forEach(f=>htm+=`<th style="padding:2px 3px;border-bottom:1px solid #222;white-space:nowrap"><div style="writing-mode:vertical-rl;transform:rotate(180deg);height:60px;display:flex;align-items:center;justify-content:flex-end"><span style="color:#9ca3af;font-size:9px">${abbr3(f)}</span></div></th>`);
    htm+=`</tr></thead><tbody>`;
    topN.forEach((a,ri)=>{
      htm+=`<tr style="background:${ri%2===0?'#0d0d0d':'#080808'}"><td style="padding:3px 8px;color:#9ca3af;font-size:9px;white-space:nowrap;border-bottom:1px solid #111">${abbr3(a)}</td>`;
      topN.forEach(b=>{
        if(a===b){htm+=`<td style="background:#111;border-bottom:1px solid #111"></td>`;return;}
        const n=coAll[a+'|'+b]||0;
        const np=coPass[a+'|'+b]||0;
        const passRate=n>0?np/n:0;
        if(n===0){htm+=`<td style="padding:2px 3px;text-align:center;color:#222;border-bottom:1px solid #111;font-size:9px">·</td>`;return;}
        const opacity=(0.08+0.82*n/maxCo).toFixed(2);
        const bg=passRate>=0.5?`rgba(16,185,129,${opacity})`:`rgba(245,165,32,${opacity})`;
        htm+=`<td title="${a} + ${b}: ${n} models, ${np} pass (${(passRate*100).toFixed(0)}%)" style="padding:2px 3px;text-align:center;background:${bg};border-bottom:1px solid #111;cursor:default"><span style="color:rgba(255,255,255,0.75);font-size:9px;font-weight:700">${n}</span></td>`;
      });
      htm+=`</tr>`;
    });
    htm+=`</tbody></table></div>`;
    htm+=`<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:16px;font-size:10px;color:#4b5563">`;
    htm+=`<span>Cell = count of models where both features appear · <span style="color:rgba(16,185,129,0.8)">green</span> = >50% of those models pass (HO PF≥1.10) · <span style="color:rgba(245,165,32,0.8)">amber</span> = &lt;50% pass · intensity = co-occurrence count</span>`;
    htm+=`</div>`;
    cont.innerHTML=htm;
  })();

  // ── FI-2: Top feature pairs by avg HO PF ─────────────────────────────────
  (function buildPairPF(){
    const ctx=el('meta-fi-pairpf')?.getContext('2d');if(!ctx)return;
    const topN=topFeats.slice(0,20);
    const pairs=[];
    for(let i=0;i<topN.length;i++){
      for(let j=i+1;j<topN.length;j++){
        const a=topN[i],b=topN[j];
        const withBoth=valid.filter(m=>{const s=new Set((m.features||[]).map(f=>f.name));return s.has(a)&&s.has(b);});
        if(withBoth.length<5)continue;
        const avg=withBoth.reduce((s,m)=>s+m.ho_pf,0)/withBoth.length;
        const withoutBoth=valid.filter(m=>{const s=new Set((m.features||[]).map(f=>f.name));return!(s.has(a)&&s.has(b));});
        const avgOut=withoutBoth.length?withoutBoth.reduce((s,m)=>s+m.ho_pf,0)/withoutBoth.length:null;
        pairs.push({a,b,avg,avgOut,diff:avgOut!=null?avg-avgOut:0,n:withBoth.length});
      }
    }
    pairs.sort((x,y)=>y.avg-x.avg);
    const top20=pairs.slice(0,20);
    const abbr3=n=>n.replace('macro_','m_').replace('price_fd_','fd_').replace('ann_','an_').replace('vol_','v_').replace('_ratio','_r').replace('_pct','%').replace('_20d','20').replace('_10d','10').replace('_5d','5');
    const colors=top20.map(p=>p.avg>=1.10?GREEN_7:p.avg>=1.0?'rgba(251,191,36,0.70)':RED_55);
    const _fi2=new Chart(ctx,{type:'bar',
      data:{labels:top20.map(p=>abbr3(p.a)+' + '+abbr3(p.b)),datasets:[
        {label:'Avg HO PF (both present)',data:top20.map(p=>+p.avg.toFixed(4)),backgroundColor:colors,borderWidth:0,borderRadius:3},
        {label:'Avg HO PF (pair absent)',data:top20.map(p=>p.avgOut!=null?+p.avgOut.toFixed(4):null),backgroundColor:'rgba(107,114,128,0.35)',borderWidth:0,borderRadius:3},
      ]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6}},
          tooltip:{callbacks:{label:c=>{const p=top20[c.dataIndex];return c.datasetIndex===0?[`n=${p.n} models · avg HO PF: ${p.avg.toFixed(4)}`,`Δ vs without pair: ${p.diff>=0?'+':''}${p.diff.toFixed(4)}`]:[`Without this pair: ${c.raw?.toFixed(4)}`];}}}},
        },
        scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'},title:{display:true,text:'Avg HO PF when both features appear in the same model',color:'#6b7280',font:{size:10}}},y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:9}}}}});
  })();

  // ── FI-3: Category co-occurrence avg HO PF ────────────────────────────────
  (function buildCatPairPF(){
    const ctx=el('meta-fi-catpair')?.getContext('2d');if(!ctx)return;
    const cats=['macro','momentum','volume','interaction','announcement','volatility','candle','trend'];
    const pairs=[];
    for(let i=0;i<cats.length;i++){
      for(let j=i+1;j<cats.length;j++){
        const a=cats[i],b=cats[j];
        const withBoth=valid.filter(m=>{
          const hasCat=cat=>( m.features||[]).some(f=>f.category===cat);
          return hasCat(a)&&hasCat(b);
        });
        if(withBoth.length<4)continue;
        const avg=withBoth.reduce((s,m)=>s+m.ho_pf,0)/withBoth.length;
        const passRate=withBoth.filter(m=>m.ho_pf>=1.10).length/withBoth.length;
        pairs.push({a,b,avg,passRate,n:withBoth.length});
      }
    }
    pairs.sort((x,y)=>y.avg-x.avg);
    const colors=pairs.map(p=>p.avg>=1.10?GREEN_7:p.avg>=1.0?'rgba(251,191,36,0.70)':RED_55);
    const _fi3=new Chart(ctx,{type:'bar',
      data:{labels:pairs.map(p=>p.a+' + '+p.b),datasets:[
        {label:'Avg HO PF',data:pairs.map(p=>+p.avg.toFixed(4)),backgroundColor:colors,borderWidth:0,borderRadius:3},
      ]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},
          tooltip:{callbacks:{label:c=>{const p=pairs[c.dataIndex];return[`${p.a} + ${p.b}`,`Avg HO PF: ${p.avg.toFixed(4)} · n=${p.n} models`,`Pass rate: ${(p.passRate*100).toFixed(0)}% above 1.10`];}}}},
        },
        scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'},title:{display:true,text:'Avg HO PF when model has features from both categories',color:'#6b7280',font:{size:10}}},y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:9}}}}});
  })();
}

// ─────────────────────────────────────────────────────────────────────────────
// Trade Mechanics Assessment
// TM-1: Expected Value (EV) by sector — is win_rate × payoff > 1.0?
// TM-2: EV by MC tier
// TM-3: Trade regime classification — trend-follow vs mean-revert (scatter)
// TM-4: Long-only concentration risk by sector (stacked bar of direction × sector)
// ─────────────────────────────────────────────────────────────────────────────
function _buildTradeMechanicsCharts(joined){
  const el=id=>document.getElementById(id);
  const trd=joined.filter(m=>m.n_trades_ho!=null&&m.n_trades_ho>=5&&m.win_rate_ho!=null&&m.payoff_ratio!=null);

  // ── TM-1 + TM-2: EV gauge by sector and MC tier ───────────────────────────
  function buildEVChart(canvasId,groups,order){
    const ctx=el(canvasId)?.getContext('2d');if(!ctx)return;
    // EV = win_rate * payoff - (1 - win_rate) * 1.0  [normalised to per unit risked]
    // or simpler: expected return per trade = win_rate * avg_win + (1-win_rate) * avg_loss
    const entries=order.map(g=>{
      const ms=(groups[g]||[]).filter(m=>m.win_rate_ho!=null&&m.payoff_ratio!=null);
      if(!ms.length)return null;
      const wr=ms.reduce((a,m)=>a+m.win_rate_ho,0)/ms.length;
      const pr=ms.reduce((a,m)=>a+m.payoff_ratio,0)/ms.length;
      // EV: every $1 risked → win wr% of the time for payoff×$1, lose (1-wr)% of the time for $1
      const ev=wr*pr-(1-wr);
      const evPct=wr*pr*100; // as percentage of entry (simplified)
      return{g,wr:+( wr*100).toFixed(1),pr:+pr.toFixed(2),ev:+ev.toFixed(3),evPct,n:ms.length,
        pass:ms.filter(m=>m.ho_pf>=1.10).length};
    }).filter(Boolean).sort((a,b)=>b.ev-a.ev);
    const evColors=entries.map(e=>e.ev>=0.05?GREEN_7:e.ev>=0?'rgba(251,191,36,0.70)':RED_55);
    const _ev=new Chart(ctx,{type:'bar',
      data:{labels:entries.map(e=>e.g),datasets:[{
        data:entries.map(e=>e.ev),backgroundColor:evColors,borderColor:evColors,borderWidth:1,borderRadius:3,
      }]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},
          tooltip:{callbacks:{label:c=>{const e=entries[c.dataIndex];return[
            `EV per unit: ${c.raw>=0?'+':''}${c.raw.toFixed(3)}`,
            `Win rate: ${e.wr}% · Payoff: ${e.pr}x`,
            `n=${e.n} models · ${e.pass} pass HO PF≥1.10`,
            c.raw>0?'✓ Positive expected value':'✗ Negative expected value — loses money long run',
          ];}}}},
        },
        scales:{
          x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280'},title:{display:true,text:'EV = (win_rate × payoff) − (1 − win_rate)  ·  >0 = profitable · <0 = guaranteed losing',color:'#6b7280',font:{size:10}}},
          y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}
        }});
  }
  const secGrp={},mcGrp={};
  _MC_TIERS.forEach(([l])=>{mcGrp[l]=[];});
  trd.forEach(m=>{const s=m.sector||'Other';if(!secGrp[s])secGrp[s]=[];secGrp[s].push(m);const t=_mcTier(m.market_cap);if(t)mcGrp[t].push(m);});
  const secOrder=Object.keys(secGrp).sort((a,b)=>secGrp[b].length-secGrp[a].length);
  const mcOrder=_MC_TIERS.filter(([l])=>(mcGrp[l]||[]).length>=2).map(([l])=>l);
  _GBfn['tme']=function(gb){
    if(gb==='mc'){
      buildEVChart('meta-tm-ev-sec',mcGrp,mcOrder);
    }else{
      buildEVChart('meta-tm-ev-sec',secGrp,secOrder);
    }
  };
  _GBfn['tme'](_GB['tme']||'sector');

  // ── TM-3: Trade regime classification — trend vs mean-revert scatter ───────
  (function buildRegimeScatter(){
    const ctx=el('meta-tm-regime')?.getContext('2d');if(!ctx)return;
    // Quadrants:
    //   High WR + Low payoff  = mean-reversion (many small wins)
    //   Low WR + High payoff  = trend-following (few big wins)
    //   High WR + High payoff = ideal (rarely real)
    //   Low WR + Low payoff   = broken model
    const quadColors={
      'Trend-Follow (Low WR, High Payoff)':'rgba(59,130,246,0.72)',
      'Mean-Revert (High WR, Low Payoff)':'rgba(167,139,250,0.72)',
      'Ideal (High WR, High Payoff)':GREEN_7,
      'Broken (Low WR, Low Payoff)':RED_55,
    };
    const classify=m=>{
      const wr=m.win_rate_ho*100;const pr=m.payoff_ratio;
      if(wr>=50&&pr>=1.2)return'Ideal (High WR, High Payoff)';
      if(wr>=50&&pr<1.2)return'Mean-Revert (High WR, Low Payoff)';
      if(wr<50&&pr>=1.2)return'Trend-Follow (Low WR, High Payoff)';
      return'Broken (Low WR, Low Payoff)';
    };
    const groups={};Object.keys(quadColors).forEach(k=>{groups[k]=[];});
    trd.forEach(m=>{const q=classify(m);groups[q].push({x:m.win_rate_ho*100,y:m.payoff_ratio,ticker:m.ticker,sec:m.sector||'Other',pf:m.ho_pf,n:m.n_trades_ho});});
    const datasets=Object.entries(quadColors).map(([label,color])=>({type:'scatter',label,data:groups[label],backgroundColor:color,pointRadius:5,pointHoverRadius:8}));
    // Dividing lines
    datasets.push({type:'line',label:'_wr50',data:[{x:50,y:0.3},{x:50,y:4.5}],borderColor:'rgba(255,255,255,0.10)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false,tension:0,order:0});
    datasets.push({type:'line',label:'_pr12',data:[{x:20,y:1.2},{x:85,y:1.2}],borderColor:'rgba(255,255,255,0.10)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false,tension:0,order:0});
    // Breakeven curve
    datasets.push({type:'line',label:'_be',data:[30,35,40,45,50,55,60,65,70,75,80].map(x=>({x,y:+(1/( x/100)).toFixed(2)})),borderColor:'rgba(245,165,32,0.20)',borderDash:[2,4],borderWidth:1.5,pointRadius:0,fill:false,tension:0.3,order:0});
    const _tm3=new Chart(ctx,{data:{datasets},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6,filter:i=>!i.text.startsWith('_')}},
        tooltip:{callbacks:{label:c=>{const p=c.raw;if(p?.ticker)return[`${p.ticker} (${p.sec})`,`Win: ${p.x?.toFixed(1)}% · Payoff: ${p.y?.toFixed(2)}x`,`HO PF: ${p.pf?.toFixed(3)} · ${p.n} trades`];return[];}}},zoom:_zoom('xy')},
      scales:{
        x:{min:20,max:85,title:{display:true,text:'Win Rate % (HO)  ·  dashed lines = quadrant boundaries',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'}},
        y:{min:0.3,title:{display:true,text:'Payoff Ratio  ·  gold dashed curve = breakeven EV',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'x'}},
      }}});
    _addResetZoom(_tm3.canvas,_tm3);
  })();

  // ── TM-4: Long-only concentration risk ────────────────────────────────────
  (function buildConcentrationRisk(){
    const ctx=el('meta-tm-concentration')?.getContext('2d');if(!ctx)return;
    // For each sector: show what % of models are predominantly long (>60%), mixed, predominantly short
    const results=secOrder.map(sec=>{
      const ms=(secGrp[sec]||[]).filter(m=>m.long_pct!=null);
      if(!ms.length)return null;
      const longDom=ms.filter(m=>m.long_pct>0.60).length;
      const shortDom=ms.filter(m=>m.long_pct<0.40).length;
      const mixed=ms.length-longDom-shortDom;
      return{sec,longDom,mixed,shortDom,n:ms.length};
    }).filter(Boolean);
    const _tm4=new Chart(ctx,{type:'bar',
      data:{labels:results.map(r=>r.sec),datasets:[
        {label:'Long-dominant (>60% long)',data:results.map(r=>+( r.longDom/r.n*100).toFixed(1)),backgroundColor:'rgba(16,185,129,0.65)',borderWidth:0,borderRadius:0},
        {label:'Balanced (40–60%)',data:results.map(r=>+(r.mixed/r.n*100).toFixed(1)),backgroundColor:'rgba(107,114,128,0.45)',borderWidth:0,borderRadius:0},
        {label:'Short-dominant (<40% long)',data:results.map(r=>+(r.shortDom/r.n*100).toFixed(1)),backgroundColor:'rgba(239,68,68,0.55)',borderWidth:0,borderRadius:0},
      ]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,position:'bottom',labels:{color:'#9ca3af',font:{size:10},boxWidth:10,padding:6}},
          tooltip:{callbacks:{label:c=>{const r=results[c.dataIndex];return`${c.dataset.label}: ${c.raw.toFixed(1)}% (${Math.round(c.raw/100*r.n)} of ${r.n} models)`;}}}},
        },
        scales:{
          x:{stacked:true,max:100,grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v+'%'},title:{display:true,text:'% of models by trade direction dominance  ·  green = long-heavy = directional risk in bear markets',color:'#6b7280',font:{size:10}}},
          y:{stacked:true,grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}
        }});
  })();
}
