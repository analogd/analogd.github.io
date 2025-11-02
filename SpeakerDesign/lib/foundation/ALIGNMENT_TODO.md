# B4/C4 Alignment Implementation Status

## Issue
B4/C4 alignment calculations need validation against known reference designs.

Current implementation for B4 with Qts=0.4:
- Returns: h=1.29, α=1.74
- Expected from Small Fig 6: h≈0.77, α≈2.6 (per test assertions)

## Root Cause
Complex inverse problem: Given QT, solve for (α, h) that satisfy B4 equations.

Small 1973 presents Fig 6 as α → (QT, h) but our API needs QT → (α, h).

## Path Forward
1. Extract data points from Small 1973 Fig 6 to create lookup table
2. Implement proper numerical solver for inverse problem
3. Validate against known speaker designs (e.g., published B4 designs for specific drivers)
4. For now: Use QB3 alignment (simpler, well-tested) or manual α selection

## QB3 Status
QB3 implementation is simpler (h = 1.0, direct α formula) and well-tested. Recommend using QB3 for production until B4/C4 validated.
