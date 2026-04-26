#!/usr/bin/env bash
# Bootstrap script for Oracle Cloud A1 (ARM) personal crawler deployment.
#
# Run this once on a fresh Ubuntu 22.04 ARM instance:
#   curl -fsSL https://raw.githubusercontent.com/developedbywt/jobseek/main/deploy/oracle/setup.sh | bash
#
# Or: scp this file to the VM and run it directly.
set -euo pipefail

REPO_URL="https://github.com/developedbywt/jobseek.git"
DEPLOY_DIR="/home/ubuntu/jobseek"
CRAWLER_DIR="$DEPLOY_DIR/apps/crawler"

echo "==> Installing Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker ubuntu
  echo "Docker installed. You may need to log out and back in for group changes."
fi

echo "==> Installing git (if missing)..."
sudo apt-get update -qq && sudo apt-get install -y git

echo "==> Cloning repo..."
if [ -d "$DEPLOY_DIR" ]; then
  echo "  Repo already exists — pulling latest..."
  git -C "$DEPLOY_DIR" pull
else
  git clone "$REPO_URL" "$DEPLOY_DIR"
fi

echo "==> Setting up environment..."
cd "$DEPLOY_DIR/deploy/oracle"
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "  ⚠️  EDIT .env NOW before continuing!"
  echo "  Fill in POSTGRES_PASSWORD and ENRICH_API_KEY:"
  echo ""
  echo "    nano $DEPLOY_DIR/deploy/oracle/.env"
  echo ""
  read -p "Press Enter once you've edited .env..."
fi

echo "==> Building crawler image (this takes ~3 minutes on A1)..."
cd "$CRAWLER_DIR"
docker build --target slim -t crawler-slim:latest .

echo "==> Starting services..."
cd "$DEPLOY_DIR/deploy/oracle"
docker compose up -d postgres redis

echo "==> Waiting for Postgres to be ready..."
until docker compose exec -T postgres pg_isready -U crawler -d crawler &>/dev/null; do
  echo "  Waiting for Postgres..."
  sleep 2
done

echo "==> Running migrations and seeding Redis..."
docker compose run --rm migrate

echo "==> Starting crawler workers..."
docker compose up -d worker-1 worker-2

echo "==> Setting up Phase 1 alert cron (every 6 hours)..."
# Runs mark-candidates then enrich-local in a fresh container using the
# same image and env as the workers, but exits when done (--rm, restart: no).
ALERT_SCRIPT="$DEPLOY_DIR/deploy/oracle/run-alert.sh"
cat > "$ALERT_SCRIPT" <<'ALERTEOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "[$(date)] alert pipeline starting"
docker compose run --rm --no-deps worker-1 sh -c \
  'uv run --no-sync crawler mark-candidates && uv run --no-sync crawler enrich-local --max-concurrent 5'
echo "[$(date)] alert pipeline done"
ALERTEOF
chmod +x "$ALERT_SCRIPT"
(crontab -l 2>/dev/null || true; echo "0 */6 * * * $ALERT_SCRIPT >> /var/log/alert-pipeline.log 2>&1") | sort -u | crontab -

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Useful commands:"
echo "  docker compose -f $DEPLOY_DIR/deploy/oracle/docker-compose.yml logs -f worker-1"
echo "  docker compose -f $DEPLOY_DIR/deploy/oracle/docker-compose.yml ps"
echo ""
echo "Manual alert pipeline run:"
echo "  cd $DEPLOY_DIR/deploy/oracle"
echo "  docker compose run --rm worker-1 uv run --no-sync crawler mark-candidates"
echo "  docker compose run --rm worker-1 uv run --no-sync crawler enrich-local"
echo "  docker compose run --rm worker-1 uv run --no-sync crawler alert --format table"
