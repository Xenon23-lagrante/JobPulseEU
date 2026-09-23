export type JobSourceStatus = "connected" | "not_connected" | "disabled" | "error";

export type JobFetchOptions = {
  limit?: number;
  since?: Date | string | null;
  country?: string;
};

export type ContractType = string;
export type RemoteWorkMode = "remote" | "hybrid" | "onsite" | "flexible" | string;

export type Job = {
  source: string;
  sourceJobId: string;
  title: string;
  company?: string | null;
  description?: string | null;
  url: string;
  country: string;
  region?: string | null;
  city?: string | null;
  contractTypes: string[];
  educationLevel?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  remoteWork?: RemoteWorkMode | null;
  languages: string[];
  startDate?: string | null;
  publishedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  rawData: Record<string, unknown>;
  fingerprint: string;
  createdAt: Date;
  updatedAt: Date;
};

export type JobCandidateInput = Omit<Job, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};

export interface JobSource<TSourceData = unknown> {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly status: JobSourceStatus;
  readonly connected: boolean;
  readonly reason?: string;

  fetchJobs(options?: JobFetchOptions): Promise<JobCandidateInput[]>;
  normalize(raw: TSourceData): JobCandidateInput;
}

export type JobPreferences = {
  countries?: string[];
  contractTypes?: string[];
  languages?: string[];
  remoteWork?: string | null;
  educationLevel?: string | null;
  minimumSalary?: number | null;
};

export interface JobWorker {
  readonly sourceId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  runOnce(): Promise<Job[]>;
}
