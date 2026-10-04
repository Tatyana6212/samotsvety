'use strict';

/* Small offline sound palette built with Web Audio; no audio downloads required. */
class GemAudio {
  constructor() {
    this.enabled = true;
    this.paused = false;
    this.context = null;
    this.master = null;
    this.music = null;
    this.ambience = [];
    this.musicTimer = null;
    this.musicStep = 0;
    this.notes = [392, 523.25, 440, 659.25, 587.33, 440, 349.23, 523.25];
  }

  unlock() {
    if (!this.enabled || this.paused) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      if (!this.context) {
        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.context.destination);
        this.music = this.context.createGain();
        this.music.gain.value = 0.72;
        this.music.connect(this.master);
      }
      this.context.resume().catch(() => {});
      this.master.gain.setTargetAtTime(0.48, this.context.currentTime, 0.18);
      this.startAmbience();
    } catch {}
  }

  startAmbience() {
    if (!this.context || this.musicTimer) return;
    const pad = (frequency, volume, type = 'sine', detune = 0) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      gain.gain.value = 0.0001;
      oscillator.connect(gain);
      gain.connect(this.music);
      oscillator.start();
      gain.gain.setTargetAtTime(volume, this.context.currentTime, 2.5);
      this.ambience.push({ oscillator, gain });
    };
    pad(130.81, 0.014);
    pad(196, 0.008, 'sine', -5);
    pad(261.63, 0.004);
    const playNext = () => {
      if (!this.enabled || !this.context) return;
      const frequency = this.notes[this.musicStep++ % this.notes.length];
      this.tone(frequency, this.context.currentTime, 1.05, 0.009, 'sine', frequency * 1.003);
    };
    playNext();
    this.musicTimer = window.setInterval(playNext, 2850);
  }

  stopAmbience() {
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (!this.context) return;
    const now = this.context.currentTime;
    this.ambience.forEach(({ oscillator, gain }) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.06);
      try { oscillator.stop(now + 0.35); } catch {}
    });
    this.ambience = [];
  }

  pause() {
    this.paused = true;
    if (this.context && this.master) this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.04);
    this.stopAmbience();
  }

  resume() {
    this.paused = false;
    this.unlock();
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) this.unlock();
    else if (this.context && this.master) {
      this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.045);
      this.stopAmbience();
    }
    return this.enabled;
  }

  tone(frequency, start, duration, volume, type = 'sine', endFrequency = frequency) {
    if (!this.enabled || this.paused || !this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const attack = Math.min(0.025, duration * 0.2);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.035);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      envelope.disconnect();
    }, { once: true });
  }

  select() {
    this.unlock();
    if (this.context) this.tone(690, this.context.currentTime, 0.105, 0.032, 'sine', 880);
  }

  swap() {
    this.unlock();
    if (!this.context) return;
    const now = this.context.currentTime;
    this.tone(390, now, 0.13, 0.036, 'triangle', 480);
    this.tone(565, now + 0.045, 0.11, 0.022, 'sine', 495);
  }

  invalid() {
    if (!this.context || !this.enabled) return;
    this.tone(315, this.context.currentTime, 0.19, 0.026, 'sine', 235);
  }

  match(cascade = 1) {
    this.unlock();
    if (!this.context) return;
    const level = Math.min(cascade, 5);
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
    const count = Math.min(7, 2 + level);
    const start = this.context.currentTime;
    const volume = 0.045 + level * 0.009;
    for (let i = 0; i < count; i++) {
      const frequency = scale[Math.min(scale.length - 1, i + level - 1)];
      const at = start + i * Math.max(0.052, 0.078 - level * 0.004);
      this.tone(frequency, at, 0.38 + level * 0.035, volume, 'sine', frequency * 1.002);
      if (level >= 2 && i % 2 === 0) this.tone(frequency * 2, at + 0.018, 0.23, volume * 0.24);
    }
  }

  levelStart() {
    this.unlock();
    if (!this.context) return;
    const now = this.context.currentTime;
    [392, 523.25, 659.25].forEach((note, i) => this.tone(note, now + i * .09, .34, .035, 'sine'));
  }

  levelComplete() {
    this.unlock();
    if (!this.context) return;
    const now = this.context.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => this.tone(note, now + i * .105, .58, .052, 'sine'));
  }

  victory() {
    this.unlock();
    if (!this.context) return;
    const now = this.context.currentTime;
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((note, i) => {
      this.tone(note, now + i * .085, .8, .055, 'sine');
      if (i > 2) this.tone(note / 2, now + i * .085, .65, .022, 'triangle');
    });
  }

  gameOver() {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime;
    [392, 349.23, 293.66].forEach((note, i) => this.tone(note, now + i * .13, .45, .025, 'sine'));
  }
}

window.GemAudio = GemAudio;
