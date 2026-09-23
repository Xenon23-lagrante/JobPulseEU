import { BaseJobSource } from "./base.js";
import type { JobCandidateInput, JobFetchOptions } from "../types.js";

export class LaBonneAlternanceJobsSource extends BaseJobSource<unknown> {
  readonly id = "labonnealternance";
  readonly name = "La Bonne Alternance";
  readonly country = "France";

  constructor(options?: { enabled?: boolean }) {
    const enabled = options?.enabled ?? false;
    super({ status: enabled ? "not_connected" : "not_connected", reason: "La Bonne Alternance not configured." });
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("LaBonneAlternanceJobsSource is not yet connected.");
  }

  override async fetchJobs(_options?: JobFetchOptions): Promise<JobCandidateInput[]> {
    this.health = "disabled";
    return [];
  }
}
