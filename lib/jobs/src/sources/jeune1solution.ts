import { BaseJobSource } from "./base.js";
import type { JobCandidateInput, JobFetchOptions } from "../types.js";

export class Jeune1SolutionJobsSource extends BaseJobSource<unknown> {
  readonly id = "1jeune1solution";
  readonly name = "1jeune1solution";
  readonly country = "France";

  constructor(options?: { enabled?: boolean }) {
    const enabled = options?.enabled ?? false;
    super({ status: enabled ? "not_connected" : "not_connected", reason: "1jeune1solution connector not configured." });
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("Jeune1SolutionJobsSource is not yet connected.");
  }

  override async fetchJobs(_options?: JobFetchOptions): Promise<JobCandidateInput[]> {
    this.health = "disabled";
    return [];
  }
}
