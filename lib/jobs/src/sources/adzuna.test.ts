import assert from "node:assert/strict";
import test from "node:test";

import { AdzunaJobsSource } from "./adzuna.js";

test("normalize converts Adzuna payload to the internal job model", () => {
  const source = new AdzunaJobsSource({
    enabled: true,
    appId: "demo-app",
    apiKey: "demo-key",
    baseUrl: "https://api.adzuna.com/v1",
  });

  const raw = {
    id: "ad_123",
    title: "Full Stack Developer",
    company: {
      display_name: "Acme Digital",
    },
    description: "Build and ship APIs for fintech products.",
    url: "https://www.adzuna.com/jobs/land/ad_123",
    created: "2026-09-20T10:00:00Z",
    location: {
      display_name: "Paris, France",
      area: ["FR", "Île-de-France", "Paris"],
    },
    contract_type: "permanent",
    salary_min: 42000,
    salary_max: 56000,
    salary_currency: "EUR",
    category: {
      label: "IT Jobs",
    },
    is_remote: true,
    latitude: 48.8566,
    longitude: 2.3522,
  };

  const normalized = source.normalize(raw as any);

  assert.equal(normalized.source, "adzuna");
  assert.equal(normalized.sourceJobId, "ad_123");
  assert.equal(normalized.title, "Full Stack Developer");
  assert.equal(normalized.company, "Acme Digital");
  assert.equal(normalized.country, "fr");
  assert.equal(normalized.city, "paris");
  assert.deepEqual(normalized.contractTypes, ["permanent"]);
  assert.equal(normalized.url, "https://www.adzuna.com/jobs/land/ad_123");
  assert.equal(normalized.rawData.id, "ad_123");
});

test("fetchJobs handles pagination and respects the requested limit", async () => {
  const calls: string[] = [];
  const originalFetch = global.fetch;

  global.fetch = async (input: any, init?: any) => {
    const url = String(input);
    calls.push(url);

    const page = Number(new URL(url).searchParams.get("page") ?? "1");
    const pageSize = Number(new URL(url).searchParams.get("results_per_page") ?? "10");

    const items = Array.from({ length: pageSize }, (_, index) => ({
      id: `job_${page}_${index}`,
      title: `Engineer ${page}-${index}`,
      company: { display_name: `Company ${page}` },
      description: "We build software.",
      url: `https://example.com/job/${page}/${index}`,
      created: "2026-09-20T10:00:00Z",
      location: { display_name: `Lyon, France`, area: ["FR", "Auvergne-Rhône-Alpes", "Lyon"] },
      contract_type: "contract",
      category: { label: "Engineering" },
      is_remote: false,
    }));

    return new Response(JSON.stringify({ results: page === 1 ? items.slice(0, 3) : items.slice(0, 1), count: 4 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const source = new AdzunaJobsSource({ enabled: true, appId: "demo-app", apiKey: "demo-key" });
    const jobs = await source.fetchJobs({ limit: 3 });

    assert.equal(jobs.length, 3);
    assert.equal(jobs[0]?.source, "adzuna");
    assert.ok(calls.length >= 1);
    assert.ok(calls[0]?.includes("results_per_page=3"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchJobs handles a failed API response gracefully", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    return new Response(JSON.stringify({ error: "invalid credentials" }), { status: 401 });
  };

  try {
    const source = new AdzunaJobsSource({ enabled: true, appId: "demo-app", apiKey: "demo-key" });
    const jobs = await source.fetchJobs({ limit: 5 });

    assert.deepEqual(jobs, []);
    assert.equal(source.status, "error");
    assert.ok(source.reason?.includes("401"));
  } finally {
    global.fetch = originalFetch;
  }
});
