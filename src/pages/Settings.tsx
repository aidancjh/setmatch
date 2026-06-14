import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { submitFeedback, deleteAccount } from "../services/gamesService";
import { setToken } from "../lib/api";

// ---------------------------------------------------------------------------
// FAQ data
// ---------------------------------------------------------------------------

const FAQ = [
  {
    q: "How do I join a game?",
    a: "Open any game from the Browse tab and tap Join. If the game is full you'll be placed on the waitlist and automatically promoted when a spot opens.",
  },
  {
    q: "I have 6 friends — do I need to fill in all 12 spots myself?",
    a: "No. When creating a game, toggle "I'm bringing friends" and enter how many you're already bringing and how many more you need. The game will show the correct number of open spots right away.",
  },
  {
    q: "What happens when I leave a game?",
    a: "Your spot is freed and the first person on the waitlist is automatically promoted and notified.",
  },
  {
    q: "Can I delete a game I posted?",
    a: "Yes. Open the game, scroll to the bottom, and tap Delete game. All members will receive a cancellation notification.",
  },
  {
    q: "How do game reviews work?",
    a: "30 minutes after a game ends, every player who joined (but didn't host) gets a prompt to leave a star rating and optional comment for the host.",
  },
  {
    q: "Can I reset my password?",
    a: "Password reset by email is coming soon. For now, if you're locked out please contact support below.",
  },
  {
    q: "How do I delete my account?",
    a: "Scroll to the Danger Zone section on this page and tap Delete account. This permanently removes all your data.",
  },
];

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-3.5 text-left"
      >
        <span className="pr-3 text-sm font-medium text-slate-800">{q}</span>
        <span className="shrink-0 text-slate-400 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          ▾
        </span>
      </button>
      {open && (
        <p className="pb-3.5 text-sm leading-relaxed text-slate-500">{a}</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        {children}
      </div>
    </div>
  );
}

function Row({ label, sub, onClick, danger }: { label: string; sub?: string; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-slate-50 border-b border-slate-50 last:border-0"
    >
      <div>
        <p className={`text-sm font-medium ${danger ? "text-rose-600" : "text-slate-800"}`}>{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
      {onClick && <span className="text-slate-300">›</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Feedback form
// ---------------------------------------------------------------------------

function FeedbackForm({ type, label, onDone }: { type: "feedback" | "bug"; label: string; onDone: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    if (!body.trim()) { setError("Please write a message."); return; }
    setBusy(true); setError("");
    try {
      await submitFeedback(type, subject, body);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return (
    <div className="px-4 py-6 text-center">
      <p className="text-2xl mb-1">✓</p>
      <p className="font-semibold text-slate-800">Thanks! We got your {type === "bug" ? "report" : "feedback"}.</p>
      <button onClick={onDone} className="mt-3 text-sm text-brand font-medium">Done</button>
    </div>
  );

  return (
    <div className="px-4 py-4 space-y-3">
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value.slice(0, 200))}
        placeholder="Subject (optional)"
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 2000))}
        placeholder="Describe in detail…"
        rows={4}
        className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-500">Cancel</button>
        <button onClick={handleSend} disabled={busy} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Settings() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<"feedback" | "bug" | "delete" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteAccount();
      setToken(null);
      logout();
      navigate("/auth");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Could not delete account.");
      setDeleting(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => navigate("/profile")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          aria-label="Back to profile"
        >
          ←
        </button>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Settings</h1>
      </div>

      {/* FAQ */}
      <Section title="Frequently asked questions">
        <div className="px-4">
          {FAQ.map((item) => (
            <FAQItem key={item.q} {...item} />
          ))}
        </div>
      </Section>

      {/* Help & Support */}
      <Section title="Help & Support">
        {panel === "feedback" ? (
          <FeedbackForm type="feedback" label="Send feedback" onDone={() => setPanel(null)} />
        ) : panel === "bug" ? (
          <FeedbackForm type="bug" label="Report a bug" onDone={() => setPanel(null)} />
        ) : (
          <>
            <Row
              label="Contact support"
              sub="support@coterie.app"
              onClick={() => window.open("mailto:support@coterie.app", "_self")}
            />
            <Row
              label="Send feedback"
              sub="Suggestions or ideas"
              onClick={() => setPanel("feedback")}
            />
            <Row
              label="Report a bug"
              sub="Something not working?"
              onClick={() => setPanel("bug")}
            />
          </>
        )}
      </Section>

      {/* Blocked features note */}
      <Section title="Coming soon">
        <Row label="Password reset by email" sub="Requires email provider setup" />
        <Row label="Sign in with Google" sub="OAuth setup required" />
      </Section>

      {/* Danger zone */}
      <Section title="Danger zone">
        {panel === "delete" ? (
          <div className="px-4 py-4">
            <p className="text-sm font-semibold text-rose-700 mb-1">Delete your account?</p>
            <p className="text-sm text-slate-500 mb-4">
              This permanently deletes your profile, games, highlights, and reviews. There is no undo.
            </p>
            {deleteError && (
              <p className="mb-3 text-sm text-rose-600">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setPanel(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-500"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex-1 rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        ) : (
          <Row
            label="Delete account"
            sub="Permanently remove all your data"
            onClick={() => setPanel("delete")}
            danger
          />
        )}
      </Section>
    </div>
  );
}
