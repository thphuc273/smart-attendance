import { BadRequestException } from '@nestjs/common';

/**
 * Parse a YYYY-MM-DD string into a UTC-midnight Date object.
 * Uses Date.UTC to avoid timezone drift and validates year range (2000-2100)
 * to prevent Postgres DATE overflow from mangled input (e.g. extended-year
 * ISO strings like "+042026-02-28" that slip past naive `new Date(str)`).
 */
export function parseDateOnly(str: string, field: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!match) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`);
  }
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (year < 2000 || year > 2100) {
    throw new BadRequestException(`${field} year out of range (2000-2100)`);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${field} is not a valid calendar date`);
  }
  return date;
}
