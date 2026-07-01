// Declarative request-body validation with zod.
//
// One place to define and enforce input rules so new endpoints can't silently
// ship without validation (the drift risk when every route hand-rolls its own
// checks). Usage:
//
//   app.post("/api/x", validateBody(xSchema), h(async (req, res) => { ... }));
//
// The middleware runs before the handler: on failure it returns 400 with the
// first issue's message (matching the app's existing one-error-at-a-time style);
// on success it calls next() and leaves req.body untouched, so handlers keep
// their existing field allowlisting/transforms.
import { z } from "zod";

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const msg = result.error.issues[0]?.message || "Invalid request.";
      return res.status(400).json({ error: msg });
    }
    next();
  };
}

// Kept in sync with server/index.js (isValidEmail / PASSWORD_MIN).
const PASSWORD_MIN = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const email = z
  .string()
  .trim()
  .refine(
    (s) => s.length > 0 && s.length <= 254 && EMAIL_RE.test(s),
    "Please enter a valid email address."
  );

const password = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`)
  .max(128, "Password must be 128 characters or fewer.");

export const signupSchema = z.object({
  email,
  password,
  name: z.string().trim().min(1, "Name is required.").max(50, "Name must be 50 characters or fewer."),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required."),
  password,
});
