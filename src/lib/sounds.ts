import { shouldPlay, soundsEnabled, type SoundKind } from "./sound-triggers";

export const SOUND_STORAGE_KEY = "oc.sounds";

type AudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

let context: AudioContext | null = null;
const lastPlayed: Partial<Record<SoundKind, number>> = {};

export function getSoundsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return soundsEnabled(window.localStorage.getItem(SOUND_STORAGE_KEY));
  } catch {
    return true;
  }
}

export function setSoundsEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // storage unavailable
  }
}

/** Browsers only allow audio after a user gesture; call from gesture handlers. */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  try {
    if (!context) {
      const w = window as AudioWindow;
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return;
      context = new Ctor();
    }
    if (context.state === "suspended") void context.resume().catch(() => undefined);
  } catch {
    // audio unavailable
  }
}

const PATTERNS: Record<SoundKind, { freqs: number[]; length: number; gap: number }> = {
  done: { freqs: [660, 880], length: 0.12, gap: 0.03 },
  attention: { freqs: [880, 880, 880], length: 0.09, gap: 0.07 },
};

export function playSound(kind: SoundKind, options?: { force?: boolean }): void {
  if (typeof window === "undefined") return;
  try {
    const force = options?.force === true;
    if (!force && !getSoundsEnabled()) return;
    const ctx = context;
    if (!ctx) return;
    const now = Date.now();
    if (!force && !shouldPlay(lastPlayed, kind, now)) return;
    lastPlayed[kind] = now;

    const pattern = PATTERNS[kind];
    let start = ctx.currentTime + 0.01;
    for (const freq of pattern.freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + pattern.length);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + pattern.length + 0.02);
      start += pattern.length + pattern.gap;
    }
  } catch {
    // sounds must never throw
  }
}
