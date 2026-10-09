#!/usr/bin/env bash
# Deploys Frilensa to Cloud Run and then the Firestore security rules, without touching data.
# Run from the repo root in Google Cloud Shell (already signed in as you):
#
#   bash scripts/deploy.sh
#
# Steps, in this order (the new app works with the old rules, but not the other way round):
#   1. Export a full Firestore backup to gs://<project>-backups/<timestamp>
#   2. Deploy the app to the existing Cloud Run service, keeping its env vars and secrets
#   3. Check /api/health reports the version in package.json
#   4. Publish firestore.rules (the previous ruleset name is printed for rollback)
#
# Optional overrides: SERVICE=<cloud run service> REGION=<region> ADMIN_EMAILS=a@b.com,c@d.com bash scripts/deploy.sh
set -euo pipefail

PROJECT="${PROJECT:-frilensa-f530d}"
DATABASE="${DATABASE:-ai-studio-fijifreelancercr-488dac79-8760-4f11-adaa-51019cc03ebb}"
VERSION="$(node -p "require('./package.json').version")"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
confirm() { read -r -p "$1 [y/N] " reply; [[ "$reply" =~ ^[Yy]$ ]] || { echo "Stopped."; exit 1; }; }

gcloud config set project "$PROJECT" >/dev/null
say "Deploying Frilensa v$VERSION to project $PROJECT"

# --- Find the Cloud Run service that serves frilensa.com ---
if [[ -z "${SERVICE:-}" || -z "${REGION:-}" ]]; then
  echo "Cloud Run services in $PROJECT:"
  gcloud run services list --format="table(metadata.name,region,status.url)"
  read -r -p "Service name to update: " SERVICE
  REGION="$(gcloud run services list --filter="metadata.name=$SERVICE" --format='value(region)' | head -n1)"
  [[ -n "$REGION" ]] || { echo "Service '$SERVICE' not found."; exit 1; }
fi
URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo "Service: $SERVICE ($REGION) at $URL"
echo "Currently live: $(curl -fsS "$URL/api/health" 2>/dev/null || echo 'unknown (older version without a version number)')"

# --- 1. Backup ---
BUCKET="gs://${PROJECT}-backups"
say "1/4 Backing up Firestore database $DATABASE to $BUCKET/$STAMP"
if ! gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "$BUCKET" --location="$REGION" --uniform-bucket-level-access
fi
gcloud firestore export "$BUCKET/$STAMP" --database="$DATABASE"
echo "Backup written. Restore if ever needed with:"
echo "  gcloud firestore import $BUCKET/$STAMP --database=$DATABASE"

# --- 2. Deploy app ---
say "2/4 Deploying app v$VERSION to Cloud Run (existing env vars are kept)"
ENV_UPDATES=()
EXISTING_ENV="$(gcloud run services describe "$SERVICE" --region "$REGION" --format=json)"
if ! grep -q '"PORTAL_SESSION_SECRET"' <<<"$EXISTING_ENV"; then
  ENV_UPDATES+=("PORTAL_SESSION_SECRET=$(openssl rand -hex 32)")
  echo "Adding a new PORTAL_SESSION_SECRET."
fi
if ! grep -q '"APP_URL"' <<<"$EXISTING_ENV"; then
  ENV_UPDATES+=("APP_URL=https://frilensa.com")
fi
if [[ -n "${ADMIN_EMAILS:-}" ]]; then
  echo "VITE_ADMIN_EMAILS=$ADMIN_EMAILS" > .env.production
fi
DEPLOY_ARGS=(run deploy "$SERVICE" --source . --region "$REGION" --quiet)
if (( ${#ENV_UPDATES[@]} )); then
  DEPLOY_ARGS+=(--update-env-vars "$(IFS=,; echo "${ENV_UPDATES[*]}")")
fi
confirm "Deploy now? (A new Cloud Run revision is created; the previous one stays available for rollback.)"
gcloud "${DEPLOY_ARGS[@]}"
rm -f .env.production

# --- 3. Health check ---
say "3/4 Checking the new version is live"
for _ in $(seq 1 20); do
  HEALTH="$(curl -fsS "$URL/api/health" 2>/dev/null || true)"
  grep -q "\"version\":\"$VERSION\"" <<<"$HEALTH" && break
  sleep 3
done
echo "Health: ${HEALTH:-no response}"
if ! grep -q "\"version\":\"$VERSION\"" <<<"${HEALTH:-}"; then
  echo "The new version did not report healthy. Rules were NOT changed."
  echo "Roll back with: gcloud run services update-traffic $SERVICE --region $REGION --to-revisions=PREVIOUS_REVISION=100"
  exit 1
fi

# --- 4. Firestore rules ---
say "4/4 Publishing firestore.rules for database $DATABASE"
TOKEN="$(gcloud auth print-access-token)"
API="https://firebaserules.googleapis.com/v1/projects/$PROJECT"
RELEASE="projects/$PROJECT/releases/cloud.firestore/$DATABASE"
PREVIOUS="$(curl -fsS -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT" "https://firebaserules.googleapis.com/v1/$RELEASE" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("rulesetName",""))' || true)"
echo "Previous ruleset (for rollback): ${PREVIOUS:-none}"
BODY="$(python3 -c 'import json; print(json.dumps({"source": {"files": [{"name": "firestore.rules", "content": open("firestore.rules").read()}]}}))')"
RULESET="$(curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT" -H 'Content-Type: application/json' \
  "$API/rulesets" -d "$BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
echo "New ruleset: $RULESET"
confirm "Publish the new rules?"
RELEASE_BODY="{\"release\":{\"name\":\"$RELEASE\",\"rulesetName\":\"$RULESET\"}}"
if [[ -n "$PREVIOUS" ]]; then
  curl -fsS -X PATCH -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT" -H 'Content-Type: application/json' \
    "https://firebaserules.googleapis.com/v1/$RELEASE" -d "$RELEASE_BODY" >/dev/null
else
  curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT" -H 'Content-Type: application/json' \
    "$API/releases" -d "{\"name\":\"$RELEASE\",\"rulesetName\":\"$RULESET\"}" >/dev/null
fi

say "Done: v$VERSION is live and the database is locked down."
echo "Backup:   $BUCKET/$STAMP"
if [[ -n "$PREVIOUS" ]]; then echo "Rules rollback: re-run step 4 with rulesetName=$PREVIOUS"; fi
