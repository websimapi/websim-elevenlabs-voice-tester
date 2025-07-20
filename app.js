let voices = JSON.parse(localStorage.getItem('elevenlabs_voices') || '[]');
let selectedVoiceId = localStorage.getItem('selected_voice') || null;
let currentAudioUrl = null;
let receivedAudioBlobUrl = null; // For peer to manage received audio

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
const peerReadyContainer = document.getElementById('peer-ready-container');
const peerReadyBtn = document.getElementById('peerReadyBtn');

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

peerReadyBtn.addEventListener('click', async () => {
    try {
        // Create a very short silent audio to establish user gesture
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Make it silent
        gainNode.gain.value = 0;
        oscillator.frequency.value = 440;
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.01);
        
        // Also try to play a silent audio element
        const silentAudio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhOSGM1/PNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhOSGM1/PNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhOSGM1/PNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhOSGM1/PNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhOSGM1/PNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhOSGM1/PNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhOSGM1/PNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhOSGM1/PNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhOSGM1/PNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhOSGM1/PNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhOSGM1/PNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhO');
        silentAudio.volume = 0;
        await silentAudio.play();
        
    } catch (error) {
        console.log('Audio context setup failed, but user gesture is registered:', error);
    }
    
    peerReadyContainer.style.display = 'none';
    console.log('Peer is ready to receive audio.');
    peerStatus.textContent += ' - Ready for audio!';
});

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

        conn.on('data', async data => {
            if (data.type === 'tts-audio') {
                await playReceivedAudioFromArrayBuffer(data.arrayBuffer);
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
    hostBtn.style.display = isConnected ? 'none' : 'inline-flex';
    connectContainer.style.display = isConnected ? 'none' : 'block';
    disconnectBtn.style.display = isConnected ? 'block' : 'none';

    // Disable adding/selecting voices if connected as a peer
    const isClient = isPeer && isConnected;
    document.querySelector('.voice-section').style.pointerEvents = isClient ? 'none' : 'auto';
    document.querySelector('.preset-section').style.pointerEvents = isClient ? 'none' : 'auto';
    
    document.querySelector('.tts-section .input-group').style.display = isClient ? 'none' : 'block';
    speakBtn.style.display = isClient ? 'none' : 'inline-flex';
    peerReadyContainer.style.display = isClient ? 'block' : 'none';
    
    if (!isConnected) {
        peerReadyContainer.style.display = 'none';
    }

    if (isClient) {
        textInput.value = ''; // Clear host's text input if they become a client
    }
    
    renderVoiceList(); // Re-render to enable/disable buttons
    updateButtonStates();
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
    
    voices.forEach(voice => {
        const item = document.createElement('div');
        item.className = `voice-item ${voice.id === selectedVoiceId ? 'selected' : ''}`;
        
        const isClient = !isHost && peer && conn;

        item.innerHTML = `
            <div class="voice-info">
                <div class="voice-id">${voice.name}</div>
            </div>
            <div class="voice-actions">
                <button ${isClient ? 'disabled title="Only host can select voices"' : `onclick="selectVoice('${voice.id}')"`} >Select</button>
                <button class="delete-btn" ${isClient ? 'disabled title="Only host can manage voices"' : `onclick="deleteVoice('${voice.id}')"`}>Delete</button>
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

        currentAudioUrl = result.url;
        
        // If host, fetch blob and send to peer *before* playing locally.
        if (isHost && conn && conn.open) {
            const response = await fetch(currentAudioUrl);
            const audioBlob = await response.blob();
            const arrayBuffer = await audioBlob.arrayBuffer();
            conn.send({ type: 'tts-audio', arrayBuffer: arrayBuffer });
        }

        // Play audio for the user who initiated it
        audioPlayer.src = currentAudioUrl;
        audioPlayer.style.display = 'block';
        audioPlayer.play().catch(e => console.error("Error playing host audio:", e));
        updateButtonStates();
        
    } catch (error) {
        console.error('Error generating speech:', error);
        alert('Error generating speech. Please check the voice ID and try again.');
    } finally {
        speakBtn.disabled = false;
        speakBtn.textContent = 'Speak';
    }
}

async function playReceivedAudioFromArrayBuffer(arrayBuffer) {
    console.log('Received audio arrayBuffer to play:', arrayBuffer);
    try {
        if (receivedAudioBlobUrl) {
            URL.revokeObjectURL(receivedAudioBlobUrl);
        }

        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        receivedAudioBlobUrl = URL.createObjectURL(blob);
        audioPlayer.src = receivedAudioBlobUrl;
        audioPlayer.style.display = 'block';
        
        // Force play with better error handling
        try {
            await audioPlayer.play();
            console.log('Audio playing successfully');
        } catch (playError) {
            console.error('Failed to auto-play audio:', playError);
            // Show a notification or button for manual play if auto-play fails
            alert('Audio ready to play - click the audio controls to play');
        }
        
        updateButtonStates();
    } catch (error) {
        console.error('Error processing received audio:', error);
    }
}

function playReceivedAudioBlob(blob) {
}

function stopAudio() {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    if (receivedAudioBlobUrl) {
        URL.revokeObjectURL(receivedAudioBlobUrl);
        receivedAudioBlobUrl = null;
    }
    // Note: We don't revoke currentAudioUrl here because it's managed by speakText
    // and might be needed again if the host wants to replay without regenerating.
}

function updateButtonStates() {
    const canSpeak = (isHost || !peer) && selectedVoiceId && textInput.value.trim() !== '';
    speakBtn.disabled = !canSpeak;
    stopBtn.disabled = audioPlayer.paused || !audioPlayer.src;
}

function saveVoices() {
    localStorage.setItem('elevenlabs_voices', JSON.stringify(voices));
}

// Text input listener
textInput.addEventListener('input', updateButtonStates);

// Make functions global for onclick handlers
window.selectVoice = selectVoice;
window.deleteVoice = deleteVoice;