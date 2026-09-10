(() => {
  'use strict';

  const CONFIG = window.__NOD_CONFIG__ || {};
  const API_BASE = String(CONFIG.API_BASE_URL || '').trim();
  const IS_LIVE = Boolean(API_BASE);
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function setText(selector, value) {
    const node = $(selector);
    if (node && node.textContent !== value) node.textContent = value;
  }

  function syncProductChrome() {
    $('#reset-demo')?.remove();

    const modeChip = $('#mode-chip');
    if (modeChip) {
      modeChip.title = IS_LIVE
        ? 'Connected to NOD production on Cloudflare.'
        : 'The production edge service is unavailable.';
    }
    setText('#mode-label', IS_LIVE ? 'Live · Cloudflare' : 'Service unavailable');

    const modeDot = $('.mode-dot');
    if (modeDot) modeDot.style.background = IS_LIVE ? 'var(--green)' : 'var(--accent)';

    setText('#sample-badge', IS_LIVE ? 'Live workspace' : 'Offline');

    const exportButton = $('#export-links');
    if (exportButton) {
      exportButton.textContent = 'Back up access keys';
      exportButton.title = 'Save the private management keys needed to manage these links from another browser.';
    }
  }

  function syncEmptyState() {
    const empty = $('#empty-state');
    if (!empty || empty.hidden) return;

    const query = $('#link-search')?.value.trim();
    const title = empty.querySelector('h3');
    const copy = empty.querySelector('p');

    if (query) {
      if (title) title.textContent = 'No links found.';
      if (copy) copy.textContent = 'Try another search.';
    } else {
      if (title) title.textContent = 'No links yet.';
      if (copy) copy.textContent = 'Create your first short link above.';
    }
  }

  function syncDialogState() {
    const anyOpen = $$('.details-dialog, .command-dialog').some(dialog => dialog.open);
    document.body.classList.toggle('dialog-open', anyOpen);

    const details = $('#details-dialog');
    if (details?.open) {
      const title = details.querySelector('.detail-title');
      if (title) {
        title.id = 'nod-detail-title';
        title.title = title.textContent.trim();
        details.setAttribute('aria-labelledby', title.id);
      }
      const destination = details.querySelector('.detail-destination');
      if (destination) destination.title = destination.textContent.trim();
    }
  }

  function enforceProductionOnly() {
    if (IS_LIVE) return;

    const form = $('#shorten-form');
    const button = $('#shorten-button');
    const status = $('#url-status');

    if (button) button.disabled = true;
    if (status) {
      status.className = 'invalid';
      status.textContent = 'Production service unavailable';
    }

    form?.addEventListener('submit', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  function keepTurnstileInTheme() {
    const toggle = $('#theme-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      window.setTimeout(() => {
        try {
          if (!window.turnstile || window.__nodTurnstileWidgetId === undefined) return;
          window.turnstile.remove(window.__nodTurnstileWidgetId);
          delete window.__nodTurnstileWidgetId;
          window.__nodTurnstileToken = '';
          window.__nodRenderTurnstile?.();
        } catch {}
      }, 0);
    });
  }

  syncProductChrome();
  syncEmptyState();
  syncDialogState();
  enforceProductionOnly();
  keepTurnstileInTheme();

  $('#link-search')?.addEventListener('input', () => {
    queueMicrotask(() => {
      syncProductChrome();
      syncEmptyState();
    });
  });

  const list = $('#link-list');
  if (list) {
    new MutationObserver(() => {
      syncProductChrome();
      syncEmptyState();
    }).observe(list, { childList: true, subtree: false });
  }

  const detailsContent = $('#details-content');
  if (detailsContent) {
    new MutationObserver(syncDialogState).observe(detailsContent, { childList: true, subtree: true });
  }

  $$('.details-dialog, .command-dialog').forEach(dialog => {
    new MutationObserver(syncDialogState).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    dialog.addEventListener('close', syncDialogState);
  });
})();
