import Modal from "./Modal";
import { AlertTriangleIcon } from "./icons";

/**
 * The app-wide way to surface an error: a centered popup instead of a small
 * inline red text block. Use this for every `error && ...` you'd otherwise
 * render as text — form validation failures, failed actions, network errors.
 * For field-validation failures, pair it with a red border on the offending
 * input(s) and scroll/focus the first one (see GameForm.tsx for the pattern).
 */
export default function ErrorModal({
  message,
  onClose,
  title = "Something's not right",
}: {
  message: string;
  onClose: () => void;
  title?: string;
}) {
  return (
    <Modal
      onClose={onClose}
      labelledBy="error-modal-title"
      describedBy="error-modal-message"
      panelClassName="w-full max-w-sm rounded-2xl border border-rose-500/20 bg-slate-900 p-5 text-center shadow-xl animate-pop-in"
    >
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400">
        <AlertTriangleIcon className="h-6 w-6" />
      </span>
      <p id="error-modal-title" className="mt-3 text-base font-bold text-white">
        {title}
      </p>
      <p id="error-modal-message" className="mt-1 text-sm leading-relaxed text-slate-300">
        {message}
      </p>
      <button
        onClick={onClose}
        className="mt-4 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark active:scale-[0.98]"
      >
        Got it
      </button>
    </Modal>
  );
}
