export * from "./base";
export * from "./france";
export * from "./belgium";
export * from "./luxembourg";
export * from "./germany";
export * from "./switzerland";
export * from "./europe";
export * from "./adzuna";

import { BelgiumJobsSource } from "./belgium";
import { EuropeJobsSource } from "./europe";
import { FranceJobsSource } from "./france";
import { GermanyJobsSource } from "./germany";
import { LuxembourgJobsSource } from "./luxembourg";
import { SwitzerlandJobsSource } from "./switzerland";
import { AdzunaJobsSource } from "./adzuna";

export const defaultJobSources = [
  new FranceJobsSource(),
  new BelgiumJobsSource(),
  new LuxembourgJobsSource(),
  new GermanyJobsSource(),
  new SwitzerlandJobsSource(),
  new EuropeJobsSource(),
  // Adzuna is disabled by default until APP_ID/KEY are configured
  new AdzunaJobsSource(),
];
