// tab_synthetic_dfs.js — Synthetic DFS Prediction Pipeline tab
// Shows drill visualisations and stats for each ticker/target.

let _synthDFSData = null;

async function initSynthDFSTab() {
  const body = document.getElementById('synth-dfs-body');
  const loading = document.getElementById('synth-dfs-loading');
  if (!body) return;

  try {
    const r = await fetch('synthetic_dfs_data.json?v=' + Date.now());
    if (!r.ok) throw new Error('synthetic_dfs_data.json not found');
    _synthDFSData = await r.json();
  } catch (e) {
    loading.innerHTML = `<div style="color:var(--muted);padding:40px;text-align:center">
      No synthetic DFS data yet.<br>
      <small>Run the pipeline: <code>python scripts/synthetic_dfs/run_pipeline.py --ticker MEK --target fs1</code></small>
    </div>`;
    return;
  }

  loading.style.display = 'none';
  body.style.display = 'block';
  body.innerHTML = buildSynthDFS(_synthDFSData);
}

function buildSynthDFS(data) {
  const tickers = Object.keys(data.tickers || {});
  if (!tickers.length) return '<p style="color:var(--muted)">No pipeline outputs found.</p>';

  let html = `
    <div style="margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <span style="color:var(--muted);font-size:12px">Updated: ${data.updated_at ? data.updated_at.slice(0,19).replace('T',' ') + ' UTC' : '—'}</span>
    </div>`;

  for (const ticker of tickers) {
    const tdata = data.tickers[ticker];
    html += buildTickerSection(ticker, tdata);
  }
  return html;
}

function buildTickerSection(ticker, tdata) {
  const targets = Object.keys(tdata.targets || {});
  if (!targets.length) return '';

  let tabBtns = '', tabPanes = '';
  targets.forEach((tkey, i) => {
    const t = tdata.targets[tkey];
    const active = i === 0 ? 'sdfs-tab-active' : '';
    tabBtns += `<button class="sdfs-tab-btn ${active}" onclick="sdfsSelectTarget('${ticker}','${tkey}')" id="sdfs-btn-${ticker}-${tkey}">${tkey.toUpperCase()}</button>`;
    tabPanes += buildTargetPane(ticker, tkey, t, i === 0);
  });

  return `
    <div style="margin-bottom:36px">
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:12px">
        <h2 style="margin:0;font-size:18px;color:var(--accent)">${ticker}</h2>
        <span style="color:var(--muted);font-size:13px">${tdata.company || ''}</span>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px">${tabBtns}</div>
      ${tabPanes}
    </div>`;
}

function buildTargetPane(ticker, tkey, t, visible) {
  const display = visible ? 'block' : 'none';
  const s = t.stats || {};
  const bb = s.bounding_box || {};
  const gs = s.grade_stats || {};
  const v  = Date.now();

  // Grade colour helper
  const gradeColour = g => g >= 5 ? '#cc0000' : g >= 2 ? '#e07b00' : g >= 0.5 ? '#f5c518' : '#888';

  // Top holes table
  let holeRows = '';
  const holes = Object.entries(s.holes_with_grade || {}).slice(0, 15);
  for (const [hid, g] of holes) {
    const colour = gradeColour(g);
    holeRows += `<tr>
      <td style="font-family:monospace;font-size:11px">${hid}</td>
      <td style="color:${colour};font-weight:bold;text-align:right">${g.toFixed(2)}</td>
    </tr>`;
  }

  const imgStyle = 'width:100%;border-radius:6px;border:1px solid #333;cursor:pointer';

  const imgHtml = (key, label) => {
    const src = t.images?.[key];
    if (!src) return `<div style="color:var(--muted);font-size:11px;padding:20px;text-align:center;border:1px dashed #333;border-radius:6px">${label} — not yet generated</div>`;
    return `<div>
      <div style="color:var(--muted);font-size:11px;margin-bottom:6px">${label}</div>
      <img src="${src}?v=${v}" alt="${label}" style="${imgStyle}" onclick="sdfsExpandImg(this)">
    </div>`;
  };

  const imgHtml2 = (key, label) => {
    const src = t.model_sections?.[key];
    if (!src) return `<div style="color:var(--muted);font-size:11px;padding:20px;text-align:center;border:1px dashed #333;border-radius:6px">${label} — not yet generated</div>`;
    return `<div>
      <div style="color:var(--muted);font-size:11px;margin-bottom:6px">${label}</div>
      <img src="${src}?v=${v}" alt="${label}" style="${imgStyle}" onclick="sdfsExpandImg(this)">
    </div>`;
  };

  const has3d       = !!t.drill_holes_url;
  const hasMesh     = !!t.ore_body_mesh_url;
  const hasMeshBase = !!t.ore_body_mesh_base_url;
  const m1 = t.mission1 || {};

  // Resource estimate panel (Mission 1 GemPy)
  const errColor = m1.pass === true ? '#44bb88' : m1.pass === false ? '#ff6666' : '#888';
  const m1Panel = m1.contained_koz != null ? `
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:16px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:10px">
        Mission 1 — GemPy Resource Estimate
        <span style="font-weight:normal;color:var(--muted);margin-left:8px">(IS data only)</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:bold;color:#f5c518">${m1.contained_koz.toFixed(1)}</div>
          <div style="font-size:11px;color:var(--muted)">Predicted koz Au</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:bold;color:#888">${m1.ho_koz != null ? m1.ho_koz.toFixed(0) : '—'}</div>
          <div style="font-size:11px;color:var(--muted)">HO Target koz</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:bold;color:${errColor}">${m1.error_pct != null ? (m1.error_pct > 0 ? '+' : '') + m1.error_pct.toFixed(1) + '%' : '—'}</div>
          <div style="font-size:11px;color:var(--muted)">Error vs HO</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:bold;color:#aaa">${m1.grade_gt != null ? m1.grade_gt.toFixed(3) : '—'}</div>
          <div style="font-size:11px;color:var(--muted)">Grade (IDW g/t)</div>
        </div>
      </div>
      ${m1.ho_label ? `<div style="font-size:11px;color:var(--muted);margin-top:10px;border-top:1px solid #333;padding-top:8px">HO: ${m1.ho_label} | Gate: ${m1.pass_gate || '±30%'} | Method: ${m1.method || 'gempy'}${m1.model_version ? ' v' + m1.model_version : ''}</div>` : ''}
      ${m1.assumptions && Object.keys(m1.assumptions).length ? (() => {
        const LABELS = {
          grade_cutoff_gt:              ['Grade cutoff', 'g/t Au'],
          grade_cutoff_source:          ['Cutoff source', ''],
          bulk_density_tm3:             ['Bulk density', 't/m³'],
          orientation_dip_direction_deg:['Dip direction', '°'],
          orientation_dip_deg:          ['Dip angle', '°'],
          interval_buffer_m:            ['Interval buffer', 'm each side'],
          influence_clip_m:             ['Influence clip', 'm radius'],
          idw_search_radius_m:          ['IDW search radius', 'm'],
          idw_power:                    ['IDW power (p)', ''],
          idw_min_samples:              ['IDW min samples', ''],
          northing_min:                 ['Northing filter (min)', 'm'],
          model_resolution:             ['Grid resolution', '[nx,ny,nz]'],
          model_pad_xy_m:               ['Model pad XY', 'm'],
          model_pad_z_m:                ['Model pad Z', 'm'],
          assay_data_type:              ['Assay data type', ''],
          collar_rl_source:             ['Collar RL source', ''],
          correction_factor:            ['Volume correction factor', ''],
          assay_intervals_total:        ['Assay intervals (total)', ''],
          assay_intervals_above_cutoff: ['Assay intervals (above cutoff)', ''],
        };
        const rows = Object.entries(m1.assumptions).map(([k, v]) => {
          const [label, unit] = LABELS[k] || [k, ''];
          const display = Array.isArray(v) ? JSON.stringify(v) : (v == null ? '—' : String(v));
          return `<tr>
            <td style="padding:3px 10px 3px 0;color:var(--muted);white-space:nowrap">${label}</td>
            <td style="padding:3px 0;color:#ccc;font-family:monospace">${display}${unit ? ' <span style="color:var(--muted);font-size:10px">' + unit + '</span>' : ''}</td>
          </tr>`;
        }).join('');
        return `<details style="margin-top:10px;border-top:1px solid #2a2a3a;padding-top:8px">
          <summary style="cursor:pointer;font-size:11px;color:var(--muted);user-select:none">
            Model assumptions (v${m1.model_version || '?'}) — click to expand
          </summary>
          <table style="font-size:11px;margin-top:8px;border-collapse:collapse;width:100%">${rows}</table>
        </details>`;
      })() : ''}
    </div>` : '';

  return `
    <div id="sdfs-pane-${ticker}-${tkey}" style="display:${display}">
      <div style="color:var(--muted);font-size:12px;margin-bottom:14px">${t.label || tkey} | cutoff ${t.cutoff_date || '—'}</div>

      ${m1Panel}

      <!-- 2D section plots -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px">
        ${imgHtml('plan_view', 'Plan View (X–Y)')}
        ${imgHtml('section_ns', 'N–S Section (looking east)')}
        ${imgHtml('section_ew', 'E–W Section (looking north) — true dip visible')}
      </div>

      <!-- GemPy lith+grade section images -->
      ${(t.model_sections && Object.keys(t.model_sections).length > 0) ? `
      <div style="margin-bottom:20px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">GemPy Block Model Sections — lith + grade</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
          ${imgHtml2('model_section_ns', 'N\u2013S Section (GemPy)')}
          ${imgHtml2('model_section_ew', 'E\u2013W Section (GemPy)')}
          ${imgHtml2('model_plan', 'Plan View (GemPy)')}
        </div>
      </div>` : ''}

      <!-- 3D viewer -->
      ${has3d ? `
      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:8px">3D Drill Intercept + Ore Body Viewer</div>
        <div id="sdfs-3d-wrap-${ticker}-${tkey}"
             style="width:100%;height:480px;border-radius:6px;border:1px solid #333;background:#0a0a12;position:relative">
          <div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px;flex-direction:column;gap:8px">
            <div>
              Click <strong style="color:var(--accent);margin:0 4px;cursor:pointer"
                onclick="sdfsLoad3D('${ticker}','${tkey}','${t.drill_holes_url}','${hasMesh ? t.ore_body_mesh_url : ''}','${hasMeshBase ? t.ore_body_mesh_base_url : ''}')">Load 3D View</strong> to render drill intercepts${hasMesh || hasMeshBase ? ' + ore body mesh' : ''}
            </div>
          </div>
        </div>
      </div>` : ''}

      <div style="display:grid;grid-template-columns:auto 1fr;gap:20px">
        <!-- Stats -->
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:16px;min-width:260px">
          <div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:10px">Pipeline Stats</div>
          ${statRow('Assay intervals', s.assay_count ?? '—')}
          ${statRow('Unique holes', s.unique_holes ?? '—')}
          ${statRow('Dry holes', s.dry_hole_count ?? '—')}
          ${statRow('Grade min', gs.min_gt != null ? gs.min_gt.toFixed(2) + ' g/t' : '—')}
          ${statRow('Grade max', gs.max_gt != null ? `<span style="color:${gradeColour(gs.max_gt)};font-weight:bold">${gs.max_gt.toFixed(2)} g/t</span>` : '—')}
          ${statRow('Grade mean', gs.mean_gt != null ? gs.mean_gt.toFixed(2) + ' g/t' : '—')}
          ${statRow('Above 0.5 g/t', gs.n_above_cutoff_0p5 != null ? `${gs.n_above_cutoff_0p5} / ${s.assay_count}` : '—')}
          ${statRow('Above 1.0 g/t', gs.n_above_cutoff_1p0 != null ? `${gs.n_above_cutoff_1p0} / ${s.assay_count}` : '—')}
          <div style="margin-top:10px;border-top:1px solid #333;padding-top:10px;font-size:11px;color:var(--muted)">Bounding box (MGA94 Z50)</div>
          ${statRow('Easting', bb.x_min != null ? `${bb.x_min.toFixed(0)} – ${bb.x_max.toFixed(0)}` : '—')}
          ${statRow('Northing', bb.y_min != null ? `${bb.y_min.toFixed(0)} – ${bb.y_max.toFixed(0)}` : '—')}
          ${statRow('RL', bb.z_min != null ? `${bb.z_min.toFixed(0)} – ${bb.z_max.toFixed(0)} m` : '—')}
        </div>

        <!-- Hole table -->
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:16px;overflow:auto">
          <div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:10px">Top holes by peak grade</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="color:var(--muted);border-bottom:1px solid #333">
                <th style="text-align:left;padding:4px 8px">Hole ID</th>
                <th style="text-align:right;padding:4px 8px">Au g/t</th>
              </tr>
            </thead>
            <tbody>${holeRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function statRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;border-bottom:1px solid #222">
    <span style="color:var(--muted)">${label}</span>
    <span>${value}</span>
  </div>`;
}

function sdfsSelectTarget(ticker, tkey) {
  // Hide all panes + deactivate all buttons for this ticker
  document.querySelectorAll(`[id^="sdfs-pane-${ticker}-"]`).forEach(el => el.style.display = 'none');
  document.querySelectorAll(`[id^="sdfs-btn-${ticker}-"]`).forEach(el => el.classList.remove('sdfs-tab-active'));
  // Show selected
  const pane = document.getElementById(`sdfs-pane-${ticker}-${tkey}`);
  const btn  = document.getElementById(`sdfs-btn-${ticker}-${tkey}`);
  if (pane) pane.style.display = 'block';
  if (btn)  btn.classList.add('sdfs-tab-active');
}

async function sdfsLoad3D(ticker, tkey, url, meshUrl, meshBaseUrl) {
  const containerId = `sdfs-3d-wrap-${ticker}-${tkey}`;
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px">Loading…</div>`;

  let holes, meshData = null, meshDataBase = null;
  try {
    const r = await fetch(url + '?v=' + Date.now());
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    holes = await r.json();
  } catch (e) {
    wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#ff6666;font-size:12px">Failed to load drill data: ${e.message}</div>`;
    return;
  }

  // Try to load ore body top mesh (optional — soft fail)
  if (meshUrl) {
    try {
      const mr = await fetch(meshUrl + '?v=' + Date.now());
      if (mr.ok) meshData = await mr.json();
    } catch (e) { /* ignore */ }
  }

  // Try to load ore body base mesh (optional — soft fail)
  if (meshBaseUrl) {
    try {
      const mr = await fetch(meshBaseUrl + '?v=' + Date.now());
      if (mr.ok) meshDataBase = await mr.json();
    } catch (e) { /* ignore */ }
  }

  if (typeof minesRender3D === 'function') {
    // Queue the mesh bundle before calling minesRender3D — it's async and will pick up _pendingMesh
    // once the Three.js scene is fully constructed (_minesRender3DInner stores scene on wrap).
    if (meshData || meshDataBase) {
      wrap._pendingMesh = { top: meshData, base: meshDataBase };
    }
    minesRender3D(holes, containerId);
  } else {
    wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#ff6666;font-size:12px">3D engine not loaded — tab_mines_3d.js required</div>`;
  }
}

function sdfsAddOreMesh(containerId, meshBundle) {
  // Overlay the GemPy ore surface meshes in the Three.js scene.
  // meshBundle may be: {top: meshData|null, base: meshData|null}
  // or (legacy) a plain mesh data object — normalise to bundle form.
  // Requires tab_mines_3d.js to have stored _threeScene / _threeCx / _threeCy / _threeZRef on wrap.
  const wrap = document.getElementById(containerId);
  if (!wrap || !wrap._threeScene || !window.THREE) return;
  const scene = wrap._threeScene;

  // Normalise legacy single-mesh call
  if (meshBundle && !('top' in meshBundle) && !('base' in meshBundle)) {
    meshBundle = { top: meshBundle, base: null };
  }

  const cx   = wrap._threeCx  || 0;
  const cy   = wrap._threeCy  || 0;
  const zRef = wrap._threeZRef || 0;

  function addMeshToScene(meshData, color, opacity) {
    if (!meshData) return false;
    const verts = meshData.vertices;  // [[easting, northing, rl], ...]
    const faces = meshData.faces;     // [[a,b,c], ...]
    if (!verts || !faces || verts.length === 0) return false;

    const posArr = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) {
      posArr[i * 3]     = verts[i][0] - cx;    // X = easting  - cx
      posArr[i * 3 + 1] = verts[i][2] - zRef;  // Y = RL       - zRef
      posArr[i * 3 + 2] = verts[i][1] - cy;    // Z = northing - cy
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(faces.flat()), 1));
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(geometry, material));
    return true;
  }

  const hasTop  = addMeshToScene(meshBundle.top,  0xf5c518, 0.20);
  const hasBase = addMeshToScene(meshBundle.base, 0x4488cc, 0.15);

  // Add key badge to the 3D viewer
  // Avoid duplicating if already present (re-load case)
  if (!wrap.querySelector('.sdfs-ore-key')) {
    const key = document.createElement('div');
    key.className = 'sdfs-ore-key';
    key.style.cssText = [
      'position:absolute', 'bottom:12px', 'right:12px',
      'font-size:10px', 'font-family:monospace', 'pointer-events:none',
      'background:rgba(0,0,0,0.60)', 'padding:8px 10px',
      'border-radius:3px', 'border:1px solid #333',
    ].join(';');
    const topRow = hasTop ? [
      `<div style="display:flex;align-items:center;gap:6px;color:#f5c518">`,
      `  <span style="width:12px;height:12px;background:rgba(245,197,24,0.35);`,
      `    border:1px solid #f5c518;display:inline-block;border-radius:2px"></span>`,
      `  Ore_Top surface`,
      `</div>`,
    ].join('') : '';
    const baseRow = hasBase ? [
      `<div style="display:flex;align-items:center;gap:6px;color:#4488cc;margin-top:4px">`,
      `  <span style="width:12px;height:12px;background:rgba(68,136,204,0.30);`,
      `    border:1px solid #4488cc;display:inline-block;border-radius:2px"></span>`,
      `  Ore_Base surface`,
      `</div>`,
    ].join('') : '';
    key.innerHTML = [
      `<div style="color:#888;margin-bottom:5px;font-size:9px;letter-spacing:0.05em">GemPy MODEL</div>`,
      topRow,
      baseRow,
      `<div style="font-size:9px;color:#555;margin-top:4px">`,
      `  Implicit GemPy kriging · 0.5 g/t cutoff`,
      `</div>`,
    ].join('');
    wrap.appendChild(key);
  }
}

function sdfsExpandImg(img) {
  // Simple lightbox: open image in a full-screen overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  const imgEl = document.createElement('img');
  imgEl.src = img.src;
  imgEl.style.cssText = 'max-width:95vw;max-height:95vh;border-radius:4px';
  overlay.appendChild(imgEl);
  overlay.onclick = () => document.body.removeChild(overlay);
  document.body.appendChild(overlay);
}

// Inject minimal tab button styles (matches existing dashboard style)
(function() {
  const style = document.createElement('style');
  style.textContent = `
    .sdfs-tab-btn {
      background: #2a2a2a;
      border: 1px solid #444;
      color: var(--muted, #888);
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }
    .sdfs-tab-btn.sdfs-tab-active {
      background: var(--accent, #4a9eff);
      border-color: var(--accent, #4a9eff);
      color: #fff;
    }
  `;
  document.head.appendChild(style);
})();
