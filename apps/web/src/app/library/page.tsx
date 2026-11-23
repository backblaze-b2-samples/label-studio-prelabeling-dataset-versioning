import { LibraryBrowser } from "@/components/library/library-browser";

export default function LibraryPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Dataset library</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
          Everything a project keeps under <code className="font-mono">labeling/</code>: raw images,
          pre-label runs, annotations and releases. Open any row in the bucket explorer to preview or
          download it.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <LibraryBrowser />
      </div>
    </div>
  );
}
