// ── Signal Tab ────────────────────────────────────────────────────────────────
async function initSignalTab() {
  const spinner = document.getElementById('sig-spinner');
  try {
    const [r1,r2] = await Promise.all([
      fetch(`./data.json?v=${_CV}`),
      fetch(`./models_comparison.json?v=${_CV}`)
    ]);
    _signalData = r1.ok ? await r1.json() : null;
    _compData   = r2.ok ? await r2.json() : null;
  } catch(e) {}
  if (spinner) spinner.style.display = 'none';
  if (!_signalData) { document.getElementById('sig-error').style.display='block'; return; }
  document.getElementById('sig-content').style.display = '';
  renderSignalTab(_signalData, _compData);
}

function computeCombinedVerdict(signalData, compData) {
  const s = signalData.summary || {};
  const tickers = (compData && compData.tickers) || [];
  const dir = (s.last_direction || '').toLowerCase();
  const claudeDir = dir === 'bullish' ? 1 : dir === 'bearish' ? -1 : 0;
  const confidence = s.last_confidence || 0;
  const score = Math.abs(s.last_score || 0);
  const claudeWeight = confidence * Math.min(1, score / 1.0);
  if (!tickers.length) return null;
  const buyCount = tickers.filter(t => t.signal === 1).length;
  const sellCount = tickers.filter(t => t.signal === -1).length;
  const quantDir = buyCount >= sellCount ? 1 : -1;
  const consensusPct = Math.max(buyCount, sellCount) / tickers.length;
  const avgPF = tickers.reduce((s,t) => s + (t.walk_fwd_pf||1), 0) / tickers.length;
  const quantWeight = consensusPct * Math.min(1, (avgPF - 1) * 8);
  const totalWeight = claudeWeight + quantWeight;
  if (totalWeight === 0) return null;
  const combined = claudeDir * claudeWeight + quantDir * quantWeight;
  const conviction = Math.abs(combined) / totalWeight;
  const combinedDir = combined > 0.05 ? 'bullish' : combined < -0.05 ? 'bearish' : 'neutral';
  const convictionLabel = conviction > 0.7 ? 'High Conviction' : conviction > 0.45 ? 'Moderate Conviction' : conviction > 0.25 ? 'Low Conviction' : 'Uncertain';
  const dominated = claudeWeight > quantWeight * 1.5 ? 'Claude-led' : quantWeight > claudeWeight * 1.5 ? 'Quant-led' : 'Split signal';
  return { dir: combinedDir, conviction, convictionLabel, dominated, claudeDir, claudeWeight, quantDir, quantWeight, totalWeight, buyCount, sellCount, total: tickers.length, conflicting: claudeDir !== 0 && quantDir !== 0 && claudeDir !== quantDir };
}

function renderSignalTab(data, compData) {
  document.getElementById('header-updated').textContent = 'Updated: ' + toAWSTFull(data.generated_at);
  const s = data.summary || {};
  document.getElementById('card-price').textContent = data.current_price_aud ? fmtPrice(data.current_price_aud) : '—';
  const dirEl = document.getElementById('card-direction');
  const dirTxt = (s.last_direction||'—').charAt(0).toUpperCase() + (s.last_direction||'').slice(1);
  dirEl.textContent = dirTxt; dirEl.className = 'hero-value ' + directionClass(s.last_direction);
  document.getElementById('card-confidence').textContent = s.last_confidence != null ? `Score ${(s.last_score||0).toFixed(2)} · Confidence ${Math.round((s.last_confidence||0)*100)}%` : '—';
  const wrEl = document.getElementById('card-winrate');
  const wrPct = Math.round((s.win_rate||0)*100);
  wrEl.textContent = wrPct + '%'; wrEl.className = 'hero-value ' + (wrPct > 60 ? 'color-green' : wrPct >= 40 ? 'color-yellow' : 'color-red');
  document.getElementById('card-winrate-sub').textContent = `${s.correct||0} / ${s.total_assessed||0} correct`;
  document.getElementById('card-cost').textContent = 'AUD $' + (s.total_cost_aud||0).toFixed(2);
  const verdict = computeCombinedVerdict(data, compData);
  buildCombinedVerdictBanner(verdict);
  buildClaudeSignalCard(s, data.signals||[]);
  if (compData) buildQuantSignalCard(compData);
  else document.getElementById('quant-signal-card').innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px">No quant data</div>';
  const signals = data.signals || [];
  buildHistoryChart(signals); buildScatterChart(signals); buildDonutChart(s);
  buildPnlChart(signals); buildDriversChart(signals); buildCostChart(data.daily_costs||[]);
}

function buildCombinedVerdictBanner(verdict) {
  const el = document.getElementById('combined-verdict-banner');
  if (!verdict) { el.style.display='none'; return; }
  el.style.display = '';
  const dirColor = verdict.dir==='bullish'?GREEN:verdict.dir==='bearish'?RED:'#9ca3af';
  const dirBg = verdict.dir==='bullish'?GREEN_08:verdict.dir==='bearish'?RED_08:'rgba(107,114,128,0.08)';
  const dirText = verdict.dir==='bullish'?'▲ BULLISH':verdict.dir==='bearish'?'▼ BEARISH':'— NEUTRAL';
  const conflictHtml = verdict.conflicting ? `<div style="margin-top:10px;padding:8px 14px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:6px;font-size:12px;color:#fbbf24">⚠ Signals conflict — Claude ${verdict.claudeDir>0?'BULLISH':'BEARISH'} vs Quant ${verdict.quantDir>0?'BULLISH ('+verdict.buyCount+'/'+verdict.total+')':'BEARISH'}. Quant weight ${(verdict.quantWeight/verdict.totalWeight*100).toFixed(0)}% of combined.</div>` : '';
  el.style.borderLeft = `4px solid ${dirColor}`;
  el.style.background = dirBg;
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
    <div>
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Combined Verdict (Claude AI + Quant)</div>
      <div style="font-size:36px;font-weight:900;color:${dirColor};letter-spacing:1px">${dirText}</div>
      <div style="font-size:14px;color:var(--muted);margin-top:4px">${verdict.convictionLabel} · ${verdict.dominated}</div>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div style="text-align:center"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">Conviction</div><div style="font-size:24px;font-weight:700;color:${dirColor}">${(verdict.conviction*100).toFixed(0)}%</div></div>
      <div style="text-align:center"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">Claude Weight</div><div style="font-size:18px;font-weight:700">${verdict.claudeWeight.toFixed(2)}</div></div>
      <div style="text-align:center"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">Quant Weight</div><div style="font-size:18px;font-weight:700">${verdict.quantWeight.toFixed(2)}</div></div>
    </div>
  </div>${conflictHtml}`;
}

function buildClaudeSignalCard(s, signals) {
  const driverKeys   = ['geopolitical_risk','usd_strength','real_yields','cb_physical','aud_dynamics'];
  const driverLabels = ['Geopolitical','USD Strength','Real Yields','CB Physical','AUD'];
  const lastSig = signals.length ? signals[signals.length-1] : null;
  const drivers = lastSig && lastSig.drivers ? lastSig.drivers : {};
  const dir = s.last_direction || '';
  const dirColor = directionColor(dir);
  const dirText = (dir||'—').charAt(0).toUpperCase()+dir.slice(1);
  const dirBg = dir==='bullish'?GREEN_1:dir==='bearish'?RED_1:'rgba(107,114,128,0.1)';
  let driversHtml = '';
  driverKeys.forEach((k,i) => {
    const v = drivers[k]; if (v == null) return;
    const pct = Math.min(100, Math.abs(v)/2*100);
    const col = v >= 0 ? GREEN : RED;
    driversHtml += `<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:11px;color:var(--muted)">${driverLabels[i]}</span><span style="font-size:11px;color:${col};font-weight:600">${v>=0?'+':''}${v.toFixed(2)}</span></div><div style="height:4px;background:#222;border-radius:2px"><div style="height:100%;width:${pct}%;background:${col};border-radius:2px"></div></div></div>`;
  });
  const el = document.getElementById('claude-signal-card');
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
    <div><div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Claude AI Signal</div>
    <div style="font-size:28px;font-weight:900;color:${dirColor};background:${dirBg};padding:6px 18px;border-radius:8px;display:inline-block">${dirText}</div></div>
    <div style="text-align:right"><div style="font-size:11px;color:var(--muted)">Score</div><div style="font-size:22px;font-weight:700">${(s.last_score||0).toFixed(2)}</div><div style="font-size:12px;color:var(--muted);margin-top:2px">${Math.round((s.last_confidence||0)*100)}% confidence</div></div>
  </div>
  <div style="font-size:11px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Latest Drivers</div>
  ${driversHtml || '<div style="color:var(--muted);font-size:12px">No driver data</div>'}
  ${lastSig ? '<div style="font-size:11px;color:var(--muted);margin-top:10px;border-top:1px solid var(--border);padding-top:8px">'+toAWSTFull(lastSig.created_at)+'</div>' : ''}`;
}

function buildQuantSignalCard(compData) {
  const tickers = compData.tickers || [];
  const buys = tickers.filter(t=>t.signal===1).length;
  const sells = tickers.filter(t=>t.signal===-1).length;
  const conDir = buys >= sells ? 'bullish' : 'bearish';
  const conColor = conDir==='bullish'?GREEN:RED;
  const conText = conDir==='bullish'?'▲ BULLISH':'▼ BEARISH';
  const avgPF = tickers.length ? (tickers.reduce((s,t)=>s+(t.walk_fwd_pf||1),0)/tickers.length).toFixed(3) : '—';
  let rowsHtml = tickers.map(t => {
    const isBuy = t.signal===1;
    const sc = isBuy?GREEN:RED;
    const predSign = t.predicted_5bar_pct>=0?'+':'';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1e1e1e">
      <span style="font-size:13px;font-weight:600;color:#e5e7eb">${t.ticker}</span>
      <span style="font-size:11px;color:var(--muted)">${t.sector||''}</span>
      <span style="font-size:12px;color:${predSign==='+'?GREEN:RED}">${predSign}${t.predicted_5bar_pct.toFixed(2)}%</span>
      <span style="font-size:11px;font-weight:700;color:${sc};background:${isBuy?GREEN_1:RED_1};padding:2px 8px;border-radius:4px">${isBuy?'BUY':'SELL'}</span>
    </div>`;
  }).join('');
  document.getElementById('quant-signal-card').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
    <div><div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Quant Consensus (ASX)</div>
    <div style="font-size:28px;font-weight:900;color:${conColor}">${conText}</div>
    <div style="font-size:13px;color:var(--muted);margin-top:4px">${buys} BUY · ${sells} SELL of ${tickers.length} models</div></div>
    <div style="text-align:right"><div style="font-size:11px;color:var(--muted)">Avg WF PF</div><div style="font-size:22px;font-weight:700;color:var(--gold)">${avgPF}</div></div>
  </div>
  <div>${rowsHtml}</div>
  <div style="font-size:11px;color:var(--muted);margin-top:10px;border-top:1px solid var(--border);padding-top:8px">Updated ${compData.generated_at ? new Date(compData.generated_at).toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</div>`;
}

// ── Chart 1: Signal History ───────────────────────────────────────────────────
function buildHistoryChart(signals) {
  if (!signals.length) { showNoData('chart-history','no-data-history'); return; }
  const labels = signals.map(s=>toAWST(s.created_at));
  const scores = signals.map(s=>s.composite_score??0);
  const pointColors = signals.map(s=>directionColor(s.direction));
  const outcomeLabels = signals.map(s=>!s.outcome?'Pending':s.outcome.was_correct?'✓ Correct':'✗ Incorrect');
  const ctx = document.getElementById('chart-history').getContext('2d');
  new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Composite Score',data:scores,borderColor:GOLD,borderWidth:2,pointBackgroundColor:pointColors,pointBorderColor:pointColors,pointRadius:6,pointHoverRadius:8,tension:0.3,segment:{borderColor:ctx2=>{const v=(scores[ctx2.p0DataIndex]+scores[ctx2.p1DataIndex])/2;return v>0.3?GREEN:v<-0.3?RED:GREY;}},fill:false},{label:'_zero',data:scores.map(()=>0),borderColor:SQ.neutral,borderWidth:1,borderDash:[4,4],pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>labels[items[0].dataIndex],label:item=>{if(item.datasetIndex!==0)return null;const i=item.dataIndex;const sig=signals[i];return[`Score: ${(sig.composite_score||0).toFixed(3)}`,`Direction: ${sig.direction||'—'}`,`Confidence: ${Math.round((sig.confidence||0)*100)}%`,outcomeLabels[i]];},filter:item=>item.datasetIndex===0}}},scales:{x:{ticks:{maxRotation:45,font:{size:11}}},y:{min:-2,max:2,title:{display:true,text:'Score',font:{size:11}},grid:{color:SQ.grid}}}}});
}

// ── Chart 2: Scatter ──────────────────────────────────────────────────────────
function buildScatterChart(signals) {
  const withOutcome = signals.filter(s=>s.outcome&&s.outcome.actual_move_pct!=null);
  if (withOutcome.length<2) { showNoData('chart-scatter','no-data-scatter'); return; }
  const correctDots = withOutcome.filter(s=>s.outcome.was_correct).map(s=>({x:s.expected_move_pct??0,y:s.outcome.actual_move_pct}));
  const incorrectDots = withOutcome.filter(s=>!s.outcome.was_correct).map(s=>({x:s.expected_move_pct??0,y:s.outcome.actual_move_pct}));
  const ctx = document.getElementById('chart-scatter').getContext('2d');
  new Chart(ctx,{type:'scatter',data:{datasets:[{label:'Correct',data:correctDots,backgroundColor:GREEN+'cc',borderColor:GREEN,pointRadius:6,pointHoverRadius:8},{label:'Incorrect',data:incorrectDots,backgroundColor:RED+'cc',borderColor:RED,pointRadius:6,pointHoverRadius:8},{label:'y = x',type:'line',data:[{x:-3,y:-3},{x:3,y:3}],borderColor:'#555',borderWidth:1.5,borderDash:[6,4],pointRadius:0,fill:false},{label:'_vz',type:'line',data:[{x:0,y:-3},{x:0,y:3}],borderColor:SQ.neutral,borderWidth:1,pointRadius:0,fill:false},{label:'_hz',type:'line',data:[{x:-3,y:0},{x:3,y:0}],borderColor:SQ.neutral,borderWidth:1,pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{filter:item=>!item.text.startsWith('_')&&item.text!=='y = x',boxWidth:12,font:{size:11}}},tooltip:{callbacks:{label:item=>{if(item.datasetIndex>1)return null;const p=item.raw;return`Pred: ${p.x.toFixed(2)}%  Actual: ${p.y.toFixed(2)}%`;}}}},scales:{x:{type:'linear',min:-3,max:3,title:{display:true,text:'Predicted Move %',font:{size:11}},grid:{color:SQ.grid}},y:{type:'linear',min:-3,max:3,title:{display:true,text:'Actual Move %',font:{size:11}},grid:{color:SQ.grid}}}}});
}

// ── Chart 3: Donut ────────────────────────────────────────────────────────────
function buildDonutChart(s) {
  const total=s.total_signals||0,assessed=s.total_assessed||0,correct=s.correct||0;
  const incorrect=assessed-correct,pending=total-assessed;
  if (total===0) { showNoData('chart-donut','no-data-donut'); return; }
  const wrPct=Math.round((s.win_rate||0)*100);
  document.getElementById('donut-subtitle').textContent=`${correct} correct · ${incorrect} incorrect · ${pending} pending`;
  const ctx=document.getElementById('chart-donut').getContext('2d');
  const centerTextPlugin={id:'centerText',afterDraw(chart){const{ctx:c,chartArea:{top,bottom,left,right}}=chart;const cx=(left+right)/2,cy=(top+bottom)/2;c.save();c.font='bold 28px -apple-system,sans-serif';c.fillStyle=SQ.text;c.textAlign='center';c.textBaseline='middle';c.fillText(wrPct+'%',cx,cy);c.restore();}};
  new Chart(ctx,{type:'doughnut',plugins:[centerTextPlugin],data:{labels:['Correct','Incorrect','Pending'],datasets:[{data:[correct,incorrect,pending],backgroundColor:[GREEN+'cc',RED+'cc',GREY+'80'],borderColor:[GREEN,RED,GREY],borderWidth:2,hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'bottom',labels:{boxWidth:12,padding:14,font:{size:11}}},tooltip:{callbacks:{label:item=>{const v=item.raw;const pct=total>0?Math.round(v/total*100):0;return` ${item.label}: ${v} (${pct}%)`;}}}}}});
}

// ── Chart 4: P&L ──────────────────────────────────────────────────────────────
function buildPnlChart(signals) {
  const withPnl=signals.filter(s=>s.cumulative_pnl!=null);
  if (withPnl.length<2) { showNoData('chart-pnl','no-data-pnl'); return; }
  const labels=withPnl.map(s=>toAWST(s.created_at));
  const values=withPnl.map(s=>s.cumulative_pnl);
  const ctx=document.getElementById('chart-pnl').getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,0,200);
  gradient.addColorStop(0,GREEN+'44');gradient.addColorStop(1,GREEN+'00');
  new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Cumulative P&L (%)',data:values,borderColor:GREEN,borderWidth:2,backgroundColor:gradient,fill:true,tension:0.3,pointRadius:4,pointBackgroundColor:values.map(v=>v>=0?GREEN:RED),pointBorderColor:values.map(v=>v>=0?GREEN:RED)},{label:'_zero',data:values.map(()=>0),borderColor:SQ.neutral,borderWidth:1,borderDash:[4,4],pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:item=>{if(item.datasetIndex!==0)return null;return`P&L: ${item.raw.toFixed(2)}%`;},filter:item=>item.datasetIndex===0}}},scales:{x:{ticks:{maxRotation:45,font:{size:11}}},y:{title:{display:true,text:'Cumulative %',font:{size:11}},grid:{color:SQ.grid}}}}});
}

// ── Chart 5: Drivers ──────────────────────────────────────────────────────────
function buildDriversChart(signals) {
  const withDrivers=signals.filter(s=>s.drivers);
  if (!withDrivers.length) { showNoData('chart-drivers','no-data-drivers'); return; }
  const driverKeys=['geopolitical_risk','usd_strength','real_yields','cb_physical','aud_dynamics'];
  const driverLabels=['Geopolitical Risk','USD Strength','Real Yields','CB Physical','AUD Dynamics'];
  const avgs=driverKeys.map(k=>{const vals=withDrivers.map(s=>s.drivers[k]).filter(v=>v!=null);return vals.length?avg(vals):0;});
  const ctx=document.getElementById('chart-drivers').getContext('2d');
  new Chart(ctx,{type:'bar',data:{labels:driverLabels,datasets:[{label:'Avg Score',data:avgs,backgroundColor:avgs.map(v=>v>=0?GOLD+'cc':RED+'cc'),borderColor:avgs.map(v=>v>=0?GOLD:RED),borderWidth:1.5,borderRadius:4}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:item=>` ${item.raw.toFixed(3)}`}}},scales:{x:{min:-2,max:2,grid:{color:SQ.grid},title:{display:true,text:'Average Score',font:{size:11}}},y:{ticks:{font:{size:11}},grid:{color:SQ.grid}}}}});
}

// ── Chart 6: Cost ─────────────────────────────────────────────────────────────
function buildCostChart(dailyCosts) {
  if (!dailyCosts.length) { showNoData('chart-costs','no-data-costs'); return; }
  const ctx=document.getElementById('chart-costs').getContext('2d');
  new Chart(ctx,{type:'bar',data:{labels:dailyCosts.map(d=>d.date),datasets:[{label:'AUD Cost',data:dailyCosts.map(d=>d.aud),backgroundColor:GOLD+'bb',borderColor:GOLD,borderWidth:1.5,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:item=>` AUD $${item.raw.toFixed(4)}`}}},scales:{x:{ticks:{maxRotation:45,font:{size:11}}},y:{beginAtZero:true,grid:{color:SQ.grid},title:{display:true,text:'AUD',font:{size:11}}}}}});
}

// ── Cluster colour palette ────────────────────────────────────────────────────
const _CLUSTER_PALETTE = Array.from({length:8},(_,i)=>({bg:sqBg(i),text:sqColor(i),border:sqColor(i)}));
const _CLUSTER_UNKNOWN = {bg:hexA(SQ.neutral,0.12),text:SQ.neutral,border:SQ.neutral};
function clusterColor(cid) { if(cid==null||cid<0)return _CLUSTER_UNKNOWN; return _CLUSTER_PALETTE[cid%_CLUSTER_PALETTE.length]; }

// ── Panel Q0: Current Signal ──────────────────────────────────────────────────
function buildCurrentSignalPanel(cs, regime) {
  const badge=document.getElementById('qs-direction-badge');
  const dir=cs.direction||'FLAT';
  const colors={LONG:{bg:GREEN_08,color:GREEN,border:GREEN,label:'▲ LONG'},SHORT:{bg:RED_08,color:RED,border:RED,label:'▼ SHORT'},FLAT:{bg:hexA(SQ.neutral,0.10),color:SQ.neutral,border:SQ.neutral,label:'— FLAT'}};
  const c=colors[dir]||colors.FLAT;
  badge.textContent=c.label;badge.style.background=c.bg;badge.style.color=c.color;badge.style.border=`2px solid ${c.border}`;
  const cid=regime.cluster!=null?regime.cluster:null;
  const cc=clusterColor(cid);
  document.getElementById('qs-regime').textContent=cid!=null?`Cluster ${cid}`:'—';
  document.getElementById('qs-regime').style.color=cc.text;
  document.getElementById('qs-strategy').textContent=cs.strategy_display||'—';
  document.getElementById('qs-bars').textContent=cs.consecutive_bars!=null?cs.consecutive_bars+'d':'—';
  document.getElementById('qs-weight').textContent=cs.quant_weight!=null?Math.round(cs.quant_weight*100)+'%':'—';
  const conf=regime.confirmation||null;
  const confirmRow=document.getElementById('qs-confirm-row');
  if (conf) {
    confirmRow.style.display='block';
    const met=conf.metrics_met||0,total=conf.metrics_total||10;
    const pct=conf.confidence!=null?Math.round(conf.confidence*100):0;
    const thr=conf.threshold!=null?Math.round(conf.threshold*100):70;
    document.getElementById('qs-confirm-label').textContent=`${met}/${total} metrics agree`;
    document.getElementById('qs-confirm-threshold').textContent=thr+'%';
    document.getElementById('qs-confirm-pct').textContent=pct+'%';
    const statusEl=document.getElementById('qs-confirm-status');
    if(conf.confirmed){statusEl.textContent='CONFIRMED';statusEl.style.background='#1a3a1a';statusEl.style.color=GREEN;}
    else{statusEl.textContent='PENDING';statusEl.style.background='#2a2a1a';statusEl.style.color='#f59e0b';}
    const bar=document.getElementById('qs-confirm-bar');
    bar.style.width=pct+'%';bar.style.background=conf.confirmed?GREEN:'#f59e0b';
    const dotsEl=document.getElementById('qs-confirm-dots');dotsEl.innerHTML='';
    if(conf.metric_details){Object.entries(conf.metric_details).forEach(([name,passed])=>{const dot=document.createElement('div');dot.title=name.replace(/_/g,' ');dot.style.cssText=`width:14px;height:14px;border-radius:3px;cursor:default;background:${passed?GREEN:'#3a1a1a'};border:1px solid ${passed?GREEN:RED}`;dotsEl.appendChild(dot);});}
  }
}

// ── Panel Q1: Cluster Panel ───────────────────────────────────────────────────
function buildClusterPanel(cluster, history) {
  const cid=cluster.cluster!=null?cluster.cluster:null;
  const cc=clusterColor(cid);
  const badge=document.getElementById('cluster-badge');
  if(cid!=null){const tokens=(cluster.label||`Cluster ${cid}`).split(' | ');badge.innerHTML=`<div style="font-size:22px;font-weight:800">Cluster ${cid}</div><div style="font-size:11px;font-weight:500;margin-top:3px;line-height:1.5">${tokens.join('<br>')}</div>`;}else{badge.textContent='—';}
  badge.style.background=cc.bg;badge.style.color=cc.text;badge.style.border=`2px solid ${cc.border}`;
  document.getElementById('cluster-strategy').textContent=cluster.strategy||'—';
  const pf=cluster.is_pf;
  document.getElementById('cluster-pf').textContent=pf!=null?pf.toFixed(3):'—';
  document.getElementById('cluster-pf').className='hero-value '+(pf>=1.5?'color-green':pf>=1.0?'color-gold':'color-red');
  document.getElementById('cluster-k').textContent=cluster.k!=null?cluster.k:'—';
  const timeline=document.getElementById('cluster-timeline');
  timeline.innerHTML='';
  history.slice(-200).forEach(item=>{const c=clusterColor(item.cluster);const bar=document.createElement('div');bar.style.flex='1';bar.style.background=c.text+'88';bar.style.borderRadius='1px';bar.title=`${item.date}  Cluster ${item.cluster}`;timeline.appendChild(bar);});
}

// ── Panel Q4: Cluster Dist ────────────────────────────────────────────────────
function buildClusterDistChart(clusterPerf) {
  if(!clusterPerf||!clusterPerf.length)return;
  const ctx=document.getElementById('chart-cluster-dist').getContext('2d');
  new Chart(ctx,{type:'bar',data:{labels:clusterPerf.map(c=>`Cluster ${c.cluster}\n${c.strategy||''}`),datasets:[{label:'Bars in cluster',data:clusterPerf.map(c=>c.n_bars||0),backgroundColor:clusterPerf.map(c=>clusterColor(c.cluster).text+'aa'),borderColor:clusterPerf.map(c=>clusterColor(c.cluster).border),borderWidth:1,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:item=>` ${item.raw} bars  ·  Strategy: ${clusterPerf[item.dataIndex].strategy||'—'}  ·  IS PF: ${clusterPerf[item.dataIndex].is_pf!=null?clusterPerf[item.dataIndex].is_pf.toFixed(3):'—'}`}}},scales:{x:{ticks:{font:{size:10},color:'#9ca3af'},grid:{color:SQ.grid}},y:{ticks:{font:{size:10}},grid:{color:SQ.grid}}}}});
}

// ── Panel Q2: MCPT Table ──────────────────────────────────────────────────────
function buildMcptTable(qd) {
  const STRATEGY_DISPLAY={donchian:'Donchian Breakout',mean_reversion:'Bollinger Mean-Rev',ma_crossover:'EMA Crossover',atr_breakout:'ATR Impulse',flat:'No Trade'};
  function mcptBadge(label,test,tipText){
    if(!test)return`<div class="hero-card" style="padding:10px 16px;min-width:200px"><div class="hero-label">${label}</div><div class="hero-value" style="color:var(--muted)">Not run</div></div>`;
    const pval=test.p_value;let statusText,statusColor;
    if(pval<0.05){statusText='VALIDATED';statusColor=GREEN;}else if(pval<0.10){statusText='BORDERLINE';statusColor='#f59e0b';}else{statusText='REJECTED';statusColor=RED;}
    return`<div class="hero-card tip" data-tip="${tipText}" style="padding:10px 16px;min-width:200px;cursor:help"><div class="hero-label">${label}</div><div class="hero-value" style="color:${statusColor};font-size:16px">${statusText}</div><div class="hero-sub">p = ${pval.toFixed(4)} · ${test.n_permutations} perms</div></div>`;
  }
  const badges=document.getElementById('mcpt-badges');
  badges.innerHTML=mcptBadge('Regime Routing MCPT',qd.mcpt_routing,"Test 1: Shuffles regime labels 200 times.\n\np < 0.05 = regime routing is real.")+mcptBadge('Combined Signal MCPT',qd.mcpt_combined,"Test 2: Shuffles price bar order 200 times.\n\np < 0.05 = combined signal is statistically robust.");
  if(qd.combined_metrics){const cm=qd.combined_metrics;badges.innerHTML+=`<div class="hero-card" style="padding:10px 16px;min-width:200px"><div class="hero-label">Combined OOS Metrics</div><div class="hero-value color-gold">Sharpe ${(cm.sharpe_ratio||0).toFixed(3)}</div><div class="hero-sub">PF ${(cm.profit_factor||0).toFixed(3)} · obj ${(cm.objective_score||0).toFixed(4)}</div></div>`;}
  const wfTbody=document.getElementById('wf-metrics-tbody');wfTbody.innerHTML='';
  (qd.strategies||[]).forEach(m=>{
    const pf=(m.profit_factor||0).toFixed(3),sr=(m.sharpe_ratio||0).toFixed(3);
    const pfColor=m.profit_factor>=1.2?GREEN:m.profit_factor>=1.0?'#f59e0b':RED;
    const srColor=m.sharpe_ratio>=0.5?GREEN:m.sharpe_ratio>=0.0?'#f59e0b':RED;
    const wfe=m.wfe_pct;const wfeStr=wfe!=null?`${wfe.toFixed(0)}%`:'—';
    const wfeColor=wfe==null?'var(--muted)':wfe>=40?GREEN:wfe>=20?'#f59e0b':RED;
    let mcptStr,mcptColor;
    if(!m.n_permutations||m.n_permutations===0){mcptStr='Not run';mcptColor='var(--muted)';}
    else if(m.p_value==null){mcptStr='—';mcptColor='var(--muted)';}
    else if(m.p_value<0.01){mcptStr=`✓ p=${m.p_value.toFixed(3)}`;mcptColor=GREEN;}
    else if(m.p_value<0.05){mcptStr=`✓ p=${m.p_value.toFixed(3)}`;mcptColor='#86efac';}
    else if(m.p_value<0.10){mcptStr=`~ p=${m.p_value.toFixed(3)}`;mcptColor='#f59e0b';}
    else{mcptStr=`✗ p=${m.p_value.toFixed(3)}`;mcptColor=RED;}
    wfTbody.innerHTML+=`<tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px">${m.name}</td><td style="padding:8px 12px;text-align:right;color:${pfColor};font-weight:600">${pf}</td><td style="padding:8px 12px;text-align:right;color:${srColor};font-weight:600">${sr}</td><td style="padding:8px 12px;text-align:right;color:${wfeColor};font-weight:600">${wfeStr}</td><td style="padding:8px 12px;text-align:right;color:var(--muted)">${m.n_windows||'—'}</td><td style="padding:8px 12px;text-align:right;color:${mcptColor};font-size:11px;font-weight:600">${mcptStr}</td></tr>`;
  });
  const clusterSummaryEl=document.getElementById('mcpt-cluster-summary');
  const cp=qd.cluster_performance||[];
  if(cp.length&&clusterSummaryEl){let html='<div class="chart-subtitle" style="margin-bottom:8px;margin-top:12px">Adaptive Pool — Last Window Cluster Assignment</div><div style="display:flex;gap:10px;flex-wrap:wrap">';cp.forEach(row=>{const cc=clusterColor(row.cluster);const pf=row.is_pf!=null?row.is_pf.toFixed(3):'—';const pfColor=row.is_pf>=1.5?GREEN:row.is_pf>=1.0?'#f59e0b':RED;html+=`<div class="hero-card" style="padding:10px 14px;min-width:130px;border:1px solid ${cc.border}44"><div style="color:${cc.text};font-weight:700;font-size:12px">Cluster ${row.cluster}</div><div style="color:#e5e7eb;font-size:13px;margin:4px 0">${row.strategy||'—'}</div><div style="color:${pfColor};font-size:12px">PF ${pf}</div><div style="color:var(--muted);font-size:11px">${row.n_bars} bars</div></div>`;});html+='</div>';clusterSummaryEl.innerHTML=html;}
}

// ── Panel Q3: Equity Curve ────────────────────────────────────────────────────
function buildEquityChart(equityCurve, clusterHistory) {
  if(!equityCurve.length){showNoData('chart-equity','no-data-equity');return;}
  const labels=equityCurve.map(d=>d.date);
  const quantRet=equityCurve.map(d=>d.quant_cumlog!=null?(d.quant_cumlog*100).toFixed(2):null);
  const bhRet=equityCurve.map(d=>d.buyhold_cumlog!=null?(d.buyhold_cumlog*100).toFixed(2):null);
  const regimeMap={};(clusterHistory||[]).forEach(r=>{regimeMap[r.date]=r.cluster;});
  const ctx=document.getElementById('chart-equity').getContext('2d');
  new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Quant (OOS)',data:quantRet,borderColor:GOLD,borderWidth:2,pointRadius:0,tension:0.2,fill:false},{label:'Buy & Hold',data:bhRet,borderColor:GREY,borderWidth:1.5,borderDash:[6,4],pointRadius:0,tension:0.2,fill:false}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{boxWidth:14,font:{size:11},color:'#9ca3af'}},tooltip:{callbacks:{title:items=>items[0].label,label:item=>{const val=parseFloat(item.raw);return` ${item.dataset.label}: ${val>=0?'+':''}${val.toFixed(2)}%`;},afterBody:items=>{const regime=regimeMap[items[0].label];return regime?[`Regime: ${regime}`]:[];}}}},scales:{x:{ticks:{maxTicksLimit:10,maxRotation:45,font:{size:10}},grid:{color:SQ.grid}},y:{title:{display:true,text:'Cumulative log return %',font:{size:11}},grid:{color:SQ.grid},ticks:{callback:v=>v+'%'}}}}});
}

// ── Rolling Chart ─────────────────────────────────────────────────────────────
function buildRollingChart(equity) {
  if(!equity||equity.length<90)return;
  const data=equity.slice(89);
  const labels=data.map(d=>d.date);
  const sharpes=data.map(d=>d.rolling_sharpe!=null?parseFloat(d.rolling_sharpe):null);
  const dds=data.map(d=>d.drawdown!=null?(parseFloat(d.drawdown)*100):null);
  const ctx=document.getElementById('chart-rolling').getContext('2d');
  new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Rolling 90d Sharpe',data:sharpes,borderColor:GOLD,borderWidth:2,pointRadius:0,tension:0.3,fill:false,yAxisID:'ySharpe'},{label:'Drawdown %',data:dds,borderColor:RED,borderWidth:1.5,pointRadius:0,tension:0.2,fill:{target:'origin',above:RED+'00',below:RED+'33'},yAxisID:'yDD'},{label:'_zero',data:labels.map(()=>0),borderColor:SQ.neutral,borderWidth:1,borderDash:[4,4],pointRadius:0,fill:false,yAxisID:'ySharpe'}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{filter:item=>!item.text.startsWith('_'),boxWidth:14,font:{size:11},color:'#9ca3af'}},tooltip:{callbacks:{label:item=>{if(item.datasetIndex===0)return` Sharpe (90d): ${(item.raw||0).toFixed(2)}`;if(item.datasetIndex===1)return` Drawdown: ${(item.raw||0).toFixed(2)}%`;return null;},filter:item=>item.datasetIndex<2}}},scales:{x:{ticks:{maxTicksLimit:10,maxRotation:45,font:{size:10}},grid:{color:SQ.grid}},ySharpe:{position:'left',grid:{color:SQ.grid},title:{display:true,text:'Sharpe (90d rolling)',font:{size:11}},ticks:{font:{size:10}}},yDD:{position:'right',grid:{drawOnChartArea:false},title:{display:true,text:'Drawdown %',font:{size:11}},ticks:{callback:v=>v+'%',font:{size:10}}}}}});
}

// ── MCPT Histogram ────────────────────────────────────────────────────────────
function buildMcptHistogram(strategies) {
  const don=(strategies||[]).find(s=>s.name==='Donchian Breakout');
  if(!don||!don.permuted_pfs||don.permuted_pfs.length===0)return;
  document.getElementById('quant-mcpt-hist-panel').style.display='';
  const perms=don.permuted_pfs.map(Number);
  const realPF=don.profit_factor||don.real_profit_factor||0;
  const n_bins=20,lo=Math.min(...perms),hi=Math.max(Math.max(...perms),realPF)*1.01,binW=(hi-lo)/n_bins;
  const counts=Array(n_bins).fill(0);
  perms.forEach(p=>{const idx=Math.min(Math.floor((p-lo)/binW),n_bins-1);counts[idx]++;});
  const labels=counts.map((_,i)=>(lo+i*binW).toFixed(3));
  const bgColors=counts.map((_,i)=>{const binLo=lo+i*binW,binHi=binLo+binW;return(realPF>=binLo&&realPF<binHi)?'#d4a01788':'#3b82f633';});
  const borderColors=bgColors.map(c=>c.startsWith('#d4')?GOLD:'#3b82f6');
  const ctx=document.getElementById('chart-mcpt-hist').getContext('2d');
  new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'Permuted PF count',data:counts,backgroundColor:bgColors,borderColor:borderColors,borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>`PF bin: ${items[0].label}`,label:item=>` ${item.raw} permutations`,afterBody:items=>{const binLo=lo+items[0].dataIndex*binW,binHi=binLo+binW;if(realPF>=binLo&&realPF<binHi)return[`← Real PF: ${realPF.toFixed(4)}`];return[];}}},annotation:undefined},scales:{x:{title:{display:true,text:'Profit Factor',font:{size:11}},ticks:{maxRotation:45,font:{size:9},maxTicksLimit:12},grid:{color:SQ.grid}},y:{title:{display:true,text:'Count',font:{size:11}},grid:{color:SQ.grid},ticks:{font:{size:10}}}}}});
  const wrap=document.getElementById('chart-mcpt-hist').parentElement;
  const pval=don.p_value!=null?don.p_value.toFixed(4):'—';
  const statusColor=don.validated?GREEN:(don.p_value<0.10?'#f59e0b':RED);
  const statusText=don.validated?'VALIDATED':(don.p_value<0.10?'BORDERLINE':'REJECTED');
  const lbl=document.createElement('div');
  lbl.style.cssText='font-size:12px;color:var(--muted);margin-top:8px;text-align:center';
  lbl.innerHTML=`Real PF: <span style="color:${GOLD};font-weight:700">${realPF.toFixed(4)}</span> &nbsp;·&nbsp; p-value: <span style="font-weight:600">${pval}</span> &nbsp;·&nbsp; <span style="color:${statusColor};font-weight:700">${statusText}</span> &nbsp;·&nbsp; ${don.n_permutations||perms.length} permutations`;
  wrap.appendChild(lbl);
}

// ── Cluster Timeline ──────────────────────────────────────────────────────────
function buildClusterTimeline(equityCurve, clusterHistory) {
  if(!equityCurve||equityCurve.length<10)return;
  if(!clusterHistory||clusterHistory.length<10)return;
  document.getElementById('quant-regime-timeline-panel').style.display='';
  const clMap={};clusterHistory.forEach(r=>{clMap[r.date]=r.cluster;});
  const labels=equityCurve.map(d=>d.date);
  const prices=equityCurve.map(d=>d.close_price!=null?d.close_price:null);
  const ctx=document.getElementById('chart-regime-timeline').getContext('2d');
  new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Gold Price (AUD)',data:prices,borderColor:GOLD,borderWidth:1.5,pointRadius:0,tension:0.1,fill:false,segment:{borderColor:ctx2=>{const d=equityCurve[ctx2.p1DataIndex];if(!d)return GOLD;const cid=clMap[d.date];return cid!=null?clusterColor(cid).text:GOLD;}}}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>items[0].label,label:item=>` Price: ${(item.raw||0).toFixed(0)} AUD`,afterLabel:item=>{const cid=clMap[item.label];return cid!=null?` Cluster: ${cid}`:' Cluster: —';}}}},scales:{x:{ticks:{maxTicksLimit:10,maxRotation:45,font:{size:10}},grid:{color:SQ.grid}},y:{grid:{color:SQ.grid},ticks:{callback:v=>'$'+v.toFixed(0),font:{size:10}}}}}});
  const seenClusters=[...new Set(clusterHistory.map(r=>r.cluster))].sort((a,b)=>a-b);
  const wrap=document.getElementById('chart-regime-timeline').parentElement;
  const lgd=document.createElement('div');lgd.style.cssText='display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:11px';
  seenClusters.forEach(cid=>{const c=clusterColor(cid);lgd.innerHTML+=`<span style="color:${c.text}">■ Cluster ${cid}</span>`;});
  wrap.appendChild(lgd);
}

// ── Parameter Heatmap ─────────────────────────────────────────────────────────
function buildParamHeatmap(grid) {
  if(!grid||grid.length===0)return;
  document.getElementById('quant-param-heatmap-panel').style.display='';
  const wrap=document.getElementById('param-heatmap-wrap');
  const entries=[...new Set(grid.map(g=>g.entry_lb))].sort((a,b)=>a-b);
  const exits=[...new Set(grid.map(g=>g.exit_lb))].sort((a,b)=>a-b);
  const lookup={};grid.forEach(g=>{if(!lookup[g.entry_lb])lookup[g.entry_lb]={};lookup[g.entry_lb][g.exit_lb]=g.pf;});
  const allPfs=grid.map(g=>g.pf).filter(p=>p>0);
  const minPf=Math.min(...allPfs),maxPf=Math.max(...allPfs);
  function pfToColor(pf){if(!pf||pf===0)return'#1a1a1a';const t=Math.max(0,Math.min(1,(pf-minPf)/(maxPf-minPf)));if(t<0.5){const r=Math.round(239*(1-t*2)+42*t*2),g=Math.round(68*(1-t*2)+68*t*2),b=Math.round(68*(1-t*2)+68*t*2);return`rgba(${r},${g},${b},0.7)`;}else{const u=(t-0.5)*2,r=Math.round(42*(1-u)+34*u),g=Math.round(68*(1-u)+197*u),b=Math.round(68*(1-u)+94*u);return`rgba(${r},${g},${b},0.7)`;}}
  let html='<table style="border-collapse:collapse;font-size:11px;min-width:400px"><thead><tr><th style="padding:4px 6px;color:var(--muted);text-align:right">Entry↓ Exit→</th>';
  exits.forEach(ex=>{html+=`<th style="padding:4px 6px;color:var(--muted);text-align:center">${ex}</th>`;});
  html+='</tr></thead><tbody>';
  entries.forEach(en=>{html+=`<tr><td style="padding:4px 6px;color:var(--muted);text-align:right;font-weight:600">${en}</td>`;exits.forEach(ex=>{const pf=(lookup[en]||{})[ex];const color=pfToColor(pf);const text=pf!=null?pf.toFixed(2):'—';const textColor=pf!=null&&pf>=1.0?'#e5e7eb':'#6b7280';html+=`<td style="padding:3px 5px;background:${color};text-align:center;color:${textColor};cursor:default" title="Entry=${en} Exit=${ex} PF=${text}">${text}</td>`;});html+='</tr>';});
  html+=`</tbody></table><div style="font-size:11px;color:var(--muted);margin-top:8px">PF range: ${minPf.toFixed(3)} – ${maxPf.toFixed(3)} &nbsp;·&nbsp; ${grid.length} combinations &nbsp;·&nbsp; <span style="color:${GREEN}">■</span> PF &gt; 1.0 &nbsp;<span style="color:${RED}">■</span> PF &lt; 1.0</div>`;
  wrap.innerHTML=html;
}

// ── Per-Cluster Perf Table ────────────────────────────────────────────────────
function buildClusterPerfTable(clusterPerf, tradeLog) {
  if(!clusterPerf||!clusterPerf.length)return;
  document.getElementById('quant-regime-perf-panel').style.display='';
  const clusterTrades={};
  (tradeLog||[]).forEach(t=>{const cid=t.cluster;if(cid==null)return;if(!clusterTrades[cid])clusterTrades[cid]={n:0,wins:0};clusterTrades[cid].n++;if(t.win)clusterTrades[cid].wins++;});
  const tbody=document.getElementById('cluster-perf-tbody');tbody.innerHTML='';
  function fmtParams(params){if(!params||!Object.keys(params).length)return'';const labels={entry_bars:'entry',exit_bars:'exit',period:'period',std_mult:'σ',exit_mult:'exit σ',fast:'fast',slow:'slow',atr_period:'atr',atr_mult:'mult',hold_bars:'hold',best_lookback:'lookback',k:'k',ema_period:'ema',back_candles:'back',min_above:'min↑',long_only:null,tenkan_period:null,kijun_period:null,senkou_b_period:null,cloud_shift:null,ichimoku_back:null};const parts=[];Object.entries(params).forEach(([k,v])=>{if(labels[k]===null)return;if(typeof v==='boolean')return;const lbl=labels[k]||k;const disp=typeof v==='number'?(Number.isInteger(v)?v:v.toFixed(2)):v;parts.push(`${lbl}: ${disp}`);});return parts.join(' / ');}
  function fmtFeatureProfile(fp){if(!fp||!fp.length)return'<span style="color:var(--muted);font-size:11px">—</span>';return fp.map(f=>{const arrow=f.dir==='high'?'▲':'▼';const color=f.dir==='high'?GREEN:'#f472b6';const zAbs=Math.abs(f.z);const weight=zAbs>=2?'700':'400';let valStr=f.value;if(typeof f.value==='number'){valStr=Math.abs(f.value)<0.01?f.value.toExponential(1):Math.abs(f.value)<10?f.value.toFixed(3):f.value.toFixed(1);}const zStr=(f.z>=0?'+':'')+f.z.toFixed(2);return`<span title="value=${valStr}" style="display:inline-block;margin:1px 3px 1px 0;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:${weight};background:#1a2030;border:1px solid ${color}30;color:${color}">${arrow} ${f.feature.replace(/_/g,' ')} <span style="opacity:0.7;font-size:10px">${zStr}σ</span></span>`;}).join('');}
  [...clusterPerf].sort((a,b)=>a.cluster-b.cluster).forEach(row=>{
    const cid=row.cluster,cc=clusterColor(cid),pf=row.is_pf;
    const pfColor=pf==null?'var(--muted)':pf>=1.5?GREEN:pf>=1.0?'#f59e0b':RED;
    const note=row.n_bars<50?' <span style="color:#f59e0b;font-size:11px">⚠ fallback</span>':'';
    const paramsStr=fmtParams(row.params||{});
    const stratCell=row.strategy?`<span style="font-weight:600">${row.strategy}</span>${paramsStr?`<br><span style="font-size:11px;color:var(--muted)">${paramsStr}</span>`:''}`+note:`—${note}`;
    const labelTokens=(row.label||`Cluster ${cid}`).split(' | ');
    const labelHtml=labelTokens.map(t=>`<span style="display:inline-block;margin:1px 2px 1px 0;padding:1px 6px;border-radius:3px;font-size:11px;background:${cc.bg};color:${cc.text};border:1px solid ${cc.border}30">${t}</span>`).join('');
    const ct=clusterTrades[cid]||{},nTrades=ct.n||0;
    const winPct=nTrades>0?(ct.wins/ct.n*100).toFixed(0)+'%':'—';
    const winColor=nTrades>0?(ct.wins/ct.n>=0.55?GREEN:ct.wins/ct.n>=0.45?'#f59e0b':RED):'var(--muted)';
    tbody.innerHTML+=`<tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;font-weight:700;white-space:nowrap"><span style="color:${cc.text};background:${cc.bg};padding:2px 10px;border-radius:4px;border:1px solid ${cc.border}">C${cid}</span></td><td style="padding:8px 12px;line-height:1.6">${labelHtml}</td><td style="padding:8px 12px;color:#e5e7eb;line-height:1.6">${stratCell}</td><td style="padding:8px 12px;text-align:right;color:${pfColor};font-weight:700;white-space:nowrap">${pf!=null?pf.toFixed(3):'—'}</td><td style="padding:8px 12px;text-align:right;color:var(--muted);white-space:nowrap">${nTrades>0?nTrades:'—'}</td><td style="padding:8px 12px;text-align:right;color:${winColor};font-weight:${nTrades>0?'600':'400'};white-space:nowrap">${winPct}</td><td style="padding:8px 12px;text-align:right;color:var(--muted);white-space:nowrap">${row.n_bars!=null?row.n_bars.toLocaleString():'—'}</td><td style="padding:8px 12px">${fmtFeatureProfile(row.feature_profile||[])}</td></tr>`;
  });
}

// ── Monthly Calendar ──────────────────────────────────────────────────────────
function buildMonthlyCalendar(equityCurve) {
  if(!equityCurve||equityCurve.length<30)return;
  document.getElementById('quant-monthly-panel').style.display='';
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const byYM={};
  equityCurve.forEach(d=>{if(d.quant_cumlog==null)return;const dt=d.date.split('-');const ym=`${dt[0]}-${dt[1]}`;if(!byYM[ym])byYM[ym]=[];byYM[ym].push(d.quant_cumlog);});
  const monthlyRet={};Object.entries(byYM).forEach(([ym,vals])=>{monthlyRet[ym]=vals[vals.length-1]-vals[0];});
  const years=[...new Set(Object.keys(monthlyRet).map(ym=>ym.split('-')[0]))].sort();
  const allRet=Object.values(monthlyRet);const maxAbs=Math.max(...allRet.map(Math.abs),0.001);
  function retToColor(ret){if(ret==null)return'#1e1e1e';const t=Math.max(-1,Math.min(1,ret/maxAbs));if(t>=0){const g=Math.round(34+163*t);return`rgba(34,${g},94,0.75)`;}else{const r=Math.round(239+(-t)*0);return`rgba(${r},68,68,${0.3+Math.abs(t)*0.5})`;}}
  let html='<table style="border-collapse:collapse;font-size:12px"><thead><tr><th style="padding:4px 8px;color:var(--muted);text-align:right">Year</th>';
  MONTHS.forEach(m=>{html+=`<th style="padding:4px 8px;color:var(--muted);text-align:center;min-width:44px">${m}</th>`;});
  html+='<th style="padding:4px 8px;color:var(--muted);text-align:right">Annual</th></tr></thead><tbody>';
  years.forEach(yr=>{let annualTotal=0;html+=`<tr><td style="padding:4px 8px;color:var(--muted);font-weight:600;text-align:right">${yr}</td>`;MONTHS.forEach((_,mi)=>{const ym=`${yr}-${String(mi+1).padStart(2,'0')}`;const ret=monthlyRet[ym];const col=retToColor(ret!=null?ret:null);const txt=ret!=null?(ret*100).toFixed(1)+'%':'';const textCol=ret!=null&&Math.abs(ret)>0.005?'#e5e7eb':'#6b7280';if(ret!=null)annualTotal+=ret;html+=`<td style="padding:4px 6px;background:${col};text-align:center;color:${textCol};border-radius:3px" title="${ym}: ${txt}">${txt}</td>`;});const annCol=retToColor(annualTotal);html+=`<td style="padding:4px 8px;text-align:right;background:${annCol};border-radius:3px;font-weight:700;color:#e5e7eb">${(annualTotal*100).toFixed(1)}%</td></tr>`;});
  html+='</tbody></table>';document.getElementById('monthly-calendar-wrap').innerHTML=html;
}

// ── Long/Short Breakdown ──────────────────────────────────────────────────────
function buildLongShortBreakdown(ls) {
  if(!ls||(!ls.long&&!ls.short))return;
  document.getElementById('quant-ls-panel').style.display='';
  const wrap=document.getElementById('ls-breakdown-wrap');wrap.innerHTML='';
  ['long','short'].forEach(side=>{
    const d=ls[side];if(!d)return;
    const pfColor=d.profit_factor>=1.2?GREEN:d.profit_factor>=1.0?'#f59e0b':RED;
    const sideColor=side==='long'?GREEN:RED;
    const totalColor=d.total_log_return>=0?GREEN:RED;
    wrap.innerHTML+=`<div class="hero-card" style="min-width:220px;padding:16px 20px"><div style="font-size:18px;font-weight:800;color:${sideColor};margin-bottom:10px">${side.toUpperCase()} POSITIONS</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><div class="hero-label">Profit Factor</div><div class="hero-value" style="color:${pfColor}">${d.profit_factor.toFixed(3)}</div></div><div><div class="hero-label">Win Rate</div><div class="hero-value">${d.win_rate.toFixed(1)}%</div></div><div><div class="hero-label">Active Bars</div><div class="hero-value" style="font-size:16px">${d.n_bars.toLocaleString()}</div></div><div><div class="hero-label">Total Log Return</div><div class="hero-value" style="color:${totalColor};font-size:16px">${(d.total_log_return*100).toFixed(2)}%</div></div></div></div>`;
  });
}

// ── Model Metrics ─────────────────────────────────────────────────────────────
function buildModelMetrics(equityCurve, strategies, tradeLog, qd) {
  if(!equityCurve||equityCurve.length<20)return;
  document.getElementById('quant-metrics-panel').style.display='';
  const sub=document.getElementById('metrics-subtitle');
  if(sub&&qd){const ticker=(qd.ticker||'').replace('=','/');const interval=(qd.interval||'').toUpperCase();const label=qd.asset_label||ticker;sub.textContent=`Walk-forward out-of-sample · ${label} (${ticker}) · ${interval} bars`;}
  const oosBars=equityCurve.filter(d=>d.quant_cumlog!=null&&d.quant_cumlog!==0);
  const allBars=oosBars.length?oosBars:equityCurve;
  const startDate=allBars[0].date,endDate=allBars[allBars.length-1].date;
  document.getElementById('metrics-date-range').textContent=`Start: ${startDate}   End: ${endDate}`;
  const dailyRets=[];for(let i=1;i<allBars.length;i++){dailyRets.push((allBars[i].quant_cumlog||0)-(allBars[i-1].quant_cumlog||0));}
  const n=dailyRets.length,sumRet=dailyRets.reduce((a,b)=>a+b,0),meanRet=sumRet/n;
  const variance=dailyRets.reduce((a,r)=>a+(r-meanRet)**2,0)/(n-1);
  const stdRet=Math.sqrt(variance);
  const annFactor=252,totalLogRet=allBars[allBars.length-1].quant_cumlog||0;
  const totalSimple=(Math.exp(totalLogRet)-1)*100,nTradingDays=n;
  const annLogRet=totalLogRet*(annFactor/nTradingDays),annSimpleRet=(Math.exp(annLogRet)-1)*100,annVol=stdRet*Math.sqrt(annFactor)*100;
  const sharpe=stdRet>0?(meanRet/stdRet)*Math.sqrt(annFactor):null;
  const maxDd=Math.min(...allBars.map(d=>d.drawdown||0))*100;
  const calmar=maxDd<0?annSimpleRet/Math.abs(maxDd):null;
  const downRets=dailyRets.filter(r=>r<0);
  const downVar=downRets.length>1?downRets.reduce((a,r)=>a+r*r,0)/downRets.length:null;
  const downStd=downVar?Math.sqrt(downVar):null;
  const sortino=downStd?(meanRet/downStd)*Math.sqrt(annFactor):null;
  const upRets=dailyRets.filter(r=>r>0);
  const upVol=upRets.length>1?Math.sqrt(upRets.reduce((a,r)=>a+r*r,0)/upRets.length)*Math.sqrt(annFactor)*100:null;
  const downVol=downStd?downStd*Math.sqrt(annFactor)*100:null;
  const bars1M=allBars.slice(-21),ret1M=bars1M.length>1?(Math.exp((bars1M[bars1M.length-1].quant_cumlog||0)-(bars1M[0].quant_cumlog||0))-1)*100:null;
  const bars1Y=allBars.slice(-252),ret1Y=bars1Y.length>20?(Math.exp((bars1Y[bars1Y.length-1].quant_cumlog||0)-(bars1Y[0].quant_cumlog||0))-1)*100:null;
  const endYear=endDate.slice(0,4);
  const ytdStart=allBars.findIndex(d=>d.date>=endYear+'-01-01');
  const barsYTD=ytdStart>=0?allBars.slice(ytdStart):[];
  const retYTD=barsYTD.length>1?(Math.exp((barsYTD[barsYTD.length-1].quant_cumlog||0)-(barsYTD[0].quant_cumlog||0))-1)*100:null;
  const prevYear=String(parseInt(endYear)-1);
  const pyStart=allBars.findIndex(d=>d.date>=prevYear+'-01-01'),pyEnd=allBars.findIndex(d=>d.date>=endYear+'-01-01');
  const barsPY=pyStart>=0&&pyEnd>pyStart?allBars.slice(pyStart,pyEnd):[];
  const retPY=barsPY.length>20?(Math.exp((barsPY[barsPY.length-1].quant_cumlog||0)-(barsPY[0].quant_cumlog||0))-1)*100:null;
  const skew=n>2&&stdRet>0?(dailyRets.reduce((a,r)=>a+((r-meanRet)/stdRet)**3,0)/n):null;
  const kurt=n>3&&stdRet>0?(dailyRets.reduce((a,r)=>a+((r-meanRet)/stdRet)**4,0)/n)-3:null;
  const adaptiveStrat=(strategies||[]).find(s=>s.name&&s.name.toLowerCase().includes('adaptive'));
  const pf=adaptiveStrat?adaptiveStrat.profit_factor:null,pfSharpe=adaptiveStrat?adaptiveStrat.sharpe_ratio:null;
  const trades=(tradeLog||[]).filter(t=>t.cluster!=null||t.entry_date);
  const wins=trades.filter(t=>t.win).length,winRate=trades.length?(wins/trades.length*100):null;
  function pct(v,dp=1){if(v==null||isNaN(v))return'<span style="color:#4b5563">—</span>';const color=v>0?GREEN:v<0?RED:'var(--muted)';return`<span style="color:${color}">${v>0?'+':''}${v.toFixed(dp)}%</span>`;}
  function pctPA(v,dp=1){if(v==null||isNaN(v))return'<span style="color:#4b5563">—</span>';const color=v>0?GREEN:v<0?RED:'var(--muted)';return`<span style="color:${color}">${v>0?'+':''}${v.toFixed(dp)}% p.a.</span>`;}
  function ratio(v,dp=2,goodAbove=1.0){if(v==null||isNaN(v))return'<span style="color:#4b5563">—</span>';const color=v>=goodAbove?GREEN:v>=0?'#f59e0b':RED;return`<span style="color:${color}">${v.toFixed(dp)}</span>`;}
  function plain(v,dp=2){if(v==null||isNaN(v))return'<span style="color:#4b5563">—</span>';return`<span>${v.toFixed(dp)}</span>`;}
  function na(){return'<span style="color:#4b5563">—</span>';}
  function section(title,rows){const rowsHtml=rows.map(([label,value])=>`<div class="metrics-row"><span class="metrics-label">${label}</span><span class="metrics-value">${value}</span></div>`).join('');return`<div class="metrics-section"><div class="metrics-section-header">${title}</div>${rowsHtml}</div>`;}
  function th(text,tip){return`<span class="tip tip-down" data-tip="${tip}">${text}</span>`;}
  const grid=document.getElementById('metrics-grid');
  grid.innerHTML=section('Performance',[
    ['YTD',pct(retYTD)],
    ['1 Month',pct(ret1M)],
    ['Previous Year',pct(retPY)],
    ['1Y',pct(ret1Y)],
    [th('Since Inception','Annualised simple return calculated from the first to last OOS bar.'),pctPA(annSimpleRet)],
    ['Total Return',pct(totalSimple)],
    [th('Profit Factor','Total gross profit ÷ total gross loss across all OOS trades.&#10;> 1.0 = profitable  |  > 1.2 = meaningful edge  |  < 1.0 = losing strategy.'),ratio(pf,3,1.0)],
    [th('Win Rate','% of trades that closed with a positive return.&#10;High win rate alone means nothing — check Profit Factor too.'),winRate!=null?ratio(winRate/100,0,50)+` <span style="font-size:11px;color:var(--muted)">(${wins}/${trades.length})</span>`:na()]
  ])+section('Risk-Adjusted',[
    [th('Sharpe (0% RF)','Annualised return ÷ annualised volatility, with 0% risk-free rate.&#10;Measures return per unit of total risk.&#10;> 0.5 = decent  |  > 1.0 = good  |  > 2.0 = exceptional.'),ratio(sharpe,2,1.0)],
    [th('Sharpe (OOS)','Sharpe ratio reported directly by the walk-forward backtest engine.&#10;Complement to the equity-curve Sharpe — should be similar if OOS data is consistent.'),ratio(pfSharpe,2,1.0)],
    [th('Calmar Ratio','Annualised return ÷ max drawdown.&#10;Measures how much return you get per unit of worst-case pain.&#10;> 0.5 = decent  |  > 1.0 = good.'),ratio(calmar,2,0.5)],
    [th('Max Drawdown','Largest peak-to-trough decline in the OOS equity curve.&#10;Shown as a percentage. Lower (less negative) = better.'),pct(maxDd)],
    [th('Sortino Ratio','Like Sharpe, but only penalises downside volatility (negative return days).&#10;Rewards strategies that have high upside variance but low downside variance.&#10;> 1.0 = good.'),ratio(sortino,2,1.0)],
    [th('Skewness','Asymmetry of the daily return distribution.&#10;Positive = occasional large gains, frequent small losses (preferred).&#10;Negative = occasional large losses — fat left tail (bad for drawdowns).'),plain(skew)],
    [th('Kurtosis (excess)','Tail fatness vs a normal distribution.&#10;Positive = more extreme events than normal (leptokurtic).&#10;Negative = thinner tails (platykurtic). Near 0 = normal-like.'),plain(kurt)],
    ['N Trades',`<span>${trades.length}</span>`]
  ])+section('Volatility',[
    ['1Y Annualised',pct(ret1Y!=null?annVol:null)],
    ['Since Inception',pct(annVol)],
    [th('Upside Volatility','Annualised standard deviation of only the positive daily return bars.&#10;High upside vol = large winning days — generally desirable.'),upVol!=null?`<span>${upVol.toFixed(1)}%</span>`:na()],
    [th('Downside Volatility','Annualised standard deviation of only the negative daily return bars.&#10;Used as the denominator in the Sortino Ratio. Lower = better.'),downVol!=null?`<span>${downVol.toFixed(1)}%</span>`:na()],
    [th('Daily Std Dev','Standard deviation of individual daily log-returns.&#10;Raw measure of how much the strategy swings day-to-day.'),plain(stdRet*100)+' <span style="font-size:11px;color:var(--muted)">%</span>']
  ])+section('Benchmark',[
    [th('Corr. to Equities','Correlation of daily returns to a broad equity index.&#10;Not yet calculated — requires equity benchmark data feed.')  ,na()],
    [th('Corr. to Benchmark','Correlation of daily returns to buy-and-hold XAU/AUD.&#10;Not yet calculated.'),na()],
    [th('Beta to Benchmark','Sensitivity of strategy returns to XAU/AUD moves.&#10;Beta < 1 = less volatile than gold. Not yet calculated.'),na()],
    [th('Buy & Hold Return','Total return from simply holding XAU/AUD over the same OOS period.&#10;Baseline to beat — your alpha is Squant Return minus this.'),  (()=>{const bh=allBars[allBars.length-1].buyhold_cumlog;return bh!=null?pct((Math.exp(bh)-1)*100):na();})()],
    [th('B&H Ann. Return','Annualised buy-and-hold return — apples-to-apples comparison to Since Inception above.'),  (()=>{const bh=allBars[allBars.length-1].buyhold_cumlog;if(bh==null)return na();const bhAnn=(Math.exp(bh*annFactor/nTradingDays)-1)*100;return pctPA(bhAnn);})()]
  ]);
}

// ── Trade Log ─────────────────────────────────────────────────────────────────
function buildTradeLog(tradeLog) {
  if(!tradeLog||tradeLog.length===0)return;
  document.getElementById('quant-trade-log-panel').style.display='';
  const tbody=document.getElementById('trade-log-tbody');tbody.innerHTML='';
  [...tradeLog].reverse().forEach(t=>{
    const retColor=t.win?GREEN:RED,dirColor=t.direction==='long'?GREEN:'#f472b6';
    const cid=t.cluster!=null?t.cluster:null,cc=clusterColor(cid);
    const cidBadge=cid!=null?`<span style="color:${cc.text};background:${cc.bg};padding:1px 7px;border-radius:3px;border:1px solid ${cc.border};font-size:11px">C${cid}</span>`:'<span style="color:var(--muted)">—</span>';
    const regime=t.regime||'—',regimeShort=regime.replace('QUIET_','Q·').replace('TREND_','T·').replace('VOLATILE_','V·');
    tbody.innerHTML+=`<tr style="border-bottom:1px solid #222"><td style="padding:5px 10px">${cidBadge}</td><td style="padding:5px 10px;color:var(--muted)">${t.entry_date}</td><td style="padding:5px 10px;color:var(--muted)">${t.exit_date}</td><td style="padding:5px 10px;color:${dirColor};font-weight:600">${t.direction.toUpperCase()}</td><td style="padding:5px 10px;text-align:right;color:var(--muted)">${t.bars}</td><td style="padding:5px 10px;text-align:right;color:${retColor};font-weight:600">${t.return_pct>0?'+':''}${t.return_pct}%</td><td style="padding:5px 10px;font-size:11px;color:var(--muted)">${regimeShort}</td><td style="padding:5px 10px;text-align:center;color:${retColor}">${t.win?'✓':'✗'}</td></tr>`;
  });
}

// ── Trade Signal Chart ────────────────────────────────────────────────────────
function buildTradeSignalChart(equityCurve, tradeLog, clusterPerf) {
  if(!equityCurve||equityCurve.length<5)return;
  document.getElementById('quant-trade-chart-panel').style.display='';

  // Full history price from equity curve
  const priceLabels=equityCurve.map(d=>d.date);
  const priceValues=equityCurve.map(d=>d.close_price);

  // Find IS→OOS boundary (first bar where strategy is live)
  const oosBar=equityCurve.find(d=>d.quant_cumlog!=null&&d.quant_cumlog!==0);
  const oosDate=oosBar?oosBar.date:null;
  const oosIdx=oosDate?priceLabels.indexOf(oosDate):-1;

  // All trades (full history, no date filter)
  const allTrades=tradeLog||[];
  const clusterLabelMap={};(clusterPerf||[]).forEach(cp=>{clusterLabelMap[cp.cluster]=cp.label||`Cluster ${cp.cluster}`;});
  const clusterIds=[...new Set(allTrades.map(t=>t.cluster).filter(c=>c!=null))].sort();

  let entryDatasets;
  if(clusterIds.length){
    entryDatasets=clusterIds.map(cid=>{
      const cc=clusterColor(cid);
      const pts=allTrades.filter(t=>t.cluster===cid);
      return{type:'scatter',label:`C${cid} Entry`,data:pts.map(t=>({x:t.entry_date,y:t.entry_price})),backgroundColor:pts.map(t=>t.direction==='long'?cc.text+'ee':'#f472b6ee'),borderColor:pts.map(t=>t.direction==='long'?cc.text:'#f472b6'),borderWidth:1,pointStyle:pts.map(t=>t.direction==='long'?'triangle':'rectRot'),pointRadius:6,pointHoverRadius:8,_meta:pts};
    });
  } else {
    const longs=allTrades.filter(t=>t.direction==='long');
    const shorts=allTrades.filter(t=>t.direction!=='long');
    entryDatasets=[];
    if(longs.length)entryDatasets.push({type:'scatter',label:'Long Entry',data:longs.map(t=>({x:t.entry_date,y:t.entry_price})),backgroundColor:'${GREEN}ee',borderColor:GREEN,borderWidth:1,pointStyle:'triangle',pointRadius:6,pointHoverRadius:8,_meta:longs});
    if(shorts.length)entryDatasets.push({type:'scatter',label:'Short Entry',data:shorts.map(t=>({x:t.entry_date,y:t.entry_price})),backgroundColor:'#f472b6ee',borderColor:'#f472b6',borderWidth:1,pointStyle:'rectRot',pointRadius:6,pointHoverRadius:8,_meta:shorts});
  }
  // Custom canvas markers for exits: tick=win, cross=loss; green=long, pink=short
  function exitMarker(win, dir, size=13) {
    const c=document.createElement('canvas');c.width=size;c.height=size;
    const cx=c.getContext('2d');
    const col=dir==='long'?GREEN:'#f472b6';
    cx.strokeStyle=col;cx.lineWidth=2.2;cx.lineCap='round';cx.lineJoin='round';
    const p=2;
    if(win){cx.beginPath();cx.moveTo(p,size/2);cx.lineTo(size/2-0.5,size-p);cx.lineTo(size-p,p);cx.stroke();}
    else{cx.beginPath();cx.moveTo(p,p);cx.lineTo(size-p,size-p);cx.moveTo(size-p,p);cx.lineTo(p,size-p);cx.stroke();}
    return c;
  }
  function exitDatasets(trades) {
    const groups={lw:[],ll:[],sw:[],sl:[]};
    trades.forEach(t=>{
      const k=(t.direction==='long'?'l':'s')+(t.win?'w':'l');
      groups[k].push(t);
    });
    return Object.entries({lw:['Long Win',true,'long'],ll:['Long Loss',false,'long'],sw:['Short Win',true,'short'],sl:['Short Loss',false,'short']})
      .filter(([k])=>groups[k].length)
      .map(([k,[lbl,win,dir]])=>({
        type:'scatter',label:lbl,
        data:groups[k].map(t=>({x:t.exit_date,y:t.exit_price})),
        pointStyle:exitMarker(win,dir),
        pointRadius:7,pointHoverRadius:9,
        backgroundColor:'transparent',borderColor:'transparent',
        _meta:groups[k]
      }));
  }
  const exitDatasetsArr=exitDatasets(allTrades);

  const oosBoundaryPlugin={}; // no IS/OOS line — entire curve is OOS (walk-forward)

  const ctx=document.getElementById('chart-trade-signals').getContext('2d');
  _tradeSignalChart=new Chart(ctx,{
    plugins:[oosBoundaryPlugin],
    data:{labels:priceLabels,datasets:[{type:'line',label:'Close',data:priceValues,borderColor:'#d4af37',borderWidth:1.5,pointRadius:0,tension:0,fill:false,yAxisID:'y',order:10},...entryDatasets,...exitDatasetsArr]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'nearest',intersect:true},
      plugins:{
        legend:{display:true,labels:{color:'#9ca3af',boxWidth:12,padding:10}},
        tooltip:{callbacks:{label(c){
          if(c.dataset.label==='Close')return` Price: $${c.parsed.y.toFixed(2)}`;
          const trade=(c.dataset._meta||[])[c.dataIndex];
          if(trade)return[` ${trade.direction.toUpperCase()} entry @ $${trade.entry_price}`,` Exit @ $${trade.exit_price}  (${trade.return_pct>0?'+':''}${trade.return_pct}%)`,` ${trade.bars} bars  ${trade.win?'✓ Win':'✗ Loss'}`];
          return` Exit @ $${c.parsed.y.toFixed(2)}`;
        }}},
        zoom:{pan:{enabled:true,mode:'x',modifierKey:'shift'},zoom:{wheel:{enabled:true},pinch:{enabled:true},drag:{enabled:true,backgroundColor:'rgba(245,165,32,0.08)',borderColor:GOLD,borderWidth:1},mode:'x'}}
      },
      scales:{x:{ticks:{color:'#6b7280',maxTicksLimit:12},grid:{color:'#ffffff08'}},y:{ticks:{color:'#6b7280',callback:v=>'$'+v.toLocaleString()},grid:{color:'#ffffff08'},position:'left'}}
    }
  });
}

// ── Cluster Rules Panel ───────────────────────────────────────────────────────
function buildClusterRulesPanel(clusterPerf) {
  if(!clusterPerf||!clusterPerf.length)return;
  document.getElementById('quant-cluster-rules-panel').style.display='';
  const wrap=document.getElementById('cluster-rules-wrap');wrap.innerHTML='';
  function strategyRules(strategy,params){
    const p=params||{};
    switch(strategy){
      case'Mean-Rev':return{long:`Price drops below the lower Bollinger Band (${p.period||'?'}-bar mean − ${p.std_mult||'?'}σ)`,short:`Price spikes above the upper Bollinger Band (${p.period||'?'}-bar mean + ${p.std_mult||'?'}σ)`,exit:`Price returns within ${p.exit_mult||'?'}σ of the mean`,note:`Bets against the move — profits when price snaps back.`};
      case'Donchian L/O':return{long:`Close breaks above the highest close of the last ${p.best_lookback||'?'} bars`,short:`No short trades — long only`,exit:`Close drops below the lowest close of the last ~${Math.round((p.best_lookback||40)/2)} bars`,note:`Trend-following, upside only.`};
      case'Donchian':return{long:`Close breaks above the highest close of the last ${p.best_lookback||'?'} bars`,short:`Close breaks below the lowest close of the last ${p.best_lookback||'?'} bars`,exit:`Close crosses back through the ${p.exit_lookback||Math.round((p.best_lookback||40)/2)}-bar channel`,note:`Classic breakout both directions.`};
      case'ATR Break':return{long:`Close breaks above the ATR channel (recent high + ${p.k||p.atr_mult||'?'}× ATR)`,short:`Close breaks below the ATR channel (recent low − ${p.k||p.atr_mult||'?'}× ATR)`,exit:`Hold fixed ${p.hold_bars||'?'} bars then exit`,note:`Volatility-adjusted breakout.`};
      case'MA Cross':return{long:`Fast MA (${p.fast||'?'} bars) crosses above slow MA (${p.slow||'?'} bars)`,short:`Fast MA crosses below slow MA`,exit:`Opposite MA crossover signal`,note:`Classic trend filter.`};
      case'Ichimoku':return{long:`Price dips into Ichimoku cloud and closes above it`,short:`Price dips into cloud and closes below it`,exit:`Hold fixed ${p.hold_bars||'?'} bars`,note:`Trend-following retracement entry.`};
      default:return{long:'See strategy code',short:'See strategy code',exit:'See strategy code',note:''};
    }
  }
  clusterPerf.forEach(cp=>{
    const cid=cp.cluster,cc=clusterColor(cid),rules=strategyRules(cp.strategy,cp.params);
    const labelTokens=(cp.label||`Cluster ${cid}`).split(' | ');
    const labelsHtml=labelTokens.map(t=>`<span style="display:inline-block;margin:2px 2px 2px 0;padding:1px 7px;border-radius:3px;font-size:11px;background:${cc.bg};color:${cc.text};border:1px solid ${cc.border}40">${t}</span>`).join('');
    const p=cp.params||{};const paramParts=[];
    if(p.period!=null)paramParts.push(`period=${p.period}`);if(p.std_mult!=null)paramParts.push(`σ=${p.std_mult}`);if(p.exit_mult!=null)paramParts.push(`exit=${p.exit_mult}σ`);if(p.best_lookback!=null)paramParts.push(`lookback=${p.best_lookback}`);if(p.exit_lookback!=null)paramParts.push(`exit_lb=${p.exit_lookback}`);if(p.fast!=null)paramParts.push(`fast=${p.fast}`);if(p.slow!=null)paramParts.push(`slow=${p.slow}`);if(p.k!=null)paramParts.push(`k=${p.k}`);if(p.atr_mult!=null)paramParts.push(`atr×${p.atr_mult}`);if(p.hold_bars!=null)paramParts.push(`hold=${p.hold_bars}bars`);
    const paramsHtml=paramParts.length?`<div style="margin-top:6px;font-size:11px;color:#6b7280">Params: <span style="color:#9ca3af">${paramParts.join(' · ')}</span></div>`:'';
    wrap.innerHTML+=`<div style="flex:1;min-width:260px;max-width:380px;background:#111;border:1px solid ${cc.border}55;border-radius:8px;padding:14px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:17px;font-weight:800;color:${cc.text};background:${cc.bg};padding:2px 10px;border-radius:4px;border:1px solid ${cc.border}">Cluster ${cid}</span><span style="font-size:13px;font-weight:600;color:#e5e7eb">${cp.strategy}</span>${cp.is_pf!=null?`<span style="margin-left:auto;font-size:12px;color:${cp.is_pf>=1.5?GREEN:cp.is_pf>=1.0?'#f59e0b':RED};font-weight:700">PF ${cp.is_pf.toFixed(2)}</span>`:''}</div><div style="margin-bottom:8px;line-height:1.7">${labelsHtml}</div><div style="font-size:12px;line-height:1.7;border-top:1px solid #222;padding-top:8px"><div><span style="color:${GREEN};font-weight:700">▲ BUY LONG &nbsp;</span><span style="color:#9ca3af">${rules.long}</span></div>${rules.short!=='No short trades — long only'?`<div><span style="color:#f472b6;font-weight:700">▼ SELL SHORT </span><span style="color:#9ca3af">${rules.short}</span></div>`:'<div style="color:#4b5563;font-size:11px">▼ No short trades</div>'}<div style="margin-top:4px"><span style="color:#f59e0b;font-weight:700">✕ EXIT &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="color:#9ca3af">${rules.exit}</span></div></div>${paramsHtml}<div style="margin-top:8px;font-size:11px;color:#6b7280;font-style:italic;border-top:1px solid #222;padding-top:6px">${rules.note}</div></div>`;
  });
}

// ── Feature Selection Panel ───────────────────────────────────────────────────
function buildFeatureSelection(strategies) {
  const strat=(strategies||[]).find(s=>s.name&&s.name.toLowerCase().includes('adaptive'));
  if(!strat)return;
  const selected=strat.selected_features||[],dropped=strat.dropped_features||[],fscores=strat.f_scores||{};
  if(!selected.length&&!dropped.length)return;
  document.getElementById('quant-features-panel').style.display='';
  const wrap=document.getElementById('features-wrap');wrap.innerHTML='';
  const maxF=Math.max(...selected.map(f=>fscores[f]||0),1);
  const FEAT_LABELS={vol_20d:'Volatility 20d',vol_ratio:'Vol Expansion Ratio',adx_14:'ADX Trend Strength',rsi_14:'RSI Momentum',bb_zscore:'Bollinger Z-Score',donchian_pos_20:'Donchian Position',hurst_20:'Hurst (20)',hurst_100:'Hurst (100)',close_vs_ma200:'Distance from 200MA',ma50_vs_ma200:'Golden/Death Cross',eff_ratio_60:'Trend Quality 60d',eff_ratio_20:'Trend Quality 20d',ret_60d:'3M Momentum',ret_126d:'6M Momentum',ret_252d:'12M Momentum',close_vs_ma50:'Distance from 50MA',vol_z_score:'Vol vs 1yr Baseline',ema_slope:'EMA Slope'};
  const FEAT_DESC={vol_20d:'How volatile is the market right now (annualised)?',vol_ratio:'Is volatility expanding or contracting vs recent history?',adx_14:'Is the market trending strongly or ranging?',rsi_14:'Is momentum overbought or oversold?',bb_zscore:'How far is price from its Bollinger Band mean?',donchian_pos_20:'Where is price within its 20-bar high/low range?',close_vs_ma200:'Is price above or below the 200-day moving average?',ma50_vs_ma200:'Is the 50MA above the 200MA (golden cross) or below (death cross)?',eff_ratio_60:'Is the 60-day trend clean/directional or choppy/noisy?',eff_ratio_20:'Is the 20-day trend clean/directional or choppy/noisy?',ret_60d:'3-month price return — medium-term momentum direction',ret_126d:'6-month price return — intermediate trend',ret_252d:'12-month price return — dominant annual trend',ema_slope:'Is the EMA rising or falling over the last N bars?',hurst_20:'Hurst exponent (20): is price mean-reverting or trending?',hurst_100:'Hurst exponent (100): long-horizon trend persistence'};
  let html='<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Used in clustering</div>';
  const sortedSelected=[...selected].sort((a,b)=>(fscores[b]||0)-(fscores[a]||0));
  sortedSelected.forEach(f=>{const fscore=fscores[f]||0;const barPct=Math.min(100,(fscore/maxF)*100);const barColor=barPct>66?'#d4a017':barPct>33?'#f59e0b':'#6b7280';const label=FEAT_LABELS[f]||f;const desc=FEAT_DESC[f]||'';html+=`<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:12px;color:#e5e7eb" title="${desc}">${label}</span><span style="font-size:11px;color:var(--muted)">F=${fscore.toFixed(0)}</span></div><div style="height:6px;background:#222;border-radius:3px"><div style="height:100%;width:${barPct}%;background:${barColor};border-radius:3px;transition:width 0.4s"></div></div>${desc?`<div style="font-size:10px;color:#4b5563;margin-top:2px">${desc}</div>`:''}</div>`;});
  html+='</div>';
  if(dropped.length){html+='<div><div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Dropped (redundant or near-constant)</div><div style="display:flex;flex-wrap:wrap;gap:6px">';dropped.forEach(f=>{const label=FEAT_LABELS[f]||f;html+=`<span style="font-size:11px;color:#4b5563;background:#1a1a1a;border:1px solid #333;border-radius:4px;padding:2px 8px">${label}</span>`;});html+='</div></div>';}
  wrap.innerHTML=html;
}

// ── buildRegimeDistChart (legacy compatibility) ───────────────────────────────
function buildRegimeDistChart(dist) { if(!dist||!dist.length)return; }

// ── Asset + Interval switchers ────────────────────────────────────────────────
function switchAsset(compositeKey) { const sep=compositeKey.lastIndexOf('__');if(sep<0)return;const assetId=compositeKey.slice(0,sep),interval=compositeKey.slice(sep+2);const url=new URL(window.location.href);url.searchParams.set('asset',assetId);url.searchParams.set('interval',interval);window.location.href=url.toString(); }
function switchInterval(interval) { const url=new URL(window.location.href);url.searchParams.set('interval',interval);window.location.href=url.toString(); }

function buildAssetDropdown(assets, currentAsset, currentInterval) {
  if(!assets||assets.length<1)return;
  const wrap=document.getElementById('asset-dropdown-wrap');
  const select=document.getElementById('asset-select');
  wrap.style.display='';wrap.dataset.mlVisible='';
  const _ICONS={gold:'🥇',gold_acf:'🥇',oil:'🛢️',oil_acf:'🛢️',dxy:'💵',dxy_acf:'💵',audusd:'🇦🇺',audusd_acf:'🇦🇺',waf:'⛏️'};
  select.innerHTML=''; // clear before repopulating to avoid duplicates
  // Sort by PF desc, show top 10 — current asset always included even if outside top 10
  const sorted=[...assets].sort((a,b)=>(b.pf||0)-(a.pf||0));
  const top10=sorted.slice(0,10);
  const inTop10=top10.some(a=>a.id===currentAsset&&a.interval===currentInterval);
  const shown=inTop10?top10:[...top10,assets.find(a=>a.id===currentAsset&&a.interval===currentInterval)].filter(Boolean);
  shown.forEach(a=>{const opt=document.createElement('option');const key=a.id+'__'+a.interval;opt.value=key;opt.selected=(a.id===currentAsset&&a.interval===currentInterval);const pf=a.pf!=null?` · PF ${a.pf.toFixed(2)}`:'';opt.textContent=`${_ICONS[a.id]||'📊'} ${a.label} (${a.interval.toUpperCase()})${pf}`;select.appendChild(opt);});
}

function buildIntervalToggle(assets, currentAsset, currentInterval) {
  const has1d=assets.some(a=>a.id===currentAsset&&a.interval==='1d');
  const has1h=assets.some(a=>a.id===currentAsset&&a.interval==='1h');
  if(!has1d||!has1h)return;
  const wrap=document.getElementById('interval-toggle-wrap');
  wrap.style.display='flex';wrap.dataset.mlVisible='flex';
  const btn1d=document.getElementById('btn-interval-1d'),btn1h=document.getElementById('btn-interval-1h');
  const activeStyle='background:#d4a017;color:#000;border-color:#d4a017;font-weight:700';
  const inactiveStyle='background:#222;color:#9ca3af;border:1px solid #444;font-weight:600';
  if(currentInterval==='1d'){btn1d.style.cssText+=';'+activeStyle;btn1h.style.cssText+=';'+inactiveStyle;}
  else{btn1h.style.cssText+=';'+activeStyle;btn1d.style.cssText+=';'+inactiveStyle;}
}

