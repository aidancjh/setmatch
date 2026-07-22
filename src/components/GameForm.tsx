import { useRef, useState } from "react";
import type { GameGender, GameType, NewGameInput, SkillLevel } from "../types";
import { todayISO } from "../lib/format";
import ErrorModal from "./ErrorModal";

const types: GameType[] = ["Indoor", "Beach", "Grass"];
const skills: SkillLevel[] = ["All Levels", "Low Beginner", "High Beginner", "Low Intermediate", "High Intermediate", "Advanced"];
const genders: GameGender[] = ["Open", "Men", "Women"];
const netHeightOptions = [
  { value: "Men's (2.43m)", label: "Men's (2.43m)" },
  { value: "Women's (2.24m)", label: "Women's (2.24m)" },
  { value: "Mixed (2.35m)", label: "Mixed (2.35m)" },
  { value: "Venue Standard", label: "Venue standard" },
];
const positions = ["Any", "Setter", "Outside Hitter", "Middle Blocker", "Opposite", "Libero"];

// Names of the fields the form can mark invalid, and how to say them in a
// sentence — used to build one message out of however many fields are wrong.
const FIELD_LABEL: Record<string, string> = {
  title: "title",
  date: "date",
  location: "location",
  players: "player counts",
};

function missingFieldsMessage(fields: string[]): string {
  const labels = fields.map((f) => FIELD_LABEL[f] ?? f);
  const list =
    labels.length === 1
      ? labels[0]
      : labels.length === 2
      ? `${labels[0]} and ${labels[1]}`
      : `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
  return `Please fill in the highlighted field${labels.length > 1 ? "s" : ""} below — ${list} ${
    labels.length > 1 ? "are" : "is"
  } required.`;
}

export const blankGame: NewGameInput = {
  title: "",
  type: "Indoor",
  skill: "All Levels",
  gender: "Open",
  netHeight: "Venue Standard",
  positionsNeeded: ["Any"],
  rotationType: "Standard",
  costPerPerson: 0,
  region: "",
  date: "",
  time: "18:00",
  endTime: "",
  location: "",
  area: "",
  totalSlots: 12,
  preFilled: 0,
  notes: "",
};

/**
 * The create/edit game form. Shared by CreateGame and EditGame so the fields,
 * validation, and styling live in one place. The parent supplies the initial
 * values, the submit-button label, and what happens on submit.
 */
export default function GameForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: NewGameInput;
  submitLabel: string;
  onSubmit: (input: NewGameInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<NewGameInput>(initial);
  // The roster is expressed as two numbers the host thinks in:
  //   playersHave — people already locked in, INCLUDING the host (always ≥ 1)
  //   playersNeed — how many more open spots to fill
  // Total capacity = have + need. We derive these from the game's
  // totalSlots/preFilled so editing preserves them, and map back on submit
  // (totalSlots = have + need, preFilled = have − 1 since the host fills one
  // real slot themselves).
  const initialHave = Math.max(1, (initial.preFilled ?? 0) + 1);
  const [playersHave, setPlayersHave] = useState(initialHave);
  const [playersNeed, setPlayersNeed] = useState(
    Math.max(0, (initial.totalSlots ?? 2) - initialHave)
  );
  const totalPlayers = playersHave + playersNeed;
  const [error, setError] = useState("");
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const today = todayISO();
  const maxDate = new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10);

  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const playersRef = useRef<HTMLDivElement>(null);
  const fieldRefs: Record<string, React.RefObject<HTMLElement>> = {
    title: titleRef,
    date: dateRef,
    location: locationRef,
    players: playersRef,
  };

  // Scrolls to and focuses the first invalid field so the user doesn't have
  // to hunt for what's wrong — the field itself also gets a red border.
  function focusInvalid(fields: string[]) {
    setInvalidFields(new Set(fields));
    const target = fields.map((f) => fieldRefs[f]?.current).find(Boolean);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof (target as HTMLElement).focus === "function") {
        (target as HTMLElement).focus({ preventScroll: true });
      }
    }
  }

  const set = <K extends keyof NewGameInput>(key: K, value: NewGameInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (invalidFields.has(key as string)) {
      setInvalidFields((prev) => {
        const next = new Set(prev);
        next.delete(key as string);
        return next;
      });
    }
  };

  const clearPlayersInvalid = () => {
    if (invalidFields.has("players")) {
      setInvalidFields((prev) => {
        const next = new Set(prev);
        next.delete("players");
        return next;
      });
    }
  };
  const handlePlayersHave = (v: number) => { setPlayersHave(v); clearPlayersInvalid(); };
  const handlePlayersNeed = (v: number) => { setPlayersNeed(v); clearPlayersInvalid(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = [
      !form.title.trim() && "title",
      !form.date && "date",
      !form.location.trim() && "location",
    ].filter((f): f is string => !!f);
    if (missing.length > 0) {
      setError(missingFieldsMessage(missing));
      focusInvalid(missing);
      return;
    }
    if (form.date < today) {
      setError(
        "That date is in the past. Games are only listed until their date, so pick today or later."
      );
      focusInvalid(["date"]);
      return;
    }
    if (form.date > maxDate || Number.isNaN(Date.parse(form.date))) {
      setError("That date is too far ahead — games can be scheduled up to a year out.");
      focusInvalid(["date"]);
      return;
    }
    if (playersHave < 1) {
      setError("You count as one player, so 'players you have' must be at least 1.");
      focusInvalid(["players"]);
      return;
    }
    if (playersNeed < 1) {
      setError("Set at least 1 player needed — that's who others can join as.");
      focusInvalid(["players"]);
      return;
    }
    if (totalPlayers < 2 || totalPlayers > 50) {
      setError("Total players must be between 2 and 50.");
      focusInvalid(["players"]);
      return;
    }
    setError("");
    setInvalidFields(new Set());
    setBusy(true);
    try {
      const totalSlots = totalPlayers;
      const preFilled = Math.max(0, playersHave - 1); // host occupies 1 real slot
      await onSubmit({
        ...form,
        title: form.title.trim(),
        location: form.location.trim(),
        area: form.area.trim() || form.location.trim(),
        notes: form.notes.trim(),
        totalSlots,
        preFilled,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Game title">
        <input
          ref={titleRef}
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Friday Night Indoor 6s"
          className={fieldCls(invalidFields.has("title"))}
        />
      </Field>

      <Field label="Type">
        <Segmented
          options={types}
          value={form.type}
          onChange={(v) => set("type", v as GameType)}
        />
      </Field>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-800 p-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">Who's this game for?</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {genders.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => set("gender", g)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  form.gender === g ? "bg-brand text-white" : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700"
                }`}
              >
                {g === "Open" ? "Open to all" : g === "Men" ? "Men's" : "Women's"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Skill grades on Vybe are based on men's competition standards.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-200">Net height</label>
          <select
            value={form.netHeight}
            onChange={(e) => set("netHeight", e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm outline-none transition focus:border-slate-400"
          >
            {netHeightOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Players — how many you already have (incl. you) and how many you need.
          Total capacity is calculated from the two. Steppers work on mobile,
          where native number-input arrows don't appear. */}
      <div
        ref={playersRef}
        tabIndex={-1}
        className={`space-y-3 rounded-xl border bg-slate-800 p-3 outline-none ${
          invalidFields.has("players") ? "border-rose-500" : "border-slate-800"
        }`}
      >
        <div className="grid grid-cols-2 gap-3">
          <Stepper
            label="Players you have"
            hint="Including yourself"
            value={playersHave}
            min={1}
            max={49}
            onChange={handlePlayersHave}
          />
          <Stepper
            label="Players you need"
            hint="Open spots to fill"
            value={playersNeed}
            min={1}
            max={49}
            onChange={handlePlayersNeed}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl bg-slate-900 px-3.5 py-2.5">
          <span className="text-sm font-medium text-slate-300">Total players</span>
          <span
            className={`text-lg font-extrabold tabular-nums ${
              totalPlayers > 50 ? "text-rose-400" : "text-white"
            }`}
          >
            {totalPlayers}
          </span>
        </div>
        {totalPlayers > 50 && (
          <p className="text-[11px] font-medium text-rose-400">
            That's more than 50 players — lower one of the numbers.
          </p>
        )}
      </div>

      <Field label="Skill level">
        <Segmented
          options={skills}
          value={form.skill}
          onChange={(v) => set("skill", v as SkillLevel)}
        />
      </Field>

      <Field label="Date">
        <input
          ref={dateRef}
          type="date"
          min={today}
          max={maxDate}
          value={form.date}
          onChange={(e) => set("date", e.target.value)}
          className={fieldCls(invalidFields.has("date"))}
        />
      </Field>

      <Field label="Cost per person (optional)">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            $
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={form.costPerPerson ? String(form.costPerPerson) : ""}
            onChange={(e) => set("costPerPerson", Number(e.target.value) || 0)}
            placeholder="0"
            className={`${inputCls} pl-7`}
          />
        </div>
        <p className="mt-1 text-xs text-slate-400">
          What each player pays to join. Leave blank if the game is free.
        </p>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start time">
          <input
            type="time"
            value={form.time}
            onChange={(e) => set("time", e.target.value)}
            className={`${inputCls} min-w-0`}
          />
        </Field>
        <Field label="End time (optional)">
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => set("endTime", e.target.value)}
            className={`${inputCls} min-w-0`}
          />
        </Field>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-800 p-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-200">Positions needed</label>
          <div className="flex flex-wrap gap-1.5">
            {positions.map((p) => {
              const active = form.positionsNeeded.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    if (p === "Any") {
                      set("positionsNeeded", active ? [] : ["Any"]);
                    } else {
                      const without = form.positionsNeeded.filter((x) => x !== "Any" && x !== p);
                      set("positionsNeeded", active ? without : [...without, p]);
                    }
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    active ? "bg-brand text-white" : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">"Any" welcomes every position; pick specific ones if you need them.</p>
        </div>
      </div>

      <Field label="Venue / location">
        <input
          ref={locationRef}
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder="e.g. Westside Rec Center, Court 2"
          className={fieldCls(invalidFields.has("location"))}
        />
      </Field>

      <Field label="Notes (optional)">
        <textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          placeholder="Format, what to bring, parking…"
          className={`${inputCls} resize-none`}
        />
      </Field>

      {error && <ErrorModal message={error} onClose={() => setError("")} />}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm outline-none transition focus:border-slate-400";

// Same as inputCls, but with a red border when the field failed validation.
// Kept as a separate function (rather than string-concatenating both border
// classes together) since Tailwind's generated stylesheet order — not class
// order in the string — decides which "border-*" utility wins on a tie.
function fieldCls(invalid: boolean): string {
  return `w-full rounded-xl border ${
    invalid ? "border-rose-500" : "border-slate-700"
  } bg-slate-900 px-3 py-2.5 text-sm outline-none transition focus:border-slate-400`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-200">
        {label}
      </span>
      {children}
    </label>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
            value === o
              ? "bg-brand text-white"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * Number stepper with big −/+ touch targets. The native number-input spinner
 * only appears on desktop (and is tiny), so on mobile these buttons are the
 * way to change the value; the center field still accepts direct typing and
 * opens a numeric keypad (inputMode="numeric").
 */
function Stepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const btn =
    "flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-xl font-bold text-slate-100 transition hover:bg-slate-800 active:scale-90 disabled:opacity-40 disabled:active:scale-100";
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-200">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          className={btn}
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange(Number.isNaN(n) ? min : clamp(n));
          }}
          aria-label={label}
          className="no-spinner w-full min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-1 py-2.5 text-center text-base font-bold text-white outline-none transition focus:border-slate-400"
        />
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          className={btn}
        >
          +
        </button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
