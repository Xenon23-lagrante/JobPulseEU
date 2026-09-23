import { BaseJobSource } from "./base";
import type { JobCandidateInput } from "../types";

export class BelgiumJobsSource extends BaseJobSource<unknown> {
  readonly id = "belgium";
  readonly name = "Belgium jobs";
  readonly country = "Belgium";

  constructor() {
    super({
      status: "not_connected",
      reason:
        "Aucune API officielle ou source ouverte Belgium n’a été connectée. Cette source est volontairement inactive.",
    });
  }

  override async fetchJobs(): Promise<JobCandidateInput[]> {
    return [];
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("BelgiumJobsSource is intentionally not connected and does not normalize live payloads.");
  }
}
