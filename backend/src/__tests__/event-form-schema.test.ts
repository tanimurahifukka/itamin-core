import { describe, expect, it } from 'vitest';
import {
  coerceEventFormSchema,
  parseEventFormSchema,
  toEventFormSchemaPersistenceError,
} from '../services/reservation/event_form_schema';

describe('parseEventFormSchema', () => {
  it('validates and normalizes a select field', () => {
    const result = parseEventFormSchema([
      {
        key: 'favorite_course',
        label: '  コース  ',
        type: 'select',
        required: true,
        options: [' A ', 'B', '', 1],
      },
    ]);

    expect(result.error).toBeUndefined();
    expect(result.schema).toEqual([
      {
        key: 'favorite_course',
        label: 'コース',
        type: 'select',
        required: true,
        options: ['A', 'B'],
      },
    ]);
  });

  it('rejects fields with an empty label', () => {
    const result = parseEventFormSchema([
      { key: 'name', label: '   ', type: 'text', required: true },
    ]);

    expect(result.error).toContain('ラベル');
  });

  it('rejects select fields without options', () => {
    const result = parseEventFormSchema([
      { key: 'course', label: 'コース', type: 'select', required: false, options: [] },
    ]);

    expect(result.error).toContain('選択肢');
  });
});

describe('coerceEventFormSchema', () => {
  it('falls back to an empty array for invalid stored data', () => {
    expect(coerceEventFormSchema({ invalid: true })).toEqual([]);
  });
});

describe('toEventFormSchemaPersistenceError', () => {
  it('maps schema cache errors to an actionable message', () => {
    const message = toEventFormSchemaPersistenceError(
      new Error("Could not find the 'form_schema' column of 'reservation_events' in the schema cache"),
    );

    expect(message).toContain('Supabase migration');
  });
});
