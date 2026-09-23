# Job Pulse Alerts

Job Pulse Alerts — repository for job matching and Telegram alerts.

See `.env.example` for required environment variables.

# Quickstart (local)

Prerequisites: Docker (for Postgres), Node 20, pnpm

1. Start Postgres and apply migrations (PowerShell):

```powershell
.\scripts\setup-postgres.ps1
$env:DATABASE_URL = "postgres://jpa:pass@localhost:5432/jpa"
```

Or on Linux/macOS:

```bash
./scripts/setup-postgres.sh
export DATABASE_URL=postgres://jpa:pass@localhost:5432/jpa
```

2. Install dependencies and run tests:

```bash
pnpm install
npx tsx --test
```

3. Run the bot locally (requires `TELEGRAM_BOT_TOKEN`):

```bash
export TELEGRAM_BOT_TOKEN=...
export DATABASE_URL=postgres://jpa:pass@localhost:5432/jpa
node -e "import('./artifacts/api-server/src/index.js').then(m=>m.start())"
```

Security note: do NOT commit your bot token. Create a local `.env` (already ignored by `.gitignore`) with `TELEGRAM_BOT_TOKEN=...` for local development, and use GitHub Actions secrets (`TELEGRAM_BOT_TOKEN`) for CI deployments.

