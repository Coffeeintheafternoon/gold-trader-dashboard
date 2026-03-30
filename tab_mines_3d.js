// tab_mines_3d.js — Three.js 3D drill hole viewer
// Loaded after Three.js CDN script.

let _3dScene     = null;
let _3dRenderer  = null;
let _3dCamera    = null;
let _3dControls  = null;
let _3dAnimFrame = null;

function minesRender3D(holes) {
  const wrap = document.getElementById('mines-3d-wrap');
  if (!wrap) return;

  // Cancel previous animation loop
  if (_3dAnimFrame) { cancelAnimationFrame(_3dAnimFrame); _3dAnimFrame = null; }

  if (!holes || holes.length === 0 || !holes.some(h => h.easting != null)) {
    wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;
      color:var(--muted);font-size:12px">No drill coordinate data available</div>`;
    return;
  }

  wrap.innerHTML = '';
  const W = wrap.clientWidth  || 500;
  const H = wrap.clientHeight || 380;

  // Three.js scene setup
  const THREE = window.THREE;
  if (!THREE) {
    wrap.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:20px">
      Three.js not loaded</div>`;
    return;
  }

  _3dScene    = new THREE.Scene();
  _3dScene.background = new THREE.Color(0x050d05);

  _3dCamera   = new THREE.PerspectiveCamera(55, W / H, 0.1, 100000);
  _3dRenderer = new THREE.WebGLRenderer({ antialias: true });
  _3dRenderer.setSize(W, H);
  _3dRenderer.setPixelRatio(window.devicePixelRatio);
  wrap.appendChild(_3dRenderer.domElement);

  // Grid helper
  const grid = new THREE.GridHelper(2000, 20, 0x1a2a1a, 0x111811);
  _3dScene.add(grid);

  // Axes
  _3dScene.add(new THREE.AxesHelper(200));

  // Ambient + directional light
  _3dScene.add(new THREE.AmbientLight(0x334433, 1.2));
  const dLight = new THREE.DirectionalLight(0xaaffaa, 0.8);
  dLight.position.set(500, 800, 400);
  _3dScene.add(dLight);

  // Normalise coordinates relative to centroid
  const validHoles = holes.filter(h => h.easting != null && h.northing != null);
  const cx = validHoles.reduce((s, h) => s + h.easting,  0) / validHoles.length;
  const cy = validHoles.reduce((s, h) => s + h.northing, 0) / validHoles.length;
  const cz = validHoles.reduce((s, h) => s + (h.elevation || 0), 0) / validHoles.length;

  // Grade → colour helper
  const _gradeColor = (grade) => {
    if (!grade)   return new THREE.Color(0x334433);
    if (grade > 5) return new THREE.Color(0xaaff00);  // high grade — bright green
    if (grade > 2) return new THREE.Color(0xffcc00);  // mid grade — amber
    return new THREE.Color(0x336633);                 // low grade — dim green
  };

  // Render each hole
  for (const hole of validHoles) {
    const x0 = hole.easting  - cx;
    const z0 = hole.northing - cy;
    const y0 = (hole.elevation || cz) - cz;

    const az  = ((hole.azimuth || 0) * Math.PI) / 180;
    const dip = ((hole.dip     || -90) * Math.PI) / 180;
    const dep = hole.total_depth_m || 200;

    // End point using azimuth & dip
    const dx = dep * Math.sin(az) * Math.cos(dip);
    const dy = dep * Math.sin(dip);           // negative = downward
    const dz = dep * Math.cos(az) * Math.cos(dip);

    // Hole trace line
    const pts = [
      new THREE.Vector3(x0,       y0,       z0),
      new THREE.Vector3(x0 + dx,  y0 + dy,  z0 + dz),
    ];
    const lineMat = new THREE.LineBasicMaterial({ color: 0x335533, linewidth: 1 });
    _3dScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));

    // Collar sphere
    const collarGeo = new THREE.SphereGeometry(4, 8, 8);
    const collarMat = new THREE.MeshLambertMaterial({ color: 0x88cc88 });
    const collar    = new THREE.Mesh(collarGeo, collarMat);
    collar.position.set(x0, y0, z0);
    _3dScene.add(collar);

    // Significant intercept cylinders
    for (const iv of (hole.intervals || [])) {
      if (!iv.grade || iv.grade <= 0) continue;
      const frac0 = (iv.from_m || 0) / dep;
      const frac1 = (iv.to_m   || 0) / dep;
      const cx_ = x0 + dx * (frac0 + frac1) / 2;
      const cy_ = y0 + dy * (frac0 + frac1) / 2;
      const cz_ = z0 + dz * (frac0 + frac1) / 2;
      const len  = ((iv.to_m || 0) - (iv.from_m || 0));

      const cyl  = new THREE.CylinderGeometry(6, 6, len, 8);
      const mat  = new THREE.MeshLambertMaterial({ color: _gradeColor(iv.grade), transparent: true, opacity: 0.85 });
      const mesh = new THREE.Mesh(cyl, mat);

      // Orient cylinder along drill direction
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      const up  = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
      mesh.setRotationFromQuaternion(quat);
      mesh.position.set(cx_, cy_, cz_);
      _3dScene.add(mesh);
    }
  }

  // Camera position
  _3dCamera.position.set(800, 600, 800);
  _3dCamera.lookAt(0, 0, 0);

  // Orbit controls (loaded from CDN alongside Three.js)
  if (window.THREE_OrbitControls) {
    _3dControls = new window.THREE_OrbitControls(_3dCamera, _3dRenderer.domElement);
    _3dControls.enableDamping = true;
    _3dControls.dampingFactor = 0.08;
  }

  // Tooltip overlay
  const tooltip = document.createElement('div');
  tooltip.style.cssText = `position:absolute;top:8px;right:8px;font-size:10px;
    color:var(--muted);font-family:monospace;pointer-events:none;
    background:rgba(0,0,0,0.6);padding:4px 8px;border-radius:2px`;
  tooltip.textContent = `${validHoles.length} holes · drag to rotate · scroll to zoom`;
  wrap.style.position = 'relative';
  wrap.appendChild(tooltip);

  // Legend
  const legend = document.createElement('div');
  legend.style.cssText = `position:absolute;bottom:8px;left:8px;font-size:10px;
    font-family:monospace;pointer-events:none`;
  legend.innerHTML = [
    ['#aaff00','> 5 g/t'],['#ffcc00','2–5 g/t'],['#336633','< 2 g/t']
  ].map(([c,l]) =>
    `<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c}"></span>
      <span style="color:var(--muted)">${l}</span>
    </div>`
  ).join('');
  wrap.appendChild(legend);

  // Animation loop
  function animate() {
    _3dAnimFrame = requestAnimationFrame(animate);
    if (_3dControls) _3dControls.update();
    _3dRenderer.render(_3dScene, _3dCamera);
  }
  animate();

  // Resize handler
  const ro = new ResizeObserver(() => {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    _3dCamera.aspect = w / h;
    _3dCamera.updateProjectionMatrix();
    _3dRenderer.setSize(w, h);
  });
  ro.observe(wrap);
}
