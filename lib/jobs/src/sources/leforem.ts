import { BaseJobSource } from "./base.js";
import type { JobCandidateInput, JobFetchOptions } from "../types.js";

export class LeFoyerJobsSource extends BaseJobSource<unknown> {
  readonly id = "leforem";
  readonly name = "Le Forem";
  readonly country = "Belgium";

  constructor(options?: { enabled?: boolean }) {
    const enabled = options?.enabled ?? false;
    super({ status: enabled ? "not_connected" : "not_connected", reason: "Le Forem connector not configured." });
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("LeFoyerJobsSource is not yet connected.");
  }

  override async fetchJobs(_options?: JobFetchOptions): Promise<JobCandidateInput[]> {
    this.health = "disabled";
    return [];
  }
}
