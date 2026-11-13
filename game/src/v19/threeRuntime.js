let pending;

export function ensureThreeRuntime() {
  if (globalThis.THREE?.GLTFLoader) return Promise.resolve();
  // Async=false orders the classic scripts while allowing both downloads to
  // start together. The HTML preloads them without blocking application boot.
  pending ??= Promise.allSettled([
    globalThis.THREE ? null : loadScript('three.bundle.js'),
    loadScript('three.addons.js'),
  ]).then(results => {
    if (globalThis.THREE?.GLTFLoader) return;
    const failed = results.find(result => result.status === 'rejected');
    throw failed?.reason ?? new Error('3D 加载器初始化失败');
  }).catch(error => {
    pending = null;
    throw error;
  });
  return pending;
}

function loadScript(filename) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../render/legacy/' + filename, import.meta.url).href;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error('3D 引擎加载失败'));
    };
    document.head.append(script);
  });
}

