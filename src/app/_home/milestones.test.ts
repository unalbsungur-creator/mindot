import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOT_MILESTONES, milestoneProgress } from "./milestones";

describe("milestoneProgress", () => {
  it("has the stops 1.000 → 10.000 → 100.000 → 1.000.000", () => {
    assert.deepEqual([...DOT_MILESTONES], [1_000, 10_000, 100_000, 1_000_000]);
  });

  it("measures the bar against the next stop", () => {
    const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);
    assert.deepEqual(milestoneProgress(0), { count: 0, next: 1_000, percent: 0, reached: false });
    const today = milestoneProgress(44);
    assert.deepEqual([today.count, today.next, today.reached], [44, 1_000, false]);
    near(today.percent, 4.4);
    near(milestoneProgress(999).percent, 99.9);
  });

  it("moves on to the following stop exactly at a stop", () => {
    assert.equal(milestoneProgress(1_000).next, 10_000);
    assert.equal(milestoneProgress(1_000).percent, 10);
    assert.equal(milestoneProgress(10_000).next, 100_000);
    assert.equal(milestoneProgress(100_000).next, 1_000_000);
  });

  it("stays full on the final goal once it is reached, and never goes negative", () => {
    assert.deepEqual(milestoneProgress(1_000_000), { count: 1_000_000, next: 1_000_000, percent: 100, reached: true });
    assert.equal(milestoneProgress(2_500_000).percent, 100);
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) assert.deepEqual(milestoneProgress(bad), milestoneProgress(0), String(bad));
  });
});
