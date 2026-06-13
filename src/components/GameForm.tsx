import { useState } from "react";
import type { GameType, NewGameInput, SkillLevel } from "../types";
import { todayISO } from "../lib/format";

const types: GameType[] = ["Indoor", "Beach", "Grass"];
const skills: SkillLevel[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "All Levels",
];

export const blankGame: NewGameInput = {
  title: "",
  type: "Indoor",
  skill: "All Levels",
  date: "",
  time: "18:00",
  location: "",
  area: "",
  totalSlots: 12,
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const today = todayISO();

  const set = <K extends keyof NewGameInput>(key: K, value: NewGameInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.date || !form.location.trim()) {
      setError("Please fill in a title, date, and location.");
      return;
    }
    if (form.date < today) {
      setError(
        "That date is in the past. Games are only listed until their date, so pick today or later."
      );
      return;
    }
    if (form.totalSlots < 2 || form.totalSlots > 50) {
      setError("Total slots should be between 2 and 50.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSubmit({
        ...form,
        title: form.title.trim(),
        location: form.location.trim(),
        area: form.area.trim() || form.location.trim(),
        notes: form.notes.trim(),
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
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Friday Night Indoor 6s"
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Segmented
            options={types}
            value={form.type}
            onChange={(v) => set("type", v as GameType)}
          />
        </Field>
        <Field label="Total slots">
          <input
            type="number"
            min={2}
            max={50}
            value={form.totalSlots}
            onChange={(e) => set("totalSlots", Number(e.target.value))}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Skill level">
        <Segmented
          options={skills}
          value={form.skill}
          onChange={(v) => set("skill", v as SkillLevel)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input
            type="date"
            min={today}
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Time">
          <input
            type="time"
            value={form.time}
            onChange={(e) => set("time", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Venue / location">
        <input
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder="e.g. Westside Rec Center, Court 2"
          className={inputCls}
        />
      </Field>

      <Field label="Area / neighborhood (for search)">
        <input
          value={form.area}
          onChange={(e) => set("area", e.target.value)}
          placeholder="e.g. Santa Monica"
          className={inputCls}
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

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-400";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
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
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
