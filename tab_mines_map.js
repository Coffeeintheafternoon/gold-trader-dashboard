// tab_mines_map.js — 2D plan view (or intercepts table when no coordinates)

function minesRenderMap(holes) {
  const canvas = document.getElementById('mines-map-canvas');
  if (!canvas) return;

  const valid = (holes || []).filter(h => h.easting != null && h.northing != null);

  if (valid.length > 0) {
    _renderPlanMap(canvas, valid);
  } else {
    _renderInterceptsTable(canvas, holes || []);
  }
}

// ── 2D plan map — only used when collar coordinates are available ─────────────

function _renderPlanMap(canvas, valid) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.offsetWidth  || 460;
  const H   = canvas.offsetHeight || 356;
  canvas.width  = W;
  canvas.height = H;

  ctx.fillStyle = '#050d05';
  ctx.fillRect(0, 0, W, H);

  const xs = valid.map(h => h.easting);
  const ys = valid.map(h => h.northing);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 40;
  const scaleX = (maxX - minX) < 1 ? 1 : (W - pad * 2) / (maxX - minX);
  const scaleY = (maxY - minY) < 1 ? 1 : (H - pad * 2) / (maxY - minY);
  const scale  = Math.min(scaleX, scaleY);
  const toCanv = (e, n) => [pad + (e - minX) * scale, H - pad - (n - minY) * scale];

  const bestGrade = h => (!h.intervals?.length) ? 0 : Math.max(...h.intervals.map(i => i.grade || 0));
  const gradeColor = g => g > 5 ? '#aaff00' : g > 2 ? '#ffcc00' : g > 0.5 ? '#33aa44' : '#334433';

  // Section lines
  const prefixMap = {};
  valid.forEach(h => {
    const pfx = (h.hole_id || '').replace(/\d+$/, '');
    if (!prefixMap[pfx]) prefixMap[pfx] = [];
    prefixMap[pfx].push(h);
  });
  ctx.strokeStyle = 'rgba(170,255,0,0.08)';
  ctx.lineWidth = 1;
  Object.values(prefixMap).forEach(group => {
    if (group.length < 2) return;
    const sorted = group.sort((a, b) => a.easting - b.easting);
    ctx.beginPath();
    sorted.forEach((h, i) => {
      const [x, y] = toCanv(h.easting, h.northing);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  // Collar dots
  valid.forEach(h => {
    const [x, y] = toCanv(h.easting, h.northing);
    const g = bestGrade(h), r = g > 2 ? 5 : 4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = gradeColor(g);
    ctx.fill();
    if (g > 2) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = gradeColor(g);
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }
  });

  // Axis labels
  ctx.fillStyle = '#334433'; ctx.font = '9px monospace';
  ctx.textAlign = 'left';  ctx.fillText(`E ${Math.round(minX)}m`, pad, H - 6);
  ctx.textAlign = 'right'; ctx.fillText(`E ${Math.round(maxX)}m`, W - pad, H - 6);
  ctx.textAlign = 'center';ctx.fillText(`N ${Math.round(maxY)}m`, W / 2, 14);
  [['#aaff00','> 5 g/t'], ['#ffcc00','2–5 g/t'], ['#33aa44','0.5–2 g/t']].forEach(([c, l], i) => {
    const lx = pad, ly = pad + i * 16;
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    ctx.fillStyle = '#556677'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
    ctx.fillText(l, lx + 10, ly + 3);
  });
  ctx.fillStyle = '#334433'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
  ctx.fillText(`${valid.length} holes`, W - pad, pad);
}

// ── Intercepts table — used when no coordinates ───────────────────────────────

function _renderInterceptsTable(canvas, holes) {
  // Replace canvas with a scrollable table
  const wrap = canvas.parentElement;
  if (!wrap) return;

  const holesWithData = holes
    .filter(h => h.intervals && h.intervals.length > 0)
    .map(h => ({
      ...h,
      bestGrade: Math.max(...h.intervals.map(i => i.grade || 0)),
      bestInterval: h.intervals.reduce((best, iv) =>
        (iv.grade || 0) > (best.grade || 0) ? iv : best, h.intervals[0]),
    }))
    .sort((a, b) => b.bestGrade - a.bestGrade);

  const gradeColor = g => g > 10 ? '#aaff00' : g > 5 ? '#88cc00' : g > 2 ? '#ffcc00' : g > 0.5 ? '#33aa44' : '#556655';

  const html = `
    <div style="font-size:10px;color:var(--muted);font-family:monospace;
        padding:6px 10px 4px;border-bottom:1px solid #1a2a1a">
      BEST INTERCEPTS — ${holesWithData.length} holes (no collar coordinates in source PDF)
    </div>
    <div style="overflow-y:auto;max-height:320px">
      <table style="width:100%;border-collapse:collapse;font-family:monospace;font-size:11px">
        <thead>
          <tr style="color:var(--muted);font-size:10px;border-bottom:1px solid #1a2a1a">
            <th style="padding:5px 8px;text-align:left;font-weight:600">HOLE</th>
            <th style="padding:5px 8px;text-align:right;font-weight:600">FROM</th>
            <th style="padding:5px 8px;text-align:right;font-weight:600">TO</th>
            <th style="padding:5px 8px;text-align:right;font-weight:600">WIDTH</th>
            <th style="padding:5px 8px;text-align:right;font-weight:600">GRADE</th>
          </tr>
        </thead>
        <tbody>
          ${holesWithData.map(h => {
            const iv = h.bestInterval;
            const gc = gradeColor(h.bestGrade);
            return `<tr style="border-bottom:1px solid #0f1a0f">
              <td style="padding:5px 8px;color:var(--text)">${h.hole_id || '—'}</td>
              <td style="padding:5px 8px;text-align:right;color:var(--muted)">${iv.from_m != null ? iv.from_m+'m' : '—'}</td>
              <td style="padding:5px 8px;text-align:right;color:var(--muted)">${iv.to_m != null ? iv.to_m+'m' : '—'}</td>
              <td style="padding:5px 8px;text-align:right;color:var(--muted)">${iv.width_m != null ? iv.width_m+'m' : '—'}</td>
              <td style="padding:5px 8px;text-align:right;font-weight:700;color:${gc}">${h.bestGrade > 0 ? h.bestGrade.toFixed(2)+' g/t' : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  wrap.innerHTML = html;
}
