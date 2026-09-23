import type { Job, JobSource, JobWorker } from "../types";
import { upsertJobsFromSource } from "../services/jobs";

export class PollingJobWorker implements JobWorker {
  readonly sourceId: string;
  private readonly source: JobSource;
  private isRunning = false;
  private intervalHandle?: ReturnType<typeof setInterval>;

  constructor(source: JobSource) {
    this.source = source;
    this.sourceId = source.id;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.intervalHandle = setInterval(() => {
      void this.runOnce().catch(() => undefined);
    }, 60_000);
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  async runOnce(): Promise<Job[]> {
    const jobs = await this.source.fetchJobs();
    return upsertJobsFromSource(jobs);
  }
}
