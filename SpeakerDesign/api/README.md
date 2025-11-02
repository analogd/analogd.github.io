# Loudspeaker Foundation API

**REST API for loudspeaker enclosure design based on Thiele-Small parameters.**

Interactive Swagger UI with real driver examples and complete OpenAPI 3.0 specification.

> **⚠️ Deployment Note:** This API requires Node.js server (Express). It **cannot run on GitHub Pages** (static hosting only).
>
> **Options for deployment:**
> - **Local development**: Run on `localhost:3000` (instructions below)
> - **Serverless**: Deploy to Vercel, Netlify Functions, AWS Lambda
> - **Self-hosted**: Deploy to VPS with Node.js
>
> **For GitHub Pages:** Use `/example.html` instead - direct browser usage of Foundation library (no server needed).

## Quick Start

```bash
# Install dependencies
cd api
npm install

# Start server
npm start

# Open Swagger UI
open http://localhost:3000/docs
```

The API will start on `http://localhost:3000` with interactive documentation at `/docs`.

## What This Is

A **REST API wrapper** around the Foundation library that:

- ✅ Accepts user-friendly units (liters, cm) and converts to SI internally
- ✅ Returns formatted responses with multiple unit systems
- ✅ Provides interactive Swagger UI with real driver examples
- ✅ Validates parameters with helpful error messages
- ✅ Cites source equations in every response
- ✅ Detects alignments automatically (Butterworth, Bessel, etc.)

## Architecture

```
Foundation Library (pure math, SI units, zero dependencies)
    ↑ imports
API Layer (Express + OpenAPI)
    ↑ serves
Swagger UI (interactive documentation)
```

The API **does not modify Foundation** - it's a clean wrapper that adds:
- Unit conversion (at API boundary only)
- User-friendly response formatting
- HTTP error handling
- Interactive documentation

## API Endpoints

### Sealed Box

**POST /api/v1/sealed-box/calculate**
Complete sealed box calculation (Fc, Qtc, F3, efficiency, SPL)

**POST /api/v1/sealed-box/alignment**
Calculate box volume for target alignment (Butterworth, Bessel, Chebyshev)

**POST /api/v1/sealed-box/response**
Calculate frequency response curve

### Ported Box

**POST /api/v1/ported-box/calculate**
Complete ported box calculation (port length, velocity, tuning)

**POST /api/v1/ported-box/qb3**
Calculate QB3 alignment parameters

### Validation

**POST /api/v1/validate/driver**
Validate T/S parameters

**POST /api/v1/validate/box**
Validate box volume

### Utilities

**GET /api/v1/constants**
Physical constants (speed of sound, air density, etc.)

**GET /api/v1/alignments**
Standard alignment constants (Butterworth, Bessel, Chebyshev, QB3)

## Example Usage

### Calculate Sealed Box (Butterworth)

```bash
curl -X POST http://localhost:3000/api/v1/sealed-box/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "driver": {
      "fs": 22.0,
      "qts": 0.53,
      "qes": 0.56,
      "vas": 248.2,
      "vasUnit": "L"
    },
    "boxVolume": 318,
    "boxVolumeUnit": "L"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "systemResonance": { "fc": 29.35, "unit": "Hz" },
    "totalQ": { "qtc": 0.707 },
    "f3": { "frequency": 29.35, "unit": "Hz" },
    "alignment": "Butterworth",
    "complianceRatio": { "alpha": 0.780 },
    "efficiency": { "eta0": 0.00428, "percent": 0.428 },
    "sensitivity": { "spl0": 88.6, "unit": "dB @ 1W/1m" }
  },
  "meta": {
    "version": "0.1.0",
    "units": "SI",
    "citations": [
      "Small 1972, Eq. 5-7 (Fc, Qtc, alpha)",
      "Small 1972, Eq. 10 (F3)",
      "Small 1972, Eq. 22 (efficiency)"
    ]
  }
}
```

### Calculate Alignment Volume

```bash
curl -X POST http://localhost:3000/api/v1/sealed-box/alignment \
  -H "Content-Type: application/json" \
  -d '{
    "driver": {
      "qts": 0.53,
      "vas": 248.2,
      "vasUnit": "L"
    },
    "targetAlignment": "butterworth"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "volume": {
      "m3": 0.318,
      "liters": 318.0,
      "cubicFeet": 11.23
    },
    "targetQtc": 0.707,
    "alignment": "Butterworth"
  }
}
```

### Calculate Frequency Response

```bash
curl -X POST http://localhost:3000/api/v1/sealed-box/response \
  -H "Content-Type: application/json" \
  -d '{
    "fc": 29.35,
    "qtc": 0.707,
    "frequencies": [10, 20, 30, 40, 50, 100]
  }'
```

### Calculate QB3 Ported Box

```bash
curl -X POST http://localhost:3000/api/v1/ported-box/qb3 \
  -H "Content-Type: application/json" \
  -d '{
    "driver": {
      "fs": 22.0,
      "qts": 0.53,
      "vas": 248.2,
      "vasUnit": "L"
    }
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "volume": {
      "m3": 0.458,
      "liters": 458.0
    },
    "tuningFrequency": {
      "fb": 22.0,
      "unit": "Hz",
      "relationship": "Fb = Fs (tuned to driver resonance)"
    },
    "alignment": "QB3"
  }
}
```

## Unit Conversion

The API accepts multiple unit systems and returns results in all common formats:

### Volume
- **m3** (SI unit, used internally)
- **L** or **liters**
- **cuft** (cubic feet)

### Length
- **m** (SI unit, used internally)
- **cm**
- **mm**
- **inches**

### Example

Input with liters:
```json
{
  "driver": { "vas": 248.2, "vasUnit": "L" },
  "boxVolume": 318,
  "boxVolumeUnit": "L"
}
```

Output with multiple units:
```json
{
  "boxVolume": {
    "m3": 0.318,
    "liters": 318.0,
    "cubicFeet": 11.23
  }
}
```

## Error Handling

The API provides helpful error messages with proper HTTP status codes:

### 400 Bad Request
Missing or invalid request format
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Missing required fields: driver, boxVolume"
  }
}
```

### 422 Validation Error
Parameter outside valid range
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Fs=600Hz outside valid range (15-500Hz). Thiele-Small parameters assume pistonic behavior without cone breakup.",
    "details": { "parameter": "Fs" }
  }
}
```

## Interactive Documentation

Open **http://localhost:3000/docs** for:

- ✅ Complete API documentation
- ✅ Try-it-out functionality (execute requests from browser)
- ✅ Pre-filled examples with real drivers (Dayton Audio UM18-22 V2, midwoofer, midbass)
- ✅ Request/response schemas
- ✅ Parameter descriptions and constraints

## Development

```bash
# Start with auto-reload on file changes
npm run dev

# Run tests (coming soon)
npm test
```

## Design Principles

Following the Foundation library philosophy:

1. **Separation of Concerns**
   - Foundation = pure math (SI units, zero dependencies)
   - API = convenience layer (unit conversion, formatting)
   - Never pollute Foundation with API logic

2. **Citations**
   - Every response cites source equations
   - Traceability to published papers

3. **First Principles**
   - Built on validated theory
   - 73 tests prove correctness

4. **User Friendly**
   - Accept liters, cm, inches
   - Return multiple unit formats
   - Detect alignments automatically
   - Helpful error messages

## Version History

**0.1.0** (Current)
- Initial release
- Sealed box calculations (Small 1972)
- Ported box calculations (Small 1973)
- Standard alignments (Thiele 1971)
- Parameter validation
- Swagger UI integration

## Future Enhancements

See `/lib/foundation/ROADMAP.md` for planned features:

- Phase 2: Impedance modeling, Klippel parameters, port compression
- Phase 3: Baffle step, thermal dynamics, inductance effects

## License

MIT

---

**Built on pure Thiele-Small theory from published papers.**

Foundation library: `../lib/foundation/`
Test suite: `../lib/test/Foundation.test.js` (73/73 tests passing)
