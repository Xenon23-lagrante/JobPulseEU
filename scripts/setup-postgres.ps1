Param(
  [string]$ContainerName = 'jpa-test-db',
  [string]$PostgresUser = 'jpa',
  [string]$PostgresPassword = 'pass',
  [string]$PostgresDb = 'jpa',
  [string]$PostgresImage = 'postgres:15'
)

function Ensure-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker does not appear to be installed or in PATH. Install Docker Desktop and re-run this script."
    exit 1
  }
}

Ensure-Docker

# Start container if not already running
$exists = docker ps -a --format "{{.Names}}" | Select-String -Pattern "^$ContainerName$"
if (-not $exists) {
  docker run --name $ContainerName -e POSTGRES_PASSWORD=$PostgresPassword -e POSTGRES_USER=$PostgresUser -e POSTGRES_DB=$PostgresDb -p 5432:5432 -d $PostgresImage
} else {
  $running = docker ps --format "{{.Names}}" | Select-String -Pattern "^$ContainerName$"
  if (-not $running) {
    docker start $ContainerName
  }
}

Write-Output "Waiting for Postgres to accept connections..."
for ($i=0; $i -lt 30; $i++) {
  try {
    docker exec -i $ContainerName psql -U $PostgresUser -d $PostgresDb -c "SELECT 1;" > $null 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Output "Postgres ready."; break }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if ($LASTEXITCODE -ne 0) {
  Write-Error "Postgres did not become ready in time. Check container logs: docker logs $ContainerName"
  exit 1
}

# Apply migrations: run all .sql files in lib/db/migrations in alphabetical order
$migrations = Get-ChildItem -Path .\lib\db\migrations -Filter *.sql | Sort-Object Name
if ($migrations.Count -eq 0) { Write-Warning "No migration files found in lib/db/migrations"; exit 0 }

foreach ($m in $migrations) {
  Write-Output "Applying migration $($m.Name)"
  type $m.FullName | docker exec -i $ContainerName psql -U $PostgresUser -d $PostgresDb
  if ($LASTEXITCODE -ne 0) { Write-Error "Migration $($m.Name) failed"; exit 1 }
}

Write-Output "Migrations applied. You can set DATABASE_URL in your shell as follows (PowerShell):"
Write-Output "$env:DATABASE_URL = \"postgres://$PostgresUser:$PostgresPassword@localhost:5432/$PostgresDb\""
