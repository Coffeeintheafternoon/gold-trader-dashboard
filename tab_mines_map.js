// tab_mines_map.js — Intercepts table (plan map when coordinates available)

function minesRenderMap(holes) {
  const wrap = document.getElementById('mines-map-inner');
  if (!wrap) return;

  const valid = (holes || []).filter(h => h.easting != null && h.northing != null);
  if (valid.length > 0) {
    _renderPlanMapDiv(wrap, valid);
  } else {
    _renderInterceptsTable(wrap, holes || []);
  }
}

// ── 2D plan map ───────────────────────────────────────────────────────────────

function _renderPlanMapDiv(wrap, valid) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:300px';
  wrap.innerHTML = '';
  wrap.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 800;
  const H = 300;
  canvas.width = W; canvas.height = H;

  ctx.fillStyle = '#050d05';
  ctx.fillRect(0, 0, W, H);

  const xs = valid.map(h => h.easting),  ys = valid.map(h => h.northing);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 40;
  const sx = (maxX-minX)<1 ? 1 : (W-pad*2)/(maxX-minX);
  const sy = (maxY-minY)<1 ? 1 : (H-pad*2)/(maxY-minY);
  const sc = Math.min(sx, sy);
  const toC = (e, n) => [pad+(e-minX)*sc, H-pad-(n-minY)*sc];

  const bestGrade = h => (!h.intervals?.length) ? 0 : Math.max(...h.intervals.map(i=>i.grade||0));
  const gc = g => g>5 ? '#aaff00' : g>2 ? '#ffcc00' : g>0.5 ? '#33aa44' : '#334433';

  valid.forEach(h => {
    const [x, y] = toC(h.easting, h.northing);
    const g = bestGrade(h), r = g > 2 ? 5 : 4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = gc(g); ctx.fill();
  });

  ctx.fillStyle='#334433'; ctx.font='9px monospace';
  ctx.textAlign='left';  ctx.fillText(`E ${Math.round(minX)}`, pad, H-6);
  ctx.textAlign='right'; ctx.fillText(`E ${Math.round(maxX)}`, W-pad, H-6);
  ctx.textAlign='center';ctx.fillText(`N ${Math.round(maxY)}`, W/2, 14);
}

// ── Intercepts table ──────────────────────────────────────────────────────────

function _renderInterceptsTable(wrap, holes) {
  const rows = holes
    .filter(h => h.intervals && h.intervals.length > 0)
    .flatMap(h => h.intervals.map(iv => ({ hole: h.hole_id || '—', ...iv })))
    .filter(r => r.grade > 0)
    .sort((a, b) => b.grade - a.grade);

  if (!rows.length) {
    wrap.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:20px">No intercept data</div>`;
    return;
  }

  const gc = g => g>10 ? '#aaff00' : g>5 ? '#88cc00' : g>2 ? '#ffcc00' : g>0.5 ? '#33aa44' : '#556655';

  wrap.innerHTML = `
    <div style="overflow-y:auto;max-height:360px">
      <table style="width:100%;border-collapse:collapse;font-family:monospace;font-size:11px">
        <thead><tr style="color:var(--muted);font-size:10px;border-bottom:1px solid #1a2a1a;position:sticky;top:0;background:#000">
          <th style="padding:5px 10px;text-align:left">HOLE</th>
          <th style="padding:5px 10px;text-align:right">FROM</th>
          <th style="padding:5px 10px;text-align:right">TO</th>
          <th style="padding:5px 10px;text-align:right">WIDTH</th>
          <th style="padding:5px 10px;text-align:right">GRADE</th>
          <th style="padding:5px 10px;text-align:left">BAR</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const maxG = rows[0].grade;
            const barW = Math.round((r.grade / maxG) * 120);
            return `<tr style="border-bottom:1px solid #0a140a">
              <td style="padding:4px 10px;color:var(--text)">${r.hole}</td>
              <td style="padding:4px 10px;text-align:right;color:var(--muted)">${r.from_m != null ? r.from_m+'m' : '—'}</td>
              <td style="padding:4px 10px;text-align:right;color:var(--muted)">${r.to_m != null ? r.to_m+'m' : '—'}</td>
              <td style="padding:4px 10px;text-align:right;color:var(--muted)">${r.width_m != null ? r.width_m+'m' : '—'}</td>
              <td style="padding:4px 10px;text-align:right;font-weight:700;color:${gc(r.grade)}">${r.grade.toFixed(2)} g/t</td>
              <td style="padding:4px 10px">
                <div style="height:8px;width:${barW}px;background:${gc(r.grade)};border-radius:1px;opacity:0.8"></div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}
