import { BaseJobSource } from "./base";
import type { JobCandidateInput } from "../types";

export class EuropeJobsSource extends BaseJobSource<unknown> {
  readonly id = "europe";
  readonly name = "Europe jobs";
  readonly country = "Europe";

  constructor() {
    super({
      status: "not_connected",
      reason:
        "Le niveau Europe n’est pas activé tant qu’aucun flux public ou API autorisée n’a été relié à cette couche.",
    });
  }

  override async fetchJobs(): Promise<JobCandidateInput[]> {
    return [];
  }

  override normalize(_raw: unknown): JobCandidateInput {
    throw new Error("EuropeJobsSource is intentionally not connected and does not normalize live payloads.");
  }
}
