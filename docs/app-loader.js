(() => {
  const app = document.createElement('script');
  app.src = new URL('app.js', document.baseURI).href;
  app.async = false;
  app.onload = () => {
    const runtime = document.createElement('script');
    runtime.src = new URL('ui-runtime.js', document.baseURI).href;
    runtime.async = false;
    document.body.appendChild(runtime);
  };
  document.body.appendChild(app);
})();
