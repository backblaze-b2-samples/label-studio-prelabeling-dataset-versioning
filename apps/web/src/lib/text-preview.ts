/**
 * In-app preview of small JSON / text objects (release manifests, COCO,
 * pre-label records) in the Files preview dialog.
 *
 * Pure on purpose so the type check, the size cap and the formatting are
 * unit-testable; the dialog fetches the body through `usePreviewText`.
 */

/** Bigger objects are offered as a download instead of being pulled into the page. */
export const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;

const TEXT_TYPES = new Set(["application/json", "application/xml", "application/x-ndjson", "application/yaml"]);

export function isTextPreviewable(contentType: string): boolean {
  const type = contentType.split(";")[0].trim().toLowerCase();
  return type.startsWith("text/") || TEXT_TYPES.has(type) || type.endsWith("+json");
}

/** Pretty-print JSON (2-space indent); anything else, or JSON that fails to parse, verbatim. */
export function formatPreviewText(body: string, contentType: string): string {
  if (!/json/i.test(contentType)) return body;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
