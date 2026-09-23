import { BaseJobSource } from "./base.js";
import type { JobCandidateInput, JobFetchOptions } from "../types.js";

export class FranceTravailJobsSource extends BaseJobSource<unknown> {
  readonly id = "france_travail";
  readonly name = "France Travail";
  readonly country = "France";

  constructor(options?: { enabled?: boolean }) {
    const enabled = options?.enabled ?? false;
    super({ status: enabled ? "not_connected" : "not_connected", reason: "France Travail connector not configured." });
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("FranceTravailJobsSource is not yet connected.");
  }

  override async fetchJobs(_options?: JobFetchOptions): Promise<JobCandidateInput[]> {
    // Placeholder: do not perform scraping. Implement only when official API/policy verified.
    this.health = "disabled";
    return [];
  }
}
