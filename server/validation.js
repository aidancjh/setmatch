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

// --- Games -----------------------------------------------------------------

export const SKILLS = ["Beginner", "Intermediate", "Advanced", "All Levels"];
export const TYPES = ["Indoor", "Beach", "Grass"];
export const GENDERS = ["Men", "Women", "Mixed", "Open"];
export const NET_HEIGHTS = ["Men's (2.43m)", "Women's (2.24m)", "Recreational (2.35m)", "Venue Standard"];
export const POSITIONS = ["Setter", "Outside Hitter", "Middle Blocker", "Opposite", "Libero", "Defensive Specialist", "Any"];
export const ROTATION_TYPES = ["Standard", "No Rotation", "King of the Court", "Round Robin"];
export const REGIONS = ["North", "South", "East", "West"];

// Matches validGameInput's original behavior: an optional field is only checked
// against the allowed list when truthy (undefined/null/"" pass through), since
// the frontend sends "" for "no preference" on several of these selects.
const optionalEnum = (list, message) =>
  z.any().refine((v) => !v || list.includes(v), message);

export const gameInputSchema = z.object({
  title: z
    .string({ message: "Title is required." })
    .trim()
    .min(1, "Title is required.")
    .max(100, "Title must be 100 characters or fewer."),
  type: z.enum(TYPES, { message: "Invalid game type." }),
  skill: z.enum(SKILLS, { message: "Invalid skill level." }),
  gender: optionalEnum(GENDERS, "Invalid gender option.").optional(),
  netHeight: optionalEnum(NET_HEIGHTS, "Invalid net height option.").optional(),
  rotationType: optionalEnum(ROTATION_TYPES, "Invalid rotation type.").optional(),
  date: z
    .string({ message: "Date is required." })
    .min(1, "Date is required.")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)."),
  time: z
    .string({ message: "Time is required." })
    .min(1, "Time is required.")
    .regex(/^\d{2}:\d{2}$/, "Invalid time format (expected HH:MM)."),
  endTime: z
    .any()
    .refine((v) => !v || /^\d{2}:\d{2}$/.test(v), "Invalid end time format.")
    .optional(),
  location: z
    .string({ message: "Location is required." })
    .trim()
    .min(1, "Location is required.")
    .max(150, "Location must be 150 characters or fewer."),
  notes: z
    .any()
    .refine((v) => !v || String(v).length <= 2000, "Notes must be 2000 characters or fewer.")
    .optional(),
  totalSlots: z
    .any()
    .refine((v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 2 && n <= 50;
    }, "Total slots must be between 2 and 50."),
});

// --- Profile -----------------------------------------------------------------

/** Only allow uploads from Cloudinary (where our upload widget sends files). */
export function isCloudinaryUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "res.cloudinary.com") return false;
    // When the account's cloud name is configured, require the asset path to
    // belong to it. A bare hostname check accepts ANY Cloudinary account's URL,
    // so a user could store links to media we can't moderate or delete. The
    // env var is optional so this stays backward-compatible if it's unset.
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    if (cloud && !u.pathname.startsWith(`/${cloud}/`)) return false;
    return true;
  } catch {
    return false;
  }
}

const USER_GENDERS = ["Man", "Woman", "Non-binary", "Prefer not to say", ""];

// All fields optional (PATCH semantics): only validate a field when it's
// actually present in the body, matching the original handler's != null /
// undefined checks field-by-field.
export const profileUpdateSchema = z.object({
  name: z
    .any()
    .refine((v) => v == null || String(v).trim().length <= 50, "Name must be 50 characters or fewer.")
    .optional(),
  skill: z
    .any()
    .refine((v) => !v || SKILLS.includes(v), "Invalid skill level.")
    .optional(),
  homeArea: z
    .any()
    .refine((v) => v == null || String(v).length <= 100, "Home area must be 100 characters or fewer.")
    .optional(),
  bio: z.any().optional(),
  avatarUrl: z
    .any()
    .refine((v) => v == null || v === "" || isCloudinaryUrl(String(v)), "Avatar must be uploaded via Cloudinary.")
    .optional(),
  bannerImage: z
    .any()
    .refine(
      (v) => v == null || v === "" || isCloudinaryUrl(String(v)),
      "Banner image must be uploaded via Cloudinary."
    )
    .optional(),
  birthdate: z
    .any()
    .refine(
      (v) => v == null || v === "" || /^\d{4}-\d{2}-\d{2}$/.test(String(v)),
      "Invalid birthdate format (expected YYYY-MM-DD)."
    )
    .optional(),
  userGender: z
    .any()
    .refine((v) => v === undefined || USER_GENDERS.includes(String(v)), "Invalid gender option.")
    .optional(),
  showAge: z.any().optional(),
  showGender: z.any().optional(),
  favoritePositions: z.any().optional(),
  bannerColor: z
    .any()
    .refine(
      (v) => v === undefined || !v || /^#[0-9A-Fa-f]{3,8}$/.test(String(v)),
      "Invalid banner color — use a hex value like #FF6B6B."
    )
    .optional(),
});
