// tab_mines_map.js — 2D top-down plan view of drill collars

function minesRenderMap(holes) {
  const canvas = document.getElementById('mines-map-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const W   = canvas.offsetWidth  || 460;
  const H   = canvas.offsetHeight || 356;
  canvas.width  = W;
  canvas.height = H;

  ctx.fillStyle = '#050d05';
  ctx.fillRect(0, 0, W, H);

  const valid = (holes || []).filter(h => h.easting != null && h.northing != null);
  if (!valid.length) {
    ctx.fillStyle = '#334433';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No coordinate data', W / 2, H / 2);
    return;
  }

  // Extents
  const xs = valid.map(h => h.easting);
  const ys = valid.map(h => h.northing);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 40;

  const scaleX = (maxX - minX) < 1 ? 1 : (W - pad * 2) / (maxX - minX);
  const scaleY = (maxY - minY) < 1 ? 1 : (H - pad * 2) / (maxY - minY);
  const scale  = Math.min(scaleX, scaleY);

  const toCanv = (e, n) => [
    pad + (e - minX) * scale,
    H - pad - (n - minY) * scale,   // flip Y (north = up)
  ];

  // Best grade per hole for colouring
  const bestGrade = h => {
    if (!h.intervals?.length) return 0;
    return Math.max(...h.intervals.map(i => i.grade || 0));
  };

  const gradeColor = g => {
    if (g > 5)  return '#aaff00';
    if (g > 2)  return '#ffcc00';
    if (g > 0.5)return '#33aa44';
    return '#334433';
  };

  // Draw section lines (connect holes with same prefix)
  const prefixMap = {};
  valid.forEach(h => {
    const pfx = (h.hole_id || '').replace(/\d+$/, '');
    if (!prefixMap[pfx]) prefixMap[pfx] = [];
    prefixMap[pfx].push(h);
  });

  ctx.strokeStyle = 'rgba(170,255,0,0.08)';
  ctx.lineWidth   = 1;
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

  // Draw collar dots
  valid.forEach(h => {
    const [x, y] = toCanv(h.easting, h.northing);
    const g      = bestGrade(h);
    const r      = g > 2 ? 5 : 4;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = gradeColor(g);
    ctx.fill();

    if (g > 2) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = gradeColor(g);
      ctx.globalAlpha = 0.25;
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth   = 1;
    }
  });

  // Axis labels
  ctx.fillStyle  = '#334433';
  ctx.font       = '9px monospace';
  ctx.textAlign  = 'left';
  ctx.fillText(`E ${Math.round(minX)}m`, pad, H - 6);
  ctx.textAlign  = 'right';
  ctx.fillText(`E ${Math.round(maxX)}m`, W - pad, H - 6);
  ctx.textAlign  = 'center';
  ctx.fillText(`N ${Math.round(maxY)}m`, W / 2, 14);

  // Legend
  [['#aaff00','> 5 g/t'], ['#ffcc00','2–5 g/t'], ['#33aa44','0.5–2 g/t']].forEach(([c, l], i) => {
    const lx = pad, ly = pad + i * 16;
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.fillStyle  = '#556677';
    ctx.font       = '9px monospace';
    ctx.textAlign  = 'left';
    ctx.fillText(l, lx + 10, ly + 3);
  });

  // Collar count
  ctx.fillStyle = '#334433';
  ctx.font      = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${valid.length} holes`, W - pad, pad);
}
