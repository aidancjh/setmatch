/**
 * Sound + haptic feedback for premium success moments.
 *
 * Sounds are synthesized with the Web Audio API (no asset files to ship or
 * download) and only ever fire inside a user gesture (a tap), which satisfies
 * browser autoplay rules. Haptics use navigator.vibrate where supported
 * (Android; iOS Safari ignores it harmlessly). Everything is gated behind a
 * user-controllable toggle, defaulting to on.
 */

const KEY = "vb.feedback";

export function feedbackEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setFeedbackEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** One soft, quickly-decaying note. */
function tone(
  ac: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  peak: number,
  type: OscillatorType
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + startOffset;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

export function playSound(kind: "join" | "success"): void {
  if (!feedbackEnabled()) return;
  const ac = audio();
  if (!ac) return;
  if (kind === "join") {
    // Bright ascending arpeggio — a small celebration.
    tone(ac, 659.25, 0, 0.18, 0.1, "triangle"); // E5
    tone(ac, 783.99, 0.09, 0.18, 0.1, "triangle"); // G5
    tone(ac, 1046.5, 0.18, 0.32, 0.12, "triangle"); // C6
  } else {
    // Gentle two-note confirmation.
    tone(ac, 587.33, 0, 0.14, 0.08, "sine"); // D5
    tone(ac, 880.0, 0.07, 0.22, 0.09, "sine"); // A5
  }
}

export function vibrate(kind: "join" | "success"): void {
  if (!feedbackEnabled()) return;
  try {
    if (!("vibrate" in navigator)) return;
    navigator.vibrate(kind === "join" ? [12, 28, 14] : 14);
  } catch {
    /* ignore */
  }
}
