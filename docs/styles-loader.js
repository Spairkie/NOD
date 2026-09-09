document.documentElement.style.visibility = "hidden";
(async () => {
  try {
    const files = ["styles-1.part","styles-2.part","styles-3.part","styles-4.part"];
    const parts = await Promise.all(files.map(file => fetch(new URL(file, document.baseURI)).then(r => { if (!r.ok) throw new Error(`Failed to load ${file}`); return r.text(); })));
    const style = document.createElement("style");
    style.textContent = parts.join("");
    document.head.appendChild(style);
  } catch (error) {
    console.error("NOD styles failed to load", error);
  } finally {
    document.documentElement.style.visibility = "visible";
  }
})();
