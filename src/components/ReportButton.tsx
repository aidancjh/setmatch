import { useState } from "react";
import { api } from "../lib/api";
import type { ReportTargetType } from "../types";
import { CheckIcon, IconChip } from "./icons";

const REASONS = ["Spam", "Inappropriate", "Harassment", "Misleading", "Other"];

/**
 * A small "Report" control users tap to flag content. Opens a sheet of reasons,
 * posts to /api/reports, and shows a brief thank-you. Reusable for any target.
 */
export default function ReportButton({
  targetType,
  targetId,
  className = "",
  label = "Report",
}: {
  targetType: ReportTargetType;
  targetId: string;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(reason: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/reports", { targetType, targetId, reason });
      setDone(true);
      setTimeout(() => setOpen(false), 1100);
    } catch {
      // Even on error, don't trap the user — close quietly.
      setDone(true);
      setTimeout(() => setOpen(false), 1100);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDone(false);
          setOpen(true);
        }}
        className={className || "text-xs font-medium text-slate-400 transition hover:text-rose-500"}
        aria-label="Report"
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="animate-sheet-up w-full max-w-md rounded-t-3xl bg-white px-4 pb-8 pt-3">
            <div className="mb-3 flex justify-center">
              <div className="h-1 w-10 rounded-full bg-slate-200" />
            </div>
            {done ? (
              <div className="flex flex-col items-center py-8 text-center">
                <IconChip size="lg" className="mb-2">
                  <CheckIcon className="h-6 w-6" />
                </IconChip>
                <p className="font-semibold text-slate-800">Thanks for the report</p>
                <p className="text-sm text-slate-500">Our team will take a look.</p>
              </div>
            ) : (
              <>
                <p className="mb-1 text-base font-bold text-slate-900">Report this content</p>
                <p className="mb-3 text-sm text-slate-500">Why are you reporting it?</p>
                <div className="space-y-2">
                  {REASONS.map((r) => (
                    <button
                      key={r}
                      disabled={busy}
                      onClick={() => submit(r)}
                      className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-800 transition hover:border-rose-200 hover:bg-rose-50 active:scale-[0.98] disabled:opacity-50"
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-3 w-full rounded-xl py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
