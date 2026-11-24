"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePreviewText } from "@/lib/queries";
import { formatPreviewText, TEXT_PREVIEW_MAX_BYTES } from "@/lib/text-preview";

/** Skeleton with a visible spinner: a slow bucket can take tens of seconds. */
export function PreviewLoading({ what = "preview" }: { what?: string }) {
  return (
    <div className="absolute inset-0 p-3" role="status" aria-live="polite" aria-busy="true">
      <Skeleton className="h-full w-full" />
      <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
        Loading {what} from B2…
      </p>
    </div>
  );
}

type MediaState = "loading" | "ready" | "error";

/**
 * Renders the preview media and owns its own load state.
 *
 * The presigned-URL fetch finishing is NOT the same thing as the media being
 * painted — a large image can take seconds more, and the dialog used to drop
 * its skeleton at that first milestone and show an empty white pane that reads
 * as "no preview available". The skeleton therefore stays up until the
 * `load` event, and an `error` swaps in a real error state with an
 * open-in-a-new-tab escape hatch.
 *
 * Mount this with `key={url}` so a new file/URL resets the state. It lives in
 * its own module to keep `file-preview.tsx` under the 300-line ceiling.
 */
export function PreviewMedia({
  url,
  filename,
  isImage,
}: {
  url: string;
  filename: string;
  isImage: boolean;
}) {
  const [state, setState] = useState<MediaState>("loading");
  const hiddenUntilReady = state === "ready" ? "" : "opacity-0";

  return (
    <div className="relative h-[min(55svh,400px)] min-h-[220px] w-full">
      {isImage ? (
        /* `unoptimized` because presigned URLs carry their own short-lived
           expiry and we don't want Next's image optimizer caching them past
           that window. */
        <Image
          src={url}
          alt={filename}
          fill
          sizes="(max-width: 768px) 100vw, 600px"
          className={`rounded object-contain ${hiddenUntilReady}`}
          unoptimized
          onLoad={() => setState("ready")}
          onError={() => setState("error")}
        />
      ) : (
        <iframe
          src={url}
          className={`h-full w-full rounded ${hiddenUntilReady}`}
          title={`Preview of ${filename}`}
          onLoad={() => setState("ready")}
          onError={() => setState("error")}
        />
      )}
      {state === "loading" && <PreviewLoading />}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-medium text-foreground">
            Preview couldn&apos;t be rendered
          </p>
          <p className="text-xs text-muted-foreground">
            The browser couldn&apos;t display this file inline.
          </p>
          <Button asChild size="sm" variant="outline">
            <a href={url} rel="noreferrer" target="_blank">
              Open in a new tab
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Pretty-printed body of a small JSON/text object (manifest.json, coco.json,
 * pre-label records). Objects over TEXT_PREVIEW_MAX_BYTES are not fetched.
 */
export function PreviewText({
  fileKey,
  url,
  contentType,
  sizeBytes,
}: {
  fileKey: string;
  url: string;
  contentType: string;
  sizeBytes: number;
}) {
  const tooLarge = sizeBytes > TEXT_PREVIEW_MAX_BYTES;
  const text = usePreviewText(fileKey, url, !tooLarge);

  return (
    <div className="relative h-[min(55svh,400px)] min-h-[220px] w-full">
      {tooLarge ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-medium text-foreground">Too large to preview here</p>
          <p className="text-xs text-muted-foreground">
            Text previews stop at {Math.round(TEXT_PREVIEW_MAX_BYTES / 1024)} KB. Download it, or open it in a new tab.
          </p>
          <Button asChild size="sm" variant="outline">
            <a href={url} rel="noreferrer" target="_blank">
              Open in a new tab
            </a>
          </Button>
        </div>
      ) : text.isLoading ? (
        <PreviewLoading what="file" />
      ) : text.error ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-medium text-foreground">Preview couldn&apos;t be loaded</p>
          <p className="break-words text-xs text-muted-foreground">{text.error.message}</p>
          <Button asChild size="sm" variant="outline">
            <a href={url} rel="noreferrer" target="_blank">
              Open in a new tab
            </a>
          </Button>
        </div>
      ) : (
        <pre
          aria-label={`Contents of ${fileKey}`}
          tabIndex={0}
          className="h-full w-full overflow-auto whitespace-pre p-3 text-left font-mono text-xs leading-relaxed text-foreground"
        >
          {formatPreviewText(text.data ?? "", contentType)}
        </pre>
      )}
    </div>
  );
}
