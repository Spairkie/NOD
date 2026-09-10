(() => {
  const script = document.createElement('script');
  script.src = new URL('app.js', document.baseURI).href;
  script.async = false;
  document.body.appendChild(script);
})();
