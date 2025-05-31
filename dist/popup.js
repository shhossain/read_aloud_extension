(function () {
    'use strict';

    const OPENAI_VOICES = [
        "alloy",
        "ash",
        "ballad",
        "coral",
        "echo",
        "fable",
        "nova",
        "onyx",
        "sage",
        "shimmer"
    ];

    const getVoices = async (apiBase, apiKey) => {
        try {
            const headers = {};
            if (apiKey) {
                headers["Authorization"] = `Bearer ${apiKey}`;
            }
            const response = await fetch(`${apiBase}/audio/voices`, {
                headers
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch voices: ${response.status}`);
            }
            const data = await response.json();
            return data;
        }
        catch (error) {
            console.log('Error fetching voices:', error);
            let voices = [];
            if (apiBase.includes("api.openai.com")) {
                voices = OPENAI_VOICES;
            }
            return {
                voices,
            };
        }
    };

    const defaultState = {
        reading: false,
        theme: 'light',
        settings: {
            apiBase: "https://api.example.com/v1",
            voice: "af_jessica",
            speed: 1.0
        }
    };

    class StateManager {
        constructor() {
            this.listeners = [];
            this.keyListeners = new Map();
        }
        addListener(listener) {
            this.listeners.push(listener);
            // Return a function to remove this listener
            return () => {
                const index = this.listeners.indexOf(listener);
                if (index !== -1) {
                    this.listeners.splice(index, 1);
                }
            };
        }
        addKeyListener(key, listener) {
            if (!this.keyListeners.has(key)) {
                this.keyListeners.set(key, []);
            }
            const listeners = this.keyListeners.get(key);
            listeners.push(listener);
            // Return function to remove this listener
            return () => {
                const keyListeners = this.keyListeners.get(key);
                if (keyListeners) {
                    const index = keyListeners.indexOf(listener);
                    if (index !== -1) {
                        keyListeners.splice(index, 1);
                    }
                }
            };
        }
        emit(prop, newValue, oldValue) {
            this.listeners.forEach(listener => listener(prop, newValue, oldValue));
            const keyListeners = this.keyListeners.get(prop);
            if (keyListeners && keyListeners.length > 0) {
                keyListeners.forEach(listener => listener(newValue, oldValue));
            }
        }
    }
    const getStateManager = () => {
        if (!window.stateManager) {
            window.stateManager = new StateManager();
        }
        return window.stateManager;
    };
    const stateManager = getStateManager();
    const handler = {
        get(target, prop) {
            window.state = window.state || defaultState;
            return window.state[prop];
        },
        set(target, prop, value) {
            window.state = window.state || defaultState;
            if (!window.state)
                return false;
            const oldValue = window.state[prop];
            // Only emit if value actually changed
            if (oldValue !== value) {
                console.log(`Assigning ${prop} = ${value}`);
                // @ts-ignore
                window.state[prop] = value;
                stateManager.emit(prop, value, oldValue);
            }
            else {
                // @ts-ignore
                window.state[prop] = value;
            }
            return true;
        }
    };
    new Proxy(defaultState, handler);

    window.globalAudio = null;

    document.addEventListener('DOMContentLoaded', function () {
        // const activeToggle = document.getElementById('activeToggle') as HTMLInputElement;
        const statusText = document.getElementById('statusText');
        const stopReadingBtn = document.getElementById('stopReading');
        const voiceSelect = document.getElementById('voiceSelect');
        const customVoiceInput = document.getElementById('customVoice');
        const refreshVoicesBtn = document.getElementById('refreshVoices');
        const speedRange = document.getElementById('speedRange');
        const speedValue = document.getElementById('speedValue');
        const saveSettingsBtn = document.getElementById('saveSettings');
        const statusMessage = document.getElementById('statusMessage');
        const themeToggle = document.getElementById('themeToggle');
        const themeIcon = document.getElementById('themeIcon');
        const themeText = document.getElementById('themeText');
        // api
        const apiBaseInput = document.getElementById('apiBase');
        const apiKeyInput = document.getElementById('apiKey');
        const modelInput = document.getElementById('model');
        // Initialize toggle state based on extension state
        chrome.runtime.sendMessage({ action: "getState" }, function (response) {
            if (response && response.active !== undefined) {
                // activeToggle.checked = response.active;
                updateStatusText(response.active);
            }
        }); // Initialize settings
        chrome.storage.local.get(['ttsSettings'], function (result) {
            const settings = result.ttsSettings || defaultState.settings;
            apiBaseInput.value = settings.apiBase;
            apiKeyInput.value = settings.apiKey || "";
            modelInput.value = settings.model || "";
            speedRange.value = settings.speed.toString();
            speedValue.textContent = `${settings.speed}x`;
            // if voice is not is the options
            if (!voiceSelect.querySelector(`option[value="${settings.voice}"]`)) {
                settings.voice = "coral"; // default to coral if not found
            }
            voiceSelect.value = settings.voice;
            // Fetch available voices after initializing settings
            fetchVoices(settings.apiBase, settings.apiKey);
        });
        const fetchVoices = async (apiBase, apiKey) => {
            statusMessage.textContent = "Loading available voices...";
            const res = await getVoices(apiBase, apiKey);
            voiceSelect.innerHTML = '';
            if (!res.voices || res.voices.length === 0) {
                statusMessage.textContent = "No voices available. Please check API base URL.";
                statusMessage.classList.add("error");
            }
            else {
                statusMessage.textContent = `${res.voices.length} voices loaded`;
                statusMessage.classList.remove("error");
                // Populate voice select options
                res.voices.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice;
                    option.textContent = voice;
                    voiceSelect.appendChild(option);
                });
                chrome.storage.local.get(['ttsSettings'], function (result) {
                    const settings = result.ttsSettings || defaultState.settings;
                    // Select the previously saved voice if it exists in the list
                    if (settings.voice && res.voices.includes(settings.voice)) {
                        voiceSelect.value = settings.voice;
                    }
                    else {
                        // If not found, default to the first available voice
                        voiceSelect.value = res.voices[0];
                    }
                });
            }
        };
        // activeToggle.addEventListener('change', function () {
        //     chrome.runtime.sendMessage({ action: "toggleActive" }, function (response) {
        //         if (response) {
        //             updateStatusText(response.active);
        //             // Show context menu info when turning on
        //             if (response.active) {
        //                 statusMessage.textContent = "Right-click on a page to use context menu";
        //                 statusMessage.classList.remove("error");
        //                 setTimeout(() => {
        //                     statusMessage.textContent = '';
        //                 }, 3000);
        //             }
        //         }
        //     });
        // });    // Handle stop reading button
        stopReadingBtn?.addEventListener('click', function () {
            chrome.runtime.sendMessage({ action: "stopReading" }, function (response) {
                if (response && response.success) {
                    console.log("Reading stopped in all tabs");
                }
            });
        });
        // Handle refresh voices button
        refreshVoicesBtn.addEventListener('click', function () {
            fetchVoices(apiBaseInput.value.trim(), apiKeyInput.value.trim());
            statusMessage.textContent = "Refreshing voices...";
        });
        // Handle speed range change
        speedRange.addEventListener('input', function () {
            const speed = parseFloat(speedRange.value);
            speedValue.textContent = `${speed.toFixed(1)}x`;
        }); // Handle save settings button
        saveSettingsBtn.addEventListener('click', function () {
            // Determine which voice to use - custom input has priority if not empty
            const customVoice = customVoiceInput.value.trim();
            const selectedVoice = customVoice || voiceSelect.value;
            const apiKey = apiKeyInput.value.trim();
            const model = modelInput.value.trim();
            const settings = {
                apiBase: apiBaseInput.value.trim(),
                voice: selectedVoice,
                speed: parseFloat(speedRange.value),
                apiKey: apiKey || undefined,
                model: model || undefined
            };
            // Save settings to storage
            chrome.storage.local.set({ ttsSettings: settings }, function () {
                // Update settings in background script and all active tabs
                chrome.runtime.sendMessage({
                    action: "updateSettings",
                    settings: settings
                }, function (response) {
                    if (response && response.success) {
                        statusMessage.textContent = "Settings saved successfully!";
                        statusMessage.classList.remove("error");
                        setTimeout(() => {
                            statusMessage.textContent = '';
                        }, 3000);
                    }
                });
            });
        });
        // Initialize theme based on stored preference
        chrome.runtime.sendMessage({ action: "getTheme" }, function (response) {
            if (response && response.theme) {
                applyTheme(response.theme);
            }
            else {
                // Check system preference for dark mode if no saved theme
                if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    applyTheme('dark');
                }
            }
        });
        // Theme toggle button handler
        themeToggle?.addEventListener('click', function () {
            // Get the current theme
            let currentTheme = document.documentElement.getAttribute('data-theme');
            let newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            // Apply the theme
            applyTheme(newTheme);
            // Save the theme preference
            chrome.runtime.sendMessage({
                action: "saveTheme",
                theme: newTheme
            });
        });
        // Function to apply theme
        function applyTheme(theme) {
            if (theme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
                themeIcon.textContent = '☀️';
                themeText.textContent = 'Light Mode';
            }
            else {
                document.documentElement.removeAttribute('data-theme');
                themeIcon.textContent = '🌙';
                themeText.textContent = 'Dark Mode';
            }
        }
        // Update status text based on active state
        function updateStatusText(isActive) {
            if (!statusText)
                return;
            statusText.textContent = isActive ? "Extension On" : "Extension Off";
        }
    });

})();
//# sourceMappingURL=popup.js.map
