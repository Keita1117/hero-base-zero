const SAFE_EVENTS = new Set([
  'click',
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'change',
  'keydown',
  'input',
]);

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'class') {
      node.className = String(v);
    } else if (k === 'text') {
      node.textContent = String(v);
    } else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sv === undefined || sv === null) continue;
        if (sk.startsWith('--')) {
          node.style.setProperty(sk, String(sv));
        } else {
          node.style[sk] = String(sv);
        }
      }
    } else if (k.startsWith('on')) {
      const eventName = k.slice(2).toLowerCase();
      if (SAFE_EVENTS.has(eventName) && typeof v === 'function') {
        node.addEventListener(eventName, v);
      }
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child !== null && child !== undefined) {
      node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
  }
  return node;
}

export function isSafeDataImageUrl(url) {
  return typeof url === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(url);
}
