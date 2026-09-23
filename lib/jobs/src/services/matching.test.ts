import assert from "node:assert/strict";
import test from "node:test";

import { matchJobToPreferences } from "./matching.js";
import type { JobPreferences } from "../types.js";

const baseJob = (overrides: any = {}) => ({
  source: "x",
  sourceJobId: "1",
  title: "Senior Backend Engineer - Node.js",
  company: "Acme",
  description: "Work on backend systems",
  url: "https://example.com/1",
  country: "fr",
  region: "Île-de-France",
  city: "Paris",
  contractTypes: ["permanent"],
  educationLevel: "master",
  salaryMin: 50000,
  salaryMax: 70000,
  salaryCurrency: "EUR",
  remoteWork: "remote",
  languages: ["fr", "en"],
  startDate: "2026-10-01",
  publishedAt: new Date(),
  expiresAt: null,
  rawData: {},
  fingerprint: "f1",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

test("certain match when all explicit criteria satisfied", () => {
  const job = baseJob();
  const prefs: JobPreferences = {
    countries: ["fr"],
    contractTypes: ["permanent"],
    languages: ["fr"],
    educationLevel: "master",
    minimumSalary: 40000,
    remoteWork: "remote",
    startDate: "2026-11-01",
  };

  const res = matchJobToPreferences(job as any, prefs);
  assert.equal(res.outcome, "certain");
  assert.ok(res.score >= 0.65);
});

test("probable match when some optional criteria missing", () => {
  const job = baseJob({ salaryMin: null, educationLevel: null });
  const prefs: JobPreferences = {
    countries: ["fr"],
    contractTypes: ["permanent"],
    languages: ["en"],
  };

  const res = matchJobToPreferences(job as any, prefs);
  assert.equal(res.outcome, "certain");
});

test("insufficient when job missing key data but not mismatched", () => {
  const job = baseJob({ city: null, region: null, salaryMin: null });
  const prefs: JobPreferences = {
    countries: ["fr"],
    contractTypes: ["permanent"],
    minimumSalary: 60000,
  };

  const res = matchJobToPreferences(job as any, prefs);
  // salary can't be verified, but country/contract match — should be insufficient
  assert.equal(res.outcome, "insufficient");
  assert.ok(res.reasons.includes("salary:insufficient") || res.reasons.includes("location:insufficient"));
});

test("no_match when explicit criterion mismatches", () => {
  const job = baseJob({ country: "de", contractTypes: ["contract"] });
  const prefs: JobPreferences = {
    countries: ["fr"],
    contractTypes: ["permanent"],
  };

  const res = matchJobToPreferences(job as any, prefs);
  assert.equal(res.outcome, "no_match");
});
