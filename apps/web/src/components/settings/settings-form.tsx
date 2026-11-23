"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { SegmentedControl } from "@/components/common/segmented-control";
import { DangerZone } from "./danger-zone";
import { DEFAULT_THEME, THEME_OPTIONS, normalizeTheme } from "@/lib/theme-preference";
import { settingsSchema, type SettingsValues } from "@/lib/settings-schema";
import {
  LABELING_PREFERENCES_DEFAULTS,
  loadLabelingPreferences,
  saveLabelingPreferences,
} from "@/lib/labeling-preferences";
import { THRESHOLD_OPTIONS } from "@/lib/project-schema";
import { useHealth } from "@/lib/queries";

const defaultValues: SettingsValues = {
  theme: DEFAULT_THEME,
  defaultThreshold: LABELING_PREFERENCES_DEFAULTS.defaultThreshold,
};

function ServiceRow({ name, url, ok, extra }: { name: string; url?: string; ok?: boolean; extra?: string | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="font-mono text-xs text-muted-foreground">{url ?? "—"}</p>
      </div>
      <div className="flex items-center gap-2">
        {extra && <span className="text-xs text-muted-foreground">{extra}</span>}
        <Badge variant={ok ? "secondary" : "destructive"}>{ok === undefined ? "unknown" : ok ? "reachable" : "down"}</Badge>
      </div>
    </div>
  );
}

/**
 * Theme and the default pre-label threshold are applied for real (the
 * threshold pre-selects the "New project" form). Release format is fixed to
 * COCO and shown read-only. Service URLs come from `/health`. Values save to
 * this browser only. See docs/features/settings.md.
 */
export function SettingsForm() {
  const [submitting, setSubmitting] = useState(false);
  const { setTheme, theme } = useTheme();
  const health = useHealth();
  const hydratedRef = useRef(false);
  const form = useForm<SettingsValues>({ resolver: zodResolver(settingsSchema), defaultValues });

  useEffect(() => {
    if (hydratedRef.current || theme === undefined) return;
    hydratedRef.current = true;
    form.reset({ ...loadLabelingPreferences(), theme: normalizeTheme(theme) });
  }, [form, theme]);

  const onSubmit = (values: SettingsValues) => {
    setSubmitting(true);
    setTheme(values.theme);
    const stored = saveLabelingPreferences({ defaultThreshold: values.defaultThreshold });
    setSubmitting(false);
    if (stored) toast.success("Preferences saved in this browser");
    else toast.warning("Theme applied; threshold not stored", { description: "This browser blocked local storage." });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Preferences</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            <FormField
              control={form.control}
              name="theme"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Theme</FormLabel>
                  <FormControl>
                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-6">
                      {THEME_OPTIONS.map((t) => (
                        <label key={t} className="flex cursor-pointer items-center gap-2 text-sm capitalize">
                          <RadioGroupItem value={t} />
                          {t}
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormDescription>Applied when you save. The header toggle changes it too.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultThreshold"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default pre-label confidence threshold</FormLabel>
                  <FormControl>
                    <SegmentedControl
                      ariaLabel="Default pre-label confidence threshold"
                      options={THRESHOLD_OPTIONS}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>Pre-selected when you create a project. 0.5 is a sound default.</FormDescription>
                </FormItem>
              )}
            />
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Default release format</p>
              <Badge variant="outline">COCO (annotations.coco.json + manifest.json)</Badge>
              <p className="text-xs text-muted-foreground">
                Every release is COCO; Label Studio&apos;s own JSON export is stored beside it for cross-checking.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Services</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            <ServiceRow
              name="Label Studio"
              url={health.data?.label_studio.url}
              ok={health.data?.label_studio.ok}
              extra={health.data?.label_studio.version}
            />
            <ServiceRow
              name="ML backend"
              url={health.data?.ml_backend.url}
              ok={health.data?.ml_backend.ok}
              extra={health.data?.ml_backend.device ? `device: ${health.data.ml_backend.device}` : null}
            />
            <p className="text-xs text-muted-foreground">
              Read-only. Set <code>LABEL_STUDIO_URL</code> and <code>ML_BACKEND_URL</code> in <code>.env</code>.
            </p>
          </CardContent>
        </Card>

        <DangerZone />

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => form.reset(defaultValues)}>
            Reset
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
