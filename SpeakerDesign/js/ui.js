// UI handling and event listeners

let chart;

document.addEventListener('DOMContentLoaded', () => {
    chart = new ResponseChart('response-chart');
    chart.init();

    const calculateBtn = document.getElementById('calculate-btn');
    calculateBtn.addEventListener('click', handleCalculate);

    // Example driver preload (optional)
    loadExampleDriver();
});

function loadExampleDriver() {
    // Example: Load a typical 8" woofer
    document.getElementById('fs').value = 38;
    document.getElementById('qts').value = 0.45;
    document.getElementById('vas').value = 28;
    document.getElementById('re').value = 6.8;
    document.getElementById('le').value = 0.8;
    document.getElementById('xmax').value = 8;
    document.getElementById('sd').value = 220;
    document.getElementById('pe').value = 100;
}

function handleCalculate() {
    const params = {
        fs: parseFloat(document.getElementById('fs').value),
        qts: parseFloat(document.getElementById('qts').value),
        vas: parseFloat(document.getElementById('vas').value),
        re: parseFloat(document.getElementById('re').value),
        le: parseFloat(document.getElementById('le').value),
        xmax: parseFloat(document.getElementById('xmax').value),
        sd: parseFloat(document.getElementById('sd').value),
        pe: parseFloat(document.getElementById('pe').value)
    };

    // Validate inputs
    if (Object.values(params).some(v => isNaN(v) || v <= 0)) {
        displayResults('<p style="color: red;">Please fill in all parameters with valid positive numbers.</p>');
        return;
    }

    const enclosureType = document.querySelector('input[name="enclosure"]:checked').value;

    let results;
    let responseData;

    if (enclosureType === 'sealed') {
        results = SpeakerCalculations.calculateSealed(params);
        displaySealedResults(results);

        // Use first alignment for frequency response
        if (results.length > 0) {
            responseData = SpeakerCalculations.calculateFrequencyResponse(
                params,
                'sealed',
                parseFloat(results[0].vb)
            );
        }
    } else if (enclosureType === 'ported') {
        results = SpeakerCalculations.calculatePorted(params);
        displayPortedResults(results);

        // Use first alignment for frequency response
        if (results.length > 0) {
            responseData = SpeakerCalculations.calculateFrequencyResponse(
                params,
                'ported',
                parseFloat(results[0].vb),
                parseFloat(results[0].fb)
            );
        }
    } else {
        displayResults('<p>Bandpass calculation coming soon...</p>');
        return;
    }

    // Update chart
    if (responseData) {
        chart.update(responseData.frequencies, responseData.spl);
    }
}

function displaySealedResults(results) {
    let html = '<h3>Sealed Box Designs</h3>';

    for (const result of results) {
        html += `
            <div class="result-item">
                <strong>${result.alignment}</strong><br>
                Qtc: ${result.qtc}<br>
                Box Volume: ${result.vb} L<br>
                System Fc: ${result.fc} Hz<br>
                F3 (-3dB): ${result.f3} Hz
            </div>
        `;
    }

    displayResults(html);
}

function displayPortedResults(results) {
    let html = '<h3>Ported Box Designs</h3>';

    for (const result of results) {
        html += `
            <div class="result-item">
                <strong>${result.alignment}</strong><br>
                Box Volume: ${result.vb} L<br>
                Tuning Freq: ${result.fb} Hz<br>
                Port Diameter: ${result.portDiameter} cm<br>
                Port Length: ${result.portLength} cm
            </div>
        `;
    }

    displayResults(html);
}

function displayResults(html) {
    document.getElementById('results').innerHTML = html;
}
