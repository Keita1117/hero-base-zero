class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
  }

  ensureContext() {
    if (this.muted) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  unlock() {
    try {
      this.ensureContext();
    } catch {
      // Ignore
    }
  }

  tone(freq, duration = 0.12, type = 'triangle', volume = 0.14, delay = 0, endFreq = null) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playTap() {
    this.tone(520, 0.07, 'sine', 0.10, 0, 660);
  }

  playLaser() {
    this.tone(920, 0.13, 'sawtooth', 0.08, 0, 280);
  }

  playTryAgain() {
    this.tone(300, 0.16, 'triangle', 0.12, 0, 210);
  }

  playSuccess() {
    this.tone(523.25, 0.12, 'triangle', 0.14, 0);
    this.tone(659.25, 0.12, 'triangle', 0.14, 0.09);
    this.tone(783.99, 0.14, 'triangle', 0.15, 0.18);
    this.tone(1046.5, 0.24, 'sine', 0.16, 0.27);
  }

  playCombo() {
    this.tone(587.33, 0.10, 'square', 0.08, 0);
    this.tone(880, 0.18, 'triangle', 0.14, 0.08);
  }

  playTransform() {
    const notes = [392.0, 523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, idx) => {
      this.tone(f, 0.22, 'sawtooth', 0.08, idx * 0.08);
      this.tone(f * 0.5, 0.22, 'triangle', 0.10, idx * 0.08);
    });
  }

  playSleep() {
    this.tone(523.25, 0.35, 'sine', 0.08, 0);
    this.tone(440.0, 0.35, 'sine', 0.08, 0.32);
    this.tone(392.0, 0.55, 'sine', 0.08, 0.64);
  }

  playNote(freq) {
    this.tone(freq, 0.28, 'triangle', 0.15, 0);
  }

  playBeatStep(trackIndex) {
    if (trackIndex === 0) {
      this.tone(150, 0.16, 'sine', 0.22, 0, 42);
    } else if (trackIndex === 1) {
      this.tone(240, 0.09, 'square', 0.09, 0, 120);
      this.tone(420, 0.06, 'triangle', 0.07, 0.01, 180);
    } else if (trackIndex === 2) {
      this.tone(523.25, 0.14, 'triangle', 0.12, 0);
    } else if (trackIndex === 3) {
      this.tone(980, 0.11, 'sawtooth', 0.07, 0, 380);
    }
  }
}

export const sound = new SoundEngine();
