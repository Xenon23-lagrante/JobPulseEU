import test from "node:test";
import assert from "node:assert/strict";

import { FranceTravailJobsSource } from "./france-travail.js";
import { LaBonneAlternanceJobsSource } from "./labonnealternance.js";
import { Jeune1SolutionJobsSource } from "./jeune1solution.js";
import { LeFoyerJobsSource } from "./leforem.js";
import { ActirisJobsSource } from "./actiris.js";
import { VDABJobsSource } from "./vdab.js";
import { ADEMJobsSource } from "./adem.js";
import { BundesagenturJobsSource } from "./bundesagentur.js";
import { EuresJobsSource } from "./eures.js";

test("connectors are disabled by default and return empty lists", async () => {
  const connectors = [
    new FranceTravailJobsSource(),
    new LaBonneAlternanceJobsSource(),
    new Jeune1SolutionJobsSource(),
    new LeFoyerJobsSource(),
    new ActirisJobsSource(),
    new VDABJobsSource(),
    new ADEMJobsSource(),
    new BundesagenturJobsSource(),
    new EuresJobsSource(),
  ];

  for (const c of connectors) {
    const jobs = await c.fetchJobs({ limit: 1 });
    assert.ok(Array.isArray(jobs));
    assert.equal(jobs.length, 0);
    assert.ok(["not_connected", "disabled", "error"].includes(c.status));
  }
});
