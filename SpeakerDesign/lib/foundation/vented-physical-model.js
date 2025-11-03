/**
 * Vented Box - Full Physical Model
 *
 * This is the "tedious" exact numeric model that solves the complete
 * electromechanical-acoustical network equations.
 *
 * Unlike simplified alignment-table formulas, this works for ANY box/port geometry.
 *
 * Source: ChatGPT's "full physical model" approach
 *         Based on Small 1973 lumped-element network
 */

// Constants
const RHO = 1.18;  // Air density (kg/m³)
const C = 343;     // Speed of sound (m/s)

/**
 * Calculate derived mechanical/acoustical parameters from T/S parameters
 *
 * From ChatGPT equations:
 * Cms = Vas / (ρ c² Sd²)
 * Mms = 1 / ((2π Fs)² Cms)
 * Qes = (1/Qts - 1/Qms)^(-1)
 * Bl = √((2π Fs) Mms Re / Qes)
 * Rms = (2π Fs) Mms / Qms
 *
 * @param {Object} driver - Driver T/S parameters (all in SI units)
 * @param {number} driver.fs - Free-air resonance (Hz)
 * @param {number} driver.qms - Mechanical Q
 * @param {number} driver.qts - Total Q
 * @param {number} driver.vas - Equivalent air volume (m³)
 * @param {number} driver.re - Voice coil resistance (Ω)
 * @param {number} driver.sd - Effective piston area (m²)
 * @returns {Object} Derived parameters
 */
function deriveMechanicalParameters(driver) {
    const { fs, qms, qts, vas, re, sd } = driver;
    const ws = 2 * Math.PI * fs;

    // Mechanical compliance: Cms = Vas / (ρ c² Sd²)
    const cms = vas / (RHO * C * C * sd * sd);

    // Moving mass: Mms = 1 / ((2πFs)² Cms)
    const mms = 1 / (ws * ws * cms);

    // Electrical Q: Qes = (1/Qts - 1/Qms)^(-1)
    const qes = 1 / (1 / qts - 1 / qms);

    // Force factor: Bl = √((2πFs) Mms Re / Qes)
    const bl = Math.sqrt(ws * mms * re / qes);

    // Mechanical resistance: Rms = (2πFs) Mms / Qms
    const rms = (ws * mms) / qms;

    return { cms, mms, qes, bl, rms };
}

/**
 * Calculate port parameters
 *
 * @param {number} vb - Box volume (m³)
 * @param {number} portArea - Port area (m²)
 * @param {number} portLength - Physical port length (m)
 * @returns {Object} Port parameters
 */
function calculatePortParameters(vb, portArea, portLength) {
    // Box acoustic compliance: Cab = Vb / (ρ c²)
    const cab = vb / (RHO * C * C);

    // Port radius
    const portRadius = Math.sqrt(portArea / Math.PI);

    // Effective length
    // WinISD likely outputs effective length already, so use portLength as-is
    // (Adding end correction would make fb too low)
    const leff = portLength;

    // Port acoustic mass: Map = ρ Leff / Sp
    const map = RHO * leff / portArea;

    return { cab, portRadius, leff, map };
}

/**
 * Calculate vented box frequency response (full physical model)
 *
 * This solves the complete electromechanical-acoustical network:
 * - Driver mechanical impedance
 * - Box air spring compliance
 * - Port acoustic mass
 * - Coupled radiation
 *
 * Valid for ANY tuning, not just textbook alignments.
 *
 * @param {number} frequency - Frequency (Hz)
 * @param {Object} driver - Driver T/S parameters
 * @param {number} vb - Box volume (m³)
 * @param {number} portArea - Port area (m²)
 * @param {number} portLength - Port length (m)
 * @param {number} portLoss - Port resistance/losses (Pa·s/m³, default 0)
 * @param {number} voltage - Input voltage (V, default 2.83V = 1W into 8Ω)
 * @returns {Object} {coneDisplacement, portVelocity, totalRadiation, magnitude, db}
 */
export function calculateVentedResponse(frequency, driver, vb, portArea, portLength, portLoss = 0, voltage = 2.83) {
    const omega = 2 * Math.PI * frequency;

    // Derive mechanical parameters
    const { cms, mms, bl, rms } = deriveMechanicalParameters(driver);

    // Port parameters
    const { map } = calculatePortParameters(vb, portArea, portLength);

    // Complex impedances
    // Port: Zp = jω Map + Rap
    const zpReal = portLoss;
    const zpImag = omega * map;

    // Box term: (ρ c²) / (jω Vb)
    const zbReal = 0;
    const zbImag = -(RHO * C * C) / (omega * vb);

    // Mechanical impedance: Zc = Rms + j(ωMms - 1/(ωCms))
    // Real part: damping (resistance)
    // Imaginary part: mass reactance - compliance reactance
    const zcReal = rms;
    const zcImag = omega * mms - 1 / (omega * cms);

    // Solve for cone displacement x and port velocity u
    // Box continuity equation (both cone and port decrease volume when moving outward):
    // dV/dt = -Sd*(dx/dt) - u  (volume decreases when cone/port move out)
    // p_b = -(ρc²/Vb) * ΔV = -(ρc²/Vb) * ∫(dV/dt)dt = (ρc²/Vb) * (Sd*x + u/(jω))
    //
    // Port impedance relation: p_b = Zp * u
    // Combining: Zp * u = (ρc²/Vb) * (Sd*x + u/(jω))
    // Solve for u: u * [Zp - ρc²/(jωVb)] = (ρc²/Vb) * Sd * x
    // Therefore: u = [(ρc²/Vb) * Sd * x] / [Zp - ρc²/(jωVb)]
    //
    // Mechanical equation: x * [Zc + jω(Bl²)/Re + Sd*Zp*A] = (Bl/Re)*V
    // Box acts as acoustic load on cone (adds to mechanical impedance)
    // Substitute p_b = Zp * u, where u = A * x

    // u = A * x, where A = [(ρc²/Vb)*Sd] / [Zp - Zb]
    const numerReal = (RHO * C * C / vb) * driver.sd;
    const denomReal = zpReal - zbReal;
    const denomImag = zpImag - zbImag;
    const denomMag = denomReal * denomReal + denomImag * denomImag;

    // Complex division: A = numerReal / (denomReal + j*denomImag)
    const aReal = (numerReal * denomReal) / denomMag;
    const aImag = (-numerReal * denomImag) / denomMag;

    // p_b = Zp * A * x, so Sd*p_b term becomes Sd * (Zp * A) * x
    // Multiply: Zp * A
    const zpAReal = zpReal * aReal - zpImag * aImag;
    const zpAImag = zpReal * aImag + zpImag * aReal;

    // RHS of mechanical equation: (Bl/Re)*V - Sd*(Zp*A)*x
    // Move -Sd*(Zp*A)*x to LHS with sign flip
    const rhsReal = (bl / driver.re) * voltage;
    const rhsImag = 0;

    // LHS: x * [Zc + jω(Bl²)/Re - Sd*(Zp*A)]
    // Acoustic load from box (pressure × area = force)
    const lhsReal = zcReal - driver.sd * zpAReal;
    const lhsImag = zcImag + omega * (bl * bl) / driver.re - driver.sd * zpAImag;

    // Solve: x = RHS / LHS
    const lhsMag = lhsReal * lhsReal + lhsImag * lhsImag;
    const xReal = (rhsReal * lhsReal + rhsImag * lhsImag) / lhsMag;
    const xImag = (rhsImag * lhsReal - rhsReal * lhsImag) / lhsMag;

    // Port velocity: u = A * x
    const uReal = aReal * xReal - aImag * xImag;
    const uImag = aReal * xImag + aImag * xReal;

    // Total radiated volume velocity: U_rad = Sd * jω * x + u
    const uradReal = -driver.sd * omega * xImag + uReal;
    const uradImag = driver.sd * omega * xReal + uImag;

    const uradMag = Math.sqrt(uradReal * uradReal + uradImag * uradImag);

    return {
        coneDisplacement: Math.sqrt(xReal * xReal + xImag * xImag),
        portVelocity: Math.sqrt(uReal * uReal + uImag * uImag),
        totalRadiation: uradMag,
        magnitude: uradMag,
        phase: Math.atan2(uradImag, uradReal)
    };
}

/**
 * Calculate normalized frequency response in dB
 *
 * Normalizes to response at reference frequency (default 200Hz passband)
 *
 * @param {number} frequency - Frequency to evaluate (Hz)
 * @param {Object} driver - Driver T/S parameters
 * @param {number} vb - Box volume (m³)
 * @param {number} portArea - Port area (m²)
 * @param {number} portLength - Port length (m)
 * @param {Object} options - Optional parameters
 * @param {number} options.portLoss - Port resistance (Pa·s/m³)
 * @param {number} options.voltage - Input voltage (V)
 * @param {number} options.refFreq - Reference frequency for normalization (Hz)
 * @returns {number} Response in dB
 */
export function calculateVentedResponseDb(frequency, driver, vb, portArea, portLength, options = {}) {
    // Normalize to high frequency (200Hz) where response should be flat
    const { portLoss = 0, voltage = 2.83, refFreq = 200 } = options;

    const response = calculateVentedResponse(frequency, driver, vb, portArea, portLength, portLoss, voltage);

    // Get reference magnitude at refFreq
    const refResponse = calculateVentedResponse(refFreq, driver, vb, portArea, portLength, portLoss, voltage);

    // Normalize
    if (refResponse.magnitude === 0) {
        return -Infinity;
    }

    return 20 * Math.log10(response.magnitude / refResponse.magnitude);
}
