(() => {
  const app = document.createElement('script');
  app.src = new URL('app.js', document.baseURI).href;
  app.async = false;
  document.body.appendChild(app);
})();
