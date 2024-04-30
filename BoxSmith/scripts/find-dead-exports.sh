#!/bin/bash
# Find potentially unused exports in the codebase
# Zero dependencies - uses grep/sed
#
# Usage: ./scripts/find-dead-exports.sh
#
# Future: Consider ESLint with eslint-plugin-unused-imports for more robust detection.
# For now, this zero-dependency approach fits the project philosophy.
#
# Note: This has false positives for:
# - Exports used via "export *" re-exports
# - Exports used in HTML script tags
# - Test files importing things
# Manual review required for each finding.

set -e
cd "$(dirname "$0")/.."

echo "=== Dead Export Finder ==="
echo ""

# Colors
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Find all named exports (function and const)
echo "Scanning for exports..."

# Track findings
UNUSED_COUNT=0
CHECKED_COUNT=0

# Function to check if an export is used
check_export() {
    local name="$1"
    local source_file="$2"

    # Skip common false positives
    case "$name" in
        default|*Test*|run*) return 0 ;;
    esac

    CHECKED_COUNT=$((CHECKED_COUNT + 1))

    # Check if imported anywhere (excluding the source file and test files)
    # Look for: import { name, import { ... name, name }, from, and direct usage
    local import_count=$(grep -r --include="*.js" --include="*.html" -l "\b${name}\b" . 2>/dev/null | \
        grep -v "$source_file" | \
        grep -v "node_modules" | \
        grep -v ".test.js" | \
        grep -v "archive/" | \
        wc -l | tr -d ' ')

    if [ "$import_count" -eq 0 ]; then
        echo -e "${YELLOW}UNUSED:${NC} $name"
        echo "        in: $source_file"
        UNUSED_COUNT=$((UNUSED_COUNT + 1))
    fi
}

# Process each JS file in lib/ and ui/
for file in $(find lib ui -name "*.js" -not -path "*/test/*" -not -path "*/archive/*" 2>/dev/null); do
    # Extract export names
    # Matches: export function name, export const name, export class name
    exports=$(grep -oE "export (function|const|class) [a-zA-Z_][a-zA-Z0-9_]*" "$file" 2>/dev/null | \
        sed 's/export \(function\|const\|class\) //' || true)

    for exp in $exports; do
        check_export "$exp" "$file"
    done
done

echo ""
echo "=== Summary ==="
echo "Checked: $CHECKED_COUNT exports"
echo -e "Potentially unused: ${RED}$UNUSED_COUNT${NC}"
echo ""
echo "Note: Review each finding - some may be false positives (used via 'export *' or in HTML)"
