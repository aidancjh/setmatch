import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  submitFeedback,
  deleteAccount,
  getBlocked,
  unblockUser,
  type BlockedUser,
} from "../services/gamesService";
import { setToken } from "../lib/api";
import { feedbackEnabled, setFeedbackEnabled, playSound } from "../lib/feedback";
import { CheckIcon, IconChip } from "../components/icons";

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
    a: "No. When creating a game, toggle ‘I’m bringing friends’ and enter how many you’re already bringing and how many more you need. The game will show the correct number of open spots right away.",
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
    a: "Yes — on the sign-in screen, tap 'Forgot password?' and we'll email you a reset link.",
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
    <div className="border-b border-slate-800 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-3.5 text-left"
      >
        <span className="pr-3 text-sm font-medium text-slate-100">{q}</span>
        <span className="shrink-0 text-slate-400 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          ▾
        </span>
      </button>
      {open && (
        <p className="pb-3.5 text-sm leading-relaxed text-slate-400">{a}</p>
      )}
    </div>
  );
}

function BlockedUsers() {
  const [list, setList] = useState<BlockedUser[] | null>(null);

  useEffect(() => {
    getBlocked()
      .then(setList)
      .catch(() => setList([]));
  }, []);

  const unblock = async (id: string) => {
    setList((prev) => (prev ? prev.filter((u) => u.id !== id) : prev));
    try {
      await unblockUser(id);
    } catch {
      getBlocked().then(setList).catch(() => {});
    }
  };

  if (list === null)
    return <div className="px-4 py-3.5 text-sm text-slate-400">Loading…</div>;
  if (list.length === 0)
    return (
      <div className="px-4 py-3.5 text-sm text-slate-400">
        You haven't blocked anyone.
      </div>
    );
  return (
    <>
      {list.map((u) => (
        <div
          key={u.id}
          className="flex items-center justify-between border-b border-slate-50 px-4 py-3 last:border-0"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 text-xs font-bold text-brand">
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt={u.name} className="h-full w-full object-cover" />
              ) : (
                u.name.charAt(0).toUpperCase()
              )}
            </div>
            <span className="truncate text-sm text-slate-200">{u.name}</span>
          </div>
          <button
            onClick={() => unblock(u.id)}
            className="shrink-0 text-xs font-semibold text-brand hover:underline"
          >
            Unblock
          </button>
        </div>
      ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        {children}
      </div>
    </div>
  );
}

function ToggleRow({ label, sub, on, onToggle }: { label: string; sub?: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex w-full items-center justify-between px-4 py-3.5 text-left border-b border-slate-50 last:border-0">
      <div className="pr-3">
        <p className="text-sm font-medium text-slate-100">{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-brand" : "bg-slate-700"}`}
      >
        <span
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-slate-900 shadow transition-transform duration-200"
          style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}

function Row({ label, sub, onClick, danger }: { label: string; sub?: string; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-slate-800 border-b border-slate-50 last:border-0"
    >
      <div>
        <p className={`text-sm font-medium ${danger ? "text-rose-600" : "text-slate-100"}`}>{label}</p>
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
    <div className="flex flex-col items-center px-4 py-6 text-center">
      <IconChip size="lg" className="mb-2">
        <CheckIcon className="h-6 w-6" />
      </IconChip>
      <p className="font-semibold text-slate-100">Thanks! We got your {type === "bug" ? "report" : "feedback"}.</p>
      <button onClick={onDone} className="mt-3 text-sm text-brand font-medium">Done</button>
    </div>
  );

  return (
    <div className="px-4 py-4 space-y-3">
      <p className="text-sm font-semibold text-slate-100">{label}</p>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value.slice(0, 200))}
        placeholder="Subject (optional)"
        className="w-full rounded-xl border border-slate-700 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 2000))}
        placeholder="Describe in detail…"
        rows={4}
        className="w-full resize-none rounded-xl border border-slate-700 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm font-semibold text-slate-400">Cancel</button>
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
  const [soundOn, setSoundOn] = useState(feedbackEnabled());
  const [deleting, setDeleting] = useState(false);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setFeedbackEnabled(next);
    if (next) playSound("success"); // let them hear it turn on
  }
  const [deleteError, setDeleteError] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  function handleSignOut() {
    logout();
    navigate("/auth");
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteAccount(deletePassword);
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
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800"
          aria-label="Back to profile"
        >
          ←
        </button>
        <h1 className="text-xl font-bold tracking-tight text-white">Settings</h1>
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

      {/* Preferences */}
      <Section title="Preferences">
        <ToggleRow
          label="Sounds & haptics"
          sub="Play a sound and vibrate on wins like joining or posting"
          on={soundOn}
          onToggle={toggleSound}
        />
      </Section>

      {/* Blocked users */}
      <Section title="Blocked users">
        <BlockedUsers />
      </Section>

      {/* Account */}
      <Section title="Account">
        <Row
          label="Sign out"
          sub="Log out of your account on this device"
          onClick={handleSignOut}
        />
      </Section>

      {/* Danger zone */}
      <Section title="Danger zone">
        {panel === "delete" ? (
          <div className="px-4 py-4">
            <p className="text-sm font-semibold text-rose-700 mb-1">Delete your account?</p>
            <p className="text-sm text-slate-400 mb-4">
              This permanently deletes your profile, games, highlights, and reviews. There is no undo.
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Enter your password to confirm"
              autoComplete="current-password"
              className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
            />
            <p className="mb-3 text-xs text-slate-400">Signed in with Google? Leave this blank.</p>
            {deleteError && (
              <p className="mb-3 text-sm text-rose-600">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setPanel(null)}
                className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm font-semibold text-slate-400"
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
