import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, shiftToUpcoming } from './format';

describe('date helpers', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-29', 3)).toBe('2027-01-01');
    expect(addDays('2026-11-21', -109)).toBe('2026-08-04');
  });
  it('keeps upcoming trips where they are', () => {
    expect(shiftToUpcoming('2026-12-29', '2026-11-22')).toBe(0);
  });
  it('moves a past trip to the next year it comes round', () => {
    const d = shiftToUpcoming('2026-08-04', '2026-11-22');
    expect(addDays('2026-08-04', d)).toBe('2027-08-04');
    expect(daysBetween('2026-08-04', '2027-08-04')).toBe(d);
  });
});
