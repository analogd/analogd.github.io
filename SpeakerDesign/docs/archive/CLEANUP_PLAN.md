# Cleanup Plan

## Safe to Delete

### Root directory:
- ❌ `FSC_INVESTIGATION.md` - Old investigation notes, no longer relevant
- ❌ `FORMULA_STATUS.md` - Superseded by `lib/foundation/STATUS.md`
- ❌ `VISION.md` - Superseded by `lib/foundation/VISION.md`
- ❌ `SESSION_2025_11_02.md` - Session notes, can move to `.claude/` or delete

### lib/foundation/:
- ❌ `small-1973.js.backup` - Backup file, not needed in git
- ❌ `small-1973.js.old` - Old version, not needed in git
- ❌ `MISSING_FUNCTIONS.md` - Old audit, superseded by PRACTICAL_PRIORITY.md
- ❌ `PAPER_INSIGHTS.md` - Notes from development, no longer needed
- ❌ `PRESERVATION_POLICY.md` - Development notes, can delete
- ❌ `RESTRUCTURE_EXAMPLE.md` - Example from refactor, no longer needed
- ❌ `SMALL_1973_AUDIT.md` - Old audit, superseded by current docs

### lib/:
- ❌ `ARCHITECTURE.md` - Superseded by root `/ARCHITECTURE.md`
- ❌ `README.md` - Check if still needed vs foundation/README.md

## Keep (Still Useful)

### Root:
- ✅ `ARCHITECTURE.md` - Current architecture doc
- ✅ `COOKBOOK_REFACTOR_PLAN.md` - Next phase planning
- ✅ `FOUNDATION_SHOWCASE_VISION.md` - Implementation guide for foundation.html
- ✅ `foundation.html` - The new status page!
- ✅ `example.html` - Usage examples
- ✅ `README.md` - Project readme
- ✅ `CLAUDE.md` - Project-specific instructions

### lib/foundation/:
- ✅ `STATUS.md` - Detailed implementation status
- ✅ `VISION.md` - Long-term vision
- ✅ `SMALL_1973_INDEX.md` - Complete function index
- ✅ `PRACTICAL_PRIORITY.md` - Priority analysis (NEW, useful!)
- ✅ `README.md` - Foundation lib docs
- ✅ `ROADMAP.md` - Implementation roadmap
- ✅ `CITATIONS.md` - Paper citations
- ✅ All `.js` files (source code)

## Migration/Consolidation

Could consolidate some root-level docs into `docs/` directory:
```
docs/
├── ARCHITECTURE.md
├── COOKBOOK_REFACTOR_PLAN.md
└── FOUNDATION_SHOWCASE_VISION.md
```

This would clean up the root but it's optional.

## Execution

Delete old/superseded files (13 files total):
```bash
# Root cleanup
rm FSC_INVESTIGATION.md FORMULA_STATUS.md VISION.md SESSION_2025_11_02.md

# Foundation cleanup
rm lib/foundation/small-1973.js.backup
rm lib/foundation/small-1973.js.old
rm lib/foundation/MISSING_FUNCTIONS.md
rm lib/foundation/PAPER_INSIGHTS.md
rm lib/foundation/PRESERVATION_POLICY.md
rm lib/foundation/RESTRUCTURE_EXAMPLE.md
rm lib/foundation/SMALL_1973_AUDIT.md

# Lib cleanup
rm lib/ARCHITECTURE.md
rm lib/README.md  # If duplicated by foundation/README.md
```

This removes ~100KB of obsolete docs.
