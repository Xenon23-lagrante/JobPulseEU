import { BaseJobSource } from "./base.js";
import type { JobCandidateInput, JobFetchOptions } from "../types.js";

export class EuresJobsSource extends BaseJobSource<unknown> {
  readonly id = "eures";
  readonly name = "EURES";
  readonly country = "Europe";

  constructor(options?: { enabled?: boolean }) {
    const enabled = options?.enabled ?? false;
    super({ status: enabled ? "not_connected" : "not_connected", reason: "EURES connector not configured." });
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("EuresJobsSource is not yet connected.");
  }

  override async fetchJobs(_options?: JobFetchOptions): Promise<JobCandidateInput[]> {
    this.health = "disabled";
    return [];
  }
}
