import type { Job, JobPreferences } from "../types";
import { normalizeText as _normalizeText, normalizeLanguage, normalizeContractType, normalizeEducationLevel, normalizeRemoteWork } from "./jobs";

export type MatchOutcome = "certain" | "probable" | "insufficient" | "no_match";

export type MatchResult = {
  outcome: MatchOutcome;
  score: number; // internal relevance score (0..1) used for ordering
  reasons: string[];
};

function normalizeText(value?: string | null): string {
  return _normalizeText(String(value ?? "")).toLowerCase();
}

export function matchJobToPreferences(job: Job, preferences: JobPreferences): MatchResult {
  const reasons: string[] = [];
  let score = 0;
  let possible = 0;

  const weights = {
    sector: 0.2,
    contract: 0.3,
    country: 0.25,
    location: 0.03,
    education: 0.03,
    salary: 0.05,
    remote: 0.02,
    languages: 0.1,
    startDate: 0.02,
  } as const;

  // Sector / métier
  if ((preferences as any).jobSector) {
    possible += weights.sector;
    const wanted = normalizeText((preferences as any).jobSector);
    const inTitle = normalizeText(job.title).includes(wanted) && wanted.length > 2;
    const inDescription = (job.description ? normalizeText(job.description) : "").includes(wanted) && wanted.length > 2;
    const inRawCategory = (String((job.rawData as any)?.category?.label ?? "")).toLowerCase().includes(wanted);

    if (inTitle || inDescription || inRawCategory) {
      score += weights.sector;
      reasons.push("sector:match");
    } else if (!job.title && !job.description && !job.rawData) {
      reasons.push("sector:insufficient");
    } else {
      return { outcome: "no_match", score: 0, reasons: ["sector:mismatch"] };
    }
  }

  // Contract types
  if (preferences.contractTypes && preferences.contractTypes.length > 0) {
    possible += weights.contract;
    const pref = preferences.contractTypes.map((c) => normalizeContractType(String(c)));
    const jobContracts = (job.contractTypes ?? []).map((c) => normalizeContractType(String(c)));
    if (jobContracts.length === 0) {
      reasons.push("contract:insufficient");
    } else {
      const has = pref.some((p) => jobContracts.includes(p));
      if (has) {
        score += weights.contract;
        reasons.push("contract:match");
      } else {
        return { outcome: "no_match", score: 0, reasons: ["contract:mismatch"] };
      }
    }
  }

  // Countries
  if (preferences.countries && preferences.countries.length > 0) {
    possible += weights.country;
    const prefs = preferences.countries.map((c) => normalizeText(c));
    const jobCountry = normalizeText(job.country);
    const hasEurope = prefs.some((p) => p.includes("europe") || p === "eu" || p.includes("toute") );
    if (hasEurope) {
      if (jobCountry) {
        score += weights.country;
        reasons.push("country:match_europe");
      } else {
        reasons.push("country:insufficient");
      }
    } else {
      const match = prefs.includes(jobCountry);
      if (match) {
        score += weights.country;
        reasons.push("country:match");
      } else if (!jobCountry) {
        reasons.push("country:insufficient");
      } else {
        return { outcome: "no_match", score: 0, reasons: ["country:mismatch"] };
      }
    }
  }

  // Location (region / city)
  if (preferences.locations && preferences.locations.length > 0) {
    possible += weights.location;
    const locs = preferences.locations.map((l) => normalizeText(l));
    const jobRegion = normalizeText(job.region);
    const jobCity = normalizeText(job.city);
    const regionMatch = jobRegion && locs.includes(jobRegion);
    const cityMatch = jobCity && locs.includes(jobCity);
    if (regionMatch || cityMatch) {
      score += weights.location;
      reasons.push("location:match");
    } else if (!jobRegion && !jobCity) {
      reasons.push("location:insufficient");
    } else {
      return { outcome: "no_match", score: 0, reasons: ["location:mismatch"] };
    }
  }

  // Education
  if (preferences.educationLevel) {
    possible += weights.education;
    if (job.educationLevel) {
      if (normalizeEducationLevel(job.educationLevel) === normalizeEducationLevel(preferences.educationLevel)) {
        score += weights.education;
        reasons.push("education:match");
      } else {
        return { outcome: "no_match", score: 0, reasons: ["education:mismatch"] };
      }
    } else {
      reasons.push("education:insufficient");
    }
  }

  // Salary
  if (typeof preferences.minimumSalary === "number") {
    possible += weights.salary;
    if (typeof job.salaryMin === "number") {
      if (job.salaryMin >= preferences.minimumSalary) {
        score += weights.salary;
        reasons.push("salary:match");
      } else {
        return { outcome: "no_match", score: 0, reasons: ["salary:mismatch"] };
      }
    } else {
      reasons.push("salary:insufficient");
    }
  }

  // Remote
  if (preferences.remoteWork) {
    possible += weights.remote;
    if (job.remoteWork) {
      const pref = normalizeRemoteWork(preferences.remoteWork ?? "");
      const j = normalizeRemoteWork(job.remoteWork ?? "");
      const ok = pref === "remote" ? (j === "remote" || j === "hybrid") : pref === j;
      if (ok) {
        score += weights.remote;
        reasons.push("remote:match");
      } else {
        return { outcome: "no_match", score: 0, reasons: ["remote:mismatch"] };
      }
    } else {
      reasons.push("remote:insufficient");
    }
  }

  // Languages
  if (preferences.languages && preferences.languages.length > 0) {
    possible += weights.languages;
    const want = preferences.languages.map((l) => normalizeLanguage(String(l))).filter(Boolean);
    const have = (job.languages ?? []).map((l) => normalizeLanguage(String(l))).filter(Boolean);
    if (have.length === 0) {
      reasons.push("languages:insufficient");
    } else if (want.some((w) => have.includes(w))) {
      score += weights.languages;
      reasons.push("languages:match");
    } else {
      return { outcome: "no_match", score: 0, reasons: ["languages:mismatch"] };
    }
  }

  // Start date
  if (preferences.startDate) {
    possible += weights.startDate;
    if (job.startDate) {
      const pref = new Date(preferences.startDate as any);
      const js = new Date(job.startDate as any);
      if (Number.isNaN(pref.getTime()) || Number.isNaN(js.getTime())) {
        reasons.push("startDate:insufficient");
      } else if (js.getTime() <= pref.getTime()) {
        score += weights.startDate;
        reasons.push("startDate:match");
      } else {
        reasons.push("startDate:future");
      }
    } else {
      reasons.push("startDate:insufficient");
    }
  }

  if (possible === 0) {
    return { outcome: "probable", score: 0.5, reasons: ["no_preferences"] };
  }

  const totalWeights = Object.values(weights).reduce((s, v) => s + v, 0);
  const normalizedScore = Math.min(1, score / totalWeights);
  // If any important field was missing we consider the result 'insufficient'
  if (reasons.some((r) => r.endsWith(":insufficient"))) {
    return { outcome: "insufficient", score: normalizedScore, reasons };
  }

  let outcome: MatchOutcome = "insufficient";
  if (normalizedScore >= 0.65) outcome = "certain";
  else if (normalizedScore >= 0.45) outcome = "probable";
  else if (normalizedScore >= 0.25) outcome = "insufficient";
  else outcome = "no_match";

  return { outcome, score: normalizedScore, reasons };
}
