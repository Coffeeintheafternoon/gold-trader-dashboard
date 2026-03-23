async function initMetaTab() {
  const loads=[];
  if(!_screenerData) loads.push(fetch(`./screener_summary.json?v=${_CV}`).then(r=>r.ok?r.json():null).then(d=>{if(d)_screenerData=d;}).catch(()=>{}));
  if(!_compData) loads.push(fetch(`./models_comparison.json?v=${_CV}`).then(r=>r.ok?r.json():null).then(d=>{if(d)_compData=d;}).catch(()=>{}));
  if(!_fullScreenerData) loads.push(fetch(`./screener_full.json?v=${_CV}`).then(r=>r.ok?r.json():null).then(d=>{if(d)_fullScreenerData=d.tickers||[];}).catch(()=>{}));
  await Promise.all(loads);
  buildMetaTab(_screenerData, _compData, _fullScreenerData);
}

let _metaSectorChart=null,_metaPfHistChart=null;

function buildMetaTab(screenerData, compData, fullTickers) {
  document.getElementById('meta-spinner').style.display='none';
  document.getElementById('meta-content').style.display='';
  const ticks=fullTickers||[];
  const valid=ticks.filter(t=>!t.error&&t.pf!=null);
  const edge=valid.filter(t=>t.pf>=1.10);
  const total=ticks.length,nValid=valid.length;
  const avgPF=valid.length?valid.reduce((s,t)=>s+(t.pf||0),0)/valid.length:0;
  const bestTicker=valid.length?valid.reduce((b,t)=>t.pf>b.pf?t:b,valid[0]):null;

  // ── Hero row ────────────────────────────────────────────────────────────────
  document.getElementById('meta-hero-row').innerHTML=`
    <div class="hero-card" style="min-width:140px"><div class="hero-label">Tickers Screened</div><div class="hero-value color-gold">${total}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${nValid} valid · ${total-nValid} no data</div></div>
    <div class="hero-card" style="min-width:140px"><div class="hero-label">PF ≥ 1.10 (Edge)</div><div class="hero-value" style="color:var(--green)">${edge.length}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${nValid?Math.round(edge.length/nValid*100):0}% of valid</div></div>
    <div class="hero-card" style="min-width:140px"><div class="hero-label">Avg Profit Factor</div><div class="hero-value" style="color:${avgPF>=1.05?'var(--green)':'var(--muted)'};font-size:22px">${avgPF.toFixed(3)}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">across valid tickers</div></div>
    <div class="hero-card" style="min-width:160px"><div class="hero-label">Top Ticker by PF</div><div class="hero-value color-gold">${bestTicker?bestTicker.ticker:'—'}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${bestTicker?'PF '+bestTicker.pf.toFixed(3)+' · '+bestTicker.sector:'—'}</div></div>
    <div class="hero-card" style="min-width:140px"><div class="hero-label">Sectors Covered</div><div class="hero-value" style="font-size:22px">${new Set(ticks.map(t=>t.sector).filter(Boolean)).size}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">unique sectors</div></div>`;

  // ── Sector stats (for charts + table) ──────────────────────────────────────
  const secMap={};
  valid.forEach(t=>{const s=t.sector||'Other';if(!secMap[s])secMap[s]={total:0,valid:0,edge:0,pfSum:0,best:0};secMap[s].total++;secMap[s].valid++;secMap[s].pfSum+=t.pf||0;if(t.pf>=1.10)secMap[s].edge++;if(t.pf>secMap[s].best)secMap[s].best=t.pf;});
  ticks.filter(t=>t.error||t.pf==null).forEach(t=>{const s=t.sector||'Other';if(!secMap[s])secMap[s]={total:0,valid:0,edge:0,pfSum:0,best:0};secMap[s].total++;});
  const secEntries=Object.entries(secMap).sort((a,b)=>{const avgA=a[1].valid?a[1].pfSum/a[1].valid:0;const avgB=b[1].valid?b[1].pfSum/b[1].valid:0;return avgB-avgA;});

  // Sector avg PF chart
  const secLabels=secEntries.map(([s])=>s);
  const secAvgPF=secEntries.map(([,d])=>d.valid?+(d.pfSum/d.valid).toFixed(3):0);
  const secBarColors=secAvgPF.map(v=>v>=1.10?GREEN_7:v>=1.05?'rgba(251,191,36,0.7)':RED_55);
  const sCtx=document.getElementById('meta-sector-pf-chart').getContext('2d');
  if(_metaSectorChart)_metaSectorChart.destroy();
  _metaSectorChart=new Chart(sCtx,{type:'bar',data:{labels:secLabels,datasets:[{data:secAvgPF,backgroundColor:secBarColors,borderColor:secBarColors.map(c=>c.replace('0.7','1').replace('0.55','1')),borderWidth:1,borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>[` Avg PF: ${ctx.raw.toFixed(3)}`,` ${secEntries[ctx.dataIndex][1].edge}/${secEntries[ctx.dataIndex][1].valid} with PF≥1.10`]}}},scales:{x:{min:0.95,grid:{color:'#222'},ticks:{callback:v=>v.toFixed(2)}},y:{grid:{display:false},ticks:{font:{size:11}}}}}});

  // PF histogram
  const bins=[];for(let b=0.85;b<1.65;b+=0.05)bins.push(b);
  const hist=bins.map(b=>valid.filter(t=>t.pf>=b&&t.pf<b+0.05).length);
  const histLabels=bins.map(b=>b.toFixed(2));
  const histColors=bins.map(b=>b>=1.10?GREEN_7:b>=1.00?'rgba(251,191,36,0.6)':RED_6);
  const hCtx=document.getElementById('meta-pf-hist-chart').getContext('2d');
  if(_metaPfHistChart)_metaPfHistChart.destroy();
  _metaPfHistChart=new Chart(hCtx,{type:'bar',data:{labels:histLabels,datasets:[{data:hist,backgroundColor:histColors,borderColor:histColors,borderWidth:1,borderRadius:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw} tickers`}},annotation:{annotations:{line1:{type:'line',value:3,scaleID:'x',borderColor:'rgba(212,160,23,0.6)',borderWidth:2,borderDash:[4,3]}}}},scales:{x:{grid:{color:'#222'},title:{display:true,text:'Profit Factor bucket (0.05 wide)',color:'#6b7280',font:{size:11}}},y:{grid:{color:'#222'},ticks:{callback:v=>Math.round(v)}}}}});

  // Sector table
  let sectorHtml=secEntries.map(([name,d])=>{const avgP=d.valid?d.pfSum/d.valid:0;const pass=d.valid?Math.round(d.edge/d.valid*100):0;const barColor=pass>=30?GREEN:pass>=10?'#f59e0b':RED;const avgC=avgP>=1.10?'var(--green)':avgP>=1.05?'#fbbf24':'var(--muted)';return`<tr style="border-bottom:1px solid #1a1a1a"><td style="padding:8px 12px;font-weight:600;color:#e5e7eb">${name}</td><td style="padding:8px 12px;text-align:center;color:var(--muted)">${d.total}</td><td style="padding:8px 12px;text-align:center;color:var(--muted)">${d.valid}</td><td style="padding:8px 12px;text-align:center;color:${GREEN}">${d.edge}</td><td style="padding:8px 12px;text-align:right;font-family:monospace;color:${avgC}">${d.valid?avgP.toFixed(3):'—'}</td><td style="padding:8px 12px;text-align:right;font-family:monospace;color:var(--green)">${d.best?d.best.toFixed(3):'—'}</td><td style="padding:8px 12px;min-width:140px"><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:6px;background:#222;border-radius:3px"><div style="height:100%;width:${pass}%;background:${barColor};border-radius:3px"></div></div><span style="font-size:12px;color:${barColor};min-width:32px">${pass}%</span></div></td></tr>`;}).join('');
  document.getElementById('meta-sector-tbody').innerHTML=sectorHtml;

  // Top 20 tickers
  _metaTop20=[...valid].sort((a,b)=>b.pf-a.pf).slice(0,20);
  document.getElementById('meta-top20-tbody').innerHTML=_metaTop20.map((t,i)=>{const pfC=t.pf>=1.10?'var(--green)':t.pf>=1.05?'#fbbf24':'var(--muted)';const shC=t.sharpe>=0.5?'var(--green)':t.sharpe>=0.25?'#fbbf24':'var(--muted)';const retC=t.mean_ann_pct>=20?'var(--green)':t.mean_ann_pct>=10?'#fbbf24':'var(--muted)';const ciC=(t.ci95_lower||0)>0?'var(--green)':'var(--red)';return`<tr style="border-bottom:1px solid #1a1a1a;cursor:pointer" onclick="openTickerInModelLab('${t.ticker}',_metaTop20.find(r=>r.ticker==='${t.ticker}')||{})" onmouseover="this.style.background='#1a1a1a'" onmouseout="this.style.background=''"><td style="padding:7px 10px;color:var(--muted);font-size:12px">${i+1}</td><td style="padding:7px 10px;font-weight:700;color:#e5e7eb">${t.ticker} <span style="font-size:10px;color:#444">→</span></td><td style="padding:7px 10px;color:var(--muted);font-size:11px">${t.sector||'—'}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:${pfC};font-weight:700">${t.pf.toFixed(3)}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:${shC}">${t.sharpe!=null?t.sharpe.toFixed(2):'—'}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:${retC}">${t.mean_ann_pct!=null?(t.mean_ann_pct>=0?'+':'')+t.mean_ann_pct.toFixed(1)+'%':'—'}</td><td style="padding:7px 10px;text-align:right;font-family:monospace;color:${ciC}">${t.ci95_lower!=null?(t.ci95_lower>=0?'+':'')+t.ci95_lower.toFixed(1)+'%':'—'}</td><td style="padding:7px 10px;text-align:right;color:var(--muted)">${t.oos_bars?.toLocaleString()??'—'}</td></tr>`;}).join('');

  // Strategy comparison
  document.getElementById('meta-lr-stat').innerHTML=`<span style="font-size:28px;font-weight:800;color:${GREEN}">${edge.length}/${nValid}</span><div style="font-size:13px;color:var(--muted);margin-top:2px">${nValid?Math.round(edge.length/nValid*100):0}% with PF ≥ 1.10</div><div style="font-size:12px;color:#4b5563;margin-top:6px">${valid.filter(t=>t.pf>=1.05).length} with PF ≥ 1.05</div>`;
  document.getElementById('meta-don-stat').innerHTML=`<span style="font-size:28px;font-weight:800;color:${RED}">0/${total}</span><div style="font-size:13px;color:var(--muted);margin-top:2px">0% pass rate</div><div style="font-size:12px;color:#4b5563;margin-top:6px">No validated edge found</div>`;

  // Portfolio alignment
  if(compData&&compData.tickers){
    const ct=compData.tickers;
    const buys=ct.filter(t=>t.signal===1).length,sells=ct.filter(t=>t.signal===-1).length;
    const pct=Math.round(buys/ct.length*100);
    const conColor=buys>sells?GREEN:RED;
    document.getElementById('meta-portfolio-bar').style.cssText+=`;width:${pct}%;background:${conColor}`;
    document.getElementById('meta-portfolio-label').textContent=`${buys} BUY · ${sells} SELL`;
    document.getElementById('meta-portfolio-tbody').innerHTML=ct.map(t=>{const isBuy=t.signal===1;const sc=isBuy?GREEN:RED;return`<tr style="border-bottom:1px solid #1a1a1a"><td style="padding:7px 12px;font-weight:600;color:#e5e7eb">${t.ticker}</td><td style="padding:7px 12px;color:var(--muted);font-size:12px">${t.sector||'—'}</td><td style="padding:7px 12px;text-align:center"><span style="font-size:11px;font-weight:700;color:${sc};background:${isBuy?GREEN_1:RED_1};padding:2px 8px;border-radius:4px">${isBuy?'BUY':'SELL'}</span></td><td style="padding:7px 12px;text-align:right;font-family:monospace;color:${t.predicted_5bar_pct>=0?GREEN:RED}">${t.predicted_5bar_pct>=0?'+':''}${t.predicted_5bar_pct.toFixed(2)}%</td><td style="padding:7px 12px;text-align:right;font-family:monospace">${t.walk_fwd_pf?.toFixed(3)??'—'}</td><td style="padding:7px 12px;text-align:right;color:var(--muted);font-size:11px">${t.mcpt_p?.toFixed(3)??'—'}</td></tr>`;}).join('');
    const featCount={};ct.forEach(t=>{(t.top_features||[]).forEach(f=>{featCount[f.name]=(featCount[f.name]||0)+1;});});
    const fsorted=Object.entries(featCount).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const mx=fsorted.length?fsorted[0][1]:1;
    document.getElementById('meta-feature-freq').innerHTML=fsorted.map(([name,count])=>`<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:12px;font-family:monospace;color:#e5e7eb">${name}</span><span style="font-size:11px;color:var(--muted)">${count}/${ct.length} models</span></div><div style="height:6px;background:#222;border-radius:3px"><div style="height:100%;width:${Math.round(count/mx*100)}%;background:var(--gold);border-radius:3px"></div></div></div>`).join('');
  }
}
