/**
 * Payload relationship fields can be populated (an object) or unpopulated
 * (a bare ID). Both must be normalised to a comparable string ID.
 */
export function relationId(value: unknown): string {
  if (value !== null && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id);
  }
  return String(value);
}
