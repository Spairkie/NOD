(async () => {
  try {
    const files = ["app-1.part","app-2.part","app-3.part","app-4.part","app-5.part"];
    const parts = await Promise.all(files.map(file => fetch(new URL(file, document.baseURI)).then(r => { if (!r.ok) throw new Error(`Failed to load ${file}`); return r.text(); })));
    const blob = new Blob([parts.join("")], { type: "text/javascript" });
    const script = document.createElement("script");
    script.src = URL.createObjectURL(blob);
    script.onload = () => URL.revokeObjectURL(script.src);
    document.body.appendChild(script);
  } catch (error) {
    console.error("NOD app failed to load", error);
  }
})();
