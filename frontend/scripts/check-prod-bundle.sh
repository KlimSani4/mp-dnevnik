#!/usr/bin/env bash
# Проверка production-сборки: в ней не должно быть тестовых данных и dev-кода (#15).
# Запуск после `pnpm --filter @nexora/desktop build`, из папки frontend/.
set -euo pipefail

DIST="${1:-packages/desktop/dist}"

# Маркеры моков и dev-входа. Новый мок — добавить сюда его характерную строку.
MARKERS=(
  "Жмышенко"
  "createMockTasks"
  "Войти как разработчик"
)

# В исходниках не должно быть скомпилированных .js рядом с .ts/.tsx
STRAY=$(git ls-files 'packages/*/src/*.js' 'packages/*/src/**/*.js' || true)
if [ -n "$STRAY" ]; then
  echo "::error::В src лежат скомпилированные .js (запускали tsc без --noEmit?):"
  echo "$STRAY"
  exit 1
fi

[ -d "$DIST" ] || { echo "::error::Нет сборки $DIST"; exit 1; }

failed=0
for m in "${MARKERS[@]}"; do
  if grep -rlF -- "$m" "$DIST" >/dev/null; then
    echo "::error::В production-сборке найдено «$m»:"
    grep -rlF -- "$m" "$DIST"
    failed=1
  fi
done

[ "$failed" -eq 0 ] && echo "Production-сборка чистая: тестовых данных и dev-кода нет"
exit "$failed"
