import { describe, expect, it } from "vitest";

import { formatPreviewText, isTextPreviewable } from "@/lib/text-preview";

describe("isTextPreviewable", () => {
  it("accepts JSON and text types", () => {
    expect(isTextPreviewable("application/json")).toBe(true);
    expect(isTextPreviewable("application/json; charset=utf-8")).toBe(true);
    expect(isTextPreviewable("text/plain")).toBe(true);
    expect(isTextPreviewable("application/ld+json")).toBe(true);
  });

  it("rejects binary types", () => {
    expect(isTextPreviewable("image/jpeg")).toBe(false);
    expect(isTextPreviewable("application/octet-stream")).toBe(false);
  });
});

describe("formatPreviewText", () => {
  it("pretty-prints JSON", () => {
    expect(formatPreviewText('{"a":[1,2]}', "application/json")).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
  });

  it("leaves broken JSON and plain text as they are", () => {
    expect(formatPreviewText("{oops", "application/json")).toBe("{oops");
    expect(formatPreviewText("a\nb", "text/plain")).toBe("a\nb");
  });
});
