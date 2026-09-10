(() => {
  const app = document.createElement('script');
  app.src = new URL('app.js', document.baseURI).href;
  app.async = false;
  app.onload = () => {
    const mode = document.querySelector('#mode-label');
    const chip = document.querySelector('#mode-chip');
    if (mode) mode.textContent = 'Live · Netlify';
    if (chip) chip.title = 'Connected to NOD production on Netlify.';
  };
  document.body.appendChild(app);
})();
