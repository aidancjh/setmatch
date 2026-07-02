// Wrap an async route so thrown errors become a 500 instead of crashing the
// process. Shared by server/index.js and server/adminRoutes.js.
export const h = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error("[api] error:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  });
