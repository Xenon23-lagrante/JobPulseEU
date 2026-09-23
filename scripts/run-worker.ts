import worker from "../lib/jobs/src/worker.js";

async function main() {
  // allow passing TELEGRAM_BOT_TOKEN via env or rely on existing env
  await worker.runWorkerOnce({});
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
