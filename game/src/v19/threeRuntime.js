// Load the 3D runtime on demand. Home/navigation can paint and respond without
// downloading/parsing the ~850 KB Three bundle on the critical UI path.
let runtime;
function script(relative) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element.src = new URL(relative, import.meta.url).href;
    element.async = false;
    element.onload = () => resolve();
    element.onerror = () => reject(new Error('3D 引擎加载失败：' + relative));
    document.head.appendChild(element);
  });
}

export function ensureThreeRuntime() {
  if (globalThis.THREE?.GLTFLoader) return Promise.resolve();
  runtime ??= (async () => {
    if (!globalThis.THREE) await script('../render/legacy/three.bundle.js');
    if (!globalThis.THREE?.GLTFLoader) await script('../render/legacy/three.addons.js');
    if (!globalThis.THREE?.GLTFLoader) throw new Error('3D 加载器初始化失败');
  })().catch(error => {
    runtime = null;
    throw error;
  });
  return runtime;
}
