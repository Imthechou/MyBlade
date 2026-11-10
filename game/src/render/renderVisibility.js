/** Keep a render loop alive only while its document and surface can be seen. */
export function renderLoopAllowed(documentHidden, viewportVisible = true) {
  return !documentHidden && viewportVisible !== false;
}

/** IO may be missing or fail to observe. Unknown viewport bounds are not zero. */
export function renderSurfaceVisible(surface, viewport = globalThis) {
  if (!surface || surface.isConnected === false) return false;
  const rect = surface.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return false;
  const width = viewport.innerWidth || viewport.document?.documentElement?.clientWidth;
  const height = viewport.innerHeight || viewport.document?.documentElement?.clientHeight;
  return rect.bottom > 0 && rect.right > 0
    && (!(width > 0) || rect.left < width)
    && (!(height > 0) || rect.top < height);
}
