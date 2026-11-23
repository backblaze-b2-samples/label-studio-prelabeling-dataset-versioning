"use client";

import { AlertTriangle } from "lucide-react";
import { useHealth } from "@/lib/queries";

/**
 * Top-of-app warning when the API is up but a dependency is not: B2
 * misconfigured (`b2_connected: false`), or Label Studio / the ML backend not
 * running. Individual fetches may still succeed (bucket views work without
 * Label Studio), so per-component ErrorStates would not explain it.
 */
export function HealthBanner() {
  const { data } = useHealth();
  if (!data) return null;

  const problems: string[] = [];
  if (!data.b2_connected) problems.push("B2 is not connected — check your .env credentials and bucket region, then restart the API.");
  if (!data.label_studio.ok) problems.push(`Label Studio is not reachable at ${data.label_studio.url}.`);
  if (!data.ml_backend.ok) problems.push(`The ML backend is not reachable at ${data.ml_backend.url}.`);
  if (problems.length === 0) return null;
  const composeHint = !data.label_studio.ok || !data.ml_backend.ok;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-[color-mix(in_oklab,var(--attention)_30%,var(--border))] bg-[var(--attention-subtle)] px-4 py-2 text-xs text-[var(--attention)]"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="text-foreground/80">
        <span className="font-medium text-[var(--attention)]">Degraded. </span>
        {problems.join(" ")}
        {composeHint && (
          <>
            {" "}
            Start them with <code className="font-mono text-[11px]">docker compose up -d</code>.
          </>
        )}
      </span>
    </div>
  );
}
