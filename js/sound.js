class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmEnabled = false;
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) {
      this.stopBgmLoop();
    } else if (this.bgmEnabled) {
      this.startBgmLoop();
    }
  }

  setBgmEnabled(enabled) {
    this.bgmEnabled = Boolean(enabled);
    if (this.bgmEnabled && !this.muted) {
      this.startBgmLoop();
    } else {
      this.stopBgmLoop();
    }
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
      if (this.bgmEnabled && !this.muted && !this.bgmTimer) {
        this.startBgmLoop();
      }
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

  startBgmLoop() {
    if (this.bgmTimer || this.muted || !this.bgmEnabled) return;
    const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.0, 783.99];
    const bass = [130.81, 130.81, 196.0, 196.0, 174.61, 174.61, 196.0, 196.0];
    this.bgmTimer = setInterval(() => {
      if (this.muted || !this.bgmEnabled) {
        this.stopBgmLoop();
        return;
      }
      const idx = this.bgmStep % melody.length;
      this.tone(melody[idx], 0.14, 'triangle', 0.035, 0);
      if (idx % 2 === 0) {
        this.tone(bass[idx], 0.18, 'sine', 0.04, 0);
      }
      this.bgmStep += 1;
    }, 280);
  }

  stopBgmLoop() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  playTap() {
    this.tone(540, 0.07, 'sine', 0.11, 0, 720);
  }

  playPop() {
    this.tone(420, 0.09, 'sine', 0.12, 0, 880);
  }

  playLaser() {
    this.tone(940, 0.12, 'sawtooth', 0.07, 0, 320);
  }

  playBoing() {
    this.tone(240, 0.14, 'sine', 0.13, 0, 460);
    this.tone(440, 0.14, 'sine', 0.10, 0.1, 220);
  }

  playTryAgain() {
    this.playBoing();
  }

  playChomp() {
    this.tone(260, 0.08, 'square', 0.10, 0, 120);
    this.tone(320, 0.09, 'square', 0.10, 0.1, 140);
    this.tone(523.25, 0.14, 'triangle', 0.14, 0.2, 783.99);
  }

  playRoar() {
    this.tone(180, 0.34, 'sawtooth', 0.12, 0, 75);
    this.tone(240, 0.30, 'triangle', 0.10, 0.03, 95);
  }

  playTurbo() {
    this.tone(280, 0.26, 'sawtooth', 0.09, 0, 880);
    this.tone(523.25, 0.18, 'triangle', 0.14, 0.12, 1046.5);
  }

  playDocking() {
    this.tone(190, 0.09, 'square', 0.14, 0, 90);
    this.tone(523.25, 0.11, 'triangle', 0.14, 0.08);
    this.tone(783.99, 0.18, 'triangle', 0.15, 0.16);
  }

  playSizzle() {
    this.tone(920, 0.06, 'sawtooth', 0.03, 0, 620);
    this.tone(740, 0.07, 'triangle', 0.04, 0.03, 1100);
  }

  playCapsuleTap(step = 1) {
    const base = 360 + step * 140;
    this.tone(base, 0.12, 'triangle', 0.16, 0, base * 1.3);
  }

  playCapsuleOpen() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    notes.forEach((f, idx) => {
      this.tone(f, 0.22, 'triangle', 0.15, idx * 0.07);
    });
  }

  playSuccess() {
    this.tone(523.25, 0.11, 'triangle', 0.14, 0);
    this.tone(659.25, 0.11, 'triangle', 0.14, 0.08);
    this.tone(783.99, 0.14, 'triangle', 0.15, 0.16);
    this.tone(1046.5, 0.24, 'sine', 0.16, 0.24);
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
