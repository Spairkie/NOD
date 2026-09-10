(() => {
  try {
    const saved = localStorage.getItem('nod.theme.v1');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#11120f' : '#f2efe7');
  } catch {}

  for (const file of ['styles.css', 'ui-polish.css', 'netlify-ui.css', 'interaction-fixes.css']) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL(file, document.baseURI).href;
    link.setAttribute('blocking', 'render');
    document.head.appendChild(link);
  }
})();
