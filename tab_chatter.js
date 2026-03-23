// tab_chatter.js — Chatter tab: YouTube channel priority management + manual scrape

let _chatterSortable  = null;
let _scrapeJobId      = null;
let _scrapePoller     = null;
let _chatterLiveMode  = false;   // true = Flask server available, false = static Netlify

async function initChatterTab() {
  const elLoading = document.getElementById('chatter-loading');
  const elOffline = document.getElementById('chatter-offline');
  const elContent = document.getElementById('chatter-content');

  // ── Try Flask server first ─────────────────────────────────────────────────
  try {
    const resp = await fetch('/api/channels', { signal: AbortSignal.timeout(1500) });
    if (!resp.ok) throw new Error('server error');
    const channels = await resp.json();
    _chatterLiveMode = true;
    elLoading.style.display = 'none';
    elContent.style.display = '';
    _renderChannelList(channels, true);
    _renderScrapePanel(true);
    return;
  } catch (_e) {}

  // ── Fall back to static chatter_data.json (Netlify mode) ──────────────────
  try {
    const resp = await fetch(`./chatter_data.json?v=${_CV}`);
    if (!resp.ok) throw new Error('no data');
    const data = await resp.json();
    elLoading.style.display = 'none';
    elContent.style.display = '';
    _renderChannelList(data.channels || [], false);
    _renderScrapePanel(false);
    _renderGlossary(data.glossary || []);
  } catch (_e) {
    elLoading.style.display = 'none';
    elOffline.style.display = '';
  }
}

// ── Channel list ───────────────────────────────────────────────────────────────

function _renderChannelList(channels, interactive) {
  const panel = document.getElementById('chatter-channels-panel');
  const subtitle = interactive
    ? 'Drag to reorder — top = scraped first when quota is limited'
    : 'Read-only on Netlify — run locally to reorder';

  panel.innerHTML = `
    <div class="chart-card">
      <div class="chart-title" style="margin-bottom:4px">Channel Priority</div>
      <div class="chart-subtitle" style="margin-bottom:14px">${subtitle}</div>
      <ul id="chatter-ch-list" style="list-style:none;padding:0;margin:0"></ul>
      ${interactive ? `<p style="margin-top:14px;font-size:11px;color:var(--muted);line-height:1.5">Order is saved automatically on drop. Toggle active/inactive to exclude a channel.</p>` : ''}
    </div>
  `;

  const ul = document.getElementById('chatter-ch-list');
  channels.forEach((ch, i) => ul.appendChild(_makeChannelRow(ch, i + 1, interactive)));

  if (!interactive) return;

  // Active-toggle listeners
  ul.querySelectorAll('.ch-toggle').forEach(cb => {
    cb.addEventListener('change', () => {
      fetch('/api/channels/toggle', {
        method:  'POST',
        headers: {'Content-Type': 'application/json'},
        body:    JSON.stringify({ channel_id: cb.dataset.cid, active: cb.checked }),
      });
      cb.closest('li').style.opacity = cb.checked ? '1' : '0.45';
    });
  });

  // Drag-and-drop
  if (typeof Sortable !== 'undefined') {
    if (_chatterSortable) _chatterSortable.destroy();
    _chatterSortable = Sortable.create(ul, {
      animation:  150,
      handle:     '.drag-handle',
      ghostClass: 'sortable-ghost',
      onEnd: async () => {
        ul.querySelectorAll('li').forEach((li, i) => {
          const badge = li.querySelector('.ch-priority');
          if (badge) badge.textContent = `#${i + 1}`;
        });
        const order = [...ul.querySelectorAll('li')].map(li => li.dataset.cid);
        await fetch('/api/channels/reorder', {
          method:  'POST',
          headers: {'Content-Type': 'application/json'},
          body:    JSON.stringify({ order }),
        });
      },
    });
  }
}

function _makeChannelRow(ch, priority, interactive) {
  const li = document.createElement('li');
  li.dataset.cid = ch.channel_id;
  li.style.cssText = [
    'display:flex', 'align-items:center', 'gap:10px',
    'padding:10px 12px', 'margin-bottom:6px',
    'background:var(--card2)', 'border:1px solid #1e1e1e',
    'border-radius:4px', `opacity:${ch.active ? '1' : '0.45'}`,
  ].join(';');

  const lastFetched = ch.last_fetched ? toAWST(ch.last_fetched) : 'Never';
  const handle = interactive
    ? `<span class="drag-handle" style="color:var(--muted);font-size:18px;cursor:grab;line-height:1;user-select:none">⠿</span>`
    : `<span style="color:#333;font-size:18px;line-height:1">⠿</span>`;
  const toggle = interactive
    ? `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:var(--muted);white-space:nowrap">
         <input type="checkbox" class="ch-toggle" data-cid="${ch.channel_id}" ${ch.active ? 'checked' : ''}
                style="cursor:pointer;accent-color:var(--gold)"> Active
       </label>`
    : `<span style="font-size:11px;color:var(--muted);white-space:nowrap">${ch.active ? 'Active' : 'Inactive'}</span>`;

  li.innerHTML = `
    ${handle}
    <span class="ch-priority" style="color:var(--gold);font-family:monospace;font-size:11px;min-width:22px">#${priority}</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ch.name}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">
        ${ch.video_count} in DB &nbsp;·&nbsp; last: ${lastFetched}
      </div>
    </div>
    ${toggle}
  `;
  return li;
}

// ── Scrape panel ───────────────────────────────────────────────────────────────

function _renderScrapePanel(interactive) {
  const panel = document.getElementById('chatter-scrape-panel');

  if (!interactive) {
    panel.innerHTML = `
      <div class="chart-card">
        <div class="chart-title" style="margin-bottom:4px">Manual Scrape</div>
        <div class="chart-subtitle" style="margin-bottom:16px">
          Scraping requires the bot running on your machine. Paste the command below into a terminal, or ask Claude to run it.
        </div>
        <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;padding:14px 16px;font-family:monospace;font-size:12px;color:var(--gold);line-height:1.8">
          cd gold_geo_trader<br>
          source .venv/bin/activate<br>
          python scripts/fetch_transcripts.py --mode quarterly --days 14
        </div>
        <p style="margin-top:14px;font-size:12px;color:var(--muted);line-height:1.6">
          This fetches the last 14 days of videos from all active channels and skips anything already in the database.
          To ask Claude: <em style="color:var(--text)">"please scrape YouTube"</em> and paste your channel order from the list on the left.
        </p>
      </div>
    `;
    return;
  }

  panel.innerHTML = `
    <div class="chart-card" style="margin-bottom:16px">
      <div class="chart-title" style="margin-bottom:4px">Manual Scrape</div>
      <div class="chart-subtitle" style="margin-bottom:16px">
        Scans the last 14 days of videos from all active channels. Skips videos already in the database.
      </div>
      <button id="chatter-scrape-btn" onclick="triggerScrape()"
        style="padding:10px 28px;background:var(--gold);color:#000;border:none;border-radius:3px;
               font-weight:800;font-size:13px;letter-spacing:0.6px;cursor:pointer;text-transform:uppercase">
        Scrape Now
      </button>
      <div id="chatter-progress" style="display:none;margin-top:18px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span id="chatter-progress-label" style="font-size:12px;color:var(--muted)">Scanning channels…</span>
          <span id="chatter-progress-count" style="font-size:12px;color:var(--muted)"></span>
        </div>
        <div style="height:6px;background:#1e1e1e;border-radius:3px;overflow:hidden">
          <div id="chatter-progress-bar"
               style="height:100%;width:0%;background:var(--gold);border-radius:3px;transition:width 0.3s"></div>
        </div>
      </div>
    </div>
    <div id="chatter-results-card" class="chart-card" style="display:none">
      <div class="chart-title" style="margin-bottom:12px">Results</div>
      <div id="chatter-results-body"></div>
    </div>
  `;
}

// ── Scrape trigger + polling (live mode only) ──────────────────────────────────

async function triggerScrape() {
  const btn      = document.getElementById('chatter-scrape-btn');
  const progress = document.getElementById('chatter-progress');
  const bar      = document.getElementById('chatter-progress-bar');

  btn.disabled    = true;
  btn.textContent = 'Running…';
  btn.style.opacity = '0.5';
  progress.style.display = '';
  bar.style.background = 'var(--gold)';

  try {
    const resp = await fetch('/api/scrape', { method: 'POST' });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      alert(err.error || 'Failed to start scrape');
      _resetScrapeBtn();
      return;
    }
    const { job_id } = await resp.json();
    _scrapeJobId  = job_id;
    _scrapePoller = setInterval(() => _pollScrape(job_id), 1500);
  } catch (_e) {
    alert('Could not reach the local server.');
    _resetScrapeBtn();
  }
}

async function _pollScrape(job_id) {
  try {
    const resp = await fetch(`/api/scrape/status/${job_id}`);
    const job  = await resp.json();

    const label = document.getElementById('chatter-progress-label');
    const count = document.getElementById('chatter-progress-count');
    const bar   = document.getElementById('chatter-progress-bar');

    if (job.total === 0 && job.status === 'running') {
      label.textContent = 'Scanning RSS feeds…';
      count.textContent = '';
      bar.style.width   = '5%';
    } else {
      const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
      label.textContent = job.status === 'done' ? 'Complete' : 'Fetching transcripts…';
      count.textContent = `${job.done} / ${job.total}`;
      bar.style.width   = `${pct}%`;
    }

    if (job.results && job.results.length) _renderResults(job.results);

    if (job.status === 'done' || job.status === 'error') {
      clearInterval(_scrapePoller);
      _scrapePoller = null;
      _resetScrapeBtn();
      if (job.status === 'error') {
        label.textContent    = `Error: ${job.error}`;
        bar.style.background = 'var(--red)';
      } else {
        bar.style.background = 'var(--green)';
        const chResp = await fetch('/api/channels');
        if (chResp.ok) _renderChannelList(await chResp.json(), true);
      }
    }
  } catch (_e) {}
}

function _renderResults(results) {
  const card = document.getElementById('chatter-results-card');
  const body = document.getElementById('chatter-results-body');
  card.style.display = '';

  if (!results.length) {
    body.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">No new videos found in the last 14 days.</div>';
    return;
  }

  const rows = results.map(r => {
    const impactColor = r.impact >= 6 ? 'var(--green)' : r.impact >= 3 ? 'var(--gold)' : 'var(--muted)';
    const badge = r.had_transcript
      ? `<span style="font-size:10px;padding:2px 6px;border-radius:2px;background:rgba(0,255,65,0.1);color:var(--green);border:1px solid rgba(0,255,65,0.2)">TRANSCRIPT</span>`
      : `<span style="font-size:10px;padding:2px 6px;border-radius:2px;background:rgba(100,100,100,0.1);color:var(--muted);border:1px solid #333">TITLE ONLY</span>`;
    return `
      <div style="padding:10px 0;border-bottom:1px solid #141414;display:flex;gap:12px;align-items:flex-start">
        <span style="font-size:13px;font-weight:700;color:${impactColor};font-family:monospace;min-width:36px;padding-top:1px">${r.impact.toFixed(1)}</span>
        <div style="flex:1;min-width:0">
          <a href="${r.url}" target="_blank"
             style="color:var(--text);text-decoration:none;font-size:13px;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
             onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text)'">${r.title}</a>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <span>${r.channel}</span><span>·</span>
            <span>${toAWST(r.published_at)}</span><span>·</span>${badge}
          </div>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px">${results.length} new video${results.length !== 1 ? 's' : ''} added</div>
    ${rows}`;
}

function _resetScrapeBtn() {
  const btn = document.getElementById('chatter-scrape-btn');
  if (!btn) return;
  btn.disabled    = false;
  btn.textContent = 'Scrape Now';
  btn.style.opacity = '1';
}

// ── Glossary (LLM-reviewed transcripts) ────────────────────────────────────────

let _glossaryItems = [];   // full dataset for filtering

function _renderGlossary(items) {
  const panel = document.getElementById('chatter-glossary-panel');
  if (!panel) return;

  if (!items || !items.length) {
    panel.innerHTML = `
      <div class="chart-card" style="margin-top:16px">
        <div class="chart-title" style="margin-bottom:6px">Transcript Glossary</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.7">
          No reviewed transcripts yet.<br>
          Scrape YouTube, then ask Claude: <em style="color:var(--text)">"please review unreviewed transcripts"</em>
        </div>
      </div>`;
    return;
  }

  _glossaryItems = items;

  // Unique channels for filter dropdown
  const channels = [...new Set(items.map(i => i.channel_name))].sort();
  const channelOpts = channels.map(c => `<option value="${c}">${c}</option>`).join('');

  panel.innerHTML = `
    <div class="chart-card" style="margin-top:16px">
      <div class="chart-title" style="margin-bottom:4px">Transcript Glossary</div>
      <div class="chart-subtitle" style="margin-bottom:14px">
        ${items.length} video${items.length !== 1 ? 's' : ''} reviewed by Claude · Score 0–10 for gold relevance · Click any row to read full transcript
      </div>

      <!-- Filter bar -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
        <select id="gl-filter-channel" onchange="_applyGlossaryFilter()"
          style="background:#111;border:1px solid #2a2a2a;color:var(--text);padding:5px 10px;border-radius:3px;font-size:12px;cursor:pointer">
          <option value="">All channels</option>
          ${channelOpts}
        </select>
        <select id="gl-filter-min-score" onchange="_applyGlossaryFilter()"
          style="background:#111;border:1px solid #2a2a2a;color:var(--text);padding:5px 10px;border-radius:3px;font-size:12px;cursor:pointer">
          <option value="0">Min score: any</option>
          <option value="5">Min score: 5+</option>
          <option value="7">Min score: 7+</option>
          <option value="9">Min score: 9+</option>
        </select>
        <select id="gl-sort" onchange="_applyGlossaryFilter()"
          style="background:#111;border:1px solid #2a2a2a;color:var(--text);padding:5px 10px;border-radius:3px;font-size:12px;cursor:pointer">
          <option value="date">Sort: newest first</option>
          <option value="score">Sort: highest score</option>
          <option value="channel">Sort: channel A–Z</option>
        </select>
        <span id="gl-count" style="font-size:11px;color:var(--muted);margin-left:auto"></span>
      </div>

      <div id="gl-rows"></div>
    </div>`;

  // Transcript modal (appended once to body)
  if (!document.getElementById('gl-modal')) {
    const m = document.createElement('div');
    m.id = 'gl-modal';
    m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:9999;overflow-y:auto;padding:32px 16px';
    m.innerHTML = `
      <div style="max-width:760px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:6px;padding:28px 32px;position:relative">
        <button onclick="_closeGlModal()" style="position:absolute;top:14px;right:18px;background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;line-height:1">✕</button>
        <div id="gl-modal-body"></div>
      </div>`;
    m.addEventListener('click', e => { if (e.target === m) _closeGlModal(); });
    document.body.appendChild(m);
  }

  _applyGlossaryFilter();
}

function _applyGlossaryFilter() {
  const ch    = document.getElementById('gl-filter-channel')?.value || '';
  const minSc = parseFloat(document.getElementById('gl-filter-min-score')?.value || '0');
  const sort  = document.getElementById('gl-sort')?.value || 'date';

  let filtered = _glossaryItems.filter(i =>
    (!ch || i.channel_name === ch) &&
    (i.llm_score == null || i.llm_score >= minSc)
  );

  if (sort === 'score')   filtered.sort((a, b) => (b.llm_score || 0) - (a.llm_score || 0));
  else if (sort === 'channel') filtered.sort((a, b) => a.channel_name.localeCompare(b.channel_name));
  // default: date (already ordered newest-first from server)

  const countEl = document.getElementById('gl-count');
  if (countEl) countEl.textContent = `${filtered.length} of ${_glossaryItems.length}`;

  const container = document.getElementById('gl-rows');
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0">No videos match the selected filters.</div>';
    return;
  }

  container.innerHTML = filtered.map((item, idx) => {
    const score = item.llm_score != null ? item.llm_score.toFixed(1) : '—';
    const scoreColor = item.llm_score >= 7 ? 'var(--green)' : item.llm_score >= 4 ? 'var(--gold)' : 'var(--muted)';
    const date = (item.published_at || '').slice(0, 10);
    const summary = item.llm_summary || '';
    return `
      <div onclick="_openGlModal(${idx})" style="padding:12px 0;border-bottom:1px solid #141414;cursor:pointer;transition:background 0.15s"
           onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='none'">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span style="font-family:monospace;font-size:13px;font-weight:700;color:${scoreColor};min-width:32px;padding-top:1px">${score}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:var(--muted);margin-bottom:3px">${item.channel_name} &nbsp;·&nbsp; ${date}</div>
            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)">${item.title}</div>
            ${summary ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${summary}</div>` : ''}
          </div>
          <span style="font-size:11px;color:#333;white-space:nowrap;padding-top:2px">read ›</span>
        </div>
      </div>`;
  }).join('');

  // Store filtered list on window so modal can index into it
  window._glFiltered = filtered;
}

function _openGlModal(idx) {
  const item = window._glFiltered ? window._glFiltered[idx] : _glossaryItems[idx];
  if (!item) return;

  const score = item.llm_score != null ? item.llm_score.toFixed(1) : '—';
  const scoreColor = item.llm_score >= 7 ? 'var(--green)' : item.llm_score >= 4 ? 'var(--gold)' : 'var(--muted)';
  const date = (item.published_at || '').slice(0, 10);
  const summary = item.llm_summary || '';
  const transcript = item.transcript_text || '';

  // Format transcript into readable paragraphs (split on double spaces / long runs)
  const txFormatted = transcript
    ? transcript.split(/\s{2,}|\n/).filter(Boolean).map(p =>
        `<p style="margin:0 0 12px;line-height:1.7;font-size:13px;color:#bbb">${p.trim()}</p>`
      ).join('')
    : '<p style="color:var(--muted);font-size:13px">Full transcript not available.</p>';

  document.getElementById('gl-modal-body').innerHTML = `
    <div style="margin-bottom:4px;font-size:11px;color:var(--muted)">${item.channel_name} &nbsp;·&nbsp; ${date}</div>
    <div style="font-size:17px;font-weight:700;margin-bottom:14px;line-height:1.4">${item.title}</div>
    <div style="display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap">
      <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;padding:10px 16px;text-align:center;min-width:70px">
        <div style="font-size:22px;font-weight:800;font-family:monospace;color:${scoreColor}">${score}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">Gold Score</div>
      </div>
      <a href="${item.url}" target="_blank"
         style="display:flex;align-items:center;gap:6px;padding:10px 16px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;
                color:var(--gold);text-decoration:none;font-size:12px;font-weight:600"
         onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='#2a2a2a'">
        ▶ Watch on YouTube
      </a>
    </div>
    ${summary ? `
    <div style="background:#0d0d0d;border-left:3px solid var(--gold);padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0">
      <div style="font-size:10px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.8px">Claude's Summary</div>
      <div style="font-size:13px;line-height:1.6;color:var(--text)">${summary}</div>
    </div>` : ''}
    <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">Full Transcript</div>
    <div style="max-height:420px;overflow-y:auto;padding-right:8px">${txFormatted}</div>
  `;

  document.getElementById('gl-modal').style.display = '';
  document.body.style.overflow = 'hidden';
}

function _closeGlModal() {
  document.getElementById('gl-modal').style.display = 'none';
  document.body.style.overflow = '';
}
