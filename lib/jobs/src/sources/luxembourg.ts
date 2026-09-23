import { BaseJobSource } from "./base";
import type { JobCandidateInput } from "../types";

export class LuxembourgJobsSource extends BaseJobSource<unknown> {
  readonly id = "luxembourg";
  readonly name = "Luxembourg jobs";
  readonly country = "Luxembourg";

  constructor() {
    super({
      status: "not_connected",
      reason:
        "Cette source n’est pas connectée tant qu’aucune API ou flux autorisé n’a été configuré pour le Luxembourg.",
    });
  }

  override async fetchJobs(): Promise<JobCandidateInput[]> {
    return [];
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("LuxembourgJobsSource is intentionally not connected and does not normalize live payloads.");
  }
}
