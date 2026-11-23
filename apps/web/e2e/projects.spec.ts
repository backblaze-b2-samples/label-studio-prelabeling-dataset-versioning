import { expect, test, type Route } from "@playwright/test";

/**
 * Smoke test for the primary entity's create flow with the API mocked, so it
 * needs neither B2, Label Studio nor the ML backend. Every call the screen
 * makes is answered here; any unmocked API call fails the test loudly.
 */

const now = "2026-11-23T12:00:00Z";
const created = {
  slug: "street-scenes-batch-1",
  title: "Street scenes, batch 1",
  description: "",
  labels: ["person", "bicycle", "car", "bus"],
  threshold: 0.5,
  model_id: "PekingU/rtdetr_r18vd_coco_o365",
  label_studio_project_id: 1,
  label_studio_url: "http://localhost:8080/projects/1/data",
  source_prefix: "labeling/raw/street-scenes-batch-1/",
  target_prefix: "labeling/annotations/street-scenes-batch-1/",
  created_at: now,
  updated_at: now,
};

// The page and the API are different origins, so mocked answers need the CORS
// headers the real API sends, and the JSON POST's preflight needs answering.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });

test("create a labeling project from the dialog", async ({ page }) => {
  let createBody: Record<string, unknown> | null = null;
  const projects: (typeof created)[] = [];

  await page.route(/:8000\//, (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === "/health") {
      return json(route, {
        status: "healthy",
        b2_connected: true,
        label_studio: { ok: true, url: "http://localhost:8080", version: "1.23.2", device: null, detail: null },
        ml_backend: { ok: true, url: "http://localhost:9090", version: "m", device: "cpu", detail: null },
      });
    }
    if (url.pathname === "/models") {
      return json(route, {
        id: "PekingU/rtdetr_r18vd_coco_o365",
        name: "RT-DETR R18",
        license: "Apache-2.0",
        source_url: "https://huggingface.co/PekingU/rtdetr_r18vd_coco_o365",
        revision: "386c43855d01bcd966e548f3296fbd2cd2a2a40b",
        device: "cpu",
        labels: ["person", "bicycle", "car", "motorbike", "bus", "truck"],
      });
    }
    if (url.pathname === "/projects" && method === "POST") {
      createBody = route.request().postDataJSON();
      projects.push(created);
      return json(route, created, 201);
    }
    if (url.pathname === "/projects") return json(route, projects);
    if (url.pathname === `/projects/${created.slug}`) {
      return json(route, {
        project: created,
        counts: { raw_objects: 8, tasks: 0, annotated_tasks: 0, prelabel_runs: 0, releases: 0 },
        latest_run: null,
        latest_release: null,
      });
    }
    if (url.pathname.endsWith("/prelabel-runs") || url.pathname.endsWith("/releases")) return json(route, []);
    return route.fulfill({ status: 599, headers: CORS, body: `unmocked ${method} ${url.pathname}` });
  });

  await page.goto("/projects");
  await expect(page.getByText("No labeling projects yet")).toBeVisible();

  await page.getByRole("button", { name: "New project" }).click();
  await page.getByPlaceholder("Street scenes, batch 1").fill("Street scenes, batch 1");
  await expect(page.getByText("labeling/raw/street-scenes-batch-1/")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "person" })).toBeChecked();
  await page.getByRole("radio", { name: "0.7" }).click();
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/projects\/street-scenes-batch-1$/);
  await expect(page.getByRole("heading", { name: "Street scenes, batch 1" })).toBeVisible();
  expect(createBody).toMatchObject({
    title: "Street scenes, batch 1",
    threshold: 0.7,
    seed_sample_images: true,
    labels: ["person", "car", "bicycle", "bus"],
  });
});
