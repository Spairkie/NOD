(() => {
  'use strict';

  const CONFIG = window.__NOD_CONFIG__ || {};
  const API_BASE = String(CONFIG.API_BASE_URL || '').replace(/\/$/, '');
  const SHORT_DOMAIN = String(CONFIG.SHORT_DOMAIN || 'nod.link').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const REMOTE_MODE = Boolean(API_BASE);
  const STORAGE_KEY = 'nod.links.v1';
  const THEME_KEY = 'nod.theme.v1';
  const RESERVED = new Set(['api','admin','app','assets','login','logout','signup','pricing','about','terms','privacy','help','support','studio','links','r']);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 10);
  const nowIso = () => new Date().toISOString();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const sampleLinks = [
    {
      id: 'sample-1', slug: 'case-study', title: 'Portfolio case study',
      url: 'https://example.com/case-study/identity-system?utm_campaign=portfolio',
      createdAt: new Date(Date.now() - 8 * 864e5).toISOString(), expiresAt: null, sample: true,
      clicks: 184, events: seedEvents(184, 8, ['desktop','mobile','mobile','desktop','tablet'])
    },
    {
      id: 'sample-2', slug: 'launch-film', title: 'Launch film',
      url: 'https://example.com/watch/product-launch-film?ref=studio',
      createdAt: new Date(Date.now() - 5 * 864e5).toISOString(), expiresAt: null, sample: true,
      clicks: 97, events: seedEvents(97, 5, ['mobile','mobile','desktop'])
    },
    {
      id: 'sample-3', slug: 'notes-26', title: 'Design notes',
      url: 'https://example.com/notes/designing-with-restraint-and-motion',
      createdAt: new Date(Date.now() - 2 * 864e5).toISOString(), expiresAt: null, sample: true,
      clicks: 43, events: seedEvents(43, 2, ['desktop','desktop','mobile'])
    }
  ];

  let state = {
    links: [],
    query: '',
    selectedId: null,
    commands: [],
    commandIndex: 0
  };

  function seedEvents(count, daysBack, devices) {
    const events = [];
    for (let i = 0; i < count; i++) {
      const age = Math.floor((i / Math.max(count, 1)) * daysBack * 864e5);
      events.push({
        at: new Date(Date.now() - age - ((i * 390001) % 864e5)).toISOString(),
        device: devices[i % devices.length],
        referrer: ['Direct','Instagram','X / Twitter','Newsletter','Portfolio'][i % 5],
        country: ['US','CA','GB','DE','AU'][i % 5]
      });
    }
    return events;
  }

  function loadLocalLinks() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(stored)) return stored;
    } catch {}
    const initial = REMOTE_MODE ? [] : structuredClone(sampleLinks);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  function saveLocalLinks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.links));
  }

  async function init() {
    initTheme();
    initFlowField();
    initInteractions();
    updateModeUI();
    $('#domain-prefix').textContent = `${SHORT_DOMAIN}/`;
    initTurnstile();

    const redirected = await maybeHandleLocalRedirect();
    if (redirected) return;

    await refreshLinks();
    renderAll();
    initCommandPalette();
  }


  function initTurnstile() {
    const siteKey = String(CONFIG.TURNSTILE_SITE_KEY || '').trim();
    if (!REMOTE_MODE || !siteKey) return;
    $('#turnstile-wrap').hidden = false;
    window.__nodTurnstileToken = '';
    window.__nodRenderTurnstile = () => {
      if (!window.turnstile || window.__nodTurnstileWidgetId !== undefined) return;
      window.__nodTurnstileWidgetId = window.turnstile.render('#turnstile-widget', {
        sitekey: siteKey,
        theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
        callback: token => { window.__nodTurnstileToken = token; },
        'expired-callback': () => { window.__nodTurnstileToken = ''; }
      });
    };
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__nodRenderTurnstile&render=explicit';
    script.async = true; script.defer = true;
    document.head.appendChild(script);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    updateThemeColor();
  }

  function updateThemeColor() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#11120f' : '#f2efe7');
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    updateThemeColor();
    toast(`${next[0].toUpperCase() + next.slice(1)} theme`);
  }

  function updateModeUI() {
    $('#mode-label').textContent = REMOTE_MODE ? 'Edge backend connected' : 'Local portfolio mode';
    $('.mode-dot').style.background = REMOTE_MODE ? 'var(--green)' : 'var(--accent)';
    if (!REMOTE_MODE) $('#mode-chip').title = 'Interactive local demo. Configure API_BASE_URL for globally shareable links.';
  }

  async function refreshLinks() {
    state.links = loadLocalLinks();
    if (!REMOTE_MODE) return;
    state.links = state.links.filter(link => !link.sample);
    const managed = state.links.filter(link => !link.sample && link.manageKey).slice(0, 24);
    await Promise.allSettled(managed.map(async link => {
      try {
        const res = await fetch(`${API_BASE}/api/links/${encodeURIComponent(link.slug)}/stats`, {
          headers: { 'X-NOD-Key': link.manageKey, Accept: 'application/json' }
        });
        if (!res.ok) return;
        const data = await res.json();
        link.clicks = Number(data.clicks || link.clicks || 0);
        link.events = Array.isArray(data.events) ? data.events : link.events || [];
      } catch {}
    }));
    saveLocalLinks();
  }

  function normalizeRemoteLink(link) {
    return {
      id: String(link.id || link.slug),
      slug: link.slug,
      title: link.title || '',
      url: link.url,
      createdAt: link.createdAt || link.created_at || nowIso(),
      expiresAt: link.expiresAt || link.expires_at || null,
      clicks: Number(link.clicks || 0),
      events: Array.isArray(link.events) ? link.events : [],
      sample: false,
      shortUrl: link.shortUrl || `https://${SHORT_DOMAIN}/${link.slug}`,
      manageKey: link.manageKey || link.manage_key || ''
    };
  }

  async function maybeHandleLocalRedirect() {
    if (REMOTE_MODE) return false;
    const match = location.hash.match(/^#\/r\/([a-zA-Z0-9_-]+)$/);
    if (!match) return false;

    const slug = decodeURIComponent(match[1]);
    const  links = loadLocalLinks();
    const link = links.find(item => item.slug === slug);
    if (!link) return false;

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      document.body.innerHTML = `<main class="redirect-screen"><div><div class="redirect-mark"><span></span><span></span><span></span></div><h2>This path expired.</h2><p>NOD kept its promise and stopped routing this link.</p></div></main>`;
      return true;
    }

    link.clicks = Number(link.clicks || 0) + 1;
    link.events = Array.isArray(link.events) ? link.events : [];
    link.events.push({ at: nowIso(), device: detectDevice(), referrer: document.referrer ? safeHost(document.referrer) : 'Direct', country: 'Local' });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
    document.body.innerHTML = `<main class="redirect-screen"><div><div class="redirect-mark"><span></span><span></span><span></span></div><h2>Following the path.</h2><p>${escapeHtml(link.url)}</p></div></main>`;
    await sleep(650);
    location.replace(link.url);
    return true;
  }

  function initInteractions() {
    $('#theme-toggle').addEventListener('click', toggleTheme);
    $('#shortcut-button').addEventListener('click', openCommandPalette);
    $('#advanced-toggle').addEventListener('click', toggleAdvanced);
    $('#utm-toggle').addEventListener('change', e => { $('#utm-field').hidden = !e.target.checked; });
    $('#shorten-form').addEventListener('submit', onSubmit);
    $('#long-url').addEventListener('input', updateUrlStatus);
    $('#custom-slug').addEventListener('input', sanitizeSlugInput);
    $('#copy-result').addEventListener('click', () => copyText($('#result-link').href, REMOTE_MODE ? 'Short link copied' : 'Local demo link copied'));
    $('#result-card').addEventListener('click', onResultAction);
    $('#link-search').addEventListener('input', e => { state.query = e.target.value.toLowerCase().trim(); renderLinkList(); });
    $('#link-list').addEventListener('click', onLinkListClick);
    $('#dialog-close').addEventListener('click', () => $('#details-dialog').close());
    $('#details-dialog').addEventListener('click', e => { if (e.target === $('#details-dialog')) $('#details-dialog').close(); });
    $('#reset-demo').addEventListener('click', resetDemo);
    $('#export-links').addEventListener('click', exportLinks);

    document.addEventListener('keydown', e => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommandPalette(); }
      if (mod && e.key === 'Enter' && !$('#command-dialog').open) { e.preventDefault(); $('#shorten-form').requestSubmit(); }
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault(); $('#link-search').focus(); location.hash = '#links';
      }
    });

    $$('.magnetic').forEach(button => {
      button.addEventListener('pointermove', e => {
        if (matchMedia('(pointer: coarse)').matches) return;
        const r = button.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width/2) * .12;
        const y = (e.clientY - r.top - r.height/2) * .12;
        button.style.transform = `translate(${x}px, ${y}px)`;
      });
      button.addEventListener('pointerleave', () => button.style.transform = '');
    });
  }

  function toggleAdvanced() {
    const btn = $('#advanced-toggle');
    const panel = $('#advanced-panel');
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
  }

  function sanitizeSlugInput(e) {
    const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (e.target.value !== cleaned) e.target.value = cleaned;
  }

  function parseHttpUrl(value) {
    try {
      const url = new URL(value.trim());
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      return url;
    } catch { return null; }
  }

  function updateUrlStatus() {
    const status = $('#url-status');
    const value = $('#long-url').value.trim();
    if (!value) { status.className = ''; status.textContent = 'Paste a URL to begin'; return; }
    const parsed = parseHttpUrl(value);
    if (!parsed) { status.className = 'invalid'; status.textContent = 'Use a complete http:// or https:// URL'; return; }
    status.className = 'valid'; status.textContent = `Ready · ${parsed.hostname.replace(/^www\./,'')}`;
  }

  async function onSubmit(event) {
    event.preventDefault();
    const input = $('#long-url');
    const parsed = parseHttpUrl(input.value);
    if (!parsed) { updateUrlStatus(); input.focus(); toast('Enter a valid http:// or https:// URL', 'error'); return; }

    const button = $('#shorten-button');
    button.disabled = true;
    button.querySelector('span').textContent = 'Composing…';

    try {
      let destination = parsed.toString();
      if ($('#utm-toggle').checked && $('#utm-source').value.trim()) {
        const u = new URL(destination);
        u.searchParams.set('utm_source', $('#utm-source').value.trim());
        destination = u.toString();
      }

      const slugInput = $('#custom-slug').value.trim();
      if (slugInput && RESERVED.has(slugInput)) throw new Error('That ending is reserved. Try another.');
      if (slugInput && state.links.some(link => link.slug === slugInput)) throw new Error('That ending already exists. Try another.');

      const payload = {
        url: destination,
        slug: slugInput || undefined,
        title: $('#link-title').value.trim() || undefined,
        expiresAt: expiryToIso($('#expiry').value)
      };
      const created = REMOTE_MODE ? await createRemoteLink(payload) : createLocalLink(payload);
      state.links.unshift(created);
      saveLocalLinks();
      showResult(created);
      renderAll();
      $('#sample-badge').textContent = state.links.some(l => l.sample) ? 'Sample + your links' : 'Your workspace';
      toast('Path created');
    } catch (error) {
      toast(error?.message || 'Could not create link', 'error');
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = 'Shorten';
    }
  }

  function expiryToIso(value) {
    const ms = { '1d': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 }[value];
    return ms ? new Date(Date.now() + ms).toISOString() : null;
  }

  function randomSlug(length = 7) {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return [...bytes].map(b => chars[b % chars.length]).join('');
  }

  function createLocalLink(payload) {
    let slug = payload.slug || randomSlug();
    while (state.links.some(link => link.slug === slug) || RESERVED.has(slug)) slug = randomSlug();
    return {
      id: uid(), slug, title: payload.title || safeHost(payload.url), url: payload.url,
      createdAt: nowIso(), expiresAt: payload.expiresAt || null, clicks: 0, events: [], sample: false,
      shortUrl: `${location.origin}${location.pathname}#/r/${encodeURIComponent(slug)}`
    };
  }

  async function createRemoteLink(payload) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (CONFIG.TURNSTILE_SITE_KEY) {
      const token = window.__nodTurnstileToken || '';
      if (!token) throw new Error('Complete the human verification before creating a public link.');
      headers['X-Turnstile-Token'] = token;
    }
    const res = await fetch(`${API_BASE}/api/links`, {
      method: 'POST', headers, body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Could not create link (${res.status})`);
    if (window.turnstile && window.__nodTurnstileWidgetId !== undefined) {
      window.turnstile.reset(window.__nodTurnstileWidgetId);
      window.__nodTurnstileToken = '';
    }
    return normalizeRemoteLink(data.link || data);
  }

  function showResult(link) {
    const card = $('#result-card');
    const shortUrl = link.shortUrl || localShortUrl(link.slug);
    $('#result-link').textContent = displayShortUrl(shortUrl, link.slug);
    $('#result-link').href = shortUrl;
    $('#result-destination').textContent = link.url;
    card.dataset.linkId = link.id;
    card.hidden = false;
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function displayShortUrl(url, slug) {
    if (!REMOTE_MODE && url.includes('#/r/')) return `${SHORT_DOMAIN}/${slug}`;
    try { return new URL(url).host.replace(/^www\./,'') + new URL(url).pathname; } catch { return url; }
  }

  function localShortUrl(slug) {
    return REMOTE_MODE ? `https://${SHORT_DOMAIN}/${slug}` : `${location.origin}${location.pathname}#/r/${encodeURIComponent(slug)}`;
  }

  function onResultAction(e) {
    const action = e.target?.dataset?.resultAction;
    if (!action) return;
    const link = state.links.find(l => l.id === $('#result-card').dataset.linkId);
    if (action === 'details' && link) openDetails(link);
    if (action === 'new') {
      $('#long-url').value = '';
      $('#custom-slug').value = '';
      $('#link-title').value = '';
      $('#result-card').hidden = true;
      updateUrlStatus();
      $('#long-url').focus();
      $('#studio').scrollIntoView({ behavior: 'smooth' });
    }
  }

  function renderAll() {
    renderMetrics();
    renderLinkList();
  }

  function visibleLinks() {
    if (!state.query) return state.links;
    return state.links.filter(link => [link.slug, link.title, link.url].join(' ').toLowerCase().includes(state.query));
  }

  function renderLinkList() {
    const links = visibleLinks();
    const list = $('#link-list');
    $('#link-count').textContent = `${state.links.length} ${state.links.length === 1 ? 'link' : 'links'}`;
    $('#sample-badge').textContent = state.links.some(l => l.sample) ? (state.links.some(l => !l.sample) ? 'Sample + your links' : 'Sample workspace') : 'Your workspace';
    $('#empty-state').hidden = links.length > 0;
    list.innerHTML = links.map(link => {
      const expired = link.expiresAt && new Date(link.expiresAt) < new Date();
      return `<article class="link-row" data-id="${escapeAttr(link.id)}">
        <div class="link-primary">
          <div class="link-slug"><span class="status" style="${expired ? 'background:var(--accent)' : ''}"></span>${escapeHtml(SHORT_DOMAIN)}/${escapeHtml(link.slug)}</div>
          <div class="link-title">${escapeHtml(link.title || safeHost(link.url))}${link.sample ? ' · sample' : ''}</div>
        </div>
        <div class="link-destination" title="${escapeAttr(link.url)}">${escapeHtml(link.url)}</div>
        <div class="link-clicks">${formatNumber(Number(link.clicks || 0))}</div>
        <div class="link-date">${formatRelative(link.createdAt)}</div>
        <button class="row-menu" type="button" data-action="details" aria-label="Open details for ${escapeAttr(link.slug)}">↗</button>
      </article>`;
    }).join('');
  }

  function renderMetrics() {
    const links = state.links;
    const totalClicks = links.reduce((sum, l) => sum + Number(l.clicks || 0), 0);
    const active = links.filter(l => !l.expiresAt || new Date(l.expiresAt) > new Date()).length;
    $('#metric-clicks').textContent = formatNumber(totalClicks);
    $('#metric-links').textContent = formatNumber(active);
    $('#metric-clicks-note').textContent = links.some(l => l.sample) ? 'Portfolio preview + local activity' : 'Across all links';
    $('#active-track').style.width = `${links.length ? Math.round(active / links.length * 100) : 0}%`;

    const events = links.flatMap(l => (l.events || []));
    const deviceCounts = { mobile: 0, desktop: 0, tablet: 0 };
    events.forEach(e => { if (deviceCounts[e.device] !== undefined) deviceCounts[e.device]++; });
    const sortedDevices = Object.entries(deviceCounts).sort((a,b) => b[1] - a[1]);
    const top = sortedDevices[0];
    $('#metric-device').textContent = top && top[1] ? titleCase(top[0]) : '—';
    $('#metric-device-note').textContent = top && top[1] ? `${Math.round(top[1] / Math.max(events.length,1) * 100)}% of observed clicks` : 'No events yet';
    $('#device-bars').innerHTML = sortedDevices.map(([name, count]) => `<div class="device-bar"><span>${titleCase(name)}</span><i style="--pct:${events.length ? Math.round(count/events.length*100) : 0}%"></i><b>${events.length ? Math.round(count/events.length*100) : 0}%</b></div>`).join('');

    const last24 = events.filter(e => Date.now() - new Date(e.at).getTime() < 864e5).length;
    $('#metric-pulse').textContent = last24 > 40 ? 'Lively' : last24 > 8 ? 'Active' : last24 > 0 ? 'Gentle' : 'Quiet';
    $('#metric-pulse-note').textContent = `${last24} clicks in the last 24h`;
    $('#pulse-dots').innerHTML = Array.from({length:16}, (_,i) => `<i class="${i < Math.min(16, Math.ceil(last24/3)) ? 'hot' : ''}"></i>`).join('');

    renderSparkline(events);
  }

  function renderSparkline(events) {
    const days = 14;
    const buckets = Array(days).fill(0);
    events.forEach(e => {
      const age = Math.floor((Date.now() - new Date(e.at).getTime()) / 864e5);
      if (age >= 0 && age < days) buckets[days - 1 - age]++;
    });
    if (!buckets.some(Boolean)) buckets[buckets.length - 1] = 1;
    const max = Math.max(...buckets, 1);
    const w = 320, h = 96;
    const pts = buckets.map((v,i) => [i/(days-1)*w, h - (v/max)*(h-18) - 4]);
    const line = smoothPath(pts);
    const area = `${line} L ${w} ${h} L 0 ${h} Z`;
    $('#sparkline').innerHTML = `<path class="area" d="${area}"/><path class="line" d="${line}"/>`;
  }

  function smoothPath(points) {
    if (points.length < 2) return '';
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i=1;i<points.length;i++) {
      const [x0,y0] = points[i-1], [x1,y1] = points[i];
      const cx = (x0+x1)/2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return d;
  }

  function onLinkListClick(e) {
    const row = e.target.closest('.link-row');
    if (!row) return;
    const link = state.links.find(l => l.id === row.dataset.id);
    if (!link) return;
    if (e.target.closest('[data-action="details"]')) openDetails(link);
  }

  function openDetails(link) {
    state.selectedId = link.id;
    const events = link.events || [];
    const last = events.length ? new Date(Math.max(...events.map(event => new Date(event.at).getTime()).filter(Number.isFinite))) : null;
    $('#details-content').innerHTML = `
      <h2 class="detail-title">${escapeHtml(SHORT_DOMAIN)}/${escapeHtml(link.slug)}</h2>
      <div class="detail-destination">${escapeHtml(link.url)}</div>
      <div class="detail-stats">
        <div class="detail-stat"><span>Total clicks</span><strong>${formatNumber(link.clicks || 0)}</strong></div>
        <div class="detail-stat"><span>Created</span><strong>${formatShortDate(link.createdAt)}</strong></div>
        <div class="detail-stat"><span>Last click</span><strong>${last ? formatRelative(last.toISOString()) : '—'}</strong></div>
      </div>
      <div class="detail-actions">
        <button type="button" data-detail="copy">Copy short link</button>
        <button type="button" data-detail="open">Open destination ↗</button>
        ${link.sample ? '' : '<button type="button" data-detail="delete" class="danger">Delete</button>'}
      </div>`;
    $('#details-content').onclick = e => handleDetailAction(e, link);
    $('#details-dialog').showModal();
  }

  async function handleDetailAction(e, link) {
    const action = e.target?.dataset?.detail;
    if (!action) return;
    if (action === 'copy') copyText(link.shortUrl || localShortUrl(link.slug), 'Short link copied');
    if (action === 'open') window.open(link.url, '_blank', 'noopener');
    if (action === 'delete') await deleteLink(link);
  }

  async function deleteLink(link) {
    if (REMOTE_MODE) {
      const res = await fetch(`${API_BASE}/api/links/${encodeURIComponent(link.slug)}`, { method: 'DELETE', headers: { 'X-NOD-Key': link.manageKey || '' } });
      if (!res.ok) { toast('Could not delete link', 'error'); return; }
    }
    state.links = state.links.filter(l => l.id !== link.id);
    saveLocalLinks();
    $('#details-dialog').close();
    renderAll();
    toast('Link deleted');
  }

  async function resetDemo() {
    if (REMOTE_MODE) { toast('Reset is only available in local portfolio mode'); return; }
    state.links = structuredClone(sampleLinks);
    saveLocalLinks();
    renderAll();
    $('#result-card').hidden = true;
    toast('Sample workspace restored');
  }

  function exportLinks() {
    const clean = state.links.map(({events, ...link}) => ({...link, events}));
    const blob = new Blob([JSON.stringify(clean, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {href:url, download:`nod-links-${new Date().toISOString().slice(0,10)}.json`});
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    toast('Workspace exported');
  }

  function initCommandPalette() {
    state.commands = [
      { name: 'Create a short link', hint: 'Studio', run: () => { location.hash='#studio'; setTimeout(()=>$('#long-url').focus(), 250); } },
      { name: 'Search your links', hint: '/', run: () => { location.hash='#links'; setTimeout(()=>$('#link-search').focus(), 250); } },
      { name: 'Toggle appearance', hint: 'Theme', run: toggleTheme },
      { name: 'Export workspace', hint: 'JSON', run: exportLinks },
      { name: 'View principles', hint: 'About', run: () => location.hash='#principles' },
      ...state.links.slice(0,5).map(link => ({ name: `${SHORT_DOMAIN}/${link.slug}`, hint: `${link.clicks || 0} clicks`, run: () => openDetails(link) }))
    ];
    renderCommands('');
    $('#command-input').addEventListener('input', e => { state.commandIndex = 0; renderCommands(e.target.value); });
    $('#command-list').addEventListener('click', e => {
      const item = e.target.closest('.command-item'); if (!item) return;
      runCommand(Number(item.dataset.index));
    });
    $('#command-dialog').addEventListener('close', () => { $('#command-input').value=''; renderCommands(''); });
    $('#command-dialog').addEventListener('keydown', e => {
      const items = $$('.command-item', $('#command-list'));
      if (e.key === 'ArrowDown') { e.preventDefault(); state.commandIndex = Math.min(state.commandIndex+1, items.length-1); updateCommandActive(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); state.commandIndex = Math.max(state.commandIndex-1, 0); updateCommandActive(); }
      if (e.key === 'Enter') { e.preventDefault(); const active = items[state.commandIndex]; if (active) runCommand(Number(active.dataset.index)); }
    });
  }

  function openCommandPalette() {
    const dialog = $('#command-dialog');
    if (!dialog.open) dialog.showModal();
    setTimeout(() => $('#command-input').focus(), 30);
  }

  function renderCommands(query) {
    const q = query.trim().toLowerCase();
    const filtered = state.commands.map((cmd,index)=>({...cmd,index})).filter(cmd => !q || `${cmd.name} ${cmd.hint}`.toLowerCase().includes(q));
    $('#command-list').innerHTML = filtered.map((cmd,i)=>`<button class="command-item ${i===state.commandIndex?'active':''}" data-index="${cmd.index}" type="button"><span>${escapeHtml(cmd.name)}</span><small>${escapeHtml(cmd.hint)}</small></button>`).join('') || '<div style="padding:18px;color:var(--muted);font-size:11px">No command found.</div>';
  }

  function updateCommandActive() {
    $$('.command-item', $('#command-list')).forEach((el,i)=>el.classList.toggle('active',i===state.commandIndex));
  }

  function runCommand(index) {
    const cmd = state.commands[index];
    if (!cmd) return;
    $('#command-dialog').close();
    cmd.run();
  }

  function initFlowField() {
    const canvas = $('#flow-field');
    const ctx = canvas.getContext('2d');
    if (!ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let w=0,h=0,dpr=1,particles=[];
    const pointer={x:-1000,y:-1000};
    const countForWidth = () => Math.min(88, Math.max(36, Math.floor(innerWidth/18)));

    function resize(){
      dpr=Math.min(devicePixelRatio||1,2); w=document.documentElement.clientWidth; h=window.innerHeight;
      canvas.width=w*dpr; canvas.height=h*dpr; canvas.style.width=w+'px'; canvas.style.height=h+'px'; ctx.setTransform(dpr,0,0,dpr,0,0);
      particles=Array.from({length:countForWidth()},()=>({x:Math.random()*w,y:Math.random()*h,px:0,py:0,s:.28+Math.random()*.55,life:Math.random()*500}));
    }
    function field(x,y,t){
      return Math.sin(x*.0041 + t*.00017)*1.4 + Math.cos(y*.0034 - t*.00013)*1.2 + Math.sin((x+y)*.0015)*.8;
    }
    function frame(t){
      ctx.clearRect(0,0,w,h);
      const dark=document.documentElement.dataset.theme==='dark';
      ctx.lineWidth=.65; ctx.globalAlpha=dark?.34:.27; ctx.strokeStyle=dark?'#d8d4c8':'#6b685f';
      for(const p of particles){
        p.px=p.x;p.py=p.y; const a=field(p.x,p.y,t); let speed=p.s;
        const dx=p.x-pointer.x,dy=p.y-pointer.y,dist=Math.hypot(dx,dy);
        if(dist<160){ p.x += dx/Math.max(dist,1)*.35; p.y += dy/Math.max(dist,1)*.35; }
        p.x += Math.cos(a)*speed; p.y += Math.sin(a)*speed; p.life++;
        if(p.x<0||p.x>w||p.y<0||p.y>h||p.life>1200){p.x=Math.random()*w;p.y=Math.random()*h;p.px=p.x;p.py=p.y;p.life=0}
        ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(p.x,p.y);ctx.stroke();
      }
      requestAnimationFrame(frame);
    }
    addEventListener('resize',resize,{passive:true}); addEventListener('pointermove',e=>{pointer.x=e.clientX;pointer.y=e.clientY},{passive:true});
    resize();requestAnimationFrame(frame);
  }

  function detectDevice() {
    const ua = navigator.userAgent;
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
    if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
    return 'desktop';
  }
  function safeHost(value) { try { return new URL(value).hostname.replace(/^www\./,''); } catch { return value; } }
  function formatNumber(value) { return new Intl.NumberFormat('en-US',{notation:value>=10000?'compact':'standard',maximumFractionDigits:1}).format(value); }
  function formatShortDate(iso) { return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date(iso)); }
  function formatRelative(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff/864e5); if(days<=0) return 'Today'; if(days===1) return 'Yesterday'; if(days<7) return `${days}d ago`; return formatShortDate(iso);
  }
  function titleCase(s){return s ? s[0].toUpperCase()+s.slice(1) : s;}
  function escapeHtml(value=''){ return String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function escapeAttr(value=''){ return escapeHtml(value).replace(/'/g,'&#39;'); }
  async function copyText(text, message='Copied') { try { await navigator.clipboard.writeText(text); toast(message); } catch { const ta=document.createElement('textarea');ta.value=text;document.body.append(ta);ta.select();document.execCommand('copy');ta.remove();toast(message); } }
  function toast(message,type='') { const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;$('#toast-stack').append(el);setTimeout(()=>{el.style.opacity='0';el.style.transform='translateY(5px)';setTimeout(()=>el.remove(),220)},2600); }

  init();
})();
