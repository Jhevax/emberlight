// All sound is synthesised with WebAudio — no audio files, nothing fetched.
// Short oscillator/noise blips for actions, and a quiet two-voice loop (a low
// pulse and a slow ember arpeggio) that starts on the first user gesture.
// Everything is guarded: no AudioContext exists until the player interacts, and
// a muted or suspended context simply plays nothing.

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  const MELODY = [220, 261.63, 329.63, 392, 329.63, 261.63, 196, 246.94];
  const BASS = [55, 55, 65.41, 49];

  function ensure() {
    if (context) return true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, duration, type, volume, slideTo) {
    if (!context || muted) return;
    try {
      const now = context.currentTime;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch { /* sound is decoration; never break the game */ }
  }

  function noise(duration, volume, lowpass) {
    if (!context || muted) return;
    try {
      const now = context.currentTime;
      const length = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(now);
    } catch { /* ignore */ }
  }

  function musicStep() {
    if (!context || muted) return;
    const bar = Math.floor(step / 2) % BASS.length;
    if (step % 2 === 0) tone(BASS[bar], 0.5, 'sine', 0.5);
    tone(MELODY[step % MELODY.length], 0.42, 'triangle', 0.22);
    step += 1;
  }

  return {
    /** Call on the first gesture; safe to call repeatedly. */
    unlock() {
      if (!ensure()) return;
      if (context.state === 'suspended') context.resume().catch(() => {});
      if (!musicTimer) musicTimer = window.setInterval(musicStep, 340);
    },
    setMuted(value) {
      muted = value;
      if (master && context) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    shoot() { tone(720, 0.09, 'square', 0.10, 320); },
    hit() { noise(0.06, 0.14, 2400); },
    kill() { tone(180, 0.16, 'sawtooth', 0.14, 60); noise(0.12, 0.10, 1200); },
    pickup() { tone(880, 0.08, 'sine', 0.12, 1320); },
    hurt() { tone(140, 0.22, 'sawtooth', 0.20, 70); },
    dash() { noise(0.14, 0.12, 3200); },
    heal() { tone(523, 0.18, 'sine', 0.14, 784); },
    wave() { tone(196, 0.5, 'triangle', 0.18, 392); tone(294, 0.5, 'triangle', 0.12, 392); },
    boss() { tone(98, 0.7, 'sawtooth', 0.20, 49); noise(0.4, 0.12, 600); },
    upgrade() { tone(523, 0.12, 'triangle', 0.16); tone(659, 0.12, 'triangle', 0.16); tone(784, 0.22, 'triangle', 0.16); },
    win() { [523, 659, 784, 1046].forEach((f, i) => window.setTimeout(() => tone(f, 0.3, 'triangle', 0.18), i * 140)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => window.setTimeout(() => tone(f, 0.35, 'triangle', 0.16), i * 160)); },
  };
}
