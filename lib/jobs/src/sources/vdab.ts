import { BaseJobSource } from "./base.js";
import type { JobCandidateInput, JobFetchOptions } from "../types.js";

export class VDABJobsSource extends BaseJobSource<unknown> {
  readonly id = "vdab";
  readonly name = "VDAB";
  readonly country = "Belgium";

  constructor(options?: { enabled?: boolean }) {
    const enabled = options?.enabled ?? false;
    super({ status: enabled ? "not_connected" : "not_connected", reason: "VDAB connector not configured." });
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("VDABJobsSource is not yet connected.");
  }

  override async fetchJobs(_options?: JobFetchOptions): Promise<JobCandidateInput[]> {
    this.health = "disabled";
    return [];
  }
}
