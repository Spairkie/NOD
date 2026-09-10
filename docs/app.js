(() => {
  'use strict';

  const API_BASE = location.origin;
  const SHORT_DOMAIN = location.host;
  const STORAGE_KEY = 'nod.links.v2';
  const LEGACY_STORAGE_KEY = 'nod.links.v1';
  const THEME_KEY = 'nod.theme.v1';
  const RESERVED = new Set(['api','admin','app','assets','login','logout','signup','pricing','about','terms','privacy','help','support','studio','links','r','.netlify']);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const nowIso = () => new Date().toISOString();

  const state = {
    links: [],
    query: '',
    selectedId: null,
    commands: [],
    commandIndex: 0,
    serviceAvailable: true
  };

  async function init() {
    initTheme();
    migrateLegacyStorage();
    state.links = loadManagedLinks();
    initInteractions();
    initFlowField();
    initCommandPalette();
    $('#domain-prefix').textContent = `${SHORT_DOMAIN}/`;
    renderAll();
    await checkService();
    await refreshLinks();
    renderAll();
    rebuildCommandPalette();
  }

  function migrateLegacyStorage() {
    if (localStorage.getItem(STORAGE_KEY)) return;
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
      if (!Array.isArray(legacy)) return;
      const currentHost = location.host.toLowerCase();
      const compatible = legacy.filter(item => {
        if (!item || !item.slug || !item.manageKey) return false;
        try {
          if (item.shortUrl) return new URL(item.shortUrl).host.toLowerCase() === currentHost;
        } catch {}
        return false;
      });
      if (compatible.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(compatible));
    } catch {}
  }

  function loadManagedLinks() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter(link => link && link.slug && link.manageKey) : [];
    } catch {
      return [];
    }
  }

  function saveManagedLinks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.links));
  }

  async function checkService() {
    const chip = $('#mode-chip');
    const label = $('#mode-label');
    const dot = $('.mode-dot');
    try {
      const response = await fetch(`${API_BASE}/api/health`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error('health');
      state.serviceAvailable = true;
      label.textContent = 'Live · Netlify';
      chip.title = 'Connected to NOD production on Netlify.';
      if (dot) dot.style.background = 'var(--green)';
      $('#shorten-button').disabled = false;
    } catch {
      state.serviceAvailable = false;
      label.textContent = 'Service unavailable';
      chip.title = 'NOD could not reach its Netlify backend.';
      if (dot) dot.style.background = 'var(--accent)';
      $('#shorten-button').disabled = true;
      const status = $('#url-status');
      status.className = 'invalid';
      status.textContent = 'Backend unavailable';
    }
  }

  async function refreshLinks() {
    if (!state.links.length) return;
    await Promise.allSettled(state.links.slice(0, 75).map(async link => {
      try {
        const response = await fetch(`${API_BASE}/api/links/${encodeURIComponent(link.slug)}/stats`, {
          headers: { 'X-NOD-Key': link.manageKey, Accept: 'application/json' },
          cache: 'no-store'
        });
        if (!response.ok) {
          if (response.status === 404) link.unavailable = true;
          return;
        }
        const data = await response.json();
        link.clicks = Number(data.clicks || 0);
        link.events = Array.isArray(data.events) ? data.events : [];
        link.unavailable = false;
      } catch {}
    }));
    saveManagedLinks();
  }

  function initTheme() {
    let next = 'light';
    try {
      const saved = localStorage.getItem(THEME_KEY);
      next = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch {}
    document.documentElement.dataset.theme = next;
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
    toast(`${titleCase(next)} theme`);
  }

  function initInteractions() {
    $('#theme-toggle')?.addEventListener('click', toggleTheme);
    $('#shortcut-button')?.addEventListener('click', openCommandPalette);
    $('#advanced-toggle')?.addEventListener('click', toggleAdvanced);
    $('#utm-toggle')?.addEventListener('change', event => { $('#utm-field').hidden = !event.target.checked; });
    $('#shorten-form')?.addEventListener('submit', onSubmit);
    $('#long-url')?.addEventListener('input', updateUrlStatus);
    $('#custom-slug')?.addEventListener('input', sanitizeSlugInput);
    $('#copy-result')?.addEventListener('click', () => copyText($('#result-link').href, 'Short link copied'));
    $('#result-card')?.addEventListener('click', onResultAction);
    $('#link-search')?.addEventListener('input', event => {
      state.query = event.target.value.toLowerCase().trim();
      renderLinkList();
    });
    $('#link-list')?.addEventListener('click', onLinkListClick);
    $('#dialog-close')?.addEventListener('click', () => $('#details-dialog').close());
    $('#details-dialog')?.addEventListener('close', syncModalState);
    $('#details-dialog')?.addEventListener('cancel', syncModalState);
    $('#command-dialog')?.addEventListener('close', syncModalState);
    $('#command-dialog')?.addEventListener('cancel', syncModalState);
    $('#export-links')?.addEventListener('click', exportLinks);
    $('#restore-links')?.addEventListener('click', () => $('#restore-links-file').click());
    $('#restore-links-file')?.addEventListener('change', restoreLinks);
    $('#back-to-top')?.addEventListener('click', backToTop);

    document.addEventListener('keydown', event => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openCommandPalette();
      }
      if (mod && event.key === 'Enter' && !$('#command-dialog')?.open && !$('#details-dialog')?.open) {
        event.preventDefault();
        $('#shorten-form')?.requestSubmit();
      }
      if (event.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName) && !activeDialog()) {
        event.preventDefault();
        location.hash = '#links';
        setTimeout(() => $('#link-search')?.focus(), 80);
      }
    });

    $$('.magnetic').forEach(button => {
      button.addEventListener('pointermove', event => {
        if (matchMedia('(pointer: coarse)').matches) return;
        const rect = button.getBoundingClientRect();
        const x = (event.clientX - rect.left - rect.width / 2) * .12;
        const y = (event.clientY - rect.top - rect.height / 2) * .12;
        button.style.transform = `translate(${x}px, ${y}px)`;
      });
      button.addEventListener('pointerleave', () => { button.style.transform = ''; });
    });
  }

  function activeDialog() {
    return $$('#details-dialog, #command-dialog').find(dialog => dialog.open) || null;
  }

  function syncModalState() {
    const dialog = activeDialog();
    document.documentElement.classList.toggle('modal-lock', Boolean(dialog));
    document.body.classList.toggle('modal-lock', Boolean(dialog));
    const stack = $('#toast-stack');
    if (!stack) return;
    const target = dialog?.querySelector('.dialog-shell, .command-shell') || document.body;
    if (stack.parentElement !== target) target.appendChild(stack);
  }

  function toggleAdvanced() {
    const button = $('#advanced-toggle');
    const panel = $('#advanced-panel');
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
    $('#advanced-symbol').textContent = expanded ? '+' : '−';
  }

  function sanitizeSlugInput(event) {
    const cleaned = event.target.value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    if (event.target.value !== cleaned) event.target.value = cleaned;
  }

  function parseHttpUrl(value) {
    try {
      const url = new URL(value.trim());
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      return url;
    } catch {
      return null;
    }
  }

  function updateUrlStatus() {
    if (!state.serviceAvailable) return;
    const status = $('#url-status');
    const value = $('#long-url').value.trim();
    if (!value) {
      status.className = '';
      status.textContent = 'Paste a URL to begin';
      return;
    }
    const parsed = parseHttpUrl(value);
    if (!parsed) {
      status.className = 'invalid';
      status.textContent = 'Use a complete http:// or https:// URL';
      return;
    }
    status.className = 'valid';
    status.textContent = `Ready · ${parsed.hostname.replace(/^www\./, '')}`;
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!state.serviceAvailable) {
      toast('NOD is unavailable right now', 'error');
      return;
    }

    const input = $('#long-url');
    const parsed = parseHttpUrl(input.value);
    if (!parsed) {
      updateUrlStatus();
      input.focus();
      toast('Enter a valid http:// or https:// URL', 'error');
      return;
    }

    const button = $('#shorten-button');
    button.disabled = true;
    button.querySelector('span').textContent = 'Creating…';

    try {
      let destination = parsed.toString();
      if ($('#utm-toggle').checked && $('#utm-source').value.trim()) {
        const url = new URL(destination);
        url.searchParams.set('utm_source', $('#utm-source').value.trim());
        destination = url.toString();
      }

      const slug = $('#custom-slug').value.trim();
      if (slug && RESERVED.has(slug.toLowerCase())) throw new Error('That ending is reserved. Try another.');

      const response = await fetch(`${API_BASE}/api/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          url: destination,
          slug: slug || undefined,
          title: $('#link-title').value.trim() || undefined,
          expiresAt: expiryToIso($('#expiry').value)
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Could not create link (${response.status})`);

      const created = normalizeLink(data.link || data);
      state.links = [created, ...state.links.filter(link => link.slug !== created.slug)];
      saveManagedLinks();
      showResult(created);
      renderAll();
      rebuildCommandPalette();
      toast('Short link created');
    } catch (error) {
      toast(error?.message || 'Could not create link', 'error');
    } finally {
      button.disabled = !state.serviceAvailable;
      button.querySelector('span').textContent = 'Shorten';
    }
  }

  function expiryToIso(value) {
    const ms = { '1d': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 }[value];
    return ms ? new Date(Date.now() + ms).toISOString() : null;
  }

  function normalizeLink(link) {
    return {
      id: String(link.id || link.slug),
      slug: String(link.slug || ''),
      title: String(link.title || ''),
      url: String(link.url || ''),
      createdAt: link.createdAt || link.created_at || nowIso(),
      expiresAt: link.expiresAt || link.expires_at || null,
      clicks: Number(link.clicks || 0),
      events: Array.isArray(link.events) ? link.events : [],
      shortUrl: link.shortUrl || shortUrlFor(link.slug),
      manageKey: link.manageKey || link.manage_key || '',
      unavailable: false
    };
  }

  function showResult(link) {
    const card = $('#result-card');
    const shortUrl = link.shortUrl || shortUrlFor(link.slug);
    $('#result-link').textContent = displayShortUrl(shortUrl);
    $('#result-link').href = shortUrl;
    $('#result-destination').textContent = link.url;
    card.dataset.linkId = link.id;
    card.hidden = false;
    card.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }

  function displayShortUrl(value) {
    try {
      const url = new URL(value);
      return url.host.replace(/^www\./, '') + url.pathname;
    } catch {
      return value;
    }
  }

  function shortUrlFor(slug) {
    return `${location.origin}/${encodeURIComponent(slug)}`;
  }

  function onResultAction(event) {
    const action = event.target?.dataset?.resultAction;
    if (!action) return;
    const link = state.links.find(item => item.id === $('#result-card').dataset.linkId);
    if (action === 'details' && link) openDetails(link);
    if (action === 'new') resetComposer();
  }

  function resetComposer() {
    $('#long-url').value = '';
    $('#custom-slug').value = '';
    $('#link-title').value = '';
    $('#utm-source').value = '';
    $('#utm-toggle').checked = false;
    $('#utm-field').hidden = true;
    $('#expiry').value = 'never';
    $('#result-card').hidden = true;
    updateUrlStatus();
    $('#long-url').focus();
    $('#studio').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
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
    $('#empty-state').hidden = links.length > 0;

    const emptyTitle = $('#empty-state h3');
    const emptyCopy = $('#empty-state p');
    if (emptyTitle && emptyCopy) {
      if (state.query) {
        emptyTitle.textContent = 'No links found.';
        emptyCopy.textContent = 'Try another search.';
      } else {
        emptyTitle.textContent = 'No links yet.';
        emptyCopy.textContent = 'Create your first short link above.';
      }
    }

    list.innerHTML = links.map(link => {
      const expired = link.expiresAt && new Date(link.expiresAt) <= new Date();
      const bad = expired || link.unavailable;
      const statusLabel = link.unavailable ? 'Unavailable' : expired ? 'Expired' : 'Active';
      return `<article class="link-row" data-id="${escapeAttr(link.id)}">
        <div class="link-primary">
          <div class="link-slug"><span class="status" title="${statusLabel}" style="${bad ? 'background:var(--accent)' : ''}"></span>${escapeHtml(SHORT_DOMAIN)}/${escapeHtml(link.slug)}</div>
          <div class="link-title">${escapeHtml(link.title || safeHost(link.url))}</div>
        </div>
        <div class="link-destination" title="${escapeAttr(link.url)}">${escapeHtml(link.url)}</div>
        <div class="link-clicks">${formatNumber(Number(link.clicks || 0))}</div>
        <div class="link-date">${formatRelative(link.createdAt)}</div>
        <button class="row-menu" type="button" data-action="details" aria-label="Open details for ${escapeAttr(link.slug)}">↗</button>
      </article>`;
    }).join('');
  }

  function renderMetrics() {
    const links = state.links.filter(link => !link.unavailable);
    const totalClicks = links.reduce((sum, link) => sum + Number(link.clicks || 0), 0);
    const active = links.filter(link => !link.expiresAt || new Date(link.expiresAt) > new Date()).length;
    $('#metric-clicks').textContent = formatNumber(totalClicks);
    $('#metric-links').textContent = formatNumber(active);
    $('#active-track').style.width = `${links.length ? Math.round(active / links.length * 100) : 0}%`;

    const events = links.flatMap(link => link.events || []);
    const deviceCounts = { mobile: 0, desktop: 0, tablet: 0 };
    events.forEach(event => {
      if (deviceCounts[event.device] !== undefined) deviceCounts[event.device]++;
    });
    const sortedDevices = Object.entries(deviceCounts).sort((a, b) => b[1] - a[1]);
    const top = sortedDevices[0];
    $('#metric-device').textContent = top?.[1] ? titleCase(top[0]) : '—';
    $('#metric-device-note').textContent = top?.[1]
      ? `${Math.round(top[1] / Math.max(events.length, 1) * 100)}% of observed clicks`
      : 'No events yet';
    $('#device-bars').innerHTML = sortedDevices.map(([name, count]) => {
      const percent = events.length ? Math.round(count / events.length * 100) : 0;
      return `<div class="device-bar"><span>${titleCase(name)}</span><i style="--pct:${percent}%"></i><b>${percent}%</b></div>`;
    }).join('');

    const last24 = events.filter(event => Date.now() - new Date(event.at).getTime() < 864e5).length;
    $('#metric-pulse').textContent = last24 > 40 ? 'Lively' : last24 > 8 ? 'Active' : last24 > 0 ? 'Gentle' : 'Quiet';
    $('#metric-pulse-note').textContent = `${last24} clicks in the last 24h`;
    $('#pulse-dots').innerHTML = Array.from({ length: 16 }, (_, index) => `<i class="${index < Math.min(16, Math.ceil(last24 / 3)) ? 'hot' : ''}"></i>`).join('');
    renderSparkline(events);
  }

  function renderSparkline(events) {
    const buckets = Array(14).fill(0);
    events.forEach(event => {
      const age = Math.floor((Date.now() - new Date(event.at).getTime()) / 864e5);
      if (age >= 0 && age < 14) buckets[13 - age]++;
    });
    const max = Math.max(...buckets, 1);
    const width = 320;
    const height = 96;
    const points = buckets.map((value, index) => [index / 13 * width, height - (value / max) * (height - 18) - 4]);
    const line = smoothPath(points);
    $('#sparkline').innerHTML = `<path class="area" d="${line} L ${width} ${height} L 0 ${height} Z"/><path class="line" d="${line}"/>`;
  }

  function smoothPath(points) {
    if (points.length < 2) return '';
    let path = `M ${points[0][0]} ${points[0][1]}`;
    for (let index = 1; index < points.length; index++) {
      const [x0, y0] = points[index - 1];
      const [x1, y1] = points[index];
      const center = (x0 + x1) / 2;
      path += ` C ${center} ${y0}, ${center} ${y1}, ${x1} ${y1}`;
    }
    return path;
  }

  function onLinkListClick(event) {
    const row = event.target.closest('.link-row');
    if (!row || !event.target.closest('[data-action="details"]')) return;
    const link = state.links.find(item => item.id === row.dataset.id);
    if (link) openDetails(link);
  }

  function openDetails(link) {
    state.selectedId = link.id;
    const events = link.events || [];
    const timestamps = events.map(event => new Date(event.at).getTime()).filter(Number.isFinite);
    const last = timestamps.length ? new Date(Math.max(...timestamps)) : null;
    const titleId = `detail-title-${String(link.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;

    $('#details-content').innerHTML = `
      <h2 class="detail-title" id="${escapeAttr(titleId)}" title="${escapeAttr(`${SHORT_DOMAIN}/${link.slug}`)}">${escapeHtml(SHORT_DOMAIN)}/${escapeHtml(link.slug)}</h2>
      <div class="detail-destination" title="${escapeAttr(link.url)}">${escapeHtml(link.url)}</div>
      <div class="detail-stats">
        <div class="detail-stat"><span>Total clicks</span><strong>${formatNumber(link.clicks || 0)}</strong></div>
        <div class="detail-stat"><span>Created</span><strong>${formatShortDate(link.createdAt)}</strong></div>
        <div class="detail-stat"><span>Last click</span><strong>${last ? formatRelative(last.toISOString()) : '—'}</strong></div>
      </div>
      <div class="detail-actions">
        <button type="button" data-detail="copy">Copy short link</button>
        <button type="button" data-detail="open">Open destination ↗</button>
        <button type="button" data-detail="delete" class="danger">Delete</button>
      </div>`;

    $('#details-content').onclick = event => handleDetailAction(event, link);
    const dialog = $('#details-dialog');
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.showModal();
    syncModalState();
  }

  async function handleDetailAction(event, link) {
    const button = event.target.closest('[data-detail]');
    const action = button?.dataset?.detail;
    if (!action) return;
    if (action === 'copy') await copyText(link.shortUrl || shortUrlFor(link.slug), 'Short link copied');
    if (action === 'open') window.open(link.url, '_blank', 'noopener');
    if (action === 'delete') await deleteLink(link, button);
  }

  async function deleteLink(link, button) {
    if (!link.manageKey) {
      toast('This browser does not have the access key for that link', 'error');
      return;
    }

    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Deleting…';

    try {
      const response = await fetch(`${API_BASE}/api/links/${encodeURIComponent(link.slug)}`, {
        method: 'DELETE',
        headers: { 'X-NOD-Key': link.manageKey, Accept: 'application/json' }
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 404) {
          state.links = state.links.filter(item => item.id !== link.id);
          saveManagedLinks();
          $('#details-dialog').close();
          renderAll();
          rebuildCommandPalette();
          toast('Removed stale link from this workspace');
          return;
        }
        throw new Error(data.error || `Could not delete link (${response.status})`);
      }

      state.links = state.links.filter(item => item.id !== link.id);
      saveManagedLinks();
      $('#details-dialog').close();
      renderAll();
      rebuildCommandPalette();
      toast('Link deleted');
    } catch (error) {
      toast(error?.message || 'Could not delete link', 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function exportLinks() {
    if (!state.links.length) {
      toast('There are no access keys to back up yet');
      return;
    }
    const backup = {
      product: 'NOD',
      version: 2,
      origin: location.origin,
      exportedAt: nowIso(),
      links: state.links.map(link => ({ ...link }))
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = Object.assign(document.createElement('a'), {
      href: url,
      download: `nod-access-keys-${new Date().toISOString().slice(0, 10)}.json`
    });
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    toast('Access-key backup saved');
  }

  async function restoreLinks(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const button = $('#restore-links');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Checking backup…';

    try {
      const parsed = JSON.parse(await file.text());
      const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.links) ? parsed.links : [];
      const usable = candidates.filter(item => item && typeof item.slug === 'string' && typeof item.url === 'string' && typeof item.manageKey === 'string' && item.manageKey);
      if (!usable.length) throw new Error('This file does not contain usable NOD access keys.');

      const checks = await Promise.all(usable.map(async item => {
        try {
          const response = await fetch(`${API_BASE}/api/links/${encodeURIComponent(item.slug)}/stats`, {
            headers: { 'X-NOD-Key': item.manageKey, Accept: 'application/json' },
            cache: 'no-store'
          });
          return response.ok;
        } catch {
          return false;
        }
      }));

      const restored = usable.filter((_, index) => checks[index]).map(normalizeLink);
      if (!restored.length) throw new Error('These keys do not match links in this NOD workspace.');

      const merged = new Map(state.links.map(item => [item.slug, item]));
      for (const item of restored) merged.set(item.slug, item);
      state.links = [...merged.values()];
      saveManagedLinks();
      await refreshLinks();
      renderAll();
      rebuildCommandPalette();
      toast(`${restored.length} ${restored.length === 1 ? 'link' : 'links'} restored`);
    } catch (error) {
      toast(error?.message || 'Could not restore that backup', 'error');
    } finally {
      input.value = '';
      button.disabled = false;
      button.textContent = original;
    }
  }

  function backToTop(event) {
    event.preventDefault();
    history.replaceState(null, '', location.pathname + location.search);
    window.scrollTo({ top: 0, left: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function initCommandPalette() {
    rebuildCommandPalette();
    $('#command-input')?.addEventListener('input', event => {
      state.commandIndex = 0;
      renderCommands(event.target.value);
    });
    $('#command-list')?.addEventListener('click', event => {
      const item = event.target.closest('.command-item');
      if (item) runCommand(Number(item.dataset.index));
    });
    $('#command-dialog')?.addEventListener('close', () => {
      $('#command-input').value = '';
      renderCommands('');
    });
    $('#command-dialog')?.addEventListener('keydown', event => {
      const items = $$('.command-item', $('#command-list'));
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.commandIndex = Math.min(state.commandIndex + 1, Math.max(items.length - 1, 0));
        updateCommandActive();
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.commandIndex = Math.max(state.commandIndex - 1, 0);
        updateCommandActive();
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const active = items[state.commandIndex];
        if (active) runCommand(Number(active.dataset.index));
      }
    });
  }

  function rebuildCommandPalette() {
    state.commands = [
      { name: 'Create a short link', hint: 'Studio', run: () => { location.hash = '#studio'; setTimeout(() => $('#long-url')?.focus(), 180); } },
      { name: 'Search your links', hint: '/', run: () => { location.hash = '#links'; setTimeout(() => $('#link-search')?.focus(), 180); } },
      { name: 'Toggle appearance', hint: 'Theme', run: toggleTheme },
      { name: 'Back up access keys', hint: 'JSON', run: exportLinks },
      { name: 'Restore access keys', hint: 'JSON', run: () => $('#restore-links-file')?.click() },
      { name: 'View principles', hint: 'About', run: () => { location.hash = '#principles'; } },
      ...state.links.slice(0, 5).map(link => ({
        name: `${SHORT_DOMAIN}/${link.slug}`,
        hint: `${link.clicks || 0} clicks`,
        run: () => openDetails(link)
      }))
    ];
    renderCommands($('#command-input')?.value || '');
  }

  function openCommandPalette() {
    const dialog = $('#command-dialog');
    if (!dialog.open) dialog.showModal();
    syncModalState();
    setTimeout(() => $('#command-input')?.focus(), 30);
  }

  function renderCommands(query) {
    const value = query.trim().toLowerCase();
    const filtered = state.commands
      .map((command, index) => ({ ...command, index }))
      .filter(command => !value || `${command.name} ${command.hint}`.toLowerCase().includes(value));

    state.commandIndex = Math.min(state.commandIndex, Math.max(filtered.length - 1, 0));
    $('#command-list').innerHTML = filtered.map((command, index) => `
      <button class="command-item ${index === state.commandIndex ? 'active' : ''}" data-index="${command.index}" type="button">
        <span>${escapeHtml(command.name)}</span><small>${escapeHtml(command.hint)}</small>
      </button>`).join('') || '<div style="padding:18px;color:var(--muted);font-size:11px">No command found.</div>';
  }

  function updateCommandActive() {
    $$('.command-item', $('#command-list')).forEach((element, index) => element.classList.toggle('active', index === state.commandIndex));
  }

  function runCommand(index) {
    const command = state.commands[index];
    if (!command) return;
    $('#command-dialog').close();
    command.run();
  }

  function initFlowField() {
    const canvas = $('#flow-field');
    const context = canvas?.getContext('2d');
    if (!context || prefersReducedMotion()) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    const pointer = { x: -1000, y: -1000 };
    const countForWidth = () => Math.min(88, Math.max(36, Math.floor(innerWidth / 18)));

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      width = document.documentElement.clientWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: countForWidth() }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        px: 0,
        py: 0,
        speed: .28 + Math.random() * .55,
        life: Math.random() * 500
      }));
    }

    function field(x, y, time) {
      return Math.sin(x * .0041 + time * .00017) * 1.4 + Math.cos(y * .0034 - time * .00013) * 1.2 + Math.sin((x + y) * .0015) * .8;
    }

    function frame(time) {
      context.clearRect(0, 0, width, height);
      const dark = document.documentElement.dataset.theme === 'dark';
      context.lineWidth = .65;
      context.globalAlpha = dark ? .34 : .27;
      context.strokeStyle = dark ? '#d8d4c8' : '#6b685f';
      for (const particle of particles) {
        particle.px = particle.x;
        particle.py = particle.y;
        const angle = field(particle.x, particle.y, time);
        const dx = particle.x - pointer.x;
        const dy = particle.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 160) {
          particle.x += dx / Math.max(distance, 1) * .35;
          particle.y += dy / Math.max(distance, 1) * .35;
        }
        particle.x += Math.cos(angle) * particle.speed;
        particle.y += Math.sin(angle) * particle.speed;
        particle.life++;
        if (particle.x < 0 || particle.x > width || particle.y < 0 || particle.y > height || particle.life > 1200) {
          particle.x = Math.random() * width;
          particle.y = Math.random() * height;
          particle.px = particle.x;
          particle.py = particle.y;
          particle.life = 0;
        }
        context.beginPath();
        context.moveTo(particle.px, particle.py);
        context.lineTo(particle.x, particle.y);
        context.stroke();
      }
      requestAnimationFrame(frame);
    }

    addEventListener('resize', resize, { passive: true });
    addEventListener('pointermove', event => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }, { passive: true });
    resize();
    requestAnimationFrame(frame);
  }

  function prefersReducedMotion() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function safeHost(value) {
    try { return new URL(value).hostname.replace(/^www\./, ''); }
    catch { return value; }
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('en-US', {
      notation: value >= 10000 ? 'compact' : 'standard',
      maximumFractionDigits: 1
    }).format(value);
  }

  function formatShortDate(iso) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
  }

  function formatRelative(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 864e5);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return formatShortDate(iso);
  }

  function titleCase(value) {
    return value ? value[0].toUpperCase() + value.slice(1) : value;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]));
  }

  function escapeAttr(value = '') {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  async function copyText(text, message = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      toast(message);
    }
  }

  function toast(message, type = '') {
    const stack = $('#toast-stack');
    if (!stack) return;
    syncModalState();
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.textContent = message;
    stack.append(element);
    setTimeout(() => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(5px)';
      setTimeout(() => element.remove(), 220);
    }, 3000);
  }

  init();
})();
