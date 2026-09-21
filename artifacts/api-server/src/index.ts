import app from "./app";
import { logger } from "./lib/logger";
import { JobAlertBot } from "./telegram/bot";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

const telegramToken = process.env["TELEGRAM_BOT_TOKEN"];
const telegramBot = telegramToken ? new JobAlertBot(telegramToken) : undefined;

if (telegramBot) {
  void telegramBot.start().catch((error: unknown) => {
    logger.error({ err: error }, "JobAlert Telegram bot failed to start");
  });
} else {
  logger.warn(
    "TELEGRAM_BOT_TOKEN is not configured; Telegram bot is disabled",
  );
}

const shutdown = (): void => {
  telegramBot?.stop();
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "Error closing server");
      process.exitCode = 1;
    }
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
