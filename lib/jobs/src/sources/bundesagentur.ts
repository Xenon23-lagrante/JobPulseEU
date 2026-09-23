import { BaseJobSource } from "./base.js";
import type { JobCandidateInput, JobFetchOptions } from "../types.js";

export class BundesagenturJobsSource extends BaseJobSource<unknown> {
  readonly id = "bundesagentur";
  readonly name = "Bundesagentur für Arbeit";
  readonly country = "Germany";

  constructor(options?: { enabled?: boolean }) {
    const enabled = options?.enabled ?? false;
    super({ status: enabled ? "not_connected" : "not_connected", reason: "Bundesagentur connector not configured." });
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("BundesagenturJobsSource is not yet connected.");
  }

  override async fetchJobs(_options?: JobFetchOptions): Promise<JobCandidateInput[]> {
    this.health = "disabled";
    return [];
  }
}
