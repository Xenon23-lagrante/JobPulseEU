import type { JobCandidateInput, JobFetchOptions, JobSource, JobSourceStatus } from "../types";

export abstract class BaseJobSource<TSourceData = unknown> implements JobSource<TSourceData> {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly country: string;

  status: JobSourceStatus;
  reason?: string;
  // health and monitoring
  health: "enabled" | "disabled" | "healthy" | "degraded" | "error";
  lastRunAt?: Date | null;
  lastDurationMs?: number | null;
  lastCountFetched?: number | null;
  lastCountNew?: number | null;
  lastErrorCount?: number | null;

  constructor(options?: { status?: JobSourceStatus; reason?: string }) {
    this.status = options?.status ?? "not_connected";
    this.reason = options?.reason ?? "Source non connectée ou non configurée.";
    this.health = this.status === "connected" ? "healthy" : this.status === "disabled" ? "disabled" : "degraded";
    this.lastRunAt = null;
    this.lastDurationMs = null;
    this.lastCountFetched = null;
    this.lastCountNew = null;
    this.lastErrorCount = null;
  }

  get connected(): boolean {
    return this.status === "connected";
  }

  async fetchJobs(_options?: JobFetchOptions): Promise<JobCandidateInput[]> {
    return [];
  }

  protected recordRun(stats: { durationMs: number; fetched: number; added: number; errors: number }): void {
    this.lastRunAt = new Date();
    this.lastDurationMs = stats.durationMs;
    this.lastCountFetched = stats.fetched;
    this.lastCountNew = stats.added;
    this.lastErrorCount = stats.errors;

    if (stats.errors > 0 && stats.errors > stats.fetched / 4) {
      this.health = "degraded";
    } else if (stats.errors > 0) {
      this.health = "degraded";
    } else {
      this.health = "healthy";
    }
  }

  normalize(_raw: TSourceData): JobCandidateInput {
    throw new Error(`${this.name} does not expose a concrete normalizer yet.`);
  }

  protected buildFingerprint(source: string, sourceJobId: string): string {
    return `job:${source}:${sourceJobId}`;
  }
}
