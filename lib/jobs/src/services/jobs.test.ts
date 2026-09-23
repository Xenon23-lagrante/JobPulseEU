import assert from "node:assert/strict";
import test from "node:test";

import {
  areLikelySameOffer,
  computeDeduplicationConfidence,
  deduplicateJobs,
  normalizeJobCandidate,
} from "./jobs.js";

function makeJob(overrides: Partial<Record<string, unknown>> = {}) {
  return normalizeJobCandidate({
    source: "france",
    sourceJobId: "job-123",
    title: "Senior Frontend Developer",
    company: "Example SAS",
    description:
      "We are looking for a senior frontend developer with React and TypeScript experience in Paris.",
    url: "https://example.com/jobs/123",
    country: "France",
    region: "Ile-de-France",
    city: "Paris",
    contractTypes: ["full_time"],
    educationLevel: "bachelor",
    salaryMin: 50000,
    salaryMax: 70000,
    salaryCurrency: "EUR",
    remoteWork: "hybrid",
    languages: ["fr", "en"],
    startDate: "2026-10-01",
    publishedAt: new Date("2026-09-15T00:00:00.000Z"),
    expiresAt: new Date("2026-10-31T00:00:00.000Z"),
    rawData: { source: "france" },
    fingerprint: "",
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    ...overrides,
  });
}

test("deduplicates exact copies from the same source", () => {
  const a = makeJob({ sourceJobId: "identical-42" });
  const b = makeJob({ sourceJobId: "identical-42" });

  assert.equal(deduplicateJobs([a, b]).length, 1);
  assert.equal(areLikelySameOffer(a, b), true);
});

test("deduplicates the same offer originating from two different sources", () => {
  const left = makeJob({
    source: "france",
    sourceJobId: "job-880",
    title: "Senior Frontend Developer",
    company: "Example SAS",
    country: "France",
    region: "Ile-de-France",
    city: "Paris",
    contractTypes: ["full_time"],
    startDate: "2026-10-01",
    description:
      "Senior frontend developer with React TypeScript experience and product mindset in Paris.",
    url: "https://fr.example.com/offres/880",
    remoteWork: "hybrid",
    languages: ["fr", "en"],
  });

  const right = makeJob({
    source: "belgium",
    sourceJobId: "job-440",
    title: "Senior Frontend Developer",
    company: "Example S.A.",
    country: "France",
    region: "Ile-de-France",
    city: "Paris",
    contractTypes: ["full_time"],
    startDate: "2026-10-01",
    description:
      "Senior frontend developer with React TypeScript experience and product mindset in Paris.",
    url: "https://be.example.com/offres/440",
    remoteWork: "hybrid",
    languages: ["fr", "en"],
  });

  assert.equal(areLikelySameOffer(left, right), true);
  assert.equal(deduplicateJobs([left, right]).length, 1);
  assert.ok(computeDeduplicationConfidence(left, right) > 0);
});

test("keeps distinct offers when only the title is similar", () => {
  const left = makeJob({
    sourceJobId: "title-1",
    title: "Senior Frontend Developer",
    company: "Alpha Labs",
    url: "https://example.com/job-1",
    description: "React and TypeScript role with a product team in Paris.",
  });

  const right = makeJob({
    sourceJobId: "title-2",
    title: "Senior Frontend Engineer",
    company: "Beta Labs",
    url: "https://example.com/job-2",
    description: "Platform engineering role with Go and Kubernetes in Lyon.",
  });

  assert.equal(areLikelySameOffer(left, right), false);
  assert.equal(deduplicateJobs([left, right]).length, 2);
});

test("normalizes companies with different writing styles", () => {
  const left = makeJob({
    source: "france",
    sourceJobId: "company-1",
    company: "Société Générale",
  });

  const right = makeJob({
    source: "france",
    sourceJobId: "company-2",
    company: "Societe Generale",
  });

  assert.equal(areLikelySameOffer(left, right), true);
});

test("normalizes cities with accents and changes in punctuation", () => {
  const left = makeJob({
    source: "france",
    sourceJobId: "city-1",
    city: "Málaga",
    country: "Espagne",
  });

  const right = makeJob({
    source: "france",
    sourceJobId: "city-2",
    city: "Malaga",
    country: "Espagne",
  });

  assert.equal(areLikelySameOffer(left, right), true);
});

test("keeps jobs with missing data distinct unless they are exact duplicates", () => {
  const left = makeJob({
    source: "france",
    sourceJobId: "missing-1",
    title: "Data Analyst",
    city: null,
    company: null,
    description: null,
    startDate: null,
    url: "https://example.com/partial-1",
  });

  const right = makeJob({
    source: "germany",
    sourceJobId: "missing-2",
    title: "Data Scientist",
    city: null,
    company: null,
    description: null,
    startDate: null,
    url: "https://example.com/partial-2",
  });

  assert.equal(areLikelySameOffer(left, right), false);
  assert.equal(deduplicateJobs([left, right]).length, 2);
});
