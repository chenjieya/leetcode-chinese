import { describe, it, expect } from 'vitest';
import { mapStatusDisplay } from '../src/notes/NoteTemplate';

describe('mapStatusDisplay (NOTE-03, GAP-2a)', () => {
  it("maps IndexedProblem 'solved' → lc-status 'accepted'", () => {
    expect(mapStatusDisplay('solved')).toBe('已完成');
  });

  it("maps IndexedProblem 'attempted' → lc-status 'attempted'", () => {
    expect(mapStatusDisplay('attempted')).toBe('已尝试');
  });

  it("maps IndexedProblem 'untouched' → lc-status 'untouched'", () => {
    expect(mapStatusDisplay('untouched')).toBe('未开始');
  });

  it("maps undefined (no caller hint) → lc-status 'untouched' (safe default)", () => {
    expect(mapStatusDisplay(undefined)).toBe('未开始');
  });
});
