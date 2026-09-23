import { BaseJobSource } from "./base";
import type { JobCandidateInput } from "../types";

export class GermanyJobsSource extends BaseJobSource<unknown> {
  readonly id = "germany";
  readonly name = "Germany jobs";
  readonly country = "Germany";

  constructor() {
    super({
      status: "not_connected",
      reason:
        "Aucune source officielle Germany n’a été branchée. La source reste en mode non connectée par défaut.",
    });
  }

  override async fetchJobs(): Promise<JobCandidateInput[]> {
    return [];
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("GermanyJobsSource is intentionally not connected and does not normalize live payloads.");
  }
}
