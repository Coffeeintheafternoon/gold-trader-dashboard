// tab_sow.js — State of the World map tab

'use strict';

let _sowMap = null;
let _sowData = null;

// Layer groups — each toggle controls one group
const _sowLayers = {
  geopolitical: { label: 'Geopolitical Risks', color: '#e05252', group: null, enabled: true },
  shipping:     { label: 'Shipping Lanes',      color: '#f5a520', group: null, enabled: true },
  mining:       { label: 'Mining Regions',      color: '#52c4a0', group: null, enabled: false },
};

// Severity → border colour
const _sevColour = { high: '#e05252', medium: '#f5a520', low: '#7a7060' };

// Impact badge colour
function _impactColour(v) {
  if (!v) return '#7a7060';
  if (v.startsWith('bull'))      return '#52c4a0';
  if (v.startsWith('mild_bull')) return '#a0c4a0';
  if (v.startsWith('bear'))      return '#e05252';
  if (v.startsWith('mild_bear')) return '#c4a0a0';
  return '#7a7060';
}

function _impactLabel(v) {
  const map = { bullish: '▲ Bullish', mild_bullish: '▲ Mild', bearish: '▼ Bearish', mild_bearish: '▼ Mild', neutral: '● Neutral' };
  return map[v] || v || '—';
}

// ── Marker icon factory ────────────────────────────────────────────────────────
function _makeIcon(colour, size = 14) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${colour};border:2px solid rgba(255,255,255,0.25);
      box-shadow:0 0 8px ${colour}88;
      cursor:pointer;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function _showDetail(h) {
  const el = document.getElementById('sow-detail-content');
  if (!el) return;

  const sev   = h.severity || 'low';
  const sevC  = _sevColour[sev] || '#7a7060';
  const type  = (h.type || '').toUpperCase();

  el.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:4px">${h.name}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid ${sevC};color:${sevC};text-transform:uppercase;letter-spacing:0.8px">${sev}</span>
        <span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid #2a2a2a;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px">${type}</span>
      </div>
      <div style="font-size:12px;color:#b0a080;line-height:1.6">${h.summary || ''}</div>
    </div>

    ${h.gold_impact || h.aud_impact || h.oil_impact ? `
    <div style="margin-bottom:12px;padding:10px;background:#0d0d0d;border-radius:4px;border:1px solid #1a1a1a">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:8px">Market Impact</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center">
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px">Gold</div>
          <div style="font-size:11px;font-weight:700;color:${_impactColour(h.gold_impact)}">${_impactLabel(h.gold_impact)}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px">AUD</div>
          <div style="font-size:11px;font-weight:700;color:${_impactColour(h.aud_impact)}">${_impactLabel(h.aud_impact)}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px">Oil</div>
          <div style="font-size:11px;font-weight:700;color:${_impactColour(h.oil_impact)}">${_impactLabel(h.oil_impact)}</div>
        </div>
      </div>
    </div>` : ''}

    ${h.scenario ? `
    <div style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Escalation Scenario</div>
      <div style="font-size:11px;color:#9a8a70;line-height:1.6;font-style:italic">${h.scenario}</div>
    </div>` : ''}
  `;

  // Update status bar
  const status = document.getElementById('sow-status');
  if (status) status.textContent = h.name;
}

// ── Build layer: hotspots ──────────────────────────────────────────────────────
function _buildHotspots(data) {
  const geo  = _sowLayers.geopolitical;
  const ship = _sowLayers.shipping;
  geo.group  = L.layerGroup();
  ship.group = L.layerGroup();

  (data.hotspots || []).forEach(h => {
    const isShip = h.type === 'shipping';
    const colour = _sevColour[h.severity] || '#7a7060';
    const size   = h.severity === 'high' ? 16 : h.severity === 'medium' ? 13 : 10;
    const marker = L.marker([h.lat, h.lng], { icon: _makeIcon(colour, size) });

    marker.on('click', () => _showDetail(h));
    marker.bindTooltip(`<b style="color:#e8d5a0">${h.name}</b><br><span style="font-size:11px;color:#9a8a70">${(h.severity||'').toUpperCase()} · ${(h.type||'').toUpperCase()}</span>`, {
      direction: 'top', offset: [0, -8],
      className: 'sow-tooltip',
    });

    if (isShip) {
      ship.group.addLayer(marker);
    } else {
      geo.group.addLayer(marker);
    }
  });
}

// ── Build layer: shipping lanes ───────────────────────────────────────────────
function _buildShippingLanes(data) {
  const ship = _sowLayers.shipping;
  if (!ship.group) ship.group = L.layerGroup();

  (data.shipping_lanes || []).forEach(lane => {
    const line = L.polyline(lane.coords, {
      color: lane.color || '#f5a520',
      weight: 1.5,
      opacity: 0.6,
      dashArray: lane.id === 'cape_route' ? '6 4' : null,
    });
    line.bindTooltip(`<b style="color:#e8d5a0">${lane.name}</b>`, {
      sticky: true, className: 'sow-tooltip',
    });
    ship.group.addLayer(line);
  });
}

// ── Build layer: mining regions ───────────────────────────────────────────────
function _buildMiningRegions(data) {
  const mining = _sowLayers.mining;
  mining.group = L.layerGroup();

  (data.mining_regions || []).forEach(r => {
    const marker = L.circleMarker([r.lat, r.lng], {
      radius: 7,
      fillColor: '#52c4a0',
      color: '#52c4a0',
      weight: 1,
      fillOpacity: 0.6,
    });
    marker.bindTooltip(`<b style="color:#e8d5a0">${r.name}</b><br><span style="font-size:11px;color:#9a8a70">Rank #${r.production_rank} producer</span><br><span style="font-size:11px;color:#7a7060">${r.notes || ''}</span>`, {
      direction: 'top', offset: [0, -8], maxWidth: 240,
      className: 'sow-tooltip',
    });
    marker.on('click', () => {
      const el = document.getElementById('sow-detail-content');
      if (el) el.innerHTML = `
        <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:6px">${r.name}</div>
        <div style="font-size:11px;color:#7a7060;margin-bottom:4px">Production rank: <span style="color:#52c4a0">#${r.production_rank} globally</span></div>
        <div style="font-size:12px;color:#9a8a70;line-height:1.6">${r.notes || ''}</div>
      `;
      const status = document.getElementById('sow-status');
      if (status) status.textContent = r.name;
    });
    mining.group.addLayer(marker);
  });
}

// ── Toggle controls ───────────────────────────────────────────────────────────
function _buildToggles() {
  const wrap = document.getElementById('sow-layer-toggles');
  if (!wrap) return;
  wrap.innerHTML = '';

  Object.entries(_sowLayers).forEach(([key, layer]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:#0d0d0d;border-radius:4px;border:1px solid #1a1a1a;cursor:pointer';

    const left = `
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:10px;height:10px;border-radius:50%;background:${layer.color};flex-shrink:0"></div>
        <span style="font-size:12px;color:${layer.enabled ? '#e8d5a0' : 'var(--muted)'}">${layer.label}</span>
      </div>`;

    const toggle = document.createElement('div');
    toggle.id = `sow-toggle-${key}`;
    toggle.style.cssText = `width:32px;height:16px;border-radius:8px;background:${layer.enabled ? layer.color : '#2a2a2a'};position:relative;transition:background 0.2s;flex-shrink:0`;
    toggle.innerHTML = `<div style="position:absolute;top:2px;${layer.enabled ? 'right:2px' : 'left:2px'};width:12px;height:12px;border-radius:50%;background:#fff;transition:left 0.2s,right 0.2s"></div>`;

    row.innerHTML = left;
    row.appendChild(toggle);

    row.addEventListener('click', () => {
      layer.enabled = !layer.enabled;
      if (layer.group) {
        layer.enabled ? _sowMap.addLayer(layer.group) : _sowMap.removeLayer(layer.group);
      }
      // Update toggle visual
      toggle.style.background = layer.enabled ? layer.color : '#2a2a2a';
      toggle.querySelector('div').style.cssText = `position:absolute;top:2px;${layer.enabled ? 'right:2px' : 'left:2px'};width:12px;height:12px;border-radius:50%;background:#fff;transition:left 0.2s,right 0.2s`;
      // Update label colour
      row.querySelector('span').style.color = layer.enabled ? '#e8d5a0' : 'var(--muted)';
    });

    wrap.appendChild(row);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initSOWTab() {
  // Tooltip style injection
  if (!document.getElementById('sow-styles')) {
    const s = document.createElement('style');
    s.id = 'sow-styles';
    s.textContent = `
      .sow-tooltip { background: #0d0d0d !important; border: 1px solid #2a2a2a !important; color: #b0a080 !important; font-size: 12px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.6) !important; }
      .sow-tooltip::before { display: none !important; }
      .leaflet-control-zoom a { background: #0d0d0d !important; color: #b0a080 !important; border-color: #2a2a2a !important; }
      .leaflet-control-zoom a:hover { background: #1a1a1a !important; color: #f5a520 !important; }
      .leaflet-control-attribution { background: rgba(0,0,0,0.6) !important; color: #3a3a3a !important; font-size: 9px !important; }
      .leaflet-control-attribution a { color: #5a5040 !important; }
    `;
    document.head.appendChild(s);
  }

  // Init map (dark tile layer)
  _sowMap = L.map('sow-map', {
    center: [20, 20],
    zoom: 3,
    minZoom: 2,
    maxZoom: 10,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(_sowMap);

  // Load data and build layers
  fetch(`sow_data.json?v=${Date.now()}`)
    .then(r => r.json())
    .then(data => {
      _sowData = data;

      _buildHotspots(data);
      _buildShippingLanes(data);
      _buildMiningRegions(data);

      // Add enabled layers to map
      Object.values(_sowLayers).forEach(layer => {
        if (layer.enabled && layer.group) _sowMap.addLayer(layer.group);
      });

      _buildToggles();

      const updated = document.getElementById('sow-updated');
      if (updated && data.generated_at) {
        updated.textContent = 'Updated ' + data.generated_at.slice(0, 10);
      }
    })
    .catch(err => {
      console.error('SOW data load failed:', err);
      const el = document.getElementById('sow-detail-content');
      if (el) el.textContent = 'Failed to load sow_data.json';
    });

  // Fix Leaflet map size after tab becomes visible
  setTimeout(() => _sowMap && _sowMap.invalidateSize(), 100);
}
