import { useEffect, useRef } from "react";

interface ModalProps {
  /** Called when the user dismisses (ESC or backdrop). Guard it yourself if a
   *  request is in flight (e.g. `onClose={() => { if (!busy) close(); }}`). */
  onClose: () => void;
  children: React.ReactNode;
  /** id of the element labelling the dialog (usually the heading) for a11y. */
  labelledBy?: string;
  /** id of the element describing the dialog, if any. */
  describedBy?: string;
  /** Vertical placement of the panel. */
  align?: "center" | "bottom";
  /** Classes for the panel container (controls its look — rounding, width, …). */
  panelClassName?: string;
  /** Extra classes for the backdrop (e.g. a darker overlay). */
  backdropClassName?: string;
  /** Set false to disable closing by clicking the backdrop. */
  closeOnBackdrop?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal shell: renders a backdrop + a `role="dialog"` panel with
 * `aria-modal`, traps Tab focus inside, closes on Escape, and restores focus to
 * whatever was focused before it opened. Children supply the panel's contents;
 * `panelClassName` controls its appearance so each modal keeps its own styling.
 */
export default function Modal({
  onClose,
  children,
  labelledBy,
  describedBy,
  align = "center",
  panelClassName = "",
  backdropClassName = "bg-black/60",
  closeOnBackdrop = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    // Move focus into the dialog (first focusable, else the panel itself).
    const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusables && focusables.length ? focusables[0] : panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    // Prevent the page behind from scrolling while the modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center p-4 ${
        align === "bottom" ? "items-end" : "items-center"
      } ${backdropClassName}`}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`outline-none ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
