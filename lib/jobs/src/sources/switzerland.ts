import { BaseJobSource } from "./base";
import type { JobCandidateInput } from "../types";

export class SwitzerlandJobsSource extends BaseJobSource<unknown> {
  readonly id = "switzerland";
  readonly name = "Switzerland jobs";
  readonly country = "Switzerland";

  constructor() {
    super({
      status: "not_connected",
      reason:
        "Aucune source officielle Switzerland n’a été activée. La source reste volontairement non connectée.",
    });
  }

  override async fetchJobs(): Promise<JobCandidateInput[]> {
    return [];
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("SwitzerlandJobsSource is intentionally not connected and does not normalize live payloads.");
  }
}
