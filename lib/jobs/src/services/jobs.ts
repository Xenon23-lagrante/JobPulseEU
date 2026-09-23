import { createHash } from "node:crypto";
import type { Job, JobCandidateInput } from "../types";

const COMMON_COMPANY_SUFFIXES = [
  "sa",
  "sas",
  "sarl",
  "gmbh",
  "ag",
  "nv",
  "bv",
  "ltd",
  "limited",
  "inc",
  "llc",
  "holding",
  "group",
  "company",
  "enterprise",
  "consulting",
  "services",
  "solutions",
  "digital",
  "technology",
  "technologies",
];

const CONTRACT_REPLACEMENTS: Record<string, string> = {
  cdi: "permanent",
  "contrat à durée indéterminée": "permanent",
  "contractuel": "contract",
  "cdd": "contract",
  "contrat": "contract",
  "fixed-term": "contract",
  "permanent": "permanent",
  "full-time": "full_time",
  "full time": "full_time",
  "temps plein": "full_time",
  "part-time": "part_time",
  "part time": "part_time",
  "temps partiel": "part_time",
  "interim": "temporary",
  "temporary": "temporary",
  "freelance": "freelance",
  "independent": "freelance",
  "stage": "internship",
  "internship": "internship",
  "apprentissage": "apprenticeship",
  "apprenticeship": "apprenticeship",
  "alternance": "apprenticeship",
};

const REMOTE_REPLACEMENTS: Record<string, string> = {
  remote: "remote",
  teletravail: "remote",
  "à distance": "remote",
  "hybrid": "hybrid",
  "hybride": "hybrid",
  onsite: "onsite",
  on_site: "onsite",
  "sur site": "onsite",
  flexible: "flexible",
};

const LANGUAGE_REPLACEMENTS: Record<string, string> = {
  fr: "fr",
  français: "fr",
  french: "fr",
  en: "en",
  english: "en",
  anglais: "en",
  de: "de",
  deutsch: "de",
  allemand: "de",
  nl: "nl",
  dutch: "nl",
  néerlandais: "nl",
  es: "es",
  espanol: "es",
  espagnol: "es",
  it: "it",
  italian: "it",
  italien: "it",
};

const EDUCATION_REPLACEMENTS: Record<string, string> = {
  "bachelor": "bachelor",
  "licence": "bachelor",
  "license": "bachelor",
  "master": "master",
  "mastère": "master",
  "doctorat": "doctorate",
  "phd": "doctorate",
  "doctorate": "doctorate",
  "technician": "secondary",
  "bac": "secondary",
  "baccalauréat": "secondary",
  "secondary": "secondary",
};

export function normalizeText(value: string | null | undefined): string {
  if (value == null) {
    return "";
  }

  let normalized = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  normalized = normalized.replace(/&/g, " and ");
  normalized = normalized.replace(/[\p{P}\p{S}]+/gu, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

export function normalizeCompanyName(value: string | null | undefined): string {
  const prepared = String(value ?? "").replace(/\./g, "").replace(/&/g, " and ");
  const normalized = normalizeText(prepared);
  if (!normalized) {
    return "";
  }

  const words = normalized.split(" ").filter(Boolean);
  const filtered = words.filter((word) => !COMMON_COMPANY_SUFFIXES.includes(word));
  return filtered.join(" ");
}

export function normalizeLocation(value: string | null | undefined): string {
  return normalizeText(value);
}

export function normalizeContractType(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  const directMatch = CONTRACT_REPLACEMENTS[normalized];
  if (directMatch) {
    return directMatch;
  }

  for (const [key, output] of Object.entries(CONTRACT_REPLACEMENTS)) {
    if (normalized.includes(key)) {
      return output;
    }
  }

  return normalized.replace(/\s+/g, "_");
}

export function normalizeRemoteWork(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  const directMatch = REMOTE_REPLACEMENTS[normalized];
  if (directMatch) {
    return directMatch;
  }

  for (const [key, output] of Object.entries(REMOTE_REPLACEMENTS)) {
    if (normalized.includes(key)) {
      return output;
    }
  }

  return normalized;
}

export function normalizeLanguage(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  return LANGUAGE_REPLACEMENTS[normalized] ?? normalized;
}

export function normalizeEducationLevel(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  const directMatch = EDUCATION_REPLACEMENTS[normalized];
  if (directMatch) {
    return directMatch;
  }

  for (const [key, output] of Object.entries(EDUCATION_REPLACEMENTS)) {
    if (normalized.includes(key)) {
      return output;
    }
  }

  return normalized;
}

export function normalizeJobDescription(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  return normalized
    .split(" ")
    .filter((word) => word.length > 2)
    .filter((word) => !["avec", "dans", "pour", "plus", "entre", "avoir", "votre", "notre", "travail", "poste", "mission", "emploi"].includes(word))
    .join(" ");
}

export function asNormalizedArray(values: Array<string | null | undefined> | undefined | null): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.filter(Boolean).map((value) => normalizeText(String(value))).filter(Boolean))];
}

export function computeStableFingerprint(job: Pick<JobCandidateInput, "title" | "company" | "country" | "region" | "city" | "contractTypes" | "startDate" | "description" | "remoteWork" | "languages" | "educationLevel">): string {
  const signature = {
    title: normalizeText(job.title),
    company: normalizeCompanyName(job.company),
    country: normalizeLocation(job.country),
    region: normalizeLocation(job.region),
    city: normalizeLocation(job.city),
    contractTypes: [...new Set((job.contractTypes ?? []).map((value) => normalizeContractType(value)))].sort(),
    startDate: job.startDate ?? "",
    description: normalizeJobDescription(job.description),
    remoteWork: normalizeRemoteWork(job.remoteWork),
    languages: asNormalizedArray(job.languages).map((value) => normalizeLanguage(value)).sort(),
    educationLevel: normalizeEducationLevel(job.educationLevel),
  };

  return createHash("sha256").update(JSON.stringify(signature)).digest("hex");
}

export function computeExactJobKey(job: Pick<JobCandidateInput, "source" | "sourceJobId">): string {
  return `${String(job.source).trim().toLowerCase()}::${String(job.sourceJobId).trim().toLowerCase()}`;
}

export function computeDeduplicationConfidence(
  left: Pick<JobCandidateInput, "title" | "company" | "country" | "region" | "city" | "contractTypes" | "startDate" | "url" | "description" | "remoteWork" | "languages" | "educationLevel">,
  right: Pick<JobCandidateInput, "title" | "company" | "country" | "region" | "city" | "contractTypes" | "startDate" | "url" | "description" | "remoteWork" | "languages" | "educationLevel">,
): number {
  let score = 0;
  let checks = 0;

  const titleLeft = normalizeText(left.title);
  const titleRight = normalizeText(right.title);
  if (titleLeft && titleRight) {
    checks += 1;
    if (titleLeft === titleRight) {
      score += 0.2;
    }
  }

  const companyLeft = normalizeCompanyName(left.company);
  const companyRight = normalizeCompanyName(right.company);
  if (companyLeft && companyRight) {
    checks += 1;
    if (companyLeft === companyRight) {
      score += 0.25;
    }
  }

  const countryLeft = normalizeLocation(left.country);
  const countryRight = normalizeLocation(right.country);
  const cityLeft = normalizeLocation(left.city);
  const cityRight = normalizeLocation(right.city);
  const regionLeft = normalizeLocation(left.region);
  const regionRight = normalizeLocation(right.region);

  const locationMatch = countryLeft && countryRight && countryLeft === countryRight;
  const cityMatch = cityLeft && cityRight && cityLeft === cityRight;
  const regionMatch = regionLeft && regionRight && regionLeft === regionRight;

  if (locationMatch || cityMatch || regionMatch) {
    checks += 1;
    score += 0.2;
  }

  const contractLeft = asNormalizedArray(left.contractTypes).map((value) => normalizeContractType(value));
  const contractRight = asNormalizedArray(right.contractTypes).map((value) => normalizeContractType(value));
  if (contractLeft.length > 0 && contractRight.length > 0) {
    checks += 1;
    const overlap = contractLeft.filter((item) => contractRight.includes(item));
    if (overlap.length > 0) {
      score += 0.15;
    }
  }

  if (left.startDate && right.startDate && left.startDate === right.startDate) {
    checks += 1;
    score += 0.1;
  }

  const leftUrl = left.url ? String(left.url).trim().toLowerCase() : "";
  const rightUrl = right.url ? String(right.url).trim().toLowerCase() : "";
  if (leftUrl && rightUrl) {
    checks += 1;
    if (leftUrl === rightUrl) {
      score += 0.4;
    } else {
      const leftHost = new URL(leftUrl).hostname;
      const rightHost = new URL(rightUrl).hostname;
      if (leftHost === rightHost && leftUrl.replace(/\?.*$/, "") === rightUrl.replace(/\?.*$/, "")) {
        score += 0.2;
      }
    }
  }

  const descriptionLeft = normalizeJobDescription(left.description);
  const descriptionRight = normalizeJobDescription(right.description);
  if (descriptionLeft && descriptionRight) {
    const leftTokens = new Set(descriptionLeft.split(" "));
    const rightTokens = new Set(descriptionRight.split(" "));
    const overlap = [...leftTokens].filter((token) => rightTokens.has(token));
    if (overlap.length > 0) {
      checks += 1;
      score += Math.min(0.15, overlap.length / 10);
    }
  }

  if (left.remoteWork && right.remoteWork) {
    const remoteLeft = normalizeRemoteWork(left.remoteWork);
    const remoteRight = normalizeRemoteWork(right.remoteWork);
    if (remoteLeft && remoteRight && remoteLeft === remoteRight) {
      checks += 1;
      score += 0.08;
    }
  }

  const leftLanguages = asNormalizedArray(left.languages).map((value) => normalizeLanguage(value));
  const rightLanguages = asNormalizedArray(right.languages).map((value) => normalizeLanguage(value));
  if (leftLanguages.length > 0 && rightLanguages.length > 0) {
    const overlap = leftLanguages.filter((language) => rightLanguages.includes(language));
    if (overlap.length > 0) {
      checks += 1;
      score += Math.min(0.1, overlap.length / 10);
    }
  }

  const selectedChecks = Math.max(checks, 1);
  return Math.min(1, score / selectedChecks);
}

export function areLikelySameOffer(
  left: JobCandidateInput,
  right: JobCandidateInput,
): boolean {
  if (computeExactJobKey(left) === computeExactJobKey(right)) {
    return true;
  }

  const baseFingerprint = computeStableFingerprint(left);
  const candidateFingerprint = computeStableFingerprint(right);
  if (baseFingerprint === candidateFingerprint) {
    return true;
  }

  const confidence = computeDeduplicationConfidence(left, right);
  return confidence >= 0.82;
}

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dbJobToNormalizedJob(record: Record<string, unknown>): Job {
  return {
    source: String(record.source ?? ""),
    sourceJobId: String(record.sourceJobId ?? ""),
    title: String(record.title ?? ""),
    company: typeof record.company === "string" ? record.company : null,
    description: typeof record.description === "string" ? record.description : null,
    url: String(record.url ?? ""),
    country: String(record.country ?? ""),
    region: typeof record.region === "string" ? record.region : null,
    city: typeof record.city === "string" ? record.city : null,
    contractTypes: Array.isArray(record.contractTypes) ? (record.contractTypes as string[]) : [],
    educationLevel: typeof record.educationLevel === "string" ? record.educationLevel : null,
    salaryMin: typeof record.salaryMin === "number" ? record.salaryMin : null,
    salaryMax: typeof record.salaryMax === "number" ? record.salaryMax : null,
    salaryCurrency: typeof record.salaryCurrency === "string" ? record.salaryCurrency : null,
    remoteWork: typeof record.remoteWork === "string" ? record.remoteWork : null,
    languages: Array.isArray(record.languages) ? (record.languages as string[]) : [],
    startDate: typeof record.startDate === "string" ? record.startDate : null,
    publishedAt: record.publishedAt instanceof Date ? record.publishedAt : toDateOrNull(typeof record.publishedAt === "string" ? record.publishedAt : null),
    expiresAt: record.expiresAt instanceof Date ? record.expiresAt : toDateOrNull(typeof record.expiresAt === "string" ? record.expiresAt : null),
    rawData: (record.rawData as Record<string, unknown>) ?? {},
    fingerprint: String(record.fingerprint ?? ""),
    createdAt: record.createdAt instanceof Date ? record.createdAt : new Date(),
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt : new Date(),
  };
}

export function normalizeJobCandidate(job: JobCandidateInput): JobCandidateInput {
  const normalized = { ...job };

  normalized.source = String(job.source ?? "").trim();
  normalized.sourceJobId = String(job.sourceJobId ?? "").trim();
  normalized.title = String(job.title ?? "").trim();
  normalized.company = job.company ? String(job.company).trim() : null;
  normalized.country = String(job.country ?? "").trim();
  normalized.region = job.region ? String(job.region).trim() : null;
  normalized.city = job.city ? String(job.city).trim() : null;
  normalized.description = job.description ? String(job.description).trim() : null;
  normalized.url = String(job.url ?? "").trim();
  normalized.contractTypes = [...new Set((job.contractTypes ?? []).map((value) => normalizeContractType(String(value))).filter(Boolean))];
  normalized.languages = [...new Set((job.languages ?? []).map((value) => normalizeLanguage(String(value))).filter(Boolean))];
  normalized.remoteWork = job.remoteWork ? normalizeRemoteWork(String(job.remoteWork)) : null;
  normalized.educationLevel = job.educationLevel ? normalizeEducationLevel(String(job.educationLevel)) : null;
  normalized.publishedAt = toDateOrNull(job.publishedAt);
  normalized.expiresAt = toDateOrNull(job.expiresAt);
  normalized.rawData = (job.rawData ?? {}) as Record<string, unknown>;
  normalized.fingerprint = computeStableFingerprint(normalized);

  return normalized;
}

export function deduplicateJobs(jobs: JobCandidateInput[]): JobCandidateInput[] {
  const deduplicated: JobCandidateInput[] = [];
  const exactKeys = new Set<string>();

  for (const candidate of jobs.map((job) => normalizeJobCandidate(job))) {
    const exactKey = computeExactJobKey(candidate);
    if (exactKey) {
      if (exactKeys.has(exactKey)) {
        continue;
      }
      exactKeys.add(exactKey);
    }

    const existingIndex = deduplicated.findIndex((existing) => areLikelySameOffer(existing, candidate));
    if (existingIndex >= 0) {
      const merged = {
        ...deduplicated[existingIndex],
        ...candidate,
        contractTypes: candidate.contractTypes.length > deduplicated[existingIndex].contractTypes.length ? candidate.contractTypes : deduplicated[existingIndex].contractTypes,
        languages: candidate.languages.length > deduplicated[existingIndex].languages.length ? candidate.languages : deduplicated[existingIndex].languages,
        rawData: {
          ...(deduplicated[existingIndex].rawData ?? {}),
          ...(candidate.rawData ?? {}),
        },
        updatedAt: candidate.updatedAt ?? deduplicated[existingIndex].updatedAt ?? new Date(),
      };

      merged.fingerprint = computeStableFingerprint(merged);
      deduplicated[existingIndex] = merged;
      continue;
    }

    deduplicated.push(candidate);
  }

  return deduplicated;
}

export async function upsertJobsFromSource(jobs: JobCandidateInput[]): Promise<Job[]> {
  if (jobs.length === 0) {
    return [];
  }

  const uniqueJobs = deduplicateJobs(jobs);
  const persisted: Job[] = [];

  const { and, eq } = await import("drizzle-orm");
  const { db, jobsTable } = await import("@workspace/db");

  for (const job of uniqueJobs) {
    const values = {
      ...job,
      rawData: (job.rawData ?? {}) as Record<string, unknown>,
      contractTypes: job.contractTypes ?? [],
      languages: job.languages ?? [],
      publishedAt: toDateOrNull(job.publishedAt),
      expiresAt: toDateOrNull(job.expiresAt),
      fingerprint: job.fingerprint ?? computeStableFingerprint(job),
      createdAt: job.createdAt ?? new Date(),
      updatedAt: job.updatedAt ?? new Date(),
    };

    const [record] = await db
      .insert(jobsTable)
      .values(values)
      .onConflictDoUpdate({
        target: jobsTable.fingerprint,
        set: {
          ...values,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (record) {
      persisted.push(dbJobToNormalizedJob(record as Record<string, unknown>));
      continue;
    }

    const [existing] = await db
      .select()
      .from(jobsTable)
      .where(and(eq(jobsTable.source, job.source), eq(jobsTable.sourceJobId, job.sourceJobId)))
      .limit(1);

    if (existing) {
      persisted.push(dbJobToNormalizedJob(existing as Record<string, unknown>));
    }
  }

  return persisted;
}
