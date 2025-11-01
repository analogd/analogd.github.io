// Chart handling for frequency response visualization

class ResponseChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.chart = null;
        this.colors = [
            '#3498db',
            '#2ecc71',
            '#e74c3c',
            '#f39c12',
            '#9b59b6',
            '#1abc9c'
        ];
        this.selectedAlignment = null;
    }

    init() {
        if (this.chart) {
            this.chart.destroy();
        }

        const ctx = this.canvas.getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'SPL (dB)',
                    data: [],
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    title: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        type: 'logarithmic',
                        title: {
                            display: true,
                            text: 'Frequency (Hz)'
                        },
                        ticks: {
                            callback: function(value) {
                                if (value === 20 || value === 50 || value === 100 || value === 200) {
                                    return value;
                                }
                                return '';
                            }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'SPL (dB)'
                        },
                        ticks: {
                            stepSize: 3
                        }
                    }
                }
            }
        });
    }

    updateMultiTrace(alignments, power = null) {
        if (!this.chart) {
            this.init();
        }

        const datasets = [];

        // Add alignment traces
        alignments.forEach((alignment, idx) => {
            const isSelected = this.selectedAlignment === idx;
            datasets.push({
                label: `${alignment.alignment} (Vb: ${alignment.vb}L, F3: ${alignment.f3}Hz)`,
                data: alignment.spl,
                borderColor: this.colors[idx % this.colors.length],
                backgroundColor: isSelected ?
                    this.hexToRgba(this.colors[idx % this.colors.length], 0.2) :
                    'transparent',
                borderWidth: isSelected ? 3 : 2,
                fill: isSelected,
                tension: 0.4,
                pointRadius: 0,
                alignmentData: alignment
            });
        });

        // Add thermal limit if power provided
        if (power && alignments[0].thermalLimit) {
            datasets.push({
                label: 'Thermal Limit',
                data: alignments[0].thermalLimit,
                borderColor: 'rgba(231, 76, 60, 0.8)',
                borderDash: [5, 5],
                borderWidth: 2,
                fill: false,
                tension: 0,
                pointRadius: 0
            });
        }

        // Add excursion limit if power provided
        if (power && alignments[0].excursionLimit) {
            datasets.push({
                label: 'Excursion Limit',
                data: alignments[0].excursionLimit,
                borderColor: 'rgba(243, 156, 18, 0.8)',
                borderDash: [5, 5],
                borderWidth: 2,
                fill: false,
                tension: 0,
                pointRadius: 0
            });
        }

        this.chart.data.labels = alignments[0].frequencies;
        this.chart.data.datasets = datasets;
        this.chart.update();
    }

    update(frequencies, spl) {
        if (!this.chart) {
            this.init();
        }

        this.chart.data.labels = frequencies;
        this.chart.data.datasets[0].data = spl;
        this.chart.update();
    }

    handleAlignmentClick(datasetIndex) {
        const dataset = this.chart.data.datasets[datasetIndex];
        if (!dataset.alignmentData) return;

        this.selectedAlignment = datasetIndex;

        // Update all datasets to reflect selection
        this.chart.data.datasets.forEach((ds, idx) => {
            if (ds.alignmentData) {
                const isSelected = this.selectedAlignment === idx;
                ds.borderWidth = isSelected ? 3 : 2;
                ds.fill = isSelected;
                ds.backgroundColor = isSelected ?
                    this.hexToRgba(ds.borderColor, 0.2) :
                    'transparent';
            }
        });

        this.chart.update();

        // Dispatch event for UI to handle
        const alignment = dataset.alignmentData;
        document.dispatchEvent(new CustomEvent('alignmentSelected', {
            detail: alignment
        }));
    }

    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    clear() {
        if (this.chart) {
            this.chart.data.labels = [];
            this.chart.data.datasets[0].data = [];
            this.selectedAlignment = null;
            this.chart.update();
        }
    }
}
