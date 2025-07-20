let voices = JSON.parse(localStorage.getItem('elevenlabs_voices') || '[]');
let selectedVoiceId = localStorage.getItem('selected_voice') || null;
let currentAudioUrl = null;

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

// AI Rap Battle elements
const startListeningBtn = document.getElementById('startListeningBtn');
const stopListeningBtn = document.getElementById('stopListeningBtn');
const generateRapBtn = document.getElementById('generateRapBtn');
const transcriptionContainer = document.getElementById('transcriptionContainer');
const transcriptionOutput = document.getElementById('transcriptionOutput');
const capturedAudio = document.getElementById('capturedAudio');

// Speech Recognition
let recognition = null;
let transcribedText = '';
let mediaStream = null;

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

// AI Rap Battle Listeners
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        let interim_transcript = '';
        let final_transcript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                final_transcript += event.results[i][0].transcript;
            } else {
                interim_transcript += event.results[i][0].transcript;
            }
        }
        
        if (final_transcript) {
            transcribedText += (transcribedText ? ' ' : '') + final_transcript;
        }

        transcriptionOutput.innerHTML = transcribedText + `<i style="color: #999;">${interim_transcript}</i>`;
    };

    recognition.onstart = () => {
        startListeningBtn.style.display = 'none';
        stopListeningBtn.style.display = 'inline-flex';
        stopListeningBtn.textContent = "Stop Capturing";
        transcriptionContainer.style.display = 'block';
        generateRapBtn.disabled = true;
    };

    recognition.onend = () => {
        // Don't hide the stop button here, it's handled in stopListening
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        alert(`Speech recognition error: ${event.error}. Ensure you selected a tab with audio and granted permissions.`);
        stopListening();
    };

    startListeningBtn.addEventListener('click', startListening);
    stopListeningBtn.addEventListener('click', stopListening);

    generateRapBtn.addEventListener('click', generateRapResponse);

} else {
    document.querySelector('.ai-battle-section').innerHTML = '<h2>AI Rap Battle</h2><p>Sorry, your browser does not support the Web Speech API for transcription.</p>';
}

async function startListening() {
    try {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100,
            },
        });

        // Use a hidden audio element to play the captured audio.
        // This is a workaround to make sure the stream is active and can be picked up.
        capturedAudio.srcObject = mediaStream;
        capturedAudio.play().catch(e => console.error("Error playing captured audio:", e));
        
        // Stop any previous video track to save resources
        mediaStream.getVideoTracks().forEach(track => track.stop());

        transcribedText = '';
        transcriptionOutput.innerHTML = '';
        recognition.start();

    } catch (err) {
        console.error("Error starting tab capture:", err);
        if (err.name === 'NotAllowedError') {
            alert("Permission to capture tab was denied. Please try again and allow access.");
        } else {
            alert(`An error occurred: ${err.name}`);
        }
    }
}

function stopListening() {
    if (recognition) {
        recognition.stop();
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    capturedAudio.srcObject = null;
    startListeningBtn.style.display = 'inline-flex';
    stopListeningBtn.style.display = 'none';
    generateRapBtn.disabled = !transcribedText.trim();
}

async function generateRapResponse() {
    if (!transcribedText.trim() || !selectedVoiceId) {
        alert("Please record something and select a voice first.");
        return;
    }

    generateRapBtn.disabled = true;
    generateRapBtn.textContent = 'AI is thinking...';

    try {
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a witty and sharp AI rapper. You will be given a text transcription of your opponent's rap. Your task is to generate a short, clever, and powerful rap battle response. The response should be a comeback that directly addresses or cleverly flips what your opponent said. Keep it concise, 2-4 lines long.",
                },
                {
                    role: 'user',
                    content: `My opponent's rap: "${transcribedText}"`
                }
            ],
        });
        
        const rapResponse = completion.content;
        
        // Use existing TTS function to speak the response
        textInput.value = rapResponse; // Put response in the main textbox
        await speakText();

    } catch (error) {
        console.error("Error generating rap response:", error);
        alert("Sorry, there was an error with the AI. Please try again.");
    } finally {
        generateRapBtn.disabled = false;
        generateRapBtn.textContent = 'Generate Rap Response';
    }
}

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
            if (data.type === 'tts') {
                playReceivedAudio(data.url);
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
        document.querySelector('.tts-section .controls button').style.display = 'none';
    } else {
        document.querySelector('.tts-section .input-group').style.display = 'block';
        document.querySelector('.tts-section .controls button').style.display = 'inline-flex';
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
    
    voices.forEach(voice => {
        const item = document.createElement('div');
        item.className = `voice-item ${voice.id === selectedVoiceId ? 'selected' : ''}`;
        
        item.innerHTML = `
            <div class="voice-info">
                <div class="voice-id">${voice.name}</div>
            </div>
            <div class="voice-actions">
                <button ${isHost || !peer ? `onclick="selectVoice('${voice.id}')"` : 'disabled title="Only host can select voices"'} >Select</button>
                <button class="delete-btn" ${isHost || !peer ? `onclick="deleteVoice('${voice.id}')"` : 'disabled title="Only host can manage voices"'}>Delete</button>
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
        
        // If host, send to peer. If peer, this function shouldn't be callable.
        if (isHost && conn && conn.open) {
            conn.send({ type: 'tts', url: currentAudioUrl });
        }

        // Play audio for the user who initiated it (the host)
        audioPlayer.src = currentAudioUrl;
        audioPlayer.style.display = 'block';
        await audioPlayer.play();
        
    } catch (error) {
        console.error('Error generating speech:', error);
        alert('Error generating speech. Please check the voice ID and try again.');
    } finally {
        speakBtn.disabled = false;
        speakBtn.textContent = 'Speak';
    }
}

function playReceivedAudio(url) {
    console.log('Received audio to play:', url);
    audioPlayer.src = url;
    audioPlayer.style.display = 'block';
    audioPlayer.play().catch(e => console.error("Error playing received audio:", e));
}

function stopAudio() {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
}

function updateButtonStates() {
    const canSpeak = (isHost || !peer) && selectedVoiceId && textInput.value.trim();
    speakBtn.disabled = !canSpeak;
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