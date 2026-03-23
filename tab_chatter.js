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
