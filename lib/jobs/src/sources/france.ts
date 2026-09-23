import { BaseJobSource } from "./base";
import type { JobCandidateInput } from "../types";

export class FranceJobsSource extends BaseJobSource<unknown> {
  readonly id = "france";
  readonly name = "France jobs";
  readonly country = "France";

  constructor() {
    super({
      status: "not_connected",
      reason:
        "Aucune source officielle France n’a été branchée dans ce dépôt. Cette source est délibérément laissée non connectée.",
    });
  }

  override async fetchJobs(): Promise<JobCandidateInput[]> {
    return [];
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("FranceJobsSource is intentionally not connected and does not normalize live payloads.");
  }
}
