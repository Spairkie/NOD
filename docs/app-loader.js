(() => {
  try {
    const key = 'nod.links.v1';
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(stored)) {
      const real = stored.filter(link => !link?.sample && !String(link?.id || '').startsWith('sample-'));
      if (real.length !== stored.length) localStorage.setItem(key, JSON.stringify(real));
    }
  } catch {}

  const app = document.createElement('script');
  app.src = new URL('app.js', document.baseURI).href;
  app.async = false;
  app.onload = () => {
    const product = document.createElement('script');
    product.src = new URL('product-runtime.js', document.baseURI).href;
    product.async = false;
    document.body.appendChild(product);
  };
  document.body.appendChild(app);
})();
