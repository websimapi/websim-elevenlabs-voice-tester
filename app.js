let voices = JSON.parse(localStorage.getItem('elevenlabs_voices') || '[]');
let selectedVoiceId = localStorage.getItem('selected_voice') || null;
let currentAudioUrl = null;

// DOM elements
const voiceIdInput = document.getElementById('voiceIdInput');
const addVoiceBtn = document.getElementById('addVoiceBtn');
const voiceList = document.getElementById('voiceList');
const textInput = document.getElementById('textInput');
const speakBtn = document.getElementById('speakBtn');
const stopBtn = document.getElementById('stopBtn');
const audioPlayer = document.getElementById('audioPlayer');

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

