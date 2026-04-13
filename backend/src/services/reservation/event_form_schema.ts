export type EventFormFieldType = 'text' | 'number' | 'select' | 'textarea' | 'checkbox';

export interface EventFormField {
  key: string;
  label: string;
  type: EventFormFieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

const EVENT_FORM_FIELD_TYPES = new Set<EventFormFieldType>([
  'text',
  'number',
  'select',
  'textarea',
  'checkbox',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseEventFormSchema(value: unknown): { schema: EventFormField[]; error?: string } {
  if (value === undefined) {
    return { schema: [] };
  }
  if (!Array.isArray(value)) {
    return { schema: [], error: 'form_schema は配列で指定してください' };
  }

  const schema: EventFormField[] = [];

  for (const [index, rawField] of value.entries()) {
    if (!isRecord(rawField)) {
      return { schema: [], error: `予約フォームの ${index + 1} 行目が不正です` };
    }

    const key = typeof rawField.key === 'string' ? rawField.key.trim() : '';
    const label = typeof rawField.label === 'string' ? rawField.label.trim() : '';
    const type = typeof rawField.type === 'string' ? rawField.type : '';

    if (!key) {
      return { schema: [], error: `予約フォームの ${index + 1} 行目に key がありません` };
    }
    if (!label) {
      return { schema: [], error: `予約フォームの ${index + 1} 行目のラベルを入力してください` };
    }
    if (!EVENT_FORM_FIELD_TYPES.has(type as EventFormFieldType)) {
      return { schema: [], error: `予約フォームの ${index + 1} 行目の type が不正です` };
    }

    const normalizedField: EventFormField = {
      key,
      label,
      type: type as EventFormFieldType,
      required: Boolean(rawField.required),
    };

    if (typeof rawField.placeholder === 'string' && rawField.placeholder.trim()) {
      normalizedField.placeholder = rawField.placeholder.trim();
    }

    if (normalizedField.type === 'select') {
      const options = Array.isArray(rawField.options)
        ? rawField.options
          .filter((option): option is string => typeof option === 'string')
          .map((option) => option.trim())
          .filter(Boolean)
        : [];
      if (options.length === 0) {
        return { schema: [], error: `予約フォームの ${index + 1} 行目の選択肢を 1 つ以上入力してください` };
      }
      normalizedField.options = options;
    }

    schema.push(normalizedField);
  }

  return { schema };
}

export function coerceEventFormSchema(value: unknown): EventFormField[] {
  const parsed = parseEventFormSchema(value);
  return parsed.error ? [] : parsed.schema;
}

export function toEventFormSchemaPersistenceError(error: unknown): string | null {
  const message = error instanceof Error
    ? error.message
    : isRecord(error) && typeof error.message === 'string'
      ? error.message
      : null;

  if (!message) {
    return null;
  }

  const mentionsSchemaColumn = message.includes('form_schema');
  const isSchemaCacheProblem = message.includes('schema cache')
    || message.includes("Could not find the 'form_schema' column")
    || message.includes('column "form_schema"');

  if (mentionsSchemaColumn && isSchemaCacheProblem) {
    return '予約フォーム機能の DB 反映が未完了です。Supabase migration を適用後に再度お試しください。';
  }

  return null;
}
