import { BaseJobSource } from "./base.js";
import { normalizeJobCandidate } from "../services/jobs.js";
import type { JobCandidateInput, JobFetchOptions } from "../types.js";

type AdzunaLocation = {
  display_name?: string | null;
  area?: Array<string | null | undefined>;
  country?: string | null;
};

type AdzunaCompany = {
  display_name?: string | null;
};

type AdzunaRaw = {
  id?: string | number | null;
  title?: string | null;
  company?: AdzunaCompany | null;
  description?: string | null;
  url?: string | null;
  redirect_url?: string | null;
  created?: string | Date | null;
  location?: AdzunaLocation | null;
  contract_type?: string | null;
  category?: {
    label?: string | null;
  } | null;
  is_remote?: boolean | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  [key: string]: unknown;
};

type AdzunaResponse = {
  results?: AdzunaRaw[];
  count?: number;
  error?: string;
};

function toBoolean(value: string | undefined): boolean {
  return value != null && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export class AdzunaJobsSource extends BaseJobSource<AdzunaRaw> {
  readonly id = "adzuna";
  readonly name = "Adzuna jobs";
  readonly country = "France";

  readonly appId?: string;
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly countryCode: string;
  readonly timeoutMs: number;
  readonly maxResultsPerPage: number;

  requestCount = 0;
  lastRequestAt?: Date;
  lastSuccessAt?: Date;
  lastError?: string;
  lastPageFetched?: number;

  constructor(options?: {
    enabled?: boolean;
    appId?: string;
    apiKey?: string;
    countryCode?: string;
    baseUrl?: string;
    timeoutMs?: number;
    maxResultsPerPage?: number;
    name?: string;
    country?: string;
    id?: string;
  }) {
    const enabled = options?.enabled ?? toBoolean(process.env.JOB_SOURCE_ADZUNA_ENABLED ?? process.env.ADZUNA_ENABLED);
    const appId = options?.appId ?? process.env.JOB_SOURCE_ADZUNA_APP_ID ?? process.env.ADZUNA_APP_ID;
    const apiKey = options?.apiKey ?? process.env.JOB_SOURCE_ADZUNA_API_KEY ?? process.env.ADZUNA_API_KEY;
    const countryCode = options?.countryCode ?? process.env.JOB_SOURCE_ADZUNA_COUNTRY ?? "fr";
    const baseUrl = options?.baseUrl ?? process.env.JOB_SOURCE_ADZUNA_BASE_URL ?? "https://api.adzuna.com/v1";
    const timeoutMs = Number(options?.timeoutMs ?? process.env.JOB_SOURCE_TIMEOUT_MS ?? 10000);
    const maxResultsPerPage = Number(options?.maxResultsPerPage ?? process.env.JOB_SOURCE_ADZUNA_PAGE_SIZE ?? 20);

    const hasCredentials = Boolean(appId && apiKey);
    super({
      status: enabled && hasCredentials ? "connected" : enabled ? "disabled" : "not_connected",
      reason:
        enabled && hasCredentials
          ? "Adzuna source available and authenticated."
          : enabled
            ? "Adzuna est activée mais l'identifiant ou la clé API n'est pas configuré."
            : "Adzuna reste désactivée par défaut.",
    });

    this.appId = appId;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.countryCode = countryCode;
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000;
    this.maxResultsPerPage = Number.isFinite(maxResultsPerPage) && maxResultsPerPage > 0 ? Math.min(maxResultsPerPage, 50) : 20;

    if (options?.name) {
      Object.defineProperty(this, "name", { value: options.name, writable: false, configurable: true });
    }
    if (options?.country) {
      Object.defineProperty(this, "country", { value: options.country, writable: false, configurable: true });
    }
    if (options?.id) {
      Object.defineProperty(this, "id", { value: options.id, writable: false, configurable: true });
    }
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      this.requestCount += 1;
      this.lastRequestAt = new Date();

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "JobPulseAlerts/1.0",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.text()) || "";
        this.status = "error";
        this.reason = `Adzuna answered ${response.status} for ${url}: ${payload.slice(0, 200)}`;
        this.lastError = this.reason;
        return null;
      }

      const payload = (await response.json()) as T;
      this.status = "connected";
      this.reason = "Adzuna source available and authenticated.";
      this.lastSuccessAt = new Date();
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      this.status = "error";
      this.reason = `Adzuna request failed: ${message}`;
      this.lastError = this.reason;
      return null;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private needsDelayBetweenPages(): boolean {
    return this.requestCount > 0;
  }

  private async sleepBetweenPages(): Promise<void> {
    if (!this.needsDelayBetweenPages()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  private normalizeLocation(raw: AdzunaRaw | undefined): { country: string; region: string | null; city: string | null } {
    const displayName = raw?.location?.display_name ?? "";
    const area = raw?.location?.area ?? [];

    const countryFromArea = area.find((value) => value && /^[a-z]{2}$/i.test(value.trim()));
    const country = countryFromArea ? countryFromArea.trim().toLowerCase() : this.countryCode.toLowerCase();

    const locationParts = displayName.split(",").map((part) => part.trim()).filter(Boolean);
    const cityCandidate = [...area].reverse().find((value) => value && !/^[a-z]{2}$/i.test(value.trim()));
    const city = (cityCandidate ?? locationParts.at(-2) ?? locationParts[0] ?? null)?.trim() || null;
    const region = (area.find((value) => value && !/^[a-z]{2}$/i.test(value.trim()) && value.trim() !== city)?.trim() ?? null) || null;

    return {
      country,
      region: region || locationParts.at(-2) || null,
      city: city ? city.toLowerCase() : null,
    };
  }

  override normalize(raw: AdzunaRaw): JobCandidateInput {
    const normalizedLocation = this.normalizeLocation(raw);
    const createdAt = raw.created ? new Date(raw.created) : undefined;
    const rawUrl = raw.redirect_url || raw.url || "";

    return normalizeJobCandidate({
      source: this.id,
      sourceJobId: String(raw.id ?? `${raw.title ?? "unknown"}-${rawUrl}`),
      title: raw.title ?? "Untitled role",
      company: raw.company?.display_name ?? null,
      description: raw.description ?? null,
      url: rawUrl,
      country: normalizedLocation.country || this.countryCode,
      region: normalizedLocation.region,
      city: normalizedLocation.city,
      contractTypes: raw.contract_type ? [raw.contract_type] : [],
      educationLevel: null,
      salaryMin: typeof raw.salary_min === "number" ? raw.salary_min : null,
      salaryMax: typeof raw.salary_max === "number" ? raw.salary_max : null,
      salaryCurrency: raw.salary_currency ?? null,
      remoteWork: raw.is_remote ? "remote" : "onsite",
      languages: [],
      startDate: createdAt ? createdAt.toISOString() : null,
      publishedAt: createdAt ? createdAt.toISOString() : null,
      expiresAt: null,
      rawData: raw as Record<string, unknown>,
      fingerprint: "",
      createdAt,
      updatedAt: createdAt,
    });
  }

  override async fetchJobs(options: JobFetchOptions = {}): Promise<JobCandidateInput[]> {
    if (!this.appId || !this.apiKey) {
      this.status = "disabled";
      this.reason = "Adzuna is enabled but missing ADZUNA_APP_ID / ADZUNA_API_KEY.";
      return [];
    }

    if (this.status !== "connected") {
      this.status = "connected";
      this.reason = "Adzuna source available and authenticated.";
    }

    const requestedLimit = Math.max(1, Math.min(options.limit ?? 20, 200));
    const pageSize = Math.min(this.maxResultsPerPage, 50, requestedLimit);
    const jobs: JobCandidateInput[] = [];
    let page = 1;

    while (jobs.length < requestedLimit && page <= 10) {
      const url = new URL(`${this.baseUrl}/api/jobs/${this.countryCode}/search/${page}`);
      url.searchParams.set("app_id", this.appId);
      url.searchParams.set("app_key", this.apiKey);
      url.searchParams.set("results_per_page", String(Math.min(pageSize, requestedLimit - jobs.length)));
      if (options.since) {
        const sinceDate = new Date(options.since);
        if (!Number.isNaN(sinceDate.getTime())) {
          const diffDays = Math.max(1, Math.ceil((Date.now() - sinceDate.getTime()) / 86_400_000));
          url.searchParams.set("created_since", String(diffDays));
        }
      }

      const payload = await this.fetchJson<AdzunaResponse>(url.toString());
      if (!payload || !Array.isArray(payload.results)) {
        break;
      }

      const pageResults = payload.results.slice(0, requestedLimit - jobs.length);
      for (const raw of pageResults) {
        jobs.push(this.normalize(raw));
      }

      this.lastPageFetched = page;
      if (pageResults.length < 1 || (payload.count != null && jobs.length >= payload.count)) {
        break;
      }

      const hasMore = (payload.count ?? 0) > jobs.length;
      if (!hasMore) {
        break;
      }

      page += 1;
      await this.sleepBetweenPages();
    }

    return jobs.slice(0, requestedLimit);
  }
}
