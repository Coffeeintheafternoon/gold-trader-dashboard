// tab_meta.js — Meta analysis tab driven by model_index.json with model-type filter

let _modelIndexData=null;
let _modelIndexFlat=[];    // [{ticker,label,safe_name,ho_pf,ho_sharpe,is_pf,is_sharpe,sector}]
let _activeModelFilter='All';
let _metaSectorChart=null,_metaPfHistChart=null;

async function initMetaTab() {
  const loads=[];
  if(!_modelIndexData) loads.push(fetch(`./model_index.json?v=${_CV}`).then(r=>r.ok?r.json():null).then(d=>{if(d)_modelIndexData=d;}).catch(()=>{}));
  if(!_fullScreenerData) loads.push(fetch(`./screener_full.json?v=${_CV}`).then(r=>r.ok?r.json():null).then(d=>{if(d)_fullScreenerData=d.tickers||[];}).catch(()=>{}));
  if(!_compData) loads.push(fetch(`./models_comparison.json?v=${_CV}`).then(r=>r.ok?r.json():null).then(d=>{if(d)_compData=d;}).catch(()=>{}));
  await Promise.all(loads);

  // Build sector lookup from screener_full
  const secLookup={};
  (_fullScreenerData||[]).forEach(t=>{if(t.ticker)secLookup[t.ticker]=t.sector||'Other';});

  // Flatten model_index → one record per model entry
  // model_type: derived from key suffix "(Regime-Weighted 3M)" if present, else entry.label
  _modelIndexFlat=[];
  if(_modelIndexData&&_modelIndexData.models){
    const _suffixRe=/\(([^)]+)\)\s*$/;
    for(const[key,entries] of Object.entries(_modelIndexData.models)){
      const suffixMatch=key.match(_suffixRe);
      const ticker=key.replace(_suffixRe,'').trim();
      (entries||[]).forEach(e=>{
        const modelType=suffixMatch?suffixMatch[1]:(e.label||'Unknown');
        _modelIndexFlat.push({
          ticker,
          label:e.label||modelType,
          model_type:modelType,
          safe_name:e.safe_name||'',
          ho_pf:e.ho_pf,
          ho_sharpe:e.ho_sharpe,
          is_pf:e.is_pf,
          is_sharpe:e.is_sharpe,
          sector:secLookup[ticker]||'Other',
        });
      });
    }
  }

  _buildFilterButtons();
  _buildMetaTab();
}

function _buildFilterButtons() {
  const container=document.getElementById('meta-filter-bar');
  if(!container)return;
  const rawLabels=[...new Set(_modelIndexFlat.map(r=>r.model_type))].sort();
  const labels=['All',...rawLabels];
  container.innerHTML=labels.map(lbl=>`<button class="meta-filter-btn${lbl===_activeModelFilter?' active':''}" onclick="setMetaFilter(${JSON.stringify(lbl)})">${lbl}</button>`).join('');
}

function setMetaFilter(label){
  _activeModelFilter=label;
  _buildFilterButtons();
  _buildMetaTab();
}

function _buildMetaTab(){
  document.getElementById('meta-spinner').style.display='none';
  document.getElementById('meta-content').style.display='';

  const filtered=_activeModelFilter==='All'?_modelIndexFlat:_modelIndexFlat.filter(r=>r.model_type===_activeModelFilter);
  const valid=filtered.filter(r=>r.ho_pf!=null);
  const edge=valid.filter(r=>r.ho_pf>=1.10);
  const avgHoPF=valid.length?valid.reduce((s,r)=>s+(r.ho_pf||0),0)/valid.length:0;
  const best=valid.length?valid.reduce((b,r)=>r.ho_pf>b.ho_pf?r:b,valid[0]):null;
  const nTickers=new Set(filtered.map(r=>r.ticker)).size;
  const nSectors=new Set(filtered.map(r=>r.sector).filter(Boolean)).size;

  // ── Section labels ──────────────────────────────────────────────────────────
  const filterLabel=_activeModelFilter==='All'?'All Models':`${_activeModelFilter}`;
  const el=id=>document.getElementById(id);
  if(el('meta-sector-label'))el('meta-sector-label').textContent=`Sector Analysis — ${nTickers} Tickers`;
  if(el('meta-hist-label'))el('meta-hist-label').textContent=`HO PF Distribution — ${valid.length} Models with Data`;
  if(el('meta-strategy-label'))el('meta-strategy-label').textContent=`Model Summary — ${filterLabel}`;

  // ── Hero row ────────────────────────────────────────────────────────────────
  el('meta-hero-row').innerHTML=`
    <div class="hero-card" style="min-width:140px"><div class="hero-label">Models</div><div class="hero-value color-gold">${filtered.length}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${nTickers} tickers · ${filtered.length-valid.length} no HO data</div></div>
    <div class="hero-card" style="min-width:140px"><div class="hero-label">HO PF ≥ 1.10</div><div class="hero-value" style="color:var(--green)">${edge.length}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${valid.length?Math.round(edge.length/valid.length*100):0}% of models with data</div></div>
    <div class="hero-card" style="min-width:140px"><div class="hero-label">Avg HO Profit Factor</div><div class="hero-value" style="color:${avgHoPF>=1.05?'var(--green)':'var(--muted)'};font-size:22px">${avgHoPF.toFixed(3)}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">holdout / out-of-sample</div></div>
    <div class="hero-card" style="min-width:160px"><div class="hero-label">Top by HO PF</div><div class="hero-value color-gold">${best?best.ticker:'—'}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${best?'HO PF '+best.ho_pf.toFixed(3)+' · '+best.label:'—'}</div></div>
    <div class="hero-card" style="min-width:140px"><div class="hero-label">Sectors</div><div class="hero-value" style="font-size:22px">${nSectors}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">covered</div></div>`;

  // ── Sector stats ────────────────────────────────────────────────────────────
  const secMap={};
  filtered.forEach(r=>{
    const s=r.sector||'Other';
    if(!secMap[s])secMap[s]={total:0,valid:0,edge:0,pfSum:0,best:0};
    secMap[s].total++;
    if(r.ho_pf!=null){secMap[s].valid++;secMap[s].pfSum+=r.ho_pf;if(r.ho_pf>=1.10)secMap[s].edge++;if(r.ho_pf>secMap[s].best)secMap[s].best=r.ho_pf;}
  });
  const secEntries=Object.entries(secMap).sort((a,b)=>{const aA=a[1].valid?a[1].pfSum/a[1].valid:0,bA=b[1].valid?b[1].pfSum/b[1].valid:0;return bA-aA;});

  // Sector avg HO PF chart
  const secLabels=secEntries.map(([s])=>s);
  const secAvgPF=secEntries.map(([,d])=>d.valid?+(d.pfSum/d.valid).toFixed(3):0);
  const secBarColors=secAvgPF.map(v=>v>=1.10?GREEN_7:v>=1.05?'rgba(251,191,36,0.7)':RED_55);
  const sCtx=el('meta-sector-pf-chart').getContext('2d');
  if(_metaSectorChart)_metaSectorChart.destroy();
  _metaSectorChart=new Chart(sCtx,{type:'bar',data:{labels:secLabels,datasets:[{data:secAvgPF,backgroundColor:secBarColors,borderColor:secBarColors,borderWidth:1,borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>[` Avg HO PF: ${ctx.raw.toFixed(3)}`,` ${secEntries[ctx.dataIndex][1].edge}/${secEntries[ctx.dataIndex][1].valid} with HO PF≥1.10`]}}},scales:{x:{min:0.95,grid:{color:'#222'},ticks:{callback:v=>v.toFixed(2)}},y:{grid:{display:false},ticks:{font:{size:11}}}}}});

  // HO PF histogram
  const bins=[];for(let b=0.85;b<1.65;b+=0.05)bins.push(b);
  const hist=bins.map(b=>valid.filter(r=>r.ho_pf>=b&&r.ho_pf<b+0.05).length);
  const histColors=bins.map(b=>b>=1.10?GREEN_7:b>=1.00?'rgba(251,191,36,0.6)':RED_6);
  const hCtx=el('meta-pf-hist-chart').getContext('2d');
  if(_metaPfHistChart)_metaPfHistChart.destroy();
  _metaPfHistChart=new Chart(hCtx,{type:'bar',data:{labels:bins.map(b=>b.toFixed(2)),datasets:[{data:hist,backgroundColor:histColors,borderColor:histColors,borderWidth:1,borderRadius:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw} models`}}},scales:{x:{grid:{color:'#222'},title:{display:true,text:'HO Profit Factor bucket (0.05 wide)',color:'#6b7280',font:{size:11}}},y:{grid:{color:'#222'},ticks:{callback:v=>Math.round(v)}}}}});

  // ── Sector table ────────────────────────────────────────────────────────────
  el('meta-sector-tbody').innerHTML=secEntries.map(([name,d])=>{
    const avgP=d.valid?d.pfSum/d.valid:0;
    const pass=d.valid?Math.round(d.edge/d.valid*100):0;
    const barColor=pass>=30?GREEN:pass>=10?'#f59e0b':RED;
    const avgC=avgP>=1.10?'var(--green)':avgP>=1.05?'#fbbf24':'var(--muted)';
    return`<tr style="border-bottom:1px solid #1a1a1a"><td style="padding:8px 12px;font-weight:600;color:#e5e7eb">${name}</td><td style="padding:8px 12px;text-align:center;color:var(--muted)">${d.total}</td><td style="padding:8px 12px;text-align:center;color:var(--muted)">${d.valid}</td><td style="padding:8px 12px;text-align:center;color:${GREEN}">${d.edge}</td><td style="padding:8px 12px;text-align:right;font-family:monospace;color:${avgC}">${d.valid?avgP.toFixed(3):'—'}</td><td style="padding:8px 12px;text-align:right;font-family:monospace;color:var(--green)">${d.best?d.best.toFixed(3):'—'}</td><td style="padding:8px 12px;min-width:140px"><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:6px;background:#222;border-radius:3px"><div style="height:100%;width:${pass}%;background:${barColor};border-radius:3px"></div></div><span style="font-size:12px;color:${barColor};min-width:32px">${pass}%</span></div></td></tr>`;
  }).join('');

  // ── Top 20 by HO PF ────────────────────────────────────────────────────────
  const top20=[...valid].sort((a,b)=>(b.ho_pf||0)-(a.ho_pf||0)).slice(0,20);
  _metaTop20=top20.map(r=>({ticker:r.ticker,sector:r.sector,pf:r.ho_pf,sharpe:r.ho_sharpe,label:r.label}));
  el('meta-top20-tbody').innerHTML=top20.map((r,i)=>{
    const pfC=r.ho_pf>=1.10?'var(--green)':r.ho_pf>=1.05?'#fbbf24':'var(--muted)';
    const shC=r.ho_sharpe!=null?(r.ho_sharpe>=0.5?'var(--green)':r.ho_sharpe>=0.2?'#fbbf24':'var(--muted)'):'var(--muted)';
    const safePassed=r.safe_name||r.ticker.toLowerCase().replace(/\./g,'_');
    return`<tr style="border-bottom:1px solid #1a1a1a"><td style="padding:7px 10px;color:var(--muted);font-size:12px">${i+1}</td><td style="padding:7px 10px;font-weight:700;color:#e5e7eb">${r.ticker}</td><td style="padding:7px 10px;color:var(--muted);font-size:11px">${r.sector||'—'}</td><td style="padding:7px 10px;font-size:10px;color:#6b7280;white-space:nowrap">${r.model_type}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:${pfC};font-weight:700">${r.ho_pf.toFixed(3)}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:${shC}">${r.ho_sharpe!=null?r.ho_sharpe.toFixed(2):'—'}</td></tr>`;
  }).join('');

  // ── Model summary (IS → HO decay) ──────────────────────────────────────────
  const isPFs=valid.filter(r=>r.is_pf!=null).map(r=>r.is_pf);
  const hoPFs=valid.filter(r=>r.ho_pf!=null).map(r=>r.ho_pf);
  const avgIs=isPFs.length?isPFs.reduce((a,b)=>a+b,0)/isPFs.length:0;
  const avgHo=hoPFs.length?hoPFs.reduce((a,b)=>a+b,0)/hoPFs.length:0;
  const decay=avgIs>0?((avgIs-avgHo)/avgIs*100):0;
  el('meta-lr-stat').innerHTML=`<span style="font-size:28px;font-weight:800;color:${GREEN}">${edge.length}/${valid.length}</span><div style="font-size:13px;color:var(--muted);margin-top:2px">${valid.length?Math.round(edge.length/valid.length*100):0}% with HO PF ≥ 1.10</div><div style="font-size:12px;color:#4b5563;margin-top:6px">IS avg ${avgIs.toFixed(3)} → HO avg ${avgHo.toFixed(3)} (−${decay.toFixed(1)}% decay)</div>`;
  el('meta-don-stat').innerHTML=`<span style="font-size:28px;font-weight:800;color:${RED}">0/${valid.length}</span><div style="font-size:13px;color:var(--muted);margin-top:2px">0% pass rate</div><div style="font-size:12px;color:#4b5563;margin-top:6px">No validated edge found</div>`;

  // ── Portfolio alignment (models_comparison.json) ────────────────────────────
  if(_compData&&_compData.tickers){
    const ct=_compData.tickers;
    const buys=ct.filter(t=>t.signal===1).length,sells=ct.filter(t=>t.signal===-1).length;
    const pct=Math.round(buys/ct.length*100);
    const conColor=buys>sells?GREEN:RED;
    el('meta-portfolio-bar').style.cssText+=`;width:${pct}%;background:${conColor}`;
    el('meta-portfolio-label').textContent=`${buys} BUY · ${sells} SELL`;
    el('meta-portfolio-tbody').innerHTML=ct.map(t=>{const isBuy=t.signal===1;const sc=isBuy?GREEN:RED;return`<tr style="border-bottom:1px solid #1a1a1a"><td style="padding:7px 12px;font-weight:600;color:#e5e7eb">${t.ticker}</td><td style="padding:7px 12px;color:var(--muted);font-size:12px">${t.sector||'—'}</td><td style="padding:7px 12px;text-align:center"><span style="font-size:11px;font-weight:700;color:${sc};background:${isBuy?GREEN_1:RED_1};padding:2px 8px;border-radius:4px">${isBuy?'BUY':'SELL'}</span></td><td style="padding:7px 12px;text-align:right;font-family:monospace;color:${t.predicted_5bar_pct>=0?GREEN:RED}">${t.predicted_5bar_pct>=0?'+':''}${t.predicted_5bar_pct.toFixed(2)}%</td><td style="padding:7px 12px;text-align:right;font-family:monospace">${t.walk_fwd_pf?.toFixed(3)??'—'}</td><td style="padding:7px 12px;text-align:right;color:var(--muted);font-size:11px">${t.mcpt_p?.toFixed(3)??'—'}</td></tr>`;}).join('');
    const featCount={};ct.forEach(t=>{(t.top_features||[]).forEach(f=>{featCount[f.name]=(featCount[f.name]||0)+1;});});
    const fsorted=Object.entries(featCount).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const mx=fsorted.length?fsorted[0][1]:1;
    el('meta-feature-freq').innerHTML=fsorted.map(([name,count])=>`<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:12px;font-family:monospace;color:#e5e7eb">${name}</span><span style="font-size:11px;color:var(--muted)">${count}/${ct.length} models</span></div><div style="height:6px;background:#222;border-radius:3px"><div style="height:100%;width:${Math.round(count/mx*100)}%;background:var(--gold);border-radius:3px"></div></div></div>`).join('');
  }
}
