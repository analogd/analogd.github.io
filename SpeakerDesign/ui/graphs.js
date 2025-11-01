// graphs.js - Chart.js wrapper functions

const GraphManager = {
    charts: {},

    // Initialize all charts
    init() {
        Chart.defaults.color = '#8b949e';
        Chart.defaults.borderColor = '#30363d';
        Chart.defaults.backgroundColor = '#1c2128';
        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        Chart.defaults.font.size = 12;
    },

    // Frequency Response Graph
    createFrequencyResponse(canvasId, datasets) {
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId).getContext('2d');

        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets.map((dataset, idx) => {
                    const colors = ['#58a6ff', '#39d353', '#f0883e'];
                    return {
                        label: `${dataset.power}W`,
                        data: dataset.frequencies.map((freq, i) => ({
                            x: freq,
                            y: dataset.spl[i]
                        })),
                        borderColor: colors[idx % colors.length],
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.1
                    };
                })
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'logarithmic',
                        title: { display: true, text: 'Frequency (Hz)' },
                        grid: { color: '#30363d' }
                    },
                    y: {
                        title: { display: true, text: 'SPL (dB)' },
                        grid: { color: '#30363d' }
                    }
                },
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(1)} dB`;
                            }
                        }
                    }
                }
            }
        });
    },

    // Maximum Power Graph
    createMaxPowerCurve(canvasId, data) {
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId).getContext('2d');

        // Separate excursion and thermal limited points
        const excursionData = [];
        const thermalData = [];

        data.forEach(point => {
            const dataPoint = { x: point.frequency, y: point.maxPower };
            if (point.limitingFactor === 'excursion') {
                excursionData.push(dataPoint);
                thermalData.push({ x: point.frequency, y: null });
            } else {
                thermalData.push(dataPoint);
                excursionData.push({ x: point.frequency, y: null });
            }
        });

        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Excursion Limited',
                        data: excursionData,
                        borderColor: '#f85149',
                        backgroundColor: 'rgba(248, 81, 73, 0.1)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#f85149',
                        tension: 0.1,
                        fill: false
                    },
                    {
                        label: 'Thermal Limited',
                        data: thermalData,
                        borderColor: '#58a6ff',
                        backgroundColor: 'rgba(88, 166, 255, 0.1)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#58a6ff',
                        tension: 0.1,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'logarithmic',
                        title: { display: true, text: 'Frequency (Hz)' },
                        grid: { color: '#30363d' }
                    },
                    y: {
                        title: { display: true, text: 'Maximum Power (W)' },
                        grid: { color: '#30363d' },
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(0)}W`;
                            }
                        }
                    }
                }
            }
        });
    },

    // Cone Excursion Graph
    createExcursionCurve(canvasId, frequencies, excursions, xmax) {
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId).getContext('2d');

        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Cone Excursion',
                        data: frequencies.map((freq, i) => ({
                            x: freq,
                            y: excursions[i]
                        })),
                        borderColor: '#58a6ff',
                        backgroundColor: 'rgba(88, 166, 255, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.1,
                        fill: true
                    },
                    {
                        label: 'Xmax Limit',
                        data: frequencies.map(freq => ({
                            x: freq,
                            y: xmax
                        })),
                        borderColor: '#f85149',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'logarithmic',
                        title: { display: true, text: 'Frequency (Hz)' },
                        grid: { color: '#30363d' }
                    },
                    y: {
                        title: { display: true, text: 'Excursion (mm)' },
                        grid: { color: '#30363d' },
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}mm`;
                            }
                        }
                    }
                }
            }
        });
    },

    // SPL Ceiling Graph
    createSPLCeiling(canvasId, frequencies, ceiling) {
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId).getContext('2d');

        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Maximum SPL',
                        data: frequencies.map((freq, i) => ({
                            x: freq,
                            y: ceiling[i]
                        })),
                        borderColor: '#39d353',
                        backgroundColor: 'rgba(57, 211, 83, 0.1)',
                        borderWidth: 3,
                        pointRadius: 0,
                        tension: 0.1,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'logarithmic',
                        title: { display: true, text: 'Frequency (Hz)' },
                        grid: { color: '#30363d' }
                    },
                    y: {
                        title: { display: true, text: 'Max SPL (dB)' },
                        grid: { color: '#30363d' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `Max SPL: ${context.parsed.y.toFixed(1)} dB`;
                            }
                        }
                    }
                }
            }
        });
    },

    // Destroy all charts
    destroyAll() {
        Object.values(this.charts).forEach(chart => chart.destroy());
        this.charts = {};
    }
};
