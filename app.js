import Peer from 'peerjs';

let voices = JSON.parse(localStorage.getItem('elevenlabs_voices') || '[]');
let selectedVoiceId = localStorage.getItem('selected_voice') || null;
let currentAudioUrl = null;
let peer = null;
let connections = [];

// DOM elements
const voiceIdInput = document.getElementById('voiceIdInput');
const addVoiceBtn = document.getElementById('addVoiceBtn');
const voiceList = document.getElementById('voiceList');
const textInput = document.getElementById('textInput');
const speakBtn = document.getElementById('speakBtn');
const stopBtn = document.getElementById('stopBtn');
const audioPlayer = document.getElementById('audioPlayer');
const hostBtn = document.getElementById('hostBtn');
const sessionIdDisplay = document.getElementById('sessionIdDisplay');
const sessionIdInput = document.getElementById('sessionIdInput');
const joinBtn = document.getElementById('joinBtn');
const peerStatus = document.getElementById('peerStatus');

// Initialize
renderVoiceList();
updateButtonStates();

// Event listeners
addVoiceBtn.addEventListener('click', addVoice);
voiceIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addVoice();
});

speakBtn.addEventListener('click', speakText);
stopBtn.addEventListener('click', stopAudio);

hostBtn.addEventListener('click', hostSession);
joinBtn.addEventListener('click', joinSession);

// Preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const voiceId = btn.dataset.voice;
        const name = btn.textContent;
        addVoiceFromPreset(voiceId, name);
    });
});

function addVoice() {
    const voiceId = voiceIdInput.value.trim();
    if (!voiceId) return;

    if (voices.some(v => v.id === voiceId)) {
        alert('Voice ID already exists!');
        return;
    }

    voices.push({ id: voiceId, name: voiceId });
    voiceIdInput.value = '';
    saveVoices();
    renderVoiceList();
}

function addVoiceFromPreset(voiceId, name) {
    if (voices.some(v => v.id === voiceId)) {
        selectVoice(voiceId);
        return;
    }

    voices.push({ id: voiceId, name: `${name} (${voiceId})` });
    saveVoices();
    renderVoiceList();
    selectVoice(voiceId);
}

function selectVoice(voiceId) {
    selectedVoiceId = voiceId;
    localStorage.setItem('selected_voice', voiceId);
    renderVoiceList();
    updateButtonStates();
}

function deleteVoice(voiceId) {
    voices = voices.filter(v => v.id !== voiceId);
    if (selectedVoiceId === voiceId) {
        selectedVoiceId = null;
    }
    saveVoices();
    renderVoiceList();
    updateButtonStates();
}

function renderVoiceList() {
    voiceList.innerHTML = '';
    
    voices.forEach(voice => {
        const item = document.createElement('div');
        item.className = `voice-item ${voice.id === selectedVoiceId ? 'selected' : ''}`;
        
        item.innerHTML = `
            <div class="voice-info">
                <div class="voice-id">${voice.name}</div>
            </div>
            <div class="voice-actions">
                <button onclick="selectVoice('${voice.id}')">Select</button>
                <button class="delete-btn" onclick="deleteVoice('${voice.id}')">Delete</button>
            </div>
        `;
        
        voiceList.appendChild(item);
    });
}

async function speakText() {
    if (!selectedVoiceId || !textInput.value.trim()) return;

    speakBtn.disabled = true;
    speakBtn.textContent = 'Generating...';

    try {
        const result = await websim.textToSpeech({
            text: textInput.value,
            voice: selectedVoiceId,
        });

        // Clean up previous audio
        if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl);
        }

        // Create audio element and play
        audioPlayer.src = result.url;
        audioPlayer.style.display = 'block';
        await audioPlayer.play();
        
        currentAudioUrl = result.url;
        
        // Broadcast TTS to connected peers
        connections.forEach(conn => conn.send({ type: 'tts', url: result.url }));
    } catch (error) {
        console.error('Error generating speech:', error);
        alert('Error generating speech. Please check the voice ID and try again.');
    } finally {
        speakBtn.disabled = false;
        speakBtn.textContent = 'Speak';
    }
}

function stopAudio() {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    // Broadcast stop event
    connections.forEach(conn => conn.send({ type: 'stop' }));
}

function updateButtonStates() {
    speakBtn.disabled = !selectedVoiceId || !textInput.value.trim();
    stopBtn.disabled = !audioPlayer.src;
}

function saveVoices() {
    localStorage.setItem('elevenlabs_voices', JSON.stringify(voices));
}

// Text input listener
textInput.addEventListener('input', updateButtonStates);

// Make functions global for onclick handlers
window.selectVoice = selectVoice;
window.deleteVoice = deleteVoice;

/* PeerJS connection logic */
function hostSession() {
    if (peer) {
        peer.destroy();
        connections = [];
    }
    peer = new Peer();
    peer.on('open', id => {
        sessionIdDisplay.value = id;
        peerStatus.textContent = 'Waiting for connection...';
    });
    peer.on('connection', conn => {
        conn.on('open', () => {
            connections.push(conn);
            peerStatus.textContent = 'Connected with: ' + conn.peer;
            conn.on('data', handlePeerData);
            conn.on('close', () => {
                connections = connections.filter(c => c !== conn);
                peerStatus.textContent = 'Peer disconnected';
            });
        });
    });
    peer.on('error', err => {
        console.error(err);
        alert('Peer error: ' + err);
    });
}

function joinSession() {
    const hostId = sessionIdInput.value.trim();
    if (!hostId) return;
    if (peer) {
        peer.destroy();
        connections = [];
    }
    peer = new Peer();
    peer.on('open', id => {
        peerStatus.textContent = 'Your ID: ' + id;
        const conn = peer.connect(hostId);
        conn.on('open', () => {
            connections.push(conn);
            peerStatus.textContent = 'Connected to host: ' + hostId;
            conn.on('data', handlePeerData);
            conn.on('close', () => {
                connections = connections.filter(c => c !== conn);
                peerStatus.textContent = 'Disconnected';
            });
        });
        conn.on('error', err => {
            console.error(err);
            alert('Connection error: ' + err);
        });
    });
    peer.on('error', err => {
        console.error(err);
        alert('Peer error: ' + err);
    });
}

function handlePeerData(data) {
    if (data.type === 'tts') {
        audioPlayer.src = data.url;
        audioPlayer.style.display = 'block';
        audioPlayer.play();
    } else if (data.type === 'stop') {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }
}