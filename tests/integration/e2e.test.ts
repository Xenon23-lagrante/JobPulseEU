import test from "node:test";
import assert from "node:assert/strict";

test('integration: DB connection available via DATABASE_URL', async () => {
  if (!process.env.DATABASE_URL) {
    test.skip('DATABASE_URL not set, skipping integration test');
    return;
  }

  // lazy import to avoid DB module loading when DATABASE_URL unset
  const { pool } = await import('../../lib/db/src/index.js').catch(() => ({} as any));
  assert(pool, 'Expected DB pool to be available when DATABASE_URL is set');

  const client = await pool.connect();
  try {
    const res = await client.query('SELECT 1 as ok');
    assert.equal(res.rows[0].ok, 1);
  } finally {
    client.release();
  }
});
