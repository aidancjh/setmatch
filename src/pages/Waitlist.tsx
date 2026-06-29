import { useState } from "react";

export default function Waitlist() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot — humans leave this blank
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, company }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Something went wrong. Please try again.");
        setStatus("error");
      } else {
        setMessage(data.message);
        setStatus("success");
      }
    } catch {
      setMessage("Something went wrong. Please check your connection and try again.");
      setStatus("error");
    }
  }

  return (
    <div
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
      className="min-h-screen bg-white flex flex-col"
    >
      <style>{`
        .wl-input:focus { border-color: #f4634e !important; box-shadow: 0 0 0 3px rgba(244,99,78,0.12); }
        .wl-btn:hover:not(:disabled) { background: #e8543f !important; }
      `}</style>
      {/* Nav */}
      <header className="px-6 py-4 flex items-center justify-center max-w-2xl mx-auto w-full">
        <span style={{ color: "#f4634e", fontWeight: 800, fontSize: 18, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Coterie
        </span>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        {/* Badge */}
        <div
          style={{ background: "#fde2dc", color: "#c0392b", fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 12px", borderRadius: 999, marginBottom: 24 }}
        >
          Coming to Singapore
        </div>

        {/* Headline */}
        <h1
          style={{ fontSize: "clamp(28px, 6vw, 48px)", fontWeight: 800, color: "#111", lineHeight: 1.15, marginBottom: 16, maxWidth: 560 }}
        >
          Fill your volleyball game.{" "}
          <span style={{ color: "#f4634e" }}>Every time.</span>
        </h1>

        {/* Sub-headline */}
        <p
          style={{ fontSize: 17, color: "#555", lineHeight: 1.6, maxWidth: 440, marginBottom: 40 }}
        >
          Coterie lets you post a game, set your skill level, and find the right players — no more chasing people over Telegram.
        </p>

        {/* Form */}
        {status === "success" ? (
          <div
            style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "20px 28px", maxWidth: 420, width: "100%" }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
            <p style={{ fontWeight: 700, color: "#166534", fontSize: 16, marginBottom: 4 }}>You're on the list!</p>
            <p style={{ color: "#15803d", fontSize: 14 }}>{message}</p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 12 }}
          >
            {/* Honeypot: off-screen, not display:none (some bots skip those),
                hidden from tab order + screen readers. Real users never fill it;
                bots that auto-fill every field do, and get silently rejected. */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
            />
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="wl-input"
              style={{
                padding: "13px 16px",
                borderRadius: 10,
                border: "1.5px solid #e5e5e5",
                fontSize: 15,
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <input
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={200}
              className="wl-input"
              style={{
                padding: "13px 16px",
                borderRadius: 10,
                border: `1.5px solid ${status === "error" ? "#f87171" : "#e5e5e5"}`,
                fontSize: 15,
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            {status === "error" && (
              <p style={{ color: "#dc2626", fontSize: 13, margin: 0, textAlign: "left" }}>{message}</p>
            )}
            <button
              type="submit"
              disabled={status === "loading"}
              className="wl-btn"
              style={{
                background: status === "loading" ? "#f9a99a" : "#f4634e",
                color: "#fff",
                fontWeight: 700,
                fontSize: 16,
                padding: "14px 24px",
                borderRadius: 10,
                border: "none",
                cursor: status === "loading" ? "not-allowed" : "pointer",
                width: "100%",
                transition: "background 0.15s",
              }}
            >
              {status === "loading" ? "Joining…" : "Join the waitlist"}
            </button>
            <p style={{ fontSize: 12, color: "#999", margin: 0 }}>
              Free. No spam. Unsubscribe anytime.
            </p>
          </form>
        )}
      </main>

      {/* Feature strip */}
      <section
        style={{ background: "#fafafa", borderTop: "1px solid #f0f0f0", padding: "32px 24px" }}
      >
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center", maxWidth: 640, margin: "0 auto" }}
        >
          {[
            { icon: "📍", title: "Find games near you", desc: "Browse open games by area and skill level in Singapore." },
            { icon: "✅", title: "Fill every slot", desc: "Post your game and let players request to join." },
            { icon: "🏐", title: "Right skill level", desc: "Filter by Beginner, Intermediate, or Advanced so every game flows." },
          ].map((f) => (
            <div
              key={f.title}
              style={{ textAlign: "center", maxWidth: 180, flexShrink: 0 }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111", marginBottom: 4 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: "#777", lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{ padding: "20px 24px", textAlign: "center", fontSize: 12, color: "#aaa" }}
      >
        © {new Date().getFullYear()} Coterie ·{" "}
        <a href="/privacy" style={{ color: "#aaa", textDecoration: "underline" }}>Privacy</a>
      </footer>
    </div>
  );
}
