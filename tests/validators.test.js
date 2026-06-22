import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  isCloudinaryUrl,
  validGameInput,
  addWeeksISO,
  PASSWORD_MIN,
} from "../server/index.js";

describe("isValidEmail", () => {
  it("accepts a normal address", () => expect(isValidEmail("player@example.com")).toBe(true));
  it("rejects a missing @", () => expect(isValidEmail("playerexample.com")).toBe(false));
  it("rejects empty and whitespace", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
  it("rejects internal spaces", () => expect(isValidEmail("a b@c.com")).toBe(false));
  it("rejects a missing TLD dot", () => expect(isValidEmail("a@b")).toBe(false));
  it("rejects over-long addresses (>254)", () =>
    expect(isValidEmail("x".repeat(250) + "@b.com")).toBe(false));
});

describe("isCloudinaryUrl", () => {
  it("accepts an https res.cloudinary.com URL", () =>
    expect(isCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/a.jpg")).toBe(true));
  it("rejects any other host", () =>
    expect(isCloudinaryUrl("https://evil.example.com/a.jpg")).toBe(false));
  it("rejects http (non-TLS)", () =>
    expect(isCloudinaryUrl("http://res.cloudinary.com/a.jpg")).toBe(false));
  it("rejects non-URL garbage", () => expect(isCloudinaryUrl("not a url")).toBe(false));
});

describe("validGameInput", () => {
  const base = {
    title: "Sunday pickup",
    type: "Indoor",
    skill: "Intermediate",
    date: "2026-06-20",
    time: "18:30",
    location: "Community Center",
    totalSlots: 8,
  };

  it("accepts a valid game (returns null)", () => expect(validGameInput(base)).toBe(null));
  it("rejects a non-object body", () => expect(validGameInput(null)).toMatch(/invalid/i));
  it("requires a title", () => expect(validGameInput({ ...base, title: "  " })).toMatch(/title/i));
  it("rejects an over-long title", () =>
    expect(validGameInput({ ...base, title: "x".repeat(101) })).toMatch(/title/i));
  it("rejects an unknown game type", () =>
    expect(validGameInput({ ...base, type: "Underwater" })).toMatch(/type/i));
  it("rejects an unknown skill", () =>
    expect(validGameInput({ ...base, skill: "Pro" })).toMatch(/skill/i));
  it("rejects a bad date format", () =>
    expect(validGameInput({ ...base, date: "06/20/2026" })).toMatch(/date/i));
  it("rejects a bad time format", () =>
    expect(validGameInput({ ...base, time: "6pm" })).toMatch(/time/i));
  it("rejects too few slots", () =>
    expect(validGameInput({ ...base, totalSlots: 1 })).toMatch(/slots/i));
  it("rejects too many slots", () =>
    expect(validGameInput({ ...base, totalSlots: 51 })).toMatch(/slots/i));
  it("rejects non-integer slots", () =>
    expect(validGameInput({ ...base, totalSlots: 4.5 })).toMatch(/slots/i));
});

describe("addWeeksISO", () => {
  it("adds one week", () => expect(addWeeksISO("2026-06-20", 1)).toBe("2026-06-27"));
  it("crosses a month boundary", () => expect(addWeeksISO("2026-06-29", 1)).toBe("2026-07-06"));
  it("week 0 is identity", () => expect(addWeeksISO("2026-06-20", 0)).toBe("2026-06-20"));
  it("crosses a year boundary", () => expect(addWeeksISO("2026-12-29", 1)).toBe("2027-01-05"));
});

describe("PASSWORD_MIN", () => {
  it("is the launch minimum of 10", () => expect(PASSWORD_MIN).toBe(10));
});
