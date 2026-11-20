class VoiceEngine {
  constructor() {
    this.enabled = true;
    this.bubbleListener = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.stop();
    }
  }

  setBubbleListener(fn) {
    this.bubbleListener = typeof fn === 'function' ? fn : null;
  }

  notifyBubble(text) {
    if (this.bubbleListener && text) {
      this.bubbleListener(text);
    }
  }

  stop() {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // Ignore
    }
  }

  speak(text, lang = 'ja-JP', bubbleText = null, opts = {}) {
    const clean = String(text || '').trim();
    const display = bubbleText || clean;
    if (display) {
      this.notifyBubble(display);
    }
    if (!this.enabled || !clean) return;

    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        return;
      }
      if (!opts.queue) {
        window.speechSynthesis.cancel();
      }
      const utt = new SpeechSynthesisUtterance(clean);
      utt.lang = lang;
      utt.rate = opts.rate ?? (lang.startsWith('en') ? 0.90 : 1.0);
      utt.pitch = opts.pitch ?? (lang.startsWith('en') ? 1.05 : 1.12);
      utt.volume = 1;
      window.speechSynthesis.speak(utt);
    } catch {
      // Speech API failure should never break gameplay
    }
  }

  speakJa(text, opts = {}) {
    this.speak(text, 'ja-JP', text, opts);
  }

  speakEn(text, bubbleJaText = null, opts = {}) {
    this.speak(text, 'en-US', bubbleJaText || text, opts);
  }
}

export const voice = new VoiceEngine();
