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
# Optional overrides:
#   RUN_PROJECT=<project hosting the Cloud Run service, if not the Firebase project>
#   SERVICE=<cloud run service> REGION=<region> ADMIN_EMAILS=a@b.com,c@d.com
set -euo pipefail

PROJECT="${PROJECT:-frilensa-f530d}"          # Firebase project: Firestore database and rules
RUN_PROJECT="${RUN_PROJECT:-}"                # project that hosts the Cloud Run service (found automatically from SERVICE)"
DATABASE="${DATABASE:-ai-studio-fijifreelancercr-488dac79-8760-4f11-adaa-51019cc03ebb}"
VERSION="$(node -p "require('./package.json').version")"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
confirm() { read -r -p "$1 [y/N] " reply; [[ "$reply" =~ ^[Yy]$ ]] || { echo "Stopped."; exit 1; }; }

if [[ "$RUN_PROJECT" =~ [[:space:]] ]]; then
  echo "RUN_PROJECT must be a single project ID, got: $RUN_PROJECT"; exit 1
fi
# Find which project hosts the service (AI Studio deploys into its own project, e.g. gen-lang-client-…).
if [[ -z "$RUN_PROJECT" && -n "${SERVICE:-}" ]]; then
  echo "Looking for Cloud Run service '$SERVICE' in your projects…"
  FOUND=()
  for p in $(gcloud projects list --format='value(projectId)'); do
    if gcloud run services list --project "$p" --quiet --format='value(metadata.name)' 2>/dev/null | grep -qx "$SERVICE"; then
      FOUND+=("$p")
    fi
  done
  if (( ${#FOUND[@]} == 1 )); then
    RUN_PROJECT="${FOUND[0]}"
    echo "Found it in project $RUN_PROJECT."
  elif (( ${#FOUND[@]} == 0 )); then
    echo "No Cloud Run service named '$SERVICE' in any of your projects."; exit 1
  else
    echo "'$SERVICE' exists in several projects: ${FOUND[*]}"
    echo "Rerun with RUN_PROJECT=<the one serving frilensa.com>."; exit 1
  fi
fi
RUN_PROJECT="${RUN_PROJECT:-$PROJECT}"
gcloud config set project "$PROJECT" >/dev/null
say "Deploying Frilensa v$VERSION (app in $RUN_PROJECT, database in $PROJECT)"

# --- Find the Cloud Run service that serves frilensa.com ---
if [[ -z "${SERVICE:-}" || -z "${REGION:-}" ]]; then
  SERVICES="$(gcloud run services list --project "$RUN_PROJECT" --quiet --format='value(metadata.name)' 2>/dev/null || true)"
  if [[ -z "$SERVICES" ]]; then
    echo "No Cloud Run services found in project $RUN_PROJECT."
    echo "If frilensa.com runs in another project, rerun with RUN_PROJECT=<that project id>."
    exit 1
  fi
  echo "Cloud Run services in $RUN_PROJECT:"
  gcloud run services list --project "$RUN_PROJECT" --format="table(metadata.name,region,status.url)"
  read -r -p "Service name to update: " SERVICE
  REGION="$(gcloud run services list --project "$RUN_PROJECT" --filter="metadata.name=$SERVICE" --format='value(region)' | head -n1)"
  [[ -n "$REGION" ]] || { echo "Service '$SERVICE' not found."; exit 1; }
fi
URL="$(gcloud run services describe "$SERVICE" --project "$RUN_PROJECT" --region "$REGION" --format='value(status.url)')"
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
EXISTING_ENV="$(gcloud run services describe "$SERVICE" --project "$RUN_PROJECT" --region "$REGION" --format=json)"
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
# Building from source uses Cloud Build and Artifact Registry in the service's project.
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$RUN_PROJECT"
DEPLOY_ARGS=(run deploy "$SERVICE" --project "$RUN_PROJECT" --source . --region "$REGION" --quiet)
if (( ${#ENV_UPDATES[@]} )); then
  DEPLOY_ARGS+=(--update-env-vars "$(IFS=,; echo "${ENV_UPDATES[*]}")")
fi
# The new server reads Firestore directly (client portal, directory, document links), so the
# service's identity needs access to the database project. This only adds a permission.
SA="$(gcloud run services describe "$SERVICE" --project "$RUN_PROJECT" --region "$REGION" --format='value(spec.template.spec.serviceAccountName)')"
if [[ -z "$SA" ]]; then
  SA="$(gcloud projects describe "$RUN_PROJECT" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
fi
echo "Service runs as: $SA"
if ! gcloud projects get-iam-policy "$PROJECT" --flatten='bindings[].members' \
     --filter="bindings.role=roles/datastore.user AND bindings.members=serviceAccount:$SA" --format='value(bindings.role)' | grep -q datastore; then
  echo "Granting it Cloud Datastore User on $PROJECT so it can read and write Firestore."
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role=roles/datastore.user --condition=None >/dev/null
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
  echo "Roll back with: gcloud run services update-traffic $SERVICE --project $RUN_PROJECT --region $REGION --to-revisions=PREVIOUS_REVISION=100"
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
