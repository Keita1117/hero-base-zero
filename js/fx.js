let fxCanvas = null;
let fxCtx = null;
let particles = [];
let rafId = null;
let reducedMotionFlag = false;

export function setFxReducedMotion(reduced) {
  reducedMotionFlag = Boolean(reduced);
}

function ensureCanvas() {
  if (typeof document === 'undefined') return null;
  if (!fxCanvas || !fxCanvas.isConnected) {
    fxCanvas = document.createElement('canvas');
    fxCanvas.className = 'fx-overlay-canvas';
    fxCanvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(fxCanvas);
    fxCtx = fxCanvas.getContext('2d');
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth || 800;
  const h = window.innerHeight || 600;
  if (fxCanvas.width !== Math.round(w * dpr) || fxCanvas.height !== Math.round(h * dpr)) {
    fxCanvas.width = Math.round(w * dpr);
    fxCanvas.height = Math.round(h * dpr);
    fxCanvas.style.width = `${w}px`;
    fxCanvas.style.height = `${h}px`;
    if (fxCtx) fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return fxCtx;
}

const PRESETS = {
  stars: ['#FFB800', '#00D2FF', '#FFFFFF', '#FF4757'],
  fire: ['#FF4757', '#FF9F43', '#FFD32A', '#FFFFFF'],
  confetti: ['#FF4757', '#00D2FF', '#FFB800', '#1DD1A1', '#A55EEA'],
  laser: ['#00D2FF', '#1DD1A1', '#FFFFFF'],
};

function tickParticles() {
  if (!fxCtx || particles.length === 0) {
    if (fxCtx && fxCanvas) {
      fxCtx.clearRect(0, 0, window.innerWidth || 800, window.innerHeight || 600);
    }
    rafId = null;
    return;
  }

  fxCtx.clearRect(0, 0, window.innerWidth || 800, window.innerHeight || 600);
  const alive = [];

  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.rot += p.vRot;
    p.life -= p.decay;
    if (p.life <= 0) continue;
    alive.push(p);

    fxCtx.save();
    fxCtx.globalAlpha = Math.max(0, Math.min(1, p.life));
    fxCtx.translate(p.x, p.y);
    fxCtx.rotate(p.rot);
    fxCtx.fillStyle = p.color;

    if (p.shape === 'star') {
      fxCtx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const a1 = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const a2 = a1 + Math.PI / 5;
        const r1 = p.size;
        const r2 = p.size * 0.45;
        if (i === 0) fxCtx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
        else fxCtx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
        fxCtx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
      }
      fxCtx.closePath();
      fxCtx.fill();
    } else if (p.shape === 'rect') {
      fxCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
    } else {
      fxCtx.beginPath();
      fxCtx.arc(0, 0, p.size * 0.55, 0, Math.PI * 2);
      fxCtx.fill();
    }
    fxCtx.restore();
  }

  particles = alive;
  if (particles.length > 0) {
    rafId = requestAnimationFrame(tickParticles);
  } else {
    fxCtx.clearRect(0, 0, window.innerWidth || 800, window.innerHeight || 600);
    rafId = null;
  }
}

export function burstParticles(x, y, { count = 26, preset = 'stars' } = {}) {
  const ctx = ensureCanvas();
  if (!ctx) return;
  const palette = PRESETS[preset] || PRESETS.stars;
  const total = reducedMotionFlag ? Math.min(8, count) : Math.min(48, count);
  const shapes = preset === 'confetti' ? ['rect', 'star', 'circle'] : preset === 'fire' ? ['circle', 'star'] : ['star', 'circle'];

  for (let i = 0; i < total; i += 1) {
    const angle = (Math.PI * 2 * i) / total + (Math.random() - 0.5) * 0.45;
    const speed = (reducedMotionFlag ? 1.5 : 3.2) + Math.random() * 5.8;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (preset === 'confetti' ? 2.8 : 1.0),
      gravity: preset === 'laser' ? 0.04 : 0.16,
      size: 6 + Math.random() * 8,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.25,
      life: 1,
      decay: 0.02 + Math.random() * 0.018,
      color: palette[Math.floor(Math.random() * palette.length)],
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    });
  }

  if (!rafId) {
    rafId = requestAnimationFrame(tickParticles);
  }
}

export function burstAtElement(el, opts = {}) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return;
  const r = el.getBoundingClientRect();
  burstParticles(r.left + r.width / 2, r.top + r.height / 2, opts);
}

export function bounceElement(el) {
  if (!el || reducedMotionFlag || typeof el.animate !== 'function') return;
  el.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.16, 0.86)' },
      { transform: 'scale(0.92, 1.12)' },
      { transform: 'scale(1.04, 0.97)' },
      { transform: 'scale(1)' },
    ],
    { duration: 420, easing: 'ease-out' }
  );
}

export function shakeElement(el) {
  if (!el || reducedMotionFlag || typeof el.animate !== 'function') return;
  el.animate(
    [
      { transform: 'translate3d(0,0,0)' },
      { transform: 'translate3d(-7px, 2px, 0)' },
      { transform: 'translate3d(7px, -2px, 0)' },
      { transform: 'translate3d(-4px, 0, 0)' },
      { transform: 'translate3d(0,0,0)' },
    ],
    { duration: 280, easing: 'ease-out' }
  );
}

export function makeDraggable(el, {
  getTargets = () => [],
  snapRadius = 96,
  onStart,
  onNear,
  onLeave,
  onDrop,
  onMiss,
  enabled = () => true,
} = {}) {
  if (!el) return () => {};
  el.style.touchAction = 'none';

  let dragging = false;
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let lastNearTarget = null;
  let baseRect = null;

  function findClosestTarget(cx, cy) {
    const targets = getTargets() || [];
    let best = null;
    let bestDist = Infinity;
    for (const t of targets) {
      const targetNode = t?.el;
      if (!targetNode || !targetNode.isConnected) continue;
      const r = targetNode.getBoundingClientRect();
      const tx = r.left + r.width / 2;
      const ty = r.top + r.height / 2;
      const dist = Math.hypot(cx - tx, cy - ty);
      const radius = t.radius || snapRadius;
      if (dist <= radius && dist < bestDist) {
        best = t;
        bestDist = dist;
      }
    }
    return best;
  }

  function handleDown(e) {
    if (!enabled() || dragging) return;
    e.preventDefault();
    dragging = true;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    baseRect = el.getBoundingClientRect();
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('is-dragging');
    el.style.transition = 'none';
    el.style.zIndex = '50';
    onStart?.(el, e);
  }

  function handleMove(e) {
    if (!dragging || e.pointerId !== activePointerId) return;
    e.preventDefault();
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const tilt = Math.max(-10, Math.min(10, dx * 0.06));
    el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.12) rotate(${tilt.toFixed(1)}deg)`;

    const cx = baseRect.left + baseRect.width / 2 + dx;
    const cy = baseRect.top + baseRect.height / 2 + dy;
    const near = findClosestTarget(cx, cy);
    if (near?.id !== lastNearTarget?.id) {
      if (lastNearTarget) onLeave?.(lastNearTarget, el);
      lastNearTarget = near;
      if (near) onNear?.(near, el);
    }
  }

  function finishDrag(e, canceled = false) {
    if (!dragging || (e && e.pointerId !== activePointerId)) return;
    if (e && el.hasPointerCapture?.(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    dragging = false;
    activePointerId = null;
    el.classList.remove('is-dragging');

    const dx = e ? e.clientX - startX : 0;
    const dy = e ? e.clientY - startY : 0;
    const cx = baseRect.left + baseRect.width / 2 + dx;
    const cy = baseRect.top + baseRect.height / 2 + dy;
    const droppedOn = canceled ? null : findClosestTarget(cx, cy);

    if (lastNearTarget) {
      onLeave?.(lastNearTarget, el);
      lastNearTarget = null;
    }

    if (droppedOn && onDrop) {
      el.style.zIndex = '';
      const handled = onDrop(droppedOn, el, { x: cx, y: cy });
      if (handled !== false) {
        return;
      }
    }

    el.style.transition = 'transform 0.34s cubic-bezier(0.34, 1.56, 0.64, 1)';
    el.style.transform = 'translate3d(0px, 0px, 0) scale(1)';
    el.style.zIndex = '';
    if (!canceled) {
      onMiss?.(el);
    }
  }

  const onUp = (e) => finishDrag(e, false);
  const onCancel = (e) => finishDrag(e, true);

  el.addEventListener('pointerdown', handleDown);
  el.addEventListener('pointermove', handleMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('lostpointercapture', onCancel);

  return () => {
    el.removeEventListener('pointerdown', handleDown);
    el.removeEventListener('pointermove', handleMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('lostpointercapture', onCancel);
  };
}
