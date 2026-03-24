// tab_meta.js — Rich meta analysis: model_index.json + screener_full.json enrichment

const _MT_COLOR={
  'Ridge (1yr)':        'rgba(245,165,32,0.75)',
  'Ridge (6mo)':        'rgba(251,191,36,0.55)',
  'V2':                 'rgba(59,130,246,0.80)',
  'V3':                 'rgba(16,185,129,0.80)',
  'Regime-Weighted 3M': 'rgba(167,139,250,0.85)',
  'Regime-Weighted 6M': 'rgba(139,92,246,0.85)',
  'Regime-Weighted 1Y': 'rgba(109,40,217,0.85)',
  '18yr · 1yr window':  'rgba(239,68,68,0.75)',
  '18yr · 6mo window':  'rgba(252,165,165,0.65)',
  '18yr · 2yr window':  'rgba(185,28,28,0.75)',
};
const _SEC_PAL=['rgba(245,165,32,0.75)','rgba(59,130,246,0.75)','rgba(16,185,129,0.75)','rgba(239,68,68,0.75)','rgba(167,139,250,0.8)','rgba(251,191,36,0.6)','rgba(52,211,153,0.75)','rgba(248,113,113,0.7)','rgba(196,181,253,0.7)','rgba(134,239,172,0.7)','rgba(253,186,116,0.7)','rgba(147,197,253,0.7)','rgba(216,180,254,0.7)','rgba(252,211,77,0.7)','rgba(110,231,183,0.7)'];

let _modelIndexData=null, _screenerFull=null;
let _modelIndexFlat=[];
let _activeModelFilter='All';
let _metaSectorChart=null,_metaPfHistChart=null,_metaScatterChart=null,_metaSharpeChart=null;

async function initMetaTab(){
  const loads=[];
  if(!_modelIndexData) loads.push(fetch(`./model_index.json?v=${_CV}`).then(r=>r.ok?r.json():null).then(d=>{if(d)_modelIndexData=d;}).catch(()=>{}));
  if(!_fullScreenerData) loads.push(fetch(`./screener_full.json?v=${_CV}`).then(r=>r.ok?r.json():null).then(d=>{if(d){_fullScreenerData=d.tickers||[];}}).catch(()=>{}));
  if(!_compData) loads.push(fetch(`./models_comparison.json?v=${_CV}`).then(r=>r.ok?r.json():null).then(d=>{if(d)_compData=d;}).catch(()=>{}));
  await Promise.all(loads);
  _screenerFull=_fullScreenerData||[];

  // Build enrichment lookup: ticker → {sector, overfit, oos_bars, mean_ann_pct, ci95_lower}
  const secLookup={}, enrichLookup={};
  _screenerFull.forEach(t=>{
    if(!t.ticker)return;
    secLookup[t.ticker]=t.sector||'Other';
    enrichLookup[t.ticker]={overfit:t.overfit,oos_bars:t.oos_bars,mean_ann_pct:t.mean_ann_pct,ci95_lower:t.ci95_lower};
  });

  // Flatten model_index → one record per model entry
  _modelIndexFlat=[];
  const _sfxRe=/\(([^)]+)\)\s*$/;
  if(_modelIndexData&&_modelIndexData.models){
    for(const[key,entries] of Object.entries(_modelIndexData.models)){
      const m=key.match(_sfxRe);
      const ticker=key.replace(_sfxRe,'').trim();
      (entries||[]).forEach(e=>{
        const model_type=m?m[1]:(e.label||'Unknown');
        const en=enrichLookup[ticker]||{};
        _modelIndexFlat.push({
          ticker, model_type, label:e.label||model_type, safe_name:e.safe_name||'',
          ho_pf:e.ho_pf, ho_sharpe:e.ho_sharpe, is_pf:e.is_pf, is_sharpe:e.is_sharpe,
          sector:secLookup[ticker]||'Other',
          overfit:en.overfit, oos_bars:en.oos_bars,
          mean_ann_pct:en.mean_ann_pct, ci95_lower:en.ci95_lower,
        });
      });
    }
  }

  _buildFilterButtons();
  _buildMetaTab();
}

function _buildFilterButtons(){
  const c=document.getElementById('meta-filter-bar');
  if(!c)return;
  const types=[...new Set(_modelIndexFlat.map(r=>r.model_type))].sort();
  c.innerHTML=['All',...types].map(t=>`<button class="meta-filter-btn${t===_activeModelFilter?' active':''}" onclick="setMetaFilter(${JSON.stringify(t)})">${t}</button>`).join('');
}

function setMetaFilter(label){_activeModelFilter=label;_buildFilterButtons();_buildMetaTab();}

function _buildMetaTab(){
  document.getElementById('meta-spinner').style.display='none';
  document.getElementById('meta-content').style.display='';
  const el=id=>document.getElementById(id);

  const filtered=_activeModelFilter==='All'?_modelIndexFlat:_modelIndexFlat.filter(r=>r.model_type===_activeModelFilter);
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
          tooltip:{callbacks:{label:ctx=>{const p=ctx.raw;if(p?.ticker)return[`${p.ticker} · ${p.mt||p.sec}`,`IS: ${p.x?.toFixed(3)} → HO: ${p.y?.toFixed(3)}`];return'IS = HO line';}}}
        },
        scales:{
          x:{title:{display:true,text:'IS Profit Factor',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',font:{size:10}}},
          y:{title:{display:true,text:'HO Profit Factor',color:'#6b7280',font:{size:11}},grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',font:{size:10}}},
        }
      }
    });
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
  if(shCtx){if(_metaSharpeChart)_metaSharpeChart.destroy();_metaSharpeChart=new Chart(shCtx,{type:'bar',data:{labels:shrBins.map(b=>b.toFixed(2)),datasets:[{data:shrHist,backgroundColor:shrHC,borderColor:shrHC,borderWidth:1,borderRadius:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw} models`}}},scales:{x:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',font:{size:9}},title:{display:true,text:'HO Sharpe',color:'#6b7280',font:{size:10}}},y:{grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>Math.round(v)}}}}});}

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
  if(scSecCtx){if(_metaSectorChart)_metaSectorChart.destroy();_metaSectorChart=new Chart(scSecCtx,{type:'bar',data:{labels:secLabels,datasets:[{data:secAvgPF,backgroundColor:secBC,borderColor:secBC,borderWidth:1,borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>[` Avg HO PF: ${ctx.raw.toFixed(3)}`,` ${secEntries[ctx.dataIndex][1].edge}/${secEntries[ctx.dataIndex][1].valid} with HO PF≥1.10`]}}},scales:{x:{min:0.90,grid:{color:'#1a1a1a'},ticks:{color:'#6b7280',callback:v=>v.toFixed(2)}},y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}}}}});}

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
}
