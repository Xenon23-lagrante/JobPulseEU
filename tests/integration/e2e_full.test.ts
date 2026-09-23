import test from "node:test";
import assert from "node:assert/strict";

test('integration: full flow (requires DATABASE_URL)', async () => {
  if (!process.env.DATABASE_URL) {
    test.skip('DATABASE_URL not set, skipping full integration');
    return;
  }

  const db = await import('../../lib/db/src/index.js');
  const { upsertTelegramUser, ensureUserPreferences, updateUserPreferences, upsertJob, hasJobBeenNotified, recordUserJobNotification, upsertSourceStatus, updateSourceRunStatus } = db;
  const { matchJobToPreferences } = await import('../../lib/jobs/src/services/matching.js');

  // create user A
  const u = await upsertTelegramUser({ telegramId: 9999, username: 'intuser', firstName: 'Int' });
  const prefs = await ensureUserPreferences(u.id);
  await updateUserPreferences(u.id, { configured: true, jobSector: 'Cybersécurité', contractTypes: ['Alternance'], countries: ['France'] });
  const updated = await ensureUserPreferences(u.id);
  assert.equal(updated.configured, true);

  // upsert a job that should match
  const job = await upsertJob({
    source: 'integration_mock',
    sourceJobId: 'job-1',
    title: 'Alternance Cybersécurité Paris',
    company: 'Acme',
    description: '',
    url: 'https://example.com/job/1',
    country: 'fr',
    region: 'ile-de-france',
    city: 'paris',
    contractTypes: ['Alternance'],
    fingerprint: 'fp-1',
  });

  const m = matchJobToPreferences(job as any, updated as any);
  assert.notEqual(m.outcome, 'no_match');

  // simulate notification
  const already = await hasJobBeenNotified(u.id, job.id as number);
  assert.equal(already, false);
  await recordUserJobNotification(u.id, job.id as number, 'immediate');
  const after = await hasJobBeenNotified(u.id, job.id as number);
  assert.equal(after, true);

  // upsert source status and update run
  await upsertSourceStatus({ sourceId: 'integration_mock', name: 'Integration Mock', enabled: true, status: 'ok' });
  const updatedStatus = await updateSourceRunStatus('integration_mock', { lastRunAt: new Date(), lastCountFetched: 1, lastCountNew: 1, status: 'ok' });
  assert(updatedStatus !== null);
});
