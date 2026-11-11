#!/usr/bin/env bash
# Deploy, verify and (if needed) roll back Lakify on the pipeline's Kind cluster.
#
#   1. Deploy the last known-good version (image tag "stable") with all its
#      dependencies: PostgreSQL, Prometheus and Grafana.
#   2. Roll out the new commit's images as a rolling update.
#   3. Verify the new version: the rollout must finish in time and the smoke
#      test (browser -> nginx -> API -> PostgreSQL) must pass.
#   4. If verification fails, roll back with `kubectl rollout undo`, verify
#      the previous version again and record the time to recover (MTTR).
#   5. If it passes, test self-healing, data persistence and monitoring.
#
# Every measured time is written to $RESULTS_FILE (JSON) for the evaluation.
#
# Required environment:
#   API_IMAGE, WEB_IMAGE   the new version's images (already loaded into Kind)
#   EXPECTED_SHA           short commit SHA the new API must report on /version
# Optional:
#   FAULT_MODE             none | unready | error  (failure experiments only)
#   ROLLOUT_TIMEOUT        how long a rollout may take (default 90s)
#   RESULTS_FILE           where to write the JSON results
#
# Exit codes: 0 deployed, 1 failed and rolled back, 2 rollback failed.

set -euo pipefail

NS=lakify
FAULT_MODE="${FAULT_MODE:-none}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-90s}"
RESULTS_FILE="${RESULTS_FILE:-deploy-results.json}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
: "${API_IMAGE:?}" "${WEB_IMAGE:?}" "${EXPECTED_SHA:?}"

k() { kubectl -n "$NS" "$@"; }
now() { date +%s.%N; }
secs() { awk -v a="$1" -v b="$2" 'BEGIN { printf "%.1f", b - a }'; }
group() { echo "::group::$*"; }
endgroup() { echo "::endgroup::"; }

declare -A R=([fault_mode]="\"$FAULT_MODE\"")
write_results() {
  local out="{" sep=""
  for key in "${!R[@]}"; do out+="$sep\"$key\": ${R[$key]}"; sep=", "; done
  echo "$out}" > "$RESULTS_FILE"
  echo "Results: $(cat "$RESULTS_FILE")"
}

# --- helpers --------------------------------------------------------------

PF_PID=""
stop_forward() { if [ -n "$PF_PID" ]; then kill "$PF_PID" 2>/dev/null || true; wait "$PF_PID" 2>/dev/null || true; PF_PID=""; fi; }
trap stop_forward EXIT

# forward <service> <service port> <local port> <readiness path>
forward() {
  stop_forward
  k port-forward "svc/$1" "$3:$2" > "/tmp/port-forward-$1.log" 2>&1 &
  PF_PID=$!
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null "localhost:$3$4" && return 0
    sleep 1
  done
  echo "port-forward to $1 did not become reachable"; cat "/tmp/port-forward-$1.log"
  return 1
}

# The smoke test exercises the whole chain the way a browser does: nginx
# serves the page, forwards /api/ to an API pod, which reads and writes
# PostgreSQL. Each check returns explicitly, because `set -e` is ignored
# inside a function called from an `if`.
smoke_test() {
  local label="$1" title="Smoke test $1 $(date +%s%N)"
  echo "Smoke test ($label)"
  forward lakify-web 80 8080 /healthz || return 1
  curl -fsS localhost:8080/ | grep -q "<title>Lakify</title>" || { echo "page not served"; return 1; }
  local code
  code=$(curl -s -o /tmp/smoke-post.json -w '%{http_code}' -X POST localhost:8080/api/listings \
    -H 'Content-Type: application/json' \
    -d "{\"title\":\"$title\",\"address\":\"Andrássy út 1\",\"district\":\"VI\",\"rent\":300000,\"size\":50,\"rooms\":2,\"photos\":[\"https://example.com/k.jpg\"]}")
  [ "$code" = "201" ] || { echo "create listing returned $code: $(cat /tmp/smoke-post.json)"; return 1; }
  curl -fsS localhost:8080/api/listings | grep -q "\"title\":\"$title\"" || { echo "listing not read back from the database"; return 1; }
  [ "$(curl -s -o /dev/null -w '%{http_code}' 'localhost:8080/api/listings?district=XXX')" = "400" ] || { echo "validation not working"; return 1; }
  stop_forward
  echo "Smoke test ($label) passed"
}

# The API must report the commit it was built from (traceability, NFR3).
version_check() {
  forward lakify-api 80 8081 /health || return 1
  local version
  version=$(curl -fsS localhost:8081/version) || return 1
  stop_forward
  echo "/version -> $version"
  echo "$version" | grep -q "\"commit\":\"$EXPECTED_SHA\""
}

rollout() { k rollout status "$1" --timeout="$2"; }

# wait_ready <deployment> <replicas> <seconds>
wait_ready() {
  for _ in $(seq 1 "$3"); do
    [ "$(k get deploy "$1" -o jsonpath='{.status.readyReplicas}')" = "$2" ] && return 0
    sleep 1
  done
  return 1
}

# --- 1. baseline: the last known-good version -----------------------------

group "Deploy baseline (stable) with database and monitoring"
kubectl apply -k k8s/overlays/kind
rollout statefulset/lakify-db 180s
rollout deployment/lakify-api 180s
rollout deployment/lakify-web 180s
endgroup

group "Verify baseline"
if ! smoke_test baseline; then
  echo "::error::The baseline (stable) version is not healthy, so a rollback target does not exist"
  R[outcome]='"baseline_failed"'; write_results; exit 2
fi
endgroup

# --- 2. roll out the new version -----------------------------------------

group "Roll out $API_IMAGE and $WEB_IMAGE (fault: $FAULT_MODE)"
t_start=$(now)
if [ "$FAULT_MODE" = none ]; then
  k set image deployment/lakify-api api="$API_IMAGE"
else
  # Change the image and inject the fault in one update, so it is a single rollout.
  k patch deployment lakify-api --type=strategic -p "{\"spec\":{\"template\":{\"spec\":{\"containers\":[{\"name\":\"api\",\"image\":\"$API_IMAGE\",\"env\":[{\"name\":\"FAULT_MODE\",\"value\":\"$FAULT_MODE\"}]}]}}}}"
fi
k set image deployment/lakify-web web="$WEB_IMAGE"
k annotate deployment/lakify-api deployment/lakify-web kubernetes.io/change-cause="commit $EXPECTED_SHA" --overwrite

failure=""
if ! rollout deployment/lakify-api "$ROLLOUT_TIMEOUT"; then
  failure="api rollout did not become ready within $ROLLOUT_TIMEOUT"
elif ! rollout deployment/lakify-web "$ROLLOUT_TIMEOUT"; then
  failure="web rollout did not become ready within $ROLLOUT_TIMEOUT"
elif ! version_check; then
  failure="new version does not report commit $EXPECTED_SHA"
elif ! smoke_test candidate; then
  failure="smoke test failed against the new version"
fi
t_verified=$(now)
endgroup

# --- 3. failed: roll back and measure the recovery -----------------------

if [ -n "$failure" ]; then
  echo "::error::Deployment failed: $failure. Rolling back."
  t_detect=$t_verified
  group "Roll back to the previous version"
  k rollout undo deployment/lakify-api
  k rollout undo deployment/lakify-web
  rollback_ok=true
  rollout deployment/lakify-api 180s || rollback_ok=false
  rollout deployment/lakify-web 180s || rollback_ok=false
  if $rollback_ok && smoke_test after-rollback; then
    t_recovered=$(now)
  else
    rollback_ok=false
  fi
  endgroup

  R[failure]="\"$failure\""
  R[time_to_detect_s]=$(secs "$t_start" "$t_detect")
  if $rollback_ok; then
    R[outcome]='"rolled_back"'
    R[time_to_recover_s]=$(secs "$t_detect" "$t_recovered")
    {
      echo "### Deployment failed and was rolled back"
      echo ""
      echo "| | |"
      echo "|---|---|"
      echo "| Fault injected | \`$FAULT_MODE\` |"
      echo "| Detected by | $failure |"
      echo "| Time to detect | ${R[time_to_detect_s]} s |"
      echo "| Time to recover (rollback verified) | ${R[time_to_recover_s]} s |"
    } >> "$SUMMARY"
    k rollout history deployment/lakify-api
    write_results; exit 1
  fi
  R[outcome]='"rollback_failed"'
  echo "::error::Rollback did not restore a healthy version"
  write_results; exit 2
fi

R[outcome]='"deployed"'
R[time_to_deploy_s]=$(secs "$t_start" "$t_verified")
echo "New version deployed and verified in ${R[time_to_deploy_s]} s"

# --- 4. resilience: self-healing and data persistence ---------------------

group "Self-healing: delete an API pod"
pod=$(k get pod -l app.kubernetes.io/name=lakify-api -o jsonpath='{.items[0].metadata.name}')
t0=$(now)
k delete pod "$pod" --wait=false
for _ in $(seq 1 60); do
  ready=$(k get deploy lakify-api -o jsonpath='{.status.readyReplicas}')
  current=$(k get pod -l app.kubernetes.io/name=lakify-api -o name | grep -vc "pod/$pod$" || true)
  [ "${ready:-0}" = "2" ] && [ "$current" = "2" ] && break
  sleep 1
done
R[self_heal_api_s]=$(secs "$t0" "$(now)")
echo "API back to 2 ready replicas after ${R[self_heal_api_s]} s"
endgroup

group "Persistence: restart the database and read the data back"
before=$(k exec statefulset/lakify-db -- psql -U lakify -d lakify -tAc 'SELECT count(*) FROM listings')
t0=$(now)
k delete pod lakify-db-0 --wait=true
rollout statefulset/lakify-db 180s
k wait --for=condition=Ready pod/lakify-db-0 --timeout=180s
after=$(k exec statefulset/lakify-db -- psql -U lakify -d lakify -tAc 'SELECT count(*) FROM listings')
# The API pods report not-ready while the database is down; wait for both.
wait_ready lakify-api 2 60 || { echo "::error::API did not become ready again after the database restart"; write_results; exit 2; }
R[db_recovery_s]=$(secs "$t0" "$(now)")
echo "Listings before restart: $before, after: $after (database back in ${R[db_recovery_s]} s)"
[ "$before" = "$after" ] || { echo "::error::Data was lost when the database pod restarted"; write_results; exit 2; }
R[persisted_listings]=$after
endgroup

group "Smoke test after the resilience tests"
smoke_test post-resilience || { echo "::error::Application unhealthy after resilience tests"; write_results; exit 2; }
endgroup

# --- 5. monitoring ---------------------------------------------------------

group "Monitoring: Prometheus scrapes both API pods, Grafana serves the dashboard"
rollout deployment/prometheus 180s
rollout deployment/grafana 180s
forward prometheus 9090 9090 /-/ready
up=0
for _ in $(seq 1 45); do
  up=$(curl -fsS 'localhost:9090/api/v1/query' --data-urlencode 'query=count(up{job="lakify-api"} == 1)' \
    | python3 -c 'import json,sys; r=json.load(sys.stdin)["data"]["result"]; print(r[0]["value"][1] if r else 0)')
  [ "$up" = "2" ] && break
  sleep 2
done
requests=$(curl -fsS 'localhost:9090/api/v1/query' --data-urlencode 'query=sum(http_requests_total)' \
  | python3 -c 'import json,sys; r=json.load(sys.stdin)["data"]["result"]; print(r[0]["value"][1] if r else 0)')
echo "API targets up: $up, requests recorded: $requests"
[ "$up" = "2" ] || { echo "::error::Prometheus is not scraping both API pods"; write_results; exit 2; }
R[prometheus_targets_up]=$up
forward grafana 3000 3001 /api/health
curl -fsS 'localhost:3001/api/search?query=Lakify' | grep -q '"uid":"lakify-api"' \
  || { echo "::error::Grafana dashboard not provisioned"; write_results; exit 2; }
stop_forward
echo "Grafana dashboard 'Lakify API — golden signals' is provisioned"
endgroup

{
  echo "### Deployment verified"
  echo ""
  echo "| Check | Result |"
  echo "|---|---|"
  echo "| Rolling update to \`$EXPECTED_SHA\` verified | ${R[time_to_deploy_s]} s |"
  echo "| API pod deleted, back to 2 ready replicas | ${R[self_heal_api_s]} s |"
  echo "| Database pod restarted, $after listings kept | ${R[db_recovery_s]} s |"
  echo "| Prometheus API targets up | $up |"
  echo "| Grafana dashboard provisioned | yes |"
} >> "$SUMMARY"

k rollout history deployment/lakify-api
write_results
