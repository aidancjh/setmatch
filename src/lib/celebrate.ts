/**
 * Fire-and-forget celebration for important success moments.
 *
 *   celebrate("join")  -> confetti burst + bright sound + haptic
 *   celebrate("post")  -> checkmark pop + soft sound + haptic
 *
 * Sound and haptics run immediately (still inside the triggering tap, so
 * autoplay rules are satisfied). The visual is handled by <CelebrationHost>,
 * which is mounted once in the app shell and subscribes here — so the effect
 * survives navigation (e.g. posting a game then routing to its page).
 */
import { playSound, vibrate } from "./feedback";

export type CelebrationKind = "join" | "post";
type Listener = (kind: CelebrationKind) => void;

const listeners = new Set<Listener>();

export function onCelebrate(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function celebrate(kind: CelebrationKind): void {
  playSound(kind === "join" ? "join" : "success");
  vibrate(kind === "join" ? "join" : "success");
  listeners.forEach((fn) => fn(kind));
}
