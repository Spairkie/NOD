(() => {
  'use strict';

  const STORAGE_KEY = 'nod.links.v1';

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
    }, 2600);
  }

  function cleanProviderCopy() {
    const mode = document.querySelector('#mode-label');
    const chip = document.querySelector('#mode-chip');
    if (mode) mode.textContent = 'Live · Netlify';
    if (chip) chip.title = 'Connected to NOD production on Netlify.';

    const turnstile = document.querySelector('#turnstile-wrap');
    if (turnstile) turnstile.remove();

    const principles = [...document.querySelectorAll('.principles-grid article')];
    const edgeCard = principles.find(card => card.querySelector('h3')?.textContent?.trim() === 'Edge by design');
    if (edgeCard) {
      edgeCard.querySelector('h3').textContent = 'Built to stay simple';
      edgeCard.querySelector('p').textContent = 'The studio, redirects, persistent storage, and click intelligence run together on Netlify.';
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

  function installRestore() {
    const controls = document.querySelector('.dashboard-controls');
    if (!controls || document.querySelector('#restore-links')) return;

    const restore = document.createElement('button');
    restore.className = 'quiet-btn';
    restore.id = 'restore-links';
    restore.type = 'button';
    restore.textContent = 'Restore access keys';
    restore.title = 'Restore a NOD backup from another browser or device.';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.hidden = true;
    input.id = 'restore-links-file';

    restore.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!Array.isArray(parsed)) throw new Error('Backup must contain a list of links.');

        const restored = parsed.filter(item =>
          item &&
          typeof item.slug === 'string' &&
          typeof item.url === 'string' &&
          typeof item.manageKey === 'string' &&
          item.manageKey.length > 0
        );
        if (!restored.length) throw new Error('No usable NOD access keys were found in that file.');

        const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const merged = new Map();
        for (const item of Array.isArray(current) ? current : []) {
          if (item?.slug) merged.set(item.slug, item);
        }
        for (const item of restored) merged.set(item.slug, item);
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...merged.values()]));
        toast(`${restored.length} ${restored.length === 1 ? 'link' : 'links'} restored`);
        setTimeout(() => location.reload(), 450);
      } catch (error) {
        toast(error?.message || 'Could not restore that backup', 'error');
      } finally {
        input.value = '';
      }
    });

    controls.prepend(restore, input);
  }

  function installBackToTop() {
    for (const link of document.querySelectorAll('a[href="#top"]')) {
      link.addEventListener('click', event => {
        event.preventDefault();
        history.replaceState(null, '', location.pathname + location.search);
        window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    }
  }

  function installModalLock() {
    const dialogs = [...document.querySelectorAll('dialog')];
    const sync = () => {
      const open = dialogs.some(dialog => dialog.open);
      document.documentElement.classList.toggle('modal-lock', open);
      document.body.classList.toggle('modal-lock', open);
    };

    const observer = new MutationObserver(sync);
    dialogs.forEach(dialog => {
      observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
      dialog.addEventListener('close', sync);
      dialog.addEventListener('cancel', sync);
    });
    sync();
  }

  cleanProviderCopy();
  installRestore();
  installBackToTop();
  installModalLock();
})();
