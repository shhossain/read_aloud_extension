import { getVoices } from "./helpers";
import { TTSSettings } from "./types/common";
import { defaultState } from "./types/state";


document.addEventListener('DOMContentLoaded', function () {
    // const activeToggle = document.getElementById('activeToggle') as HTMLInputElement;
    const statusText = document.getElementById('statusText') as HTMLElement;
    const stopReadingBtn = document.getElementById('stopReading') as HTMLButtonElement;
    const voiceSelect = document.getElementById('voiceSelect') as HTMLSelectElement;
    const customVoiceInput = document.getElementById('customVoice') as HTMLInputElement;
    const refreshVoicesBtn = document.getElementById('refreshVoices') as HTMLButtonElement;
    const speedRange = document.getElementById('speedRange') as HTMLInputElement;
    const speedValue = document.getElementById('speedValue') as HTMLElement;
    const saveSettingsBtn = document.getElementById('saveSettings') as HTMLButtonElement;
    const statusMessage = document.getElementById('statusMessage') as HTMLElement;
    const themeToggle = document.getElementById('themeToggle') as HTMLButtonElement;
    const themeIcon = document.getElementById('themeIcon') as HTMLElement;
    const themeText = document.getElementById('themeText') as HTMLElement;

    // api
    const apiBaseInput = document.getElementById('apiBase') as HTMLInputElement;
    const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;

    const modelInput = document.getElementById('model') as HTMLInputElement;

    // Initialize toggle state based on extension state
    chrome.runtime.sendMessage({ action: "getState" }, function (response) {
        if (response && response.active !== undefined) {
            // activeToggle.checked = response.active;
            updateStatusText(response.active);
        }
    });    // Initialize settings
    chrome.storage.local.get(['ttsSettings'], function (result) {
        const settings: TTSSettings = result.ttsSettings || defaultState.settings;

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

    const fetchVoices = async (apiBase: string, apiKey?: string) => {
        statusMessage.textContent = "Loading available voices...";
        const res = await getVoices(apiBase, apiKey);
        voiceSelect.innerHTML = '';
        if (!res.voices || res.voices.length === 0) {
            statusMessage.textContent = "No voices available. Please check API base URL.";
            statusMessage.classList.add("error");

        } else {
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
                const settings: TTSSettings = result.ttsSettings || defaultState.settings;

                // Select the previously saved voice if it exists in the list
                if (settings.voice && res.voices.includes(settings.voice)) {
                    voiceSelect.value = settings.voice;
                } else {
                    // If not found, default to the first available voice
                    voiceSelect.value = res.voices[0];
                }
            });
        }
    }

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
    });    // Handle save settings button


    saveSettingsBtn.addEventListener('click', function () {
        // Determine which voice to use - custom input has priority if not empty
        const customVoice = customVoiceInput.value.trim();
        const selectedVoice = customVoice || voiceSelect.value;
        const apiKey = apiKeyInput.value.trim();
        const model = modelInput.value.trim();

        const settings: TTSSettings = {
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
        } else {
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
    function applyTheme(theme: string): void {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeIcon.textContent = '☀️';
            themeText.textContent = 'Light Mode';
        } else {
            document.documentElement.removeAttribute('data-theme');
            themeIcon.textContent = '🌙';
            themeText.textContent = 'Dark Mode';
        }
    }

    // Update status text based on active state
    function updateStatusText(isActive: boolean): void {
        if (!statusText) return;
        statusText.textContent = isActive ? "Extension On" : "Extension Off";
    }
});
