document.addEventListener('DOMContentLoaded', function() {
    loadCookies();
    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', function() {
            saveCookies();
            updateCalculations();
        });
    });
});

function saveCookies() {
    document.querySelectorAll('input').forEach(input => {
        document.cookie = `${input.id}=${input.value};path=/`;
    });
}

function loadCookies() {
    const cookies = document.cookie.split('; ');
    cookies.forEach(cookie => {
        const [name, value] = cookie.split('=');
        const input = document.getElementById(name);
        if (input) {
            input.value = value;
        }
    });
}

function getRoomDimensions() {
    const length = parseFloat(document.getElementById('room-length').value);
    const width = parseFloat(document.getElementById('room-width').value);
    const height = parseFloat(document.getElementById('room-height').value);
    return { length, width, height };
}

function calculateModalFrequencies() {
    const { length, width, height } = getRoomDimensions();
    
    const frequencies = [
        (344 / (2 * length / 100)).toFixed(2),
        (344 / (2 * width / 100)).toFixed(2),
        (344 / (2 * height / 100)).toFixed(2)
    ];
    
    document.getElementById('modal-frequencies-result').innerHTML = 
        `Modal Frequencies: ${frequencies.join(', ')} Hz`;
}

function calculateFloorBounce() {
    const micHeight = 100; // Example mic height in cm
    const speakerHeight = parseFloat(document.getElementById('c-speaker-height').value);
    
    const distance = 2 * Math.abs(speakerHeight - micHeight) / 100;
    const dipFrequency = (344 / distance).toFixed(2);
    
    document.getElementById('floor-bounce-result').innerHTML = 
        `Floor Bounce Dip: ${dipFrequency} Hz`;
}

function calculateCeilingBounce() {
    const micHeight = 100; // Example mic height in cm
    const roomHeight = parseFloat(document.getElementById('room-height').value);
    const speakerHeight = parseFloat(document.getElementById('c-speaker-height').value);
    
    const distance = 2 * Math.abs(roomHeight - speakerHeight) / 100;
    const dipFrequency = (344 / distance).toFixed(2);
    
    document.getElementById('ceiling-bounce-result').innerHTML = 
        `Ceiling Bounce Dip: ${dipFrequency} Hz`;
}

function calculateSideWallBounce() {
    const micDistance = 100; // Example mic distance from side wall in cm
    const roomWidth = parseFloat(document.getElementById('room-width').value);
    
    const distance = 2 * Math.abs(roomWidth / 2 - micDistance) / 100;
    const dipFrequency = (344 / distance).toFixed(2);
    
    document.getElementById('side-wall-bounce-result').innerHTML = 
        `Side Wall Bounce Dip: ${dipFrequency} Hz`;
}

function updateCalculations() {
    calculateModalFrequencies();
    calculateFloorBounce();
    calculateCeilingBounce();
    calculateSideWallBounce();
    drawIllustration();
}

function drawIllustration() {
    const { length, width, height } = getRoomDimensions();
    const lSpeakerHeight = parseFloat(document.getElementById('l-speaker-height').value);
    const cSpeakerHeight = parseFloat(document.getElementById('c-speaker-height').value);
    const rSpeakerHeight = parseFloat(document.getElementById('r-speaker-height').value);
    
    // Simple illustration logic, you can use a canvas or SVG for a more detailed drawing
    const illustration = `
        <p>Room Dimensions: L=${length}cm, W=${width}cm, H=${height}cm</p>
        <p>Speaker Heights: L=${lSpeakerHeight}cm, C=${cSpeakerHeight}cm, R=${rSpeakerHeight}cm</p>
    `;
    
    document.getElementById('illustration').innerHTML = illustration;
}