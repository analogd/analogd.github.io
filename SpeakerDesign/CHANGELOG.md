# Changelog

## [v2.0.0] - Library Refactoring - 2025-01-XX

### Major Changes

#### 🎯 **New: SpeakerPhysics Library**

Created comprehensive physics calculation library with validated algorithms:

**Models:**
- `Driver` - Immutable T-S parameter model with EBP calculation
- `SealedBox` - 2nd-order sealed enclosure with transfer function
- `PortedBox` - Vented enclosure with Helmholtz resonator port design

**Calculators:**
- `AlignmentCalculator` - Standard alignments (Butterworth, Bessel, Chebychev, QB3, SC4, C4)
- `SPLCalculator` - SPL analysis with thermal, excursion, and port velocity limits

**Validation:**
- 8 automated tests validating against WinISD reference data
- Reference data for UM18-22, BC15SW76, and generic drivers
- Test coverage for sealed, ported, EBP classification, port velocity

#### ✨ **Improvements**

1. **EBP-Based Enclosure Hints**
   - Switched from Qtc-only to EBP (Fs/Qes) for better accuracy
   - Matches WinISD recommendation algorithm
   - More accurate driver classification

2. **Separation of Concerns**
   - Pure physics calculations in library layer
   - UI formatting in adapter layer
   - No DOM dependencies in calculation code

3. **Testability**
   - All calculations can be tested in isolation
   - No need to run UI to validate physics
   - Automated regression testing

4. **Backward Compatibility**
   - Created `calculations-v2.js` adapter
   - Maintains exact same API as old code
   - No UI changes required
   - Drop-in replacement

#### 🐛 **Bug Fixes**

1. **Help Modal Not Working**
   - Fixed: `renderList()` expected `section.items` but JSON had `section.details`
   - Solution: Changed to `section.items || section.details || []`

2. **Event Listener Timing**
   - Fixed: Event listeners attached before DOM elements existed
   - Solution: Used event delegation on parent container

#### 📝 **Documentation**

- `lib/README.md` - Library API and usage guide
- `lib/test.html` - Interactive validation test runner
- `lib/integration-test.html` - Integration smoke tests
- `REFACTORING.md` - Detailed refactoring documentation

#### 🧪 **Testing**

**Validation Tests (8 total):**
1. ✓ UM18-22 sealed Butterworth (box volume, Qtc, Fc, F3)
2. ✓ BC15SW76 ported QB3 (box volume, tuning, F3, port length)
3. ✓ Small sealed driver (12" generic)
4. ✓ Response curve shape (frequency response validation)
5. ✓ Port velocity calculation
6. ✓ High Qts sealed driver
7. ✓ Low Qts ported driver
8. ✓ EBP classification and hints

**Integration Tests (10 total):**
1. ✓ Library loads correctly
2. ✓ Adapter loads correctly
3. ✓ Constants available
4. ✓ Driver creation via library
5. ✓ Sealed alignment via library
6. ✓ Sealed calculation via adapter
7. ✓ Ported calculation via adapter
8. ✓ All alignments via adapter
9. ✓ Limiting factors via adapter
10. ✓ Port velocity calculation

#### 📦 **New Files**

```
lib/
├── models/
│   ├── Driver.js                  (70 lines)
│   ├── SealedBox.js               (70 lines)
│   └── PortedBox.js              (105 lines)
├── calculators/
│   ├── AlignmentCalculator.js    (115 lines)
│   └── SPLCalculator.js          (145 lines)
├── validation/
│   ├── reference-data.js         (188 lines)
│   └── Validator.js              (285 lines)
├── SpeakerPhysics.js              (58 lines)
├── README.md                     (165 lines)
├── test.html                     (180 lines)
└── integration-test.html         (200 lines)

js/
└── calculations-v2.js            (200 lines) - Adapter using new library

docs/
├── REFACTORING.md                (250 lines) - Refactoring details
└── CHANGELOG.md                  (this file)
```

#### 🔄 **Modified Files**

- `index.html` - Updated script loading order for library
- `js/help.js` - Fixed renderList() to handle both `items` and `details`

#### 🚀 **Performance**

No performance degradation - library uses same algorithms but with cleaner structure.

#### 🔮 **Future Possibilities**

With new architecture:
- ✅ Easy to add more validation tests
- ✅ Can publish as standalone npm package
- ✅ Easy to swap with alternative implementation
- ✅ Can extend with bandpass, isobarik, etc.
- ✅ Can port to Node.js, React Native, etc.

### Breaking Changes

None - backward compatible via adapter layer.

### Migration Guide

#### Current State
- Using `calculations-v2.js` (library-backed)
- Old `calculations.js` kept for reference

#### If Issues Found
```javascript
// Rollback: Change one line in index.html
<script src="js/calculations.js"></script>  // Old
<script src="js/calculations-v2.js"></script>  // New
```

#### Once Confident
1. Delete old `calculations.js`
2. Rename `calculations-v2.js` → `calculations.js`
3. (Optional) Remove adapter, use library directly

### Testing Checklist

- [x] All 8 validation tests pass
- [x] All 10 integration tests pass
- [x] Main app loads without errors
- [x] UM18-22 sealed shows correct results
- [x] UM18-22 ported shows correct results
- [x] BC15SW76 ported shows correct results
- [x] Help modal works
- [x] Alignment buttons work
- [x] Chart interaction works
- [x] SPL limits display correctly
- [x] Port velocity warnings work

### Credits

- Reference data validated against WinISD 0.70 Alpha
- EBP classification based on WinISD recommendations
- Transfer functions based on Small's Thiele-Small theory

---

## [v1.1.0] - Previous Session

### Added
- Alignment selection via buttons (removed fiddly chart clicking)
- External dimension calculations
- Auto-selection of best alignment
- Quick-select example buttons (UM18, 15SW76)
- Power input moved to better location
- Limit indicators on alignment buttons
- Constants.js for magic number extraction
- Utils.js for reusable helpers
- Real-time input validation

### Fixed
- Frequency response curves (sealed box formula)
- Excursion limit calculations
- SPL levels at high power

---

## [v1.0.0] - Initial Release

### Features
- Driver library (47 drivers)
- Sealed and ported box calculations
- Frequency response graphing
- Multiple alignment support
- Help system
- Driver filter
- Project save/load
- Custom driver editor
