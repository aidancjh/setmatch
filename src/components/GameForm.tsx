import { useState } from "react";
import type { GameGender, GameType, NewGameInput, SkillLevel } from "../types";
import { todayISO } from "../lib/format";

const types: GameType[] = ["Indoor", "Beach", "Grass"];
const skills: SkillLevel[] = ["Beginner", "Intermediate", "Advanced", "All Levels"];
const genders: GameGender[] = ["Open", "Mixed", "Men", "Women"];
const netHeightOptions = [
  { value: "Men's (2.43m)", label: "Men's (2.43m)" },
  { value: "Women's (2.24m)", label: "Women's (2.24m)" },
  { value: "Recreational (2.35m)", label: "Recreational (2.35m)" },
  { value: "Venue Standard", label: "Venue standard" },
];
const positions = ["Setter", "Outside Hitter", "Middle Blocker", "Opposite", "Libero", "Defensive Specialist", "Any"];
const rotationTypes = ["Standard", "No Rotation", "King of the Court", "Round Robin"];
const regions = ["North", "South", "East", "West"];

export const blankGame: NewGameInput = {
  title: "",
  type: "Indoor",
  skill: "All Levels",
  gender: "Open",
  netHeight: "Venue Standard",
  positionsNeeded: [],
  rotationType: "Standard",
  courtFee: "",
  courtCost: 0,
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
const repeatOptions = [
  { label: "One-time", weeks: 1 },
  { label: "Weekly ×4", weeks: 4 },
  { label: "Weekly ×8", weeks: 8 },
];

export default function GameForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  allowRepeat = false,
}: {
  initial: NewGameInput;
  submitLabel: string;
  onSubmit: (input: NewGameInput, repeatWeeks: number) => Promise<void>;
  onCancel: () => void;
  allowRepeat?: boolean;
}) {
  const [form, setForm] = useState<NewGameInput>(initial);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [friendsMode, setFriendsMode] = useState(false);
  const [alreadyHave, setAlreadyHave] = useState(1); // including yourself
  const [needMore, setNeedMore] = useState(11);
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
      const totalSlots = friendsMode ? alreadyHave + needMore : form.totalSlots;
      const preFilled = friendsMode ? Math.max(0, alreadyHave - 1) : 0; // host occupies 1 slot
      await onSubmit(
        {
          ...form,
          title: form.title.trim(),
          location: form.location.trim(),
          area: form.area.trim() || form.location.trim(),
          notes: form.notes.trim(),
          totalSlots,
          preFilled,
        },
        repeatWeeks
      );
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
        {!friendsMode && (
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
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Who's this game for?</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {genders.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => set("gender", g)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  form.gender === g ? "bg-brand text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {g === "Open" ? "Open to all" : g === "Men" ? "Men's" : g === "Women" ? "Women's" : "Mixed"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Skill grades on Coterie are based on men's competition standards.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Net height</label>
          <select
            value={form.netHeight}
            onChange={(e) => set("netHeight", e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-400"
          >
            {netHeightOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Friends mode toggle */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-800">I'm bringing friends</p>
            <p className="text-xs text-slate-500">
              {friendsMode
                ? `Bringing ${alreadyHave} · Need ${needMore} more · Total ${alreadyHave + needMore}`
                : "Set exactly how many you have and how many you need"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFriendsMode((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
              friendsMode ? "bg-brand" : "bg-slate-200"
            }`}
          >
            <span
              className={`mt-0.5 ml-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                friendsMode ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </label>

        {friendsMode && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                You're bringing (inc. yourself)
              </span>
              <input
                type="number"
                min={1}
                max={49}
                value={alreadyHave}
                onChange={(e) => setAlreadyHave(Math.max(1, Number(e.target.value)))}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                Still need
              </span>
              <input
                type="number"
                min={1}
                max={49}
                value={needMore}
                onChange={(e) => setNeedMore(Math.max(1, Number(e.target.value)))}
                className={inputCls}
              />
            </label>
          </div>
        )}
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
        <Field label="Court fee (optional)">
          <input
            value={form.courtFee}
            onChange={(e) => set("courtFee", e.target.value)}
            placeholder="e.g. $5, free"
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Total court cost to split (optional)">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            $
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={form.courtCost ? String(form.courtCost) : ""}
            onChange={(e) => set("courtCost", Number(e.target.value) || 0)}
            placeholder="0"
            className={`${inputCls} pl-7`}
          />
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Coterie divides this by the number of confirmed players and tracks who's
          paid. Leave blank if there's no shared cost.
        </p>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start time">
          <input
            type="time"
            value={form.time}
            onChange={(e) => set("time", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="End time (optional)">
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => set("endTime", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Positions needed</label>
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
                    active ? "bg-brand text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">Leave blank if any position is welcome.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Rotation</label>
          <div className="flex flex-wrap gap-1.5">
            {rotationTypes.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => set("rotationType", r)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  form.rotationType === r ? "bg-brand text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
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

      <Field label="Region">
        <div className="flex flex-wrap gap-1.5">
          {regions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => set("region", form.region === r ? "" : r)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                form.region === r
                  ? "bg-brand text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Helps players filter games by part of the island.
        </p>
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

      {allowRepeat && (
        <Field label="Repeat">
          <div className="flex flex-wrap gap-1.5">
            {repeatOptions.map((o) => (
              <button
                key={o.weeks}
                type="button"
                onClick={() => setRepeatWeeks(o.weeks)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  repeatWeeks === o.weeks
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {repeatWeeks > 1 && (
            <p className="mt-1.5 text-xs text-slate-400">
              Creates {repeatWeeks} games, one a week starting on the date above.
            </p>
          )}
        </Field>
      )}

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
          className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
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
              ? "bg-brand text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
