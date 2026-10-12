#!/usr/bin/env bash
# Deploys Frilensa to Cloud Run and then the Firestore security rules, without touching data.
# Run from the repo root in Google Cloud Shell (already signed in as you):
#
#   bash scripts/deploy.sh
#
# Steps, in this order (the new app works with the old rules, but not the other way round):
#   1. Export a full Firestore backup to gs://<project>-backups/<timestamp>
#   2. Build the image with Cloud Build and update the existing Cloud Run service, keeping its settings
#   3. Check /api/health reports the version in package.json
#   4. Schedule the daily automation job (Cloud Scheduler: retainer invoices and overdue reminders)
#   5. Publish firestore.rules (the previous ruleset name is printed for rollback)
#
# Optional overrides:
#   RUN_PROJECT=<project hosting the Cloud Run service, if not the Firebase project>
#   SERVICE=<cloud run service> REGION=<region> ADMIN_EMAILS=a@b.com,c@d.com
#   IMAGE=<image already built by an earlier run>   (skips the Cloud Build step)
#   SCHEDULER_REGION=<Cloud Scheduler location>     (defaults to REGION)
#   APP_URL=<public address>                        (defaults to https://frilensa.com; used in emails and links)
#   FILES_BUCKET=<bucket for receipts>              (defaults to <PROJECT>-files, created if missing)
#   ALLOW_LOCAL_CHANGES=1   deploy this folder even if it differs from GitHub (not recommended)
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

# --- Safety check: deploy exactly what is on GitHub ---
# The build uploads this folder as-is, so refuse to continue if it differs from origin/main.
if [[ "${ALLOW_LOCAL_CHANGES:-}" == "1" ]]; then
  echo "WARNING: ALLOW_LOCAL_CHANGES=1 set; deploying this folder even if it differs from GitHub."
else
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "This folder isn't a git clone of the Frilensa repo. Clone it from GitHub and run the script there."; exit 1
  fi
  DIRTY="$(git status --porcelain)"
  if [[ -n "$DIRTY" ]]; then
    echo "This folder has changes that aren't on GitHub:"
    echo "$DIRTY"
    echo "Commit and push them (or discard them with: git checkout -- . && git clean -fd), then run again."
    exit 1
  fi
  git fetch --quiet origin main
  LOCAL_SHA="$(git rev-parse HEAD)"; REMOTE_SHA="$(git rev-parse origin/main)"
  if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
    if git merge-base --is-ancestor HEAD origin/main; then
      echo "This folder is behind GitHub. Run: git pull   then run the script again."
    else
      echo "This folder has commits that aren't on GitHub ($(git rev-parse --short HEAD) vs $(git rev-parse --short origin/main)). Push them first."
    fi
    exit 1
  fi
fi
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "Deploying commit $COMMIT: $(git log -1 --format=%s 2>/dev/null || true)"

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
say "1/5 Backing up Firestore database $DATABASE to $BUCKET/$STAMP"
if ! gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "$BUCKET" --location="$REGION" --uniform-bucket-level-access
fi
gcloud firestore export "$BUCKET/$STAMP" --database="$DATABASE"
echo "Backup written. Restore if ever needed with:"
echo "  gcloud firestore import $BUCKET/$STAMP --database=$DATABASE"

# --- 2. Deploy app ---
say "2/5 Deploying app v$VERSION to Cloud Run (existing settings are kept)"
WORK="$(mktemp -d)"
gcloud run services describe "$SERVICE" --project "$RUN_PROJECT" --region "$REGION" --format=json > "$WORK/current.json"
PREVIOUS_REVISION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("status",{}).get("latestReadyRevisionName",""))' "$WORK/current.json")"
echo "Current revision (for rollback): ${PREVIOUS_REVISION:-unknown}"

# Always rewrite (or remove) the build-time settings file so a leftover from an earlier run can't leak in.
rm -f .env.production
if [[ -n "${ADMIN_EMAILS:-}" ]]; then
  echo "VITE_ADMIN_EMAILS=$ADMIN_EMAILS" > .env.production
fi

# The new server reads Firestore directly (client portal, directory, document links), so the
# service's identity needs access to the database project. This only adds a permission.
SA="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["spec"]["template"]["spec"].get("serviceAccountName",""))' "$WORK/current.json")"
if [[ -z "$SA" ]]; then
  SA="$(gcloud projects describe "$RUN_PROJECT" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
fi
echo "Service runs as: $SA"
if ! gcloud projects get-iam-policy "$PROJECT" --flatten='bindings[].members' \
     --filter="bindings.role=roles/datastore.user AND bindings.members=serviceAccount:$SA" --format='value(bindings.role)' | grep -q datastore; then
  echo "Granting it Cloud Datastore User on $PROJECT so it can read and write Firestore."
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role=roles/datastore.user --condition=None >/dev/null
fi

# Receipts and other files live in a private Cloud Storage bucket in the database project.
FILES_BUCKET="${FILES_BUCKET:-${PROJECT}-files}"
if ! gcloud storage buckets describe "gs://$FILES_BUCKET" >/dev/null 2>&1; then
  echo "Creating private bucket gs://$FILES_BUCKET for receipts."
  gcloud storage buckets create "gs://$FILES_BUCKET" --project "$PROJECT" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention
fi
if ! gcloud storage buckets get-iam-policy "gs://$FILES_BUCKET" --format=json 2>/dev/null | grep -q "serviceAccount:$SA"; then
  echo "Letting the service read and write receipts in gs://$FILES_BUCKET."
  gcloud storage buckets add-iam-policy-binding "gs://$FILES_BUCKET" --member="serviceAccount:$SA" --role=roles/storage.objectAdmin >/dev/null
fi

# The assistant uses Claude. Its API key is kept in Secret Manager (secret "anthropic-api-key").
ASSISTANT_ENV=()
gcloud services enable secretmanager.googleapis.com --project "$RUN_PROJECT" >/dev/null
if ! gcloud secrets describe anthropic-api-key --project "$RUN_PROJECT" >/dev/null 2>&1; then
  echo "The assistant needs an Anthropic API key (create one at https://console.anthropic.com/settings/keys)."
  read -rsp "Paste it here and press Enter (it won't be shown), or just press Enter to skip: " ANTHROPIC_KEY; echo
  if [[ -n "$ANTHROPIC_KEY" ]]; then
    printf '%s' "$ANTHROPIC_KEY" | gcloud secrets create anthropic-api-key --project "$RUN_PROJECT" --replication-policy=automatic --data-file=- >/dev/null
    echo "Saved the key as secret anthropic-api-key."
  else
    echo "Skipped. The assistant will say it isn't set up until you add the key and deploy again."
  fi
  unset ANTHROPIC_KEY
fi
if gcloud secrets describe anthropic-api-key --project "$RUN_PROJECT" >/dev/null 2>&1; then
  gcloud secrets add-iam-policy-binding anthropic-api-key --project "$RUN_PROJECT" \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null
  ASSISTANT_ENV=("ANTHROPIC_API_KEY@=anthropic-api-key")
fi

confirm "Build v$VERSION and deploy it? (A new Cloud Run revision is created; the current one stays available for rollback.)"

# Build the container with Cloud Build into Artifact Registry. (AI Studio's source-deploy
# annotations make `gcloud run deploy --source` fail, so the image is built separately.)
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$RUN_PROJECT"
if ! gcloud artifacts repositories describe frilensa --project "$RUN_PROJECT" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create frilensa --project "$RUN_PROJECT" --location "$REGION" \
    --repository-format=docker --description="Frilensa app images"
fi
if [[ -n "${IMAGE:-}" ]]; then
  echo "Using the already built image $IMAGE (skipping the build)."
  # Tags look like <version>-<timestamp>; the health check should expect that image's version.
  TAG="${IMAGE##*:}"; VERSION="${TAG%%-*}"
else
  IMAGE="$REGION-docker.pkg.dev/$RUN_PROJECT/frilensa/app:$VERSION-$STAMP-$COMMIT"
  gcloud builds submit --project "$RUN_PROJECT" --tag "$IMAGE" .
fi
rm -f .env.production

# The daily job is called with a shared secret. Keep the service's existing one; create it the first time.
JOBS_SECRET="$(python3 -c '
import json, sys
env = json.load(open(sys.argv[1]))["spec"]["template"]["spec"]["containers"][0].get("env", [])
print(next((e.get("value", "") for e in env if e.get("name") == "JOBS_SECRET"), ""))' "$WORK/current.json")"
JOBS_SECRET="${JOBS_SECRET:-$(openssl rand -hex 32)}"

# Update the service from its own current configuration with only the image (and missing env vars) changed.
# PAYMENT_SECRETS_KEY encrypts saved PayPal keys. It is created once and never changed: a new key would disconnect every PayPal account.
python3 scripts/prepare_service.py "$WORK/current.json" "$IMAGE" "$WORK/next.json" \
  "PORTAL_SESSION_SECRET=$(openssl rand -hex 32)" "APP_URL:=${APP_URL:-https://frilensa.com}" "JOBS_SECRET=$JOBS_SECRET" "FILES_BUCKET:=$FILES_BUCKET" "PAYMENT_SECRETS_KEY=$(openssl rand -hex 32)" ${ADMIN_EMAILS:+"ADMIN_EMAILS:=$ADMIN_EMAILS"} "${ASSISTANT_ENV[@]}"
gcloud run services replace "$WORK/next.json" --project "$RUN_PROJECT" --region "$REGION"

# --- 3. Health check ---
say "3/5 Checking the new version is live"
for _ in $(seq 1 20); do
  HEALTH="$(curl -fsS "$URL/api/health" 2>/dev/null || true)"
  grep -q "\"version\":\"$VERSION\"" <<<"$HEALTH" && break
  sleep 3
done
echo "Health: ${HEALTH:-no response}"
if ! grep -q "\"version\":\"$VERSION\"" <<<"${HEALTH:-}"; then
  echo "The new version did not report healthy. Rules were NOT changed."
  echo "Roll back with: gcloud run services update-traffic $SERVICE --project $RUN_PROJECT --region $REGION --to-revisions=${PREVIOUS_REVISION:-PREVIOUS_REVISION}=100"
  exit 1
fi

# --- 4. Daily automation schedule ---
SCHEDULER_REGION="${SCHEDULER_REGION:-$REGION}"
say "4/5 Scheduling the daily automation job (8:00 am Fiji time, $SCHEDULER_REGION)"
echo "It creates retainer invoices that are due and, for users who switch them on, emails invoices and overdue reminders."
gcloud services enable cloudscheduler.googleapis.com --project "$RUN_PROJECT" || true
JOB_FLAGS=(--project "$RUN_PROJECT" --location "$SCHEDULER_REGION" --schedule "0 8 * * *" --time-zone "Pacific/Fiji"
  --uri "$URL/api/jobs/daily" --http-method POST --attempt-deadline 600s)
if gcloud scheduler jobs describe frilensa-daily --project "$RUN_PROJECT" --location "$SCHEDULER_REGION" >/dev/null 2>&1; then
  JOB_OK=0; gcloud scheduler jobs update http frilensa-daily "${JOB_FLAGS[@]}" --update-headers "X-Job-Secret=$JOBS_SECRET" >/dev/null || JOB_OK=$?
else
  JOB_OK=0; gcloud scheduler jobs create http frilensa-daily "${JOB_FLAGS[@]}" --headers "X-Job-Secret=$JOBS_SECRET" >/dev/null || JOB_OK=$?
fi
if [[ "$JOB_OK" == "0" ]]; then
  echo "Scheduled job frilensa-daily is set. Test it any time with:"
  echo "  gcloud scheduler jobs run frilensa-daily --project $RUN_PROJECT --location $SCHEDULER_REGION"
else
  echo "WARNING: could not set up the scheduled job (the app is deployed and working)."
  echo "Rerun with SCHEDULER_REGION=<a Cloud Scheduler location, e.g. asia-northeast1> to try another region."
fi

# --- 5. Firestore rules ---
say "5/5 Publishing firestore.rules for database $DATABASE"
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
if [[ -n "$PREVIOUS" ]]; then echo "Rules rollback: re-run step 5 with rulesetName=$PREVIOUS"; fi
