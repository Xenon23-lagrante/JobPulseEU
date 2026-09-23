import { BaseJobSource } from "./base.js";
import type { JobCandidateInput, JobFetchOptions } from "../types.js";

export class ADEMJobsSource extends BaseJobSource<unknown> {
  readonly id = "adem";
  readonly name = "ADEM";
  readonly country = "Luxembourg";

  constructor(options?: { enabled?: boolean }) {
    const enabled = options?.enabled ?? false;
    super({ status: enabled ? "not_connected" : "not_connected", reason: "ADEM connector not configured." });
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("ADEMJobsSource is not yet connected.");
  }

  override async fetchJobs(_options?: JobFetchOptions): Promise<JobCandidateInput[]> {
    this.health = "disabled";
    return [];
  }
}
