import { describe, it, expect } from "vitest";
import { relativeDay, isPast, todayISO } from "../src/lib/format";

describe("todayISO", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("relativeDay", () => {
  it("labels today as 'Today'", () => {
    expect(relativeDay(todayISO())).toBe("Today");
  });
  it("labels a long-past date with 'ago'", () => {
    expect(relativeDay("2000-01-01")).toMatch(/ago/);
  });
});

describe("isPast", () => {
  it("treats a long-past date as past", () => {
    expect(isPast("2000-01-01")).toBe(true);
  });
  it("treats a far-future date as not past", () => {
    expect(isPast("2999-01-01")).toBe(false);
  });
});
