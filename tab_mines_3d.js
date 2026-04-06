// tab_mines_3d.js — Interactive 3D drill intercept viewer (Three.js)
// Uses real coordinates if available, otherwise arranges holes synthetically.

let _3dRenderer  = null;
let _3dAnimFrame = null;

// ── Grade colour schemes ──────────────────────────────────────────────────────

const _GRADE_SCHEMES = {
  red: {
    label: 'Red',
    bands: [
      { min: 15,  hex: '#ffffff', color: 0xffffff, label: '> 15 g/t' },
      { min: 10,  hex: '#ff8800', color: 0xff8800, label: '10–15 g/t' },
      { min: 5,   hex: '#ff4400', color: 0xff4400, label: '5–10 g/t' },
      { min: 2,   hex: '#ff2200', color: 0xff2200, label: '2–5 g/t' },
      { min: 0.5, hex: '#cc1100', color: 0xcc1100, label: '0.5–2 g/t' },
      { min: 0,   hex: '#551100', color: 0x551100, label: '< 0.5 g/t' },
    ],
  },
  heat: {
    label: 'Heat',
    bands: [
      { min: 15,  hex: '#ffffff', color: 0xffffff, label: '> 15 g/t' },
      { min: 10,  hex: '#ff2200', color: 0xff2200, label: '10–15 g/t' },
      { min: 5,   hex: '#ff8800', color: 0xff8800, label: '5–10 g/t' },
      { min: 2,   hex: '#ffee00', color: 0xffee00, label: '2–5 g/t' },
      { min: 0.5, hex: '#44cc44', color: 0x44cc44, label: '0.5–2 g/t' },
      { min: 0,   hex: '#2244cc', color: 0x2244cc, label: '< 0.5 g/t' },
    ],
  },
  mono: {
    label: 'Mono',
    bands: [
      { min: 15,  hex: '#ffffff', color: 0xffffff, label: '> 15 g/t' },
      { min: 10,  hex: '#cccccc', color: 0xcccccc, label: '10–15 g/t' },
      { min: 5,   hex: '#999999', color: 0x999999, label: '5–10 g/t' },
      { min: 2,   hex: '#666666', color: 0x666666, label: '2–5 g/t' },
      { min: 0.5, hex: '#444444', color: 0x444444, label: '0.5–2 g/t' },
      { min: 0,   hex: '#222222', color: 0x222222, label: '< 0.5 g/t' },
    ],
  },
};

function _gradeColor(g, isWamex, scheme) {
  const THREE = window.THREE;
  if (!g || g <= 0) return new THREE.Color(isWamex ? 0x0a0a1a : 0x1a0a0a);
  if (isWamex) {
    if (g > 5)  return new THREE.Color(0x88ccff);
    if (g > 2)  return new THREE.Color(0x5599dd);
    if (g > 0.5)return new THREE.Color(0x336699);
    return new THREE.Color(0x1a3355);
  }
  const bands = (_GRADE_SCHEMES[scheme] || _GRADE_SCHEMES.red).bands;
  for (const b of bands) {
    if (g > b.min) return new THREE.Color(b.color);
  }
  return new THREE.Color(bands[bands.length - 1].color);
}

function _buildLegendHTML(scheme) {
  const bands = (_GRADE_SCHEMES[scheme] || _GRADE_SCHEMES.red).bands;
  return [
    ...bands.map(b => [b.hex, b.label]),
    [null, null],
    ['#4466aa', '● WAMEX hole (blue = low grade)'],
    ['#88ccff', '● WAMEX high grade'],
    [null, null],
    ['#ff3300', '— Fault / shear zone'],
    ['#8B7355', '▪ Sedimentary'],
    ['#4a6741', '▪ Volcanic / greenstone'],
    ['#ff6633', '▪ Intrusive / granite'],
    ['#557799', '▪ Metamorphic'],
  ].map(([c, l]) => !c
    ? '<div style="border-top:1px solid #1a2a1a;margin:4px 0"></div>'
    : `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
        <span style="width:10px;height:10px;border-radius:${l.startsWith('—') ? '0' : '50%'};background:${c};display:inline-block"></span>
        <span style="color:#88aa88">${l}</span>
      </div>`
  ).join('');
}

// ── Opacity helper ────────────────────────────────────────────────────────────
// Apply a stored opacity value to the matching set of scene objects.
// Called by the opacity sliders in the controls panel and by _rebuildIntercepts.

function _applyOpacity(wrap, key, v) {
  if (key === 'voxels') {
    if (wrap._voxelMesh) {
      wrap._voxelMesh.material.opacity     = v;
      wrap._voxelMesh.material.transparent = v < 1.0;
      wrap._voxelMesh.material.needsUpdate = true;
    }
  } else if (key === 'intercepts') {
    const s = wrap._3dState;
    if (s && s.interceptMeshes) s.interceptMeshes.forEach(m => {
      m.material.opacity     = v;
      m.material.transparent = v < 1.0;
      m.material.needsUpdate = true;
    });
  } else if (key === 'surface') {
    // _oreMeshes is populated by sdfsAddOreMesh; may be empty until surfaces are loaded
    (wrap._oreMeshes || []).forEach(m => {
      m.material.opacity     = v;
      m.material.transparent = v < 1.0;
      m.material.needsUpdate = true;
    });
  }
}

// ── Intercept mesh builder ────────────────────────────────────────────────────
// Builds only the intercept cylinders — called on init and on every settings change.
// Returns array of added THREE.Mesh so they can be removed on rebuild.

function _buildInterceptMeshes(scene, holesWithData, holePos, geomScale, settings) {
  const THREE = window.THREE;
  const { gradeCutoff, colourScheme, cylSizeMult } = settings;
  const added = [];

  holesWithData.forEach(hole => {
    const pos = holePos[hole.id];
    if (!pos) return;
    const isWamex = hole.source === 'wamex';
    const { x, z, azRad, dipRad, depth } = pos;
    const y0 = 0;
    const dx = depth * Math.sin(azRad) * Math.cos(dipRad);
    const dy = depth * Math.sin(dipRad);
    const dz = depth * Math.cos(azRad) * Math.cos(dipRad);

    hole.intervals.forEach(iv => {
      if (!iv.grade || iv.grade < gradeCutoff) return;
      const f   = (iv.from_m || 0) / depth;
      const t   = Math.min((iv.to_m   || 0) / depth, 1.0);
      const len = Math.max((iv.to_m || 0) - (iv.from_m || 0), geomScale * 0.5);
      const mx  = x  + dx * (f + t) / 2;
      const my  = y0 + dy * (f + t) / 2;
      const mz  = z  + dz * (f + t) / 2;

      const radius = geomScale * cylSizeMult * (isWamex ? 0.2 : 0.3 + Math.min(iv.grade / 25, 0.7));
      const col    = _gradeColor(iv.grade, isWamex, colourScheme);
      const mesh   = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, len, 8),
        new THREE.MeshLambertMaterial({ color: col, emissive: col,
          emissiveIntensity: isWamex ? 0.4 : 0.8 })
      );

      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      const up  = Math.abs(dir.dot(new THREE.Vector3(0, 1, 0))) > 0.999
        ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      mesh.setRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(up, dir)
      );
      mesh.position.set(mx, my, mz);
      scene.add(mesh);
      added.push(mesh);
    });
  });

  return added;
}

// ── Intercept rebuild (triggered by controls) ─────────────────────────────────

function _rebuildIntercepts(wrap) {
  const s = wrap._3dState;
  if (!s) return;
  (s.interceptMeshes || []).forEach(m => s.scene.remove(m));
  s.interceptMeshes = _buildInterceptMeshes(
    s.scene, s.holesWithData, s.holePos, s.geomScale, s.settings
  );
  // Re-apply intercept opacity if user has changed it from the default
  const opa = wrap._opacity?.intercepts ?? 1.0;
  if (opa < 1.0) _applyOpacity(wrap, 'intercepts', opa);
  _update3DBadge(wrap);
  if (wrap._3dLegend) wrap._3dLegend.innerHTML = _buildLegendHTML(s.settings.colourScheme);
}

function _update3DBadge(wrap) {
  const s = wrap._3dState;
  if (!wrap._3dBadge || !s) return;
  const n = s.interceptMeshes.length;
  const holeLabel = s.nWamex > 0
    ? `<span style="color:#ddcc55">${s.nCompany} co</span> + <span style="color:#4466aa">${s.nWamex} wamex</span> holes`
    : `${s.nCompany + s.nWamex} holes`;
  wrap._3dBadge.innerHTML = `${holeLabel} · ${n} intercepts${s.hasCoords ? ' · real coords' : ''}`;
}

// ── Display controls panel ────────────────────────────────────────────────────

function _build3DControlsPanel(wrap) {
  const s = wrap._3dState;

  const panel = document.createElement('div');
  panel.style.cssText = `position:absolute;top:42px;right:10px;
    background:rgba(0,0,0,0.65);border:1px solid #1a2a3a;border-radius:3px;
    padding:8px 10px;font-family:monospace;font-size:10px;color:#88aa88;
    display:flex;flex-direction:column;gap:6px;min-width:185px`;

  // Button group helper — getCurrent() returns the active value (re-evaluated on each click)
  const _btnGroup = (options, getCurrent, onChange) => {
    const grp = document.createElement('div');
    grp.style.cssText = 'display:flex;gap:3px';
    options.forEach(({ label, value }) => {
      const btn = document.createElement('span');
      btn.textContent = label;
      btn.style.cssText = `padding:2px 7px;border-radius:2px;cursor:pointer;
        border:1px solid #1a2a3a;user-select:none`;
      const _setActive = (active) => {
        btn.style.background  = active ? '#1a3a2a' : 'transparent';
        btn.style.color       = active ? '#aaccaa' : '#88aa88';
        btn.style.borderColor = active ? '#2a5a3a' : '#1a2a3a';
      };
      _setActive(value === getCurrent());
      btn.addEventListener('click', () => {
        grp.querySelectorAll('span').forEach(b => {
          b.style.background = 'transparent'; b.style.color = '#88aa88'; b.style.borderColor = '#1a2a3a';
        });
        _setActive(true);
        onChange(value);
      });
      grp.appendChild(btn);
    });
    return grp;
  };

  const _row = (labelText, control) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';
    const lbl = document.createElement('span');
    lbl.textContent = labelText;
    lbl.style.cssText = 'min-width:52px;flex-shrink:0';
    row.appendChild(lbl);
    row.appendChild(control);
    return row;
  };

  // Colour scheme
  panel.appendChild(_row('Colours', _btnGroup(
    [{ label: 'Red', value: 'red' }, { label: 'Heat', value: 'heat' }, { label: 'Mono', value: 'mono' }],
    () => s.settings.colourScheme,
    v => { s.settings.colourScheme = v; _rebuildIntercepts(wrap); }
  )));

  // Cylinder size
  panel.appendChild(_row('Cyl size', _btnGroup(
    [{ label: 'S', value: 0.5 }, { label: 'M', value: 1.0 }, { label: 'L', value: 2.0 }],
    () => s.settings.cylSizeMult,
    v => { s.settings.cylSizeMult = v; _rebuildIntercepts(wrap); }
  )));

  // Viewer height — buttons set wrap height; ResizeObserver handles camera/renderer
  panel.appendChild(_row('Height', _btnGroup(
    [{ label: '–', value: 380 }, { label: '■', value: 520 }, { label: '+', value: 720 }],
    () => { const h = parseInt(wrap.style.height); return h === 380 ? 380 : h === 720 ? 720 : 520; },
    v => { wrap.style.height = v + 'px'; }
  )));

  // Grade cutoff slider
  const cutoffDiv = document.createElement('div');
  cutoffDiv.style.cssText = 'display:flex;flex-direction:column;gap:3px;padding-top:4px;border-top:1px solid #1a2a3a';

  const cutoffTop = document.createElement('div');
  cutoffTop.style.cssText = 'display:flex;justify-content:space-between';
  const cutoffLabel = document.createElement('span');
  cutoffLabel.textContent = 'Grade cutoff';
  const cutoffVal = document.createElement('span');
  cutoffVal.style.color = '#aaccaa';
  cutoffVal.textContent = s.settings.gradeCutoff.toFixed(2) + ' g/t';
  cutoffTop.appendChild(cutoffLabel);
  cutoffTop.appendChild(cutoffVal);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0'; slider.max = '5'; slider.step = '0.1';
  slider.value = s.settings.gradeCutoff;
  slider.style.cssText = 'width:100%;cursor:pointer;accent-color:#4a8a4a;margin:0';
  slider.addEventListener('input', function () {
    const v = parseFloat(this.value);
    s.settings.gradeCutoff = v;
    cutoffVal.textContent = v.toFixed(2) + ' g/t';
    _rebuildIntercepts(wrap);
  });

  cutoffDiv.appendChild(cutoffTop);
  cutoffDiv.appendChild(slider);
  panel.appendChild(cutoffDiv);

  // ── Opacity sliders ────────────────────────────────────────────────────────
  // Initialise opacity store with sensible defaults matching the render defaults.
  if (!wrap._opacity) wrap._opacity = { voxels: 0.82, intercepts: 1.0, surface: 0.68 };

  const opDiv = document.createElement('div');
  opDiv.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding-top:6px;border-top:1px solid #1a2a3a';

  const opHdr = document.createElement('div');
  opHdr.textContent = 'Opacity';
  opHdr.style.cssText = 'font-size:9px;color:#667766;text-transform:uppercase;letter-spacing:0.05em';
  opDiv.appendChild(opHdr);

  const _opRow = (label, key, minVal) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:5px';
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = 'min-width:62px;flex-shrink:0;font-size:9px;color:#667766';
    const sl = document.createElement('input');
    sl.type = 'range'; sl.min = String(minVal); sl.max = '1'; sl.step = '0.05';
    sl.value = String(wrap._opacity[key]);
    sl.style.cssText = 'flex:1;cursor:pointer;accent-color:#4a8a4a;margin:0';
    const pct = document.createElement('span');
    pct.style.cssText = 'min-width:26px;text-align:right;color:#aaccaa;font-size:9px';
    pct.textContent = Math.round(wrap._opacity[key] * 100) + '%';
    sl.addEventListener('input', function () {
      const v = parseFloat(this.value);
      wrap._opacity[key] = v;
      pct.textContent = Math.round(v * 100) + '%';
      _applyOpacity(wrap, key, v);
    });
    row.appendChild(lbl); row.appendChild(sl); row.appendChild(pct);
    return row;
  };

  opDiv.appendChild(_opRow('Ore body',    'voxels',     0.05));
  opDiv.appendChild(_opRow('Drill holes', 'intercepts', 0.05));
  opDiv.appendChild(_opRow('Surfaces',    'surface',    0));
  panel.appendChild(opDiv);

  wrap.appendChild(panel);
}

// ── Main entry ────────────────────────────────────────────────────────────────

function minesRender3D(holes, containerId) {
  const wrap = document.getElementById(containerId || 'mines-3d-wrap');
  if (!wrap) return;

  if (_3dAnimFrame) { cancelAnimationFrame(_3dAnimFrame); _3dAnimFrame = null; }
  if (_3dRenderer)  { _3dRenderer.dispose(); _3dRenderer = null; }

  wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;
    color:var(--muted);font-size:12px">Loading 3D engine…</div>`;

  _loadThree().then(() => _minesRender3DInner(wrap, holes)).catch(e => {
    wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;
      color:#ff6666;font-size:12px">3D load error: ${e.message}</div>`;
  });
}

function _loadThree() {
  if (window.THREE) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = './three.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('three.min.js not found'));
    document.head.appendChild(s);
  });
}

function _minesRender3DInner(wrap, holes) {
  const THREE = window.THREE;
  if (!THREE) throw new Error('THREE still undefined after load');

  const holesWithData = (holes || []).filter(h => h.intervals && h.intervals.length > 0);
  if (!holesWithData.length) {
    wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;
      color:var(--muted);font-size:12px">No intercept data extracted for this ticker</div>`;
    return;
  }

  // ── Assign 3D positions ──────────────────────────────────────────────────
  const hasCoords = holesWithData.every(h => h.easting != null && h.northing != null);

  const _median = arr => { const s = [...arr].sort((a,b)=>a-b); const m = s.length>>1; return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
  const _iqrFilter = (arr, vals, k=3) => {
    const med = _median(arr);
    const devs = arr.map(v => Math.abs(v - med));
    const mad  = _median(devs) || 1;
    return vals.filter((_, i) => Math.abs(arr[i] - med) <= k * mad * 1.4826);
  };

  let cx = 0, cy = 0;
  if (hasCoords) {
    cx = _median(holesWithData.map(h => h.easting));
    cy = _median(holesWithData.map(h => h.northing));
  }

  const COLS         = Math.ceil(Math.sqrt(holesWithData.length));
  const HOLE_SPACING = 60;

  const holePos = {};
  holesWithData.forEach((h, i) => {
    let x, z;
    if (hasCoords) {
      x = h.easting  - cx;
      z = h.northing - cy;
    } else {
      x = (i % COLS)           * HOLE_SPACING;
      z = Math.floor(i / COLS) * HOLE_SPACING;
    }
    const az  = ((h.azimuth || (i % 4) * 90) * Math.PI) / 180;
    const dip = (-Math.abs(h.dip || 60)      * Math.PI) / 180;
    const dep = h.total_depth_m ||
      Math.max(...h.intervals.map(iv => iv.to_m || 0), 150);
    holePos[h.id] = { x, z, azRad: az, dipRad: dip, depth: dep };
  });

  // ── Scene setup ──────────────────────────────────────────────────────────
  wrap.innerHTML = '';
  const W = wrap.clientWidth || 900;
  const H = wrap.clientHeight || 520;

  const _extE = hasCoords ? holesWithData.map(h => h.easting  - cx) : holesWithData.map((_,i) => (i % COLS) * HOLE_SPACING);
  const _extN = hasCoords ? holesWithData.map(h => h.northing - cy) : holesWithData.map((_,i) => Math.floor(i / COLS) * HOLE_SPACING);
  const _filtE = hasCoords ? _iqrFilter(_extE, _extE) : _extE;
  const _filtN = hasCoords ? _iqrFilter(_extN, _extN) : _extN;
  const sceneSpan = Math.max(
    Math.max(..._filtE) - Math.min(..._filtE),
    Math.max(..._filtN) - Math.min(..._filtN),
    500
  );

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a12);

  const camera = new THREE.PerspectiveCamera(50, W / H, sceneSpan * 0.0001, sceneSpan * 20);
  _3dRenderer = new THREE.WebGLRenderer({ antialias: true });
  _3dRenderer.setSize(W, H);
  _3dRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _3dRenderer.localClippingEnabled = true;
  wrap.appendChild(_3dRenderer.domElement);

  const gridSize = Math.ceil(sceneSpan * 1.1 / 100) * 100;
  const gridDivs = Math.min(Math.round(sceneSpan / 200), 100);
  scene.add(new THREE.GridHelper(gridSize, gridDivs, 0x334455, 0x1a2233));

  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(gridSize, gridSize),
    new THREE.MeshLambertMaterial({ color: 0x1a2233, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  scene.add(groundMesh);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(sceneSpan * 0.3, sceneSpan * 0.5, sceneSpan * 0.2);
  scene.add(sun);

  const geomScale = sceneSpan < 5000
    ? Math.max(sceneSpan * 0.01, 5)
    : sceneSpan * 0.00025;

  // ── Hole traces + collars (static — not rebuilt on settings change) ───────
  let allPoints = [];
  let nCompany = 0, nWamex = 0;

  holesWithData.forEach(hole => {
    const pos = holePos[hole.id];
    if (!pos) return;
    const isWamex = hole.source === 'wamex';
    if (isWamex) nWamex++; else nCompany++;

    const { x, z, azRad, dipRad, depth } = pos;
    const y0 = 0;
    const dx = depth * Math.sin(azRad) * Math.cos(dipRad);
    const dy = depth * Math.sin(dipRad);
    const dz = depth * Math.cos(azRad) * Math.cos(dipRad);

    const pts = [new THREE.Vector3(x, y0, z), new THREE.Vector3(x+dx, y0+dy, z+dz)];
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: isWamex ? 0x334466 : 0x8899bb })
    ));
    allPoints.push(...pts);

    const collar = new THREE.Mesh(
      new THREE.SphereGeometry(geomScale * (isWamex ? 0.4 : 0.6), 8, 8),
      new THREE.MeshLambertMaterial({
        color:   isWamex ? 0x4466aa : 0xddcc55,
        emissive:isWamex ? 0x112244 : 0x443300,
      })
    );
    collar.position.set(x, y0, z);
    scene.add(collar);
  });

  // ── Initial intercept build ───────────────────────────────────────────────
  const settings = { gradeCutoff: 0.1, colourScheme: 'red', cylSizeMult: 1.0 };
  const interceptMeshes = _buildInterceptMeshes(scene, holesWithData, holePos, geomScale, settings);

  // Store state on wrap for rebuild / controls
  wrap._3dState = { scene, holesWithData, holePos, geomScale, settings, interceptMeshes, nCompany, nWamex, hasCoords };

  // ── Camera fit ───────────────────────────────────────────────────────────
  const _apx = allPoints.map(p => p.x), _apz = allPoints.map(p => p.z);
  const _mX  = _median(_apx), _mZ = _median(_apz);
  const _dX  = (_median(_apx.map(v => Math.abs(v - _mX))) || 1) * 1.4826 * 3;
  const _dZ  = (_median(_apz.map(v => Math.abs(v - _mZ))) || 1) * 1.4826 * 3;
  const _corePoints = allPoints.filter((p, i) =>
    Math.abs(_apx[i] - _mX) <= _dX && Math.abs(_apz[i] - _mZ) <= _dZ
  );
  const bbox = new THREE.Box3();
  (_corePoints.length ? _corePoints : allPoints).forEach(p => bbox.expandByPoint(p));
  const centre = new THREE.Vector3();
  bbox.getCenter(centre);
  const size = bbox.getSize(new THREE.Vector3()).length();
  const dist = size * 1.4;
  camera.position.set(centre.x + dist * 0.6, centre.y + dist * 0.5, centre.z + dist * 0.7);
  camera.lookAt(centre);
  camera.near = Math.max(dist * 0.001, 0.1);
  camera.far  = dist * 20;
  camera.updateProjectionMatrix();

  const _orbit = _makeOrbitControls(camera, _3dRenderer.domElement, centre, dist);

  // ── Overlays ─────────────────────────────────────────────────────────────
  wrap.style.position = 'relative';

  // Legend — bottom-left, not toggleable, updates on colour scheme change
  const legend = document.createElement('div');
  legend.style.cssText = `position:absolute;bottom:12px;left:12px;font-size:10px;
    font-family:monospace;pointer-events:none;background:rgba(0,0,0,0.55);
    padding:8px 10px;border-radius:3px;border:1px solid #1a2a1a`;
  legend.innerHTML = _buildLegendHTML(settings.colourScheme);
  wrap._3dLegend = legend;
  wrap.appendChild(legend);

  // Badge — top-right
  const badge = document.createElement('div');
  badge.style.cssText = `position:absolute;top:10px;right:10px;font-size:10px;
    color:var(--muted);font-family:monospace;background:rgba(0,0,0,0.55);
    padding:4px 8px;border-radius:2px;border:1px solid #1a2a1a;pointer-events:none`;
  wrap._3dBadge = badge;
  wrap.appendChild(badge);
  _update3DBadge(wrap);

  // Top-left controls container — plan view toggle stacked above any future rows
  // (sdfsAddVoxelMesh appends a Grade/JORC row here instead of creating an overlapping element)
  const controlsLeft = document.createElement('div');
  controlsLeft.className = 'mines3d-controls-left';
  controlsLeft.style.cssText = `position:absolute;top:10px;left:10px;display:flex;
    flex-direction:column;gap:4px;z-index:10`;
  wrap._3dControlsLeft = controlsLeft;

  const planBtn = document.createElement('div');
  planBtn.style.cssText = `font-size:10px;font-family:monospace;background:rgba(0,0,0,0.6);
    padding:4px 10px;border-radius:2px;border:1px solid #1a2a3a;cursor:pointer;color:#88aa88;
    user-select:none`;
  planBtn.textContent = '⊙ Plan view';
  let _planMode = false;
  planBtn.addEventListener('click', () => {
    _planMode = !_planMode;
    if (_planMode) {
      camera.position.set(centre.x, centre.y + dist * 1.5, centre.z);
      camera.up.set(0, 0, -1);
      camera.lookAt(centre);
      camera.updateProjectionMatrix();
      planBtn.textContent = '⊙ 3D view';
      planBtn.style.color = '#aaccaa';
      planBtn.style.borderColor = '#2a4a2a';
    } else {
      camera.up.set(0, 1, 0);
      camera.position.set(centre.x + dist * 0.6, centre.y + dist * 0.5, centre.z + dist * 0.7);
      camera.lookAt(centre);
      camera.updateProjectionMatrix();
      planBtn.textContent = '⊙ Plan view';
      planBtn.style.color = '#88aa88';
      planBtn.style.borderColor = '#1a2a3a';
    }
  });
  controlsLeft.appendChild(planBtn);
  wrap.appendChild(controlsLeft);

  // Display controls panel — top-right, below badge
  _build3DControlsPanel(wrap);

  // Depth slicer — bottom-right
  const _maxSliceDepth = Math.max(Math.abs(bbox.min.y), 100);
  const _slicePlane    = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

  const sliceWrap = document.createElement('div');
  sliceWrap.style.cssText = `position:absolute;bottom:12px;right:12px;
    background:rgba(0,0,0,0.6);border:1px solid #1a2a3a;border-radius:3px;
    padding:8px 10px;font-family:monospace;font-size:10px;color:#88aa88;
    display:flex;flex-direction:column;align-items:center;gap:4px`;
  sliceWrap.innerHTML = `
    <div>&#9660; depth slice</div>
    <input type="range" min="0" max="${Math.round(_maxSliceDepth)}" value="0"
      style="width:110px;cursor:pointer;accent-color:#4a8a4a">
    <div style="color:#aaccaa">Full view</div>`;
  wrap.appendChild(sliceWrap);

  const _sliceInput = sliceWrap.querySelector('input');
  const _sliceLabel = sliceWrap.querySelectorAll('div')[1];
  _sliceInput.addEventListener('input', function () {
    const d = parseFloat(this.value);
    if (d <= 0) {
      _3dRenderer.clippingPlanes = [];
      _sliceLabel.textContent = 'Full view';
    } else {
      _slicePlane.constant = -d;
      _3dRenderer.clippingPlanes = [_slicePlane];
      _sliceLabel.textContent = `>${Math.round(d)}m depth`;
    }
  });

  // ── Animation loop ───────────────────────────────────────────────────────
  function animate() {
    _3dAnimFrame = requestAnimationFrame(animate);
    _orbit.update();
    _3dRenderer.render(scene, camera);
  }
  animate();

  // Store scene context for ore/ground mesh overlays from DFS Pred tab
  wrap._threeScene = scene;
  wrap._threeCx    = hasCoords ? cx : 0;
  wrap._threeCy    = hasCoords ? cy : 0;
  const _rls = holesWithData.filter(h => h.rl != null).map(h => h.rl);
  wrap._threeZRef  = _rls.length > 0 ? _median(_rls) : 0;

  // Voxel volumetric render — preferred over surface mesh when available
  const _hasVoxels = wrap._pendingSubmodelMeshes
    ? wrap._pendingSubmodelMeshes.some(sm => sm.voxels)
    : !!wrap._pendingVoxels;

  if (_hasVoxels && typeof sdfsAddVoxelMesh === 'function') {
    const _entries = wrap._pendingSubmodelMeshes
      ? wrap._pendingSubmodelMeshes.filter(sm => sm.voxels).map(sm => ({ voxels: sm.voxels, color: sm.color }))
      : (wrap._pendingVoxels || []);
    sdfsAddVoxelMesh(wrap.id, _entries);
    delete wrap._pendingVoxels;
    // Still add the surface mesh underneath (hidden by sdfsAddVoxelMesh) for fallback
    if (wrap._pendingSubmodelMeshes && typeof sdfsAddOreMesh === 'function') {
      sdfsAddOreMesh(wrap.id, { submodels: wrap._pendingSubmodelMeshes });
      delete wrap._pendingSubmodelMeshes;
    }
  } else if (wrap._pendingSubmodelMeshes && typeof sdfsAddOreMesh === 'function') {
    sdfsAddOreMesh(wrap.id, { submodels: wrap._pendingSubmodelMeshes });
    delete wrap._pendingSubmodelMeshes;
  } else if (wrap._pendingMesh && typeof sdfsAddOreMesh === 'function') {
    sdfsAddOreMesh(wrap.id, wrap._pendingMesh);
    delete wrap._pendingMesh;
  }
  if (wrap._pendingGround && typeof sdfsAddGroundSurface === 'function') {
    sdfsAddGroundSurface(wrap.id, wrap._pendingGround);
    delete wrap._pendingGround;
  }

  _overlayGeology(scene, groundMesh, cx, cy, gridSize, holesWithData, badge).catch(() => {});

  new ResizeObserver(() => {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    _3dRenderer.setSize(w, h);
  }).observe(wrap);
}

// ── Minimal orbit controls (rotate / zoom / pan) ─────────────────────────────
function _makeOrbitControls(camera, domEl, target, sceneSize) {
  const _t  = target.clone();
  let _phi  = Math.acos((camera.position.y - _t.y) / camera.position.distanceTo(_t));
  let _theta = Math.atan2(camera.position.x - _t.x, camera.position.z - _t.z);
  let _r    = camera.position.distanceTo(_t);
  let _mouse = null, _button = 0;
  let _velPhi = 0, _velTheta = 0;

  const _update = () => {
    _velPhi   *= 0.88;
    _velTheta *= 0.88;
    _phi   += _velPhi;
    _theta += _velTheta;
    _phi = Math.max(0.05, Math.min(Math.PI - 0.05, _phi));
    camera.position.set(
      _t.x + _r * Math.sin(_phi) * Math.sin(_theta),
      _t.y + _r * Math.cos(_phi),
      _t.z + _r * Math.sin(_phi) * Math.cos(_theta),
    );
    camera.lookAt(_t);
  };

  domEl.addEventListener('mousedown', e => { _mouse = { x: e.clientX, y: e.clientY }; _button = e.button; e.preventDefault(); });
  domEl.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('mousemove', e => {
    if (!_mouse) return;
    const dx = e.clientX - _mouse.x, dy = e.clientY - _mouse.y;
    _mouse = { x: e.clientX, y: e.clientY };
    if (_button === 0) {
      const sens = Math.max(0.0003, 0.003 * Math.min(_r / sceneSize, 1));
      _velTheta -= dx * sens;
      _velPhi   -= dy * sens;
    } else if (_button === 2) {
      const panScale = _r * 0.001;
      const forward = new THREE.Vector3().subVectors(camera.position, _t).normalize();
      const right   = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const up      = new THREE.Vector3().crossVectors(right, forward).normalize();
      _t.addScaledVector(right, dx * panScale);
      _t.addScaledVector(up,   -dy * panScale);
    }
  });

  window.addEventListener('mouseup', () => { _mouse = null; });

  domEl.addEventListener('wheel', e => {
    const delta = e.deltaMode === 0 ? e.deltaY * 0.003 : e.deltaY * 0.3;
    _r = Math.max(50, Math.min(sceneSize * 8, _r * (1 + delta)));
    e.preventDefault();
  }, { passive: false });

  domEl.addEventListener('touchstart', e => {
    if (e.touches.length === 1) _mouse = { x: e.touches[0].clientX, y: e.touches[0].clientY, _button: 0 };
  }, { passive: true });
  domEl.addEventListener('touchmove', e => {
    if (!_mouse || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - _mouse.x, dy = e.touches[0].clientY - _mouse.y;
    _mouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    _velTheta -= dx * 0.008;
    _velPhi   -= dy * 0.008;
  }, { passive: true });
  domEl.addEventListener('touchend', () => { _mouse = null; }, { passive: true });

  return { update: _update };
}

// ── Geology overlay functions ─────────────────────────────────────────────────

function _detectUTMZone(holes) {
  const h = (holes || []).find(h => h.easting != null && h.northing != null);
  if (!h) return null;
  const e = h.easting, n = h.northing;
  if (e > 300000 && e < 500000 && n > 900000 && n < 1500000) return 32629;
  return null;
}

function _loadProj4() {
  if (window.proj4) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.9.0/proj4.min.js';
    s.onload = () => {
      if (window.proj4) {
        proj4.defs('EPSG:32629', '+proj=utm +zone=29 +datum=WGS84 +units=m +no_defs');
      }
      resolve();
    };
    s.onerror = () => reject(new Error('proj4.js load failed'));
    document.head.appendChild(s);
  });
}

async function _overlayGeology(scene, groundMesh, cx, cy, gridSize, holes, badge) {
  const THREE = window.THREE;
  const utmZone = _detectUTMZone(holes);
  if (!utmZone) return;

  await _loadProj4();

  const pad = gridSize * 0.05;
  const [lng1, lat1] = proj4('EPSG:' + utmZone, 'EPSG:4326', [cx - gridSize/2 - pad, cy - gridSize/2 - pad]);
  const [lng2, lat2] = proj4('EPSG:' + utmZone, 'EPSG:4326', [cx + gridSize/2 + pad, cy + gridSize/2 + pad]);

  const wmsUrl = `https://mrdata.usgs.gov/services/gscworld`
    + `?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap`
    + `&LAYERS=geology,flt`
    + `&CRS=EPSG:4326`
    + `&BBOX=${lat1},${lng1},${lat2},${lng2}`
    + `&WIDTH=512&HEIGHT=512`
    + `&FORMAT=image/png&TRANSPARENT=TRUE`;

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  loader.load(
    wmsUrl,
    (tex) => {
      groundMesh.material.map = tex;
      groundMesh.material.color.set(0xffffff);
      groundMesh.material.opacity = 0.65;
      groundMesh.material.needsUpdate = true;
      if (badge) {
        const cur = badge.textContent || '';
        if (!cur.includes('geo')) badge.textContent = cur + ' · geo';
      }
    },
    undefined,
    () => {}
  );

  const wfsUrl = `https://mrdata.usgs.gov/services/gscworld`
    + `?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature`
    + `&TYPENAMES=flt&COUNT=100&OUTPUTFORMAT=application/json`
    + `&BBOX=${lat1},${lng1},${lat2},${lng2},EPSG:4326`;

  try {
    const r = await fetch(wfsUrl);
    if (r.ok) {
      const gj = await r.json();
      _add3DFaultLines(scene, gj, cx, cy, utmZone);
    }
  } catch (_) {}
}

function _add3DFaultLines(scene, geojson, cx, cy, utmZone, depth) {
  const THREE = window.THREE;
  depth = depth || 600;
  const features = (geojson && geojson.features) || [];
  features.forEach(f => {
    const geom = f.geometry;
    if (!geom) return;
    const lines = geom.type === 'LineString'
      ? [geom.coordinates]
      : geom.type === 'MultiLineString' ? geom.coordinates : [];

    lines.forEach(coords => {
      const pts = coords.map(([lng, lat]) => {
        const [e, n] = proj4('EPSG:4326', 'EPSG:' + utmZone, [lng, lat]);
        return new THREE.Vector3(e - cx, 0, n - cy);
      });
      if (pts.length < 2) return;
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xff3300 })
      ));
      pts.forEach(p => {
        const vPts = [p.clone(), new THREE.Vector3(p.x, -depth, p.z)];
        scene.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(vPts),
          new THREE.LineBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.25 })
        ));
      });
    });
  });
}
