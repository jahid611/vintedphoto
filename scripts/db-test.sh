#!/usr/bin/env bash
# Rejoue le schéma Dripshot sur un Postgres local jetable et lance les tests
# fonctionnels : isolation RLS, débit atomique, idempotence du webhook.
#
# Rien ne touche au projet hébergé. Il faut juste un Postgres local :
#   sudo apt install postgresql        # ou: brew install postgresql
#
#   ./scripts/db-test.sh
#
# Variables : PSQL, DROPDB, CREATEDB, PGDATABASE_TEST (défaut dripshot_test).

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL="${PSQL:-psql}"
DROPDB="${DROPDB:-dropdb}"
CREATEDB="${CREATEDB:-createdb}"
DB="${PGDATABASE_TEST:-dripshot_test}"
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

# Joue un fichier SQL ; renvoie l'état de psql, pas celui du filtre.
run() {
  if "$PSQL" -v ON_ERROR_STOP=1 -q -d "$DB" -f "$1" >"$LOG" 2>&1; then
    grep -E '^(psql:.*)?(NOTICE|ERROR)' "$LOG" \
      | sed -e 's/^.*NOTICE:  //' -e 's/^.*ERROR:  /ERREUR : /' \
      | grep -v 'does not exist, skipping' || true
    return 0
  fi
  echo "--- sortie de psql ---"
  cat "$LOG"
  return 1
}

echo "→ base jetable : $DB"
"$DROPDB" --if-exists "$DB" >/dev/null 2>&1 || true
"$CREATEDB" "$DB"

echo "→ environnement Supabase simulé"
run "$HERE/supabase/tests/stub.sql"

echo "→ migration"
run "$HERE/supabase/migrations/0001_init.sql"

echo "→ migration rejouée (elle doit être idempotente)"
run "$HERE/supabase/migrations/0001_init.sql"

echo "→ tests"
if ! run "$HERE/supabase/tests/schema.test.sql"; then
  echo "des tests ont échoué" >&2
  exit 1
fi

"$DROPDB" --if-exists "$DB" >/dev/null 2>&1 || true
echo "schéma validé"
