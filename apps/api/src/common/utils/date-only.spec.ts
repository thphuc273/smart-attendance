import { BadRequestException } from '@nestjs/common';
import { parseDateOnly } from './date-only';

describe('parseDateOnly', () => {
  it('parses valid YYYY-MM-DD into UTC midnight', () => {
    const d = parseDateOnly('2026-04-17', 'x');
    expect(d.toISOString()).toBe('2026-04-17T00:00:00.000Z');
  });

  it('rejects mangled extended-year like +042026-02-28', () => {
    expect(() => parseDateOnly('+042026-02-28', 'x')).toThrow(BadRequestException);
  });

  it('rejects year < 2000', () => {
    expect(() => parseDateOnly('1999-12-31', 'x')).toThrow(/out of range/);
  });

  it('rejects year > 2100', () => {
    expect(() => parseDateOnly('2101-01-01', 'x')).toThrow(/out of range/);
  });

  it('rejects invalid calendar date (Feb 30)', () => {
    expect(() => parseDateOnly('2026-02-30', 'x')).toThrow(/valid calendar date/);
  });

  it('rejects non-date-only strings', () => {
    expect(() => parseDateOnly('2026-04-17T00:00', 'x')).toThrow(/YYYY-MM-DD/);
    expect(() => parseDateOnly('04/17/2026', 'x')).toThrow(/YYYY-MM-DD/);
    expect(() => parseDateOnly('', 'x')).toThrow(/YYYY-MM-DD/);
  });

  it('includes field name in the error', () => {
    expect(() => parseDateOnly('bad', 'effective_from')).toThrow(/effective_from/);
  });

  it('accepts boundary dates', () => {
    expect(parseDateOnly('2000-01-01', 'x').toISOString()).toBe('2000-01-01T00:00:00.000Z');
    expect(parseDateOnly('2100-12-31', 'x').toISOString()).toBe('2100-12-31T00:00:00.000Z');
  });
});
