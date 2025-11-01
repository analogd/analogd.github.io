// Chart handling for frequency response visualization

class ResponseChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.chart = null;
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

    update(frequencies, spl) {
        if (!this.chart) {
            this.init();
        }

        this.chart.data.labels = frequencies;
        this.chart.data.datasets[0].data = spl;
        this.chart.update();
    }

    clear() {
        if (this.chart) {
            this.chart.data.labels = [];
            this.chart.data.datasets[0].data = [];
            this.chart.update();
        }
    }
}
