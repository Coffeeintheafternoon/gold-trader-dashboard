// tab_mines_3d.js — Downhole strip-log viewer (falls back from 3D when no coordinates)

let _3dAnimFrame = null;

function minesRender3D(holes) {
  const wrap = document.getElementById('mines-3d-wrap');
  if (!wrap) return;
  if (_3dAnimFrame) { cancelAnimationFrame(_3dAnimFrame); _3dAnimFrame = null; }

  const validCoords = (holes || []).filter(h => h.easting != null && h.northing != null);

  if (validCoords.length > 0) {
    _render3D(wrap, validCoords);
  } else {
    _renderDownholeLog(wrap, holes || []);
  }
}

// ── 3D viewer (Three.js) — only used when collar coordinates are available ────

function _render3D(wrap, holes) {
  wrap.innerHTML = '';
  const THREE = window.THREE;
  if (!THREE) {
    wrap.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:20px">Three.js not loaded</div>`;
    return;
  }

  const W = wrap.clientWidth || 500;
  const H = wrap.clientHeight || 380;

  const scene    = new THREE.Scene();
  scene.background = new THREE.Color(0x050d05);
  const camera   = new THREE.PerspectiveCamera(55, W / H, 0.1, 100000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(window.devicePixelRatio);
  wrap.appendChild(renderer.domElement);

  scene.add(new THREE.GridHelper(2000, 20, 0x1a2a1a, 0x111811));
  scene.add(new THREE.AxesHelper(200));
  scene.add(new THREE.AmbientLight(0x334433, 1.2));
  const dLight = new THREE.DirectionalLight(0xaaffaa, 0.8);
  dLight.position.set(500, 800, 400);
  scene.add(dLight);

  const cx = holes.reduce((s, h) => s + h.easting,  0) / holes.length;
  const cy = holes.reduce((s, h) => s + h.northing, 0) / holes.length;
  const cz = holes.reduce((s, h) => s + (h.elevation || 0), 0) / holes.length;

  const gradeColor = (g) => {
    if (!g)    return new THREE.Color(0x334433);
    if (g > 5) return new THREE.Color(0xaaff00);
    if (g > 2) return new THREE.Color(0xffcc00);
    return new THREE.Color(0x336633);
  };

  for (const hole of holes) {
    const x0 = hole.easting  - cx;
    const z0 = hole.northing - cy;
    const y0 = (hole.elevation || cz) - cz;
    const az  = ((hole.azimuth || 0) * Math.PI) / 180;
    const dip = ((hole.dip || -90) * Math.PI) / 180;
    const dep = hole.total_depth_m || 200;
    const dx = dep * Math.sin(az) * Math.cos(dip);
    const dy = dep * Math.sin(dip);
    const dz = dep * Math.cos(az) * Math.cos(dip);

    const pts = [new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x0+dx, y0+dy, z0+dz)];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x335533 })));

    const collar = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x88cc88 }));
    collar.position.set(x0, y0, z0);
    scene.add(collar);

    for (const iv of (hole.intervals || [])) {
      if (!iv.grade || iv.grade <= 0) continue;
      const f = (iv.from_m || 0) / dep, t = (iv.to_m || 0) / dep;
      const mx = x0 + dx * (f + t) / 2, my = y0 + dy * (f + t) / 2, mz = z0 + dz * (f + t) / 2;
      const len = (iv.to_m || 0) - (iv.from_m || 0);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, len, 8),
        new THREE.MeshLambertMaterial({ color: gradeColor(iv.grade), transparent: true, opacity: 0.85 }));
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      cyl.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir));
      cyl.position.set(mx, my, mz);
      scene.add(cyl);
    }
  }

  camera.position.set(800, 600, 800);
  camera.lookAt(0, 0, 0);

  let controls = null;
  if (window.THREE_OrbitControls) {
    controls = new window.THREE_OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
  }

  const tip = document.createElement('div');
  tip.style.cssText = `position:absolute;top:8px;right:8px;font-size:10px;color:var(--muted);
    font-family:monospace;pointer-events:none;background:rgba(0,0,0,0.6);padding:4px 8px;border-radius:2px`;
  tip.textContent = `${holes.length} holes · drag to rotate · scroll to zoom`;
  wrap.style.position = 'relative';
  wrap.appendChild(tip);

  function animate() {
    _3dAnimFrame = requestAnimationFrame(animate);
    if (controls) controls.update();
    renderer.render(scene, camera);
  }
  animate();

  new ResizeObserver(() => {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }).observe(wrap);
}

// ── Downhole strip-log (canvas) — used when no coordinates ───────────────────

function _renderDownholeLog(wrap, holes) {
  const holesWithData = holes.filter(h => h.intervals && h.intervals.length > 0);

  wrap.innerHTML = '';
  wrap.style.position = 'relative';
  wrap.style.overflow = 'auto';

  if (!holesWithData.length) {
    wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;
      color:var(--muted);font-size:12px">No drill intercept data extracted</div>`;
    return;
  }

  // Label at top
  const note = document.createElement('div');
  note.style.cssText = `font-size:10px;color:var(--muted);font-family:monospace;
    padding:6px 10px;border-bottom:1px solid #1a2a1a`;
  note.textContent = `DOWNHOLE GRADE LOG — ${holesWithData.length} holes with intercepts (no collar coordinates in source PDF)`;
  wrap.appendChild(note);

  const canvas = document.createElement('canvas');
  const W = wrap.clientWidth || 500;
  const H = 320;
  canvas.width  = W;
  canvas.height = H;
  canvas.style.display = 'block';
  wrap.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#050d05';
  ctx.fillRect(0, 0, W, H);

  const maxDepth = Math.max(...holesWithData.map(h =>
    Math.max(...h.intervals.map(i => i.to_m || 0), 10)
  ));

  const colW   = Math.max(18, Math.floor((W - 20) / holesWithData.length) - 2);
  const margin = { top: 30, bottom: 20 };
  const drawH  = H - margin.top - margin.bottom;

  const gradeColor = (g) => {
    if (!g)    return '#1a2a1a';
    if (g > 10) return '#aaff00';
    if (g > 5)  return '#66cc00';
    if (g > 2)  return '#ffcc00';
    if (g > 0.5)return '#33aa44';
    return '#1a3a1a';
  };

  holesWithData.forEach((hole, i) => {
    const x = 10 + i * (colW + 2);

    // Background column
    ctx.fillStyle = '#0a140a';
    ctx.fillRect(x, margin.top, colW, drawH);

    // Grade intervals
    hole.intervals.forEach(iv => {
      const y0 = margin.top + ((iv.from_m || 0) / maxDepth) * drawH;
      const y1 = margin.top + ((iv.to_m   || 0) / maxDepth) * drawH;
      ctx.fillStyle = gradeColor(iv.grade);
      ctx.fillRect(x + 1, y0, colW - 2, Math.max(2, y1 - y0));
    });

    // Hole label
    ctx.fillStyle = '#556655';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    const label = (hole.hole_id || `H${i+1}`).slice(-6);
    ctx.fillText(label, x + colW / 2, margin.top - 4);
  });

  // Depth axis labels
  ctx.fillStyle = '#334433';
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';
  [0, 0.25, 0.5, 0.75, 1].forEach(frac => {
    const y = margin.top + frac * drawH;
    ctx.fillText(`${Math.round(frac * maxDepth)}m`, 9, y + 3);
  });

  // Legend
  [['#aaff00','>10 g/t'], ['#66cc00','5–10'], ['#ffcc00','2–5'], ['#33aa44','0.5–2']].forEach(([c, l], i) => {
    const lx = W - 80, ly = margin.top + i * 16;
    ctx.fillStyle = c;
    ctx.fillRect(lx, ly, 10, 10);
    ctx.fillStyle = '#556655';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(l, lx + 14, ly + 8);
  });
}
