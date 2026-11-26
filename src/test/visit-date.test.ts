import { describe, it, expect } from "vitest";
import { visitDate } from "@/lib/bookings.functions";

// Thursday 26 Nov 2026, 09:00 UTC (11:00 in South Africa)
const now = new Date("2026-11-26T09:00:00Z");
describe("reminder dates", () => {
  it("Today is the same day", () => expect(visitDate("Today", now)).toBe("2026-11-26"));
  it("Tomorrow is the next day", () => expect(visitDate("Tomorrow", now)).toBe("2026-11-27"));
  it("Saturday is the coming Saturday", () => expect(visitDate("Saturday", now)).toBe("2026-11-28"));
});
