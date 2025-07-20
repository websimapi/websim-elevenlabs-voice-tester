let voices = JSON.parse(localStorage.getItem('elevenlabs_voices') || '[]');
let selectedVoiceId = localStorage.getItem('selected_voice') || null;
let currentAudioUrl = null;
const audioCache = new Map(); // Cache for audio blobs: key -> { blob, text, voiceId }

// PeerJS variables
let peer = null;
let conn = null;
let isHost = false;

// DOM elements
const voiceIdInput = document.getElementById('voiceIdInput');
const addVoiceBtn = document.getElementById('addVoiceBtn');
const voiceList = document.getElementById('voiceList');
const textInput = document.getElementById('textInput');
const speakBtn = document.getElementById('speakBtn');
const stopBtn = document.getElementById('stopBtn');
const audioPlayer = document.getElementById('audioPlayer');
const hostBtn = document.getElementById('hostBtn');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const hostIdInput = document.getElementById('hostIdInput');
const peerStatus = document.getElementById('peer-status');
const myPeerIdSpan = document.getElementById('myPeerId');
const connectContainer = document.getElementById('connect-container');
const audioHistoryList = document.getElementById('audioHistoryList');

// Initialize
renderVoiceList();
updateButtonStates();
renderAudioHistory();

// Event listeners
addVoiceBtn.addEventListener('click', addVoice);
voiceIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addVoice();
});

speakBtn.addEventListener('click', speakText);
stopBtn.addEventListener('click', stopAudio);

// PeerJS Listeners
hostBtn.addEventListener('click', startHosting);
connectBtn.addEventListener('click', connectToHost);
disconnectBtn.addEventListener('click', disconnect);
myPeerIdSpan.addEventListener('click', () => {
    if (peer && peer.id) {
        navigator.clipboard.writeText(peer.id).then(() => {
            alert('Host ID copied to clipboard!');
        });
    }
});

// Preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const voiceId = btn.dataset.voice;
        const name = btn.textContent;
        addVoiceFromPreset(voiceId, name);
    });
});

function startHosting() {
    isHost = true;
    peer = new Peer();

    peer.on('open', id => {
        myPeerIdSpan.textContent = id;
        peerStatus.textContent = `Hosting. Waiting for connection...`;
        updatePeerUI(true, false);
    });

    peer.on('connection', connection => {
        conn = connection;
        peerStatus.textContent = `Connected to Peer: ${conn.peer}`;
        peerStatus.classList.add('connected');

        conn.on('open', () => {
            console.log('Connection opened with peer:', conn.peer);
        });

        conn.on('close', () => {
            peerStatus.textContent = 'Peer disconnected. You are still hosting.';
            peerStatus.classList.remove('connected');
            conn = null;
        });
    });

    peer.on('error', err => {
        console.error('PeerJS error:', err);
        alert(`Error: ${err.message}`);
        disconnect();
    });
}

function connectToHost() {
    const hostId = hostIdInput.value.trim();
    if (!hostId) {
        alert('Please enter a Host ID.');
        return;
    }

    isHost = false;
    peer = new Peer();

    peer.on('open', id => {
        myPeerIdSpan.textContent = id;
        conn = peer.connect(hostId);
        peerStatus.textContent = `Connecting to ${hostId}...`;

        conn.on('open', () => {
            peerStatus.textContent = `Connected to Host: ${conn.peer}`;
            peerStatus.classList.add('connected');
            updatePeerUI(true, true);
        });

        conn.on('data', data => {
            if (data.type === 'tts-blob') {
                const blob = new Blob([data.blob], { type: 'audio/mpeg' });
                const localUrl = URL.createObjectURL(blob);
                audioCache.set(data.id, { blob, text: data.text, voiceId: data.voiceId, url: localUrl });
                renderAudioHistory();
                playAudio(localUrl);
            } else if (data.type === 'play-cached') {
                const cachedAudio = audioCache.get(data.id);
                if (cachedAudio && cachedAudio.url) {
                    playAudio(cachedAudio.url);
                }
            }
        });

        conn.on('close', () => {
            peerStatus.textContent = 'Disconnected from host.';
            peerStatus.classList.remove('connected');
            disconnect();
        });
    });

    peer.on('error', err => {
        console.error('PeerJS error:', err);
        alert(`Error: ${err.message}`);
        disconnect();
    });
}

function disconnect() {
    if (conn) {
        conn.close();
    }
    if (peer) {
        peer.destroy();
    }
    conn = null;
    peer = null;
    isHost = false;
    myPeerIdSpan.textContent = `(click 'Host' to get an ID)`;
    peerStatus.textContent = 'Status: Disconnected';
    peerStatus.classList.remove('connected');
    updatePeerUI(false, false);
}

function updatePeerUI(isConnected, isPeer) {
    hostBtn.style.display = isConnected ? 'none' : 'block';
    connectContainer.style.display = isConnected ? 'none' : 'block';
    disconnectBtn.style.display = isConnected ? 'block' : 'none';

    // Disable TTS controls if a peer and not connected
    const disableTTS = isPeer && !isConnected;
    textInput.disabled = disableTTS;
    document.querySelector('.voice-section').style.pointerEvents = disableTTS ? 'none' : 'auto';
    document.querySelector('.preset-section').style.pointerEvents = disableTTS ? 'none' : 'auto';

    if (isPeer && isConnected) {
        // Peer is connected, they can only listen
        document.querySelector('.tts-section .input-group').style.display = 'none';
        document.querySelector('.tts-section .controls button#speakBtn').style.display = 'none';
        document.querySelector('.tts-section .controls button#stopBtn').style.display = 'none';
    } else {
        document.querySelector('.tts-section .input-group').style.display = 'block';
        document.querySelector('.tts-section .controls button#speakBtn').style.display = 'inline-flex';
        document.querySelector('.tts-section .controls button#stopBtn').style.display = 'inline-flex';
    }
}

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
    
    // Clear existing onclick handlers to prevent memory leaks
    Array.from(voiceList.getElementsByTagName('button')).forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
    });

    voices.forEach(voice => {
        const item = document.createElement('div');
        item.className = `voice-item ${voice.id === selectedVoiceId ? 'selected' : ''}`;
        
        item.innerHTML = `
            <div class="voice-info">
                <div class="voice-id">${voice.name}</div>
            </div>
            <div class="voice-actions">
                <button class="select-btn" data-voice-id="${voice.id}" ${isHost || !peer ? '' : 'disabled title="Only host can select voices"'} >Select</button>
                <button class="delete-btn" data-voice-id="${voice.id}" ${isHost || !peer ? '' : 'disabled title="Only host can manage voices"'}>Delete</button>
            </div>
        `;
        
        voiceList.appendChild(item);
    });

    voiceList.querySelectorAll('.select-btn').forEach(btn => {
        btn.addEventListener('click', (e) => selectVoice(e.target.dataset.voiceId));
    });
    voiceList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteVoice(e.target.dataset.voiceId));
    });
}

async function speakText() {
    if (!selectedVoiceId || !textInput.value.trim()) return;
    const text = textInput.value.trim();
    const audioId = `${selectedVoiceId}:${text}`;

    if (audioCache.has(audioId)) {
        const cached = audioCache.get(audioId);
        playAudio(cached.url);
        if (isHost && conn && conn.open) {
            conn.send({ type: 'play-cached', id: audioId });
        }
        return;
    }

    speakBtn.disabled = true;
    speakBtn.textContent = 'Generating...';

    try {
        const result = await websim.textToSpeech({
            text: text,
            voice: selectedVoiceId,
        });

        const response = await fetch(result.url);
        const blob = await response.blob();
        const localUrl = URL.createObjectURL(blob);

        audioCache.set(audioId, { blob, text, voiceId: selectedVoiceId, url: localUrl });
        renderAudioHistory();
        
        if (isHost && conn && conn.open) {
            conn.send({ type: 'tts-blob', id: audioId, blob: blob, text: text, voiceId: selectedVoiceId });
        }

        playAudio(localUrl);
        
    } catch (error) {
        console.error('Error generating speech:', error);
        alert('Error generating speech. Please check the voice ID and try again.');
    } finally {
        updateButtonStates();
        speakBtn.textContent = 'Speak';
    }
}

function playAudio(url) {
    audioPlayer.src = url;
    audioPlayer.style.display = 'block';
    audioPlayer.play().catch(e => console.error("Error playing audio:", e));
    updateButtonStates();
}

function playReceivedAudio(url) {
    console.log('Received audio to play:', url);
    playAudio(url);
}

function stopAudio() {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
}

function updateButtonStates() {
    const canSpeak = (isHost || !peer) && selectedVoiceId && textInput.value.trim();
    speakBtn.disabled = !canSpeak || (speakBtn.textContent === 'Generating...');
    stopBtn.disabled = !audioPlayer.src || audioPlayer.paused;
}

function saveVoices() {
    localStorage.setItem('elevenlabs_voices', JSON.stringify(voices));
}

// Text input listener
textInput.addEventListener('input', updateButtonStates);

audioPlayer.addEventListener('play', updateButtonStates);
audioPlayer.addEventListener('pause', updateButtonStates);
audioPlayer.addEventListener('ended', updateButtonStates);

// Make functions global for onclick handlers
// No longer needed as we use event listeners
// window.selectVoice = selectVoice;
// window.deleteVoice = deleteVoice;