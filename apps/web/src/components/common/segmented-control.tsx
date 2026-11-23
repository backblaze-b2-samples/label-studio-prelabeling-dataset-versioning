"use client";

import { cn } from "@/lib/utils";

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * A small radiogroup rendered as joined buttons — the selector for a short,
 * finite option set (e.g. the 0.3 / 0.5 / 0.7 confidence threshold).
 * Arrow keys move the selection, as a native radio group would.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
}: SegmentedControlProps<T>) {
  const move = (delta: number) => {
    const index = options.indexOf(value);
    onChange(options[(index + delta + options.length) % options.length]);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-border bg-muted/40 p-0.5"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              "min-w-12 rounded px-3 py-1 text-sm font-medium tabular-nums transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
