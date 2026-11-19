#!/usr/bin/env bash
# Runs database/init/*.js against a real, throwaway MongoDB and checks the
# results. The unit tests cover the same scripts with an in-memory stand-in;
# this proves they behave the same in mongosh against a real server, where the
# validators actually reject bad writes.
#
#   scripts/db/check-init-scripts.sh      # needs Docker; used by CI
#
# Checks: validators and indexes apply, and re-apply via collMod; the demo
# seed passes every validator, is idempotent, refuses a database with a real
# user, and its removal mode deletes only demo documents.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="${MONGO_IMAGE:-mongo:7}"
NAME="phishaware-init-check-$$"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$NAME" -v "$ROOT/database/init:/init:ro" "$IMAGE" >/dev/null
for _ in $(seq 1 30); do
  docker exec "$NAME" mongosh --quiet --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1 && break
  sleep 1
done

run() {
  docker exec -e "DEMO_SEED_FORCE=${FORCE:-}" -e "DEMO_SEED_REMOVE=${REMOVE:-}" "$NAME" mongosh --quiet "$@"
}
count() { run --eval "print(db.getSiblingDB('phishaware').getCollection('$1').countDocuments({}))"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

echo "== schema, twice (create, then collMod)"
for _ in 1 2; do
  run /init/01-validators.js >/dev/null
  run /init/02-indexes.js >/dev/null
done

echo "== demo seed, twice"
run /init/03-seed.js >/dev/null
first="$(count users) $(count attempts) $(count consents)"
run /init/03-seed.js >/dev/null
second="$(count users) $(count attempts) $(count consents)"
[ "$first" = "$second" ] || fail "re-seeding changed document counts ($first -> $second)"
[ "$(count organizations)" = 1 ] || fail "expected one demo organization"

echo "== guard: refuses once a real user exists"
run --eval 'db.getSiblingDB("phishaware").users.insertOne({ userId: ObjectId(), orgId: null, email: "real@person.test", name: "Real", role: "employee" })' >/dev/null
if run /init/03-seed.js >/dev/null 2>&1; then fail "seeded a database that has a real user"; fi
FORCE=1 run /init/03-seed.js >/dev/null || fail "DEMO_SEED_FORCE=1 did not override the guard"

echo "== removal deletes only demo documents"
REMOVE=1 run /init/03-seed.js >/dev/null
[ "$(count users)" = 1 ] || fail "removal should leave exactly the real user"
for c in organizations attempts campaigns invitations surveyResponses; do
  [ "$(count "$c")" = 0 ] || fail "removal left documents in $c"
done

echo "OK: database/init scripts behave as documented"
