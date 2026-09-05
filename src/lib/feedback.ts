const SOUND_KEY = 'tutop.feedback.sound.v1';

export function isSoundEnabled() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

export function setSoundEnabled(enabled: boolean) {
  try { localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off'); } catch { /* noop */ }
}

function vibrate(pattern: number | number[]) {
  try { if ('vibrate' in navigator) navigator.vibrate(pattern); } catch { /* noop */ }
}

function tone(frequency: number, duration = 0.07, gain = 0.028, delay = 0) {
  if (!isSoundEnabled()) return;
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    const start = ctx.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(volume);
    volume.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.015);
    oscillator.addEventListener('ended', () => void ctx.close());
  } catch { /* Audio feedback must never block the action. */ }
}

export function feedbackTap() { vibrate(8); }
export function feedbackFavorite() { vibrate(12); tone(520, 0.055, 0.018); }
export function feedbackMessage() { vibrate(10); tone(610, 0.045, 0.014); }
export function feedbackSuccess() {
  vibrate([12, 35, 18]);
  tone(520, 0.07, 0.025);
  tone(760, 0.09, 0.022, 0.065);
}
export function feedbackError() { vibrate([25, 45, 25]); tone(180, 0.1, 0.02); }
