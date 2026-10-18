/** URL-safe slug: "Panjabi - Eid Collection" → "panjabi-eid-collection" */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
