(() => {
  'use strict';

  const STORAGE_KEY = 'nod.links.v1';
  const API_BASE = location.origin;
  const bodyToastParent = document.body;

  function getStoredLinks() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveStoredLinks(links) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }

  function toast(message, type = '') {
    const stack = document.querySelector('#toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    stack.append(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(5px)';
      setTimeout(() => el.remove(), 220);
    }, 3000);
  }

  function cleanProviderCopy() {
    const mode = document.querySelector('#mode-label');
    const chip = document.querySelector('#mode-chip');
    if (mode) mode.textContent = 'Live · Netlify';
    if (chip) chip.title = 'Connected to NOD production on Netlify.';

    document.querySelector('#turnstile-wrap')?.remove();
    document.querySelector('#sample-badge')?.remove();

    const principles = [...document.querySelectorAll('.principles-grid article')];
    const edgeCard = principles.find(card => card.querySelector('h3')?.textContent?.trim() === 'Edge by design');
    if (edgeCard) {
      edgeCard.querySelector('h3').textContent = 'Built to stay simple';
      edgeCard.querySelector('p').textContent = 'The studio, redirects, storage, and click intelligence run together on Netlify.';
    }

    const architecture = document.querySelector('.architecture-strip');
    if (architecture) {
      architecture.innerHTML = `
        <div><span>01</span><strong>Static UI</strong><small>Studio</small></div>
        <i>→</i>
        <div><span>02</span><strong>Netlify Functions</strong><small>API + redirects</small></div>
        <i>→</i>
        <div><span>03</span><strong>Netlify Blobs</strong><small>Links + events</small></div>`;
    }
  }

  async function validateRestoredLink(item) {
    try {
      const response = await fetch(`${API_BASE}/api/links/${encodeURIComponent(item.slug)}/stats`, {
        headers: { 'X-NOD-Key': item.manageKey, Accept: 'application/json' }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  function installRestore() {
    const controls = document.querySelector('.dashboard-controls');
    if (!controls || document.querySelector('#restore-links')) return;

    const restore = document.createElement('button');
    restore.className = 'quiet-btn';
    restore.id = 'restore-links';
    restore.type = 'button';
    restore.textContent = 'Restore access keys';
    restore.title = 'Restore a NOD access-key backup from another browser or device.';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.hidden = true;
    input.id = 'restore-links-file';

    restore.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      restore.disabled = true;
      restore.textContent = 'Checking backup…';
      try {
        const parsed = JSON.parse(await file.text());
        const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.links) ? parsed.links : [];
        if (!candidates.length) throw new Error('This file is not a NOD access-key backup.');

        const usable = candidates.filter(item =>
          item &&
          typeof item.slug === 'string' &&
          typeof item.url === 'string' &&
          typeof item.manageKey === 'string' &&
          item.manageKey.length > 0
        );
        if (!usable.length) throw new Error('No access keys were found in this backup.');

        const checks = await Promise.all(usable.map(validateRestoredLink));
        const restored = usable.filter((_, index) => checks[index]);
        if (!restored.length) throw new Error('These keys do not match links in this Netlify workspace.');

        const merged = new Map(getStoredLinks().filter(item => item?.slug).map(item => [item.slug, item]));
        for (const item of restored) merged.set(item.slug, item);
        saveStoredLinks([...merged.values()]);
        toast(`${restored.length} ${restored.length === 1 ? 'link' : 'links'} restored`);
        setTimeout(() => location.reload(), 550);
      } catch (error) {
        toast(error?.message || 'Could not restore that backup', 'error');
      } finally {
        input.value = '';
        restore.disabled = false;
        restore.textContent = 'Restore access keys';
      }
    });

    controls.prepend(restore, input);
  }

  function installBackToTop() {
    for (const link of document.querySelectorAll('a[href="#top"]')) {
      link.addEventListener('click', event => {
        event.preventDefault();
        history.replaceState(null, '', location.pathname + location.search);
        window.scrollTo({ top: 0, left: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    }
  }

  function installDeleteFix() {
    document.addEventListener('click', async event => {
      const button = event.target.closest('[data-detail="delete"]');
      if (!button) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const title = document.querySelector('#details-content .detail-title')?.textContent || '';
      const slug = title.split('/').pop()?.trim();
      if (!slug) return toast('Could not determine which link to delete', 'error');

      const links = getStoredLinks();
      const link = links.find(item => item?.slug === slug);
      if (!link?.manageKey) return toast('This browser does not have the access key for that link', 'error');

      button.disabled = true;
      const original = button.textContent;
      button.textContent = 'Deleting…';
      try {
        const response = await fetch(`${API_BASE}/api/links/${encodeURIComponent(slug)}`, {
          method: 'DELETE',
          headers: { 'X-NOD-Key': link.manageKey, Accept: 'application/json' }
        });
        const payload = await response.json().catch(() => ({}));

        if (response.ok) {
          saveStoredLinks(links.filter(item => item?.slug !== slug));
          document.querySelector('#details-dialog')?.close();
          toast('Link deleted');
          setTimeout(() => location.reload(), 450);
          return;
        }

        if (response.status === 404) {
          saveStoredLinks(links.filter(item => item?.slug !== slug));
          document.querySelector('#details-dialog')?.close();
          toast('Removed stale link from this workspace');
          setTimeout(() => location.reload(), 450);
          return;
        }

        throw new Error(payload.error || `Could not delete link (${response.status})`);
      } catch (error) {
        toast(error?.message || 'Could not delete link', 'error');
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    }, true);
  }

  function installModalOwnership() {
    const dialogs = [...document.querySelectorAll('dialog')];
    const toastStack = document.querySelector('#toast-stack');

    const sync = () => {
      const active = [...dialogs].reverse().find(dialog => dialog.open);
      const isOpen = Boolean(active);
      document.documentElement.classList.toggle('modal-lock', isOpen);
      document.body.classList.toggle('modal-lock', isOpen);

      if (toastStack) {
        const target = active?.querySelector('.dialog-shell, .command-shell') || bodyToastParent;
        if (toastStack.parentElement !== target) target.appendChild(toastStack);
      }
    };

    const observer = new MutationObserver(sync);
    dialogs.forEach(dialog => {
      observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
      dialog.addEventListener('close', sync);
      dialog.addEventListener('cancel', sync);
      dialog.addEventListener('click', event => {
        if (event.target === dialog) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    });
    sync();
  }

  cleanProviderCopy();
  installRestore();
  installBackToTop();
  installDeleteFix();
  installModalOwnership();
})();
