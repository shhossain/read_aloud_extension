import { clearPreviousSession, getVoices } from "../helpers";
import { TTSSettings } from "../types/common";
import { state, subscribeToKey } from "./state";



export function createControlPanel(): void {
    // Don't create multiple panels
    if (document.getElementById('read-aloud-control-panel')) {
        return;
    }

    // Create the control panel container
    const panel = document.createElement('div');
    panel.id = 'read-aloud-control-panel';
    panel.className = 'read-aloud-control-panel';


    // Create control panel content
    panel.innerHTML = `
    <div class="read-aloud-controls">
        <div class="read-aloud-left">
            <div style="display: flex; align-items: center;">
                <div id="read-aloud-wave" class="read-aloud-wave">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <div class="read-aloud-title">Read Aloud</div>
            </div>
        </div>
        <div class="read-aloud-buttons">
            <button id="read-aloud-stop" class="read-aloud-button stop" disabled>Stop</button>
        </div>
        <div class="read-aloud-settings">
            <button id="read-aloud-settings-toggle" class="read-aloud-button settings-toggle" title="Settings">
                <span>⚙️</span>
            </button>
            <div id="read-aloud-settings-dropdown" class="read-aloud-settings-dropdown">
                <label>
                    <span>Voice:</span>
                    <select id="read-aloud-voice">
                        <option value="loading">Loading voices...</option>
                    </select>
                </label>
                <label>
                    <span>Speed:</span>
                    <input type="range" min="0.5" max="2.5" step="0.1" value="1.5" id="read-aloud-speed">
                    <span id="read-aloud-speed-value">1.5x</span>
                </label>
                <label>
                    <span>Theme:</span>
                    <button id="read-aloud-theme-toggle" class="read-aloud-button theme-toggle" title="Toggle Dark Mode">
                        <span id="theme-icon">🌙</span>
                    </button>
                </label>
            </div>
            <button id="read-aloud-close" class="read-aloud-button close-button" title="Close Panel">
                <span>✕</span>
            </button>
        </div>
    </div>
`;

    // Insert at the top of the page
    document.body.insertBefore(panel, document.body.firstChild);


    initializeSettings();
    attachEventListeners();
}

/**
 * Initialize settings in the control panel
 */
function initializeSettings(): void {
    chrome.runtime.sendMessage({ action: "getSettings" }, function (response) {
        if (response && response.settings) {
            updateControlSettings(response.settings);
            fetchVoices(response.settings);
        }
    });

    // Initialize theme
    chrome.runtime.sendMessage({ action: "getTheme" }, function (response) {
        if (response && response.theme) {
            // Update state and apply theme
            state.theme = response.theme;
            applyTheme(response.theme);
        } else {
            // Check system preference for dark mode if no saved theme
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                state.theme = 'dark';
                applyTheme('dark');
                saveThemePreference('dark');
            }
        }
    });
}

/**
 * Update control panel with current settings
 */
function updateControlSettings(settings: TTSSettings): void {
    // if (speedRangeElement && speedValueElement) {
    //     speedRangeElement.value = settings.speed.toString();
    //     speedValueElement.textContent = `${settings.speed}x`;
    // }
    const speedRange = document.getElementById('read-aloud-speed') as HTMLInputElement;
    const speedValue = document.getElementById('read-aloud-speed-value') as HTMLSpanElement;
    if (speedRange && speedValue) {
        speedRange.value = settings.speed.toString();
        speedValue.textContent = `${settings.speed.toFixed(1)}x`;
    }
}

function attachEventListeners(): void {
    // Stop button
    const stopButton = document.getElementById('read-aloud-stop');
    const startButton = document.getElementById('read-aloud-start');
    const settingsToggle = document.getElementById('read-aloud-settings-toggle');
    const settingsDropdown = document.getElementById('read-aloud-settings-dropdown');
    const themeToggle = document.getElementById('read-aloud-theme-toggle');
    const closeButton = document.getElementById('read-aloud-close');
    const speedRangeElement = document.getElementById('read-aloud-speed');
    const speedValueElement = document.getElementById('read-aloud-speed-value');
    const voiceSelectElement = document.getElementById('read-aloud-voice');


    if (stopButton) {
        stopButton.addEventListener('click', clearPreviousSession);
    }

    // Start button
    if (startButton) {
        startButton.addEventListener('click', () => {
            setExtensionActive(true);
        });
    }

    if (settingsToggle && settingsDropdown) {
        settingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsDropdown.classList.toggle('open');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const target = e.target as Element;
            if (!settingsDropdown.contains(target) && !settingsToggle.contains(target)) {
                settingsDropdown.classList.remove('open');
            }
        });
    }

    // Speed range
    if (speedRangeElement && speedValueElement) {
        speedRangeElement.addEventListener('input', () => {
            const speed = parseFloat((speedRangeElement as HTMLInputElement).value);
            speedValueElement!.textContent = `${speed.toFixed(1)}x`;
            saveSettings();
        });
    }

    // Voice select
    if (voiceSelectElement) {
        voiceSelectElement.addEventListener('change', saveSettings);
    }

    // Theme toggle
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            clearPreviousSession();
            hideControlPanel();
        });
    }

    subscribeToKey("reading", (newValue) => {
        const waveElement = document.getElementById('read-aloud-wave');
        const stopButton = document.getElementById('read-aloud-stop');
        if (waveElement) {
            if (newValue) {
                waveElement.classList.add('active');
            } else {
                waveElement.classList.remove('active');
            }
        }

        // disable/enable stop button
        if (stopButton) {
            if (newValue) {
                stopButton.classList.remove('disabled');
                stopButton.removeAttribute('disabled');
            } else {
                stopButton.classList.add('disabled');
                stopButton.setAttribute('disabled', 'true');
            }
        }
    });



}

function setExtensionActive(active: boolean): void {
    const controlPanelElement = document.getElementById('read-aloud-control-panel');
    chrome.runtime.sendMessage({
        action: "toggleActive"
    }, function (response) {
        // If the extension is now active, show a message to the user
        if (response && response.active) {
            const message = document.createElement('div');
            message.className = 'read-aloud-message';
            message.textContent = 'Click anywhere on the page to start reading';

            // Add message to the control panel
            if (controlPanelElement) {
                controlPanelElement.appendChild(message);

                // Remove message after 3 seconds
                setTimeout(() => {
                    if (message.parentNode === controlPanelElement && controlPanelElement) {
                        controlPanelElement.removeChild(message);
                    }
                }, 3000);
            }

        }
    });
}

/**
 * Save current settings to storage and update background script
 */
function saveSettings(): void {
    const speedRangeElement = document.getElementById('read-aloud-speed') as HTMLInputElement;
    const voiceSelectElement = document.getElementById('read-aloud-voice') as HTMLSelectElement;
    console.log('Saving settings...');
    chrome.runtime.sendMessage({ action: "getSettings" }, function (response) {
        if (response && response.settings) {
            const settings: TTSSettings = { ...response.settings };
            console.log('Current settings:', settings);

            // Update with current control panel values
            if (speedRangeElement) {
                settings.speed = parseFloat(speedRangeElement.value);
            }

            if (voiceSelectElement && voiceSelectElement.value !== 'loading') {
                settings.voice = voiceSelectElement.value;
            }

            // Save settings
            chrome.runtime.sendMessage({
                action: "updateSettings",
                settings: settings
            });
            state.settings = settings; // Update state with new settings
        }
    });
}

/**
 * Fetch available voices from the API
 */
async function fetchVoices(settings: TTSSettings): Promise<void> {
    const voiceSelectElement = document.getElementById('read-aloud-voice') as HTMLSelectElement;

    try {
        const data = await getVoices(settings.apiBase, settings.apiKey);

        if (voiceSelectElement) {
            // Clear existing options
            voiceSelectElement.innerHTML = '';

            // Add voices to select element
            data.voices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice;
                option.textContent = voice;
                voiceSelectElement?.appendChild(option);
            });

            // Select the current voice from settings
            chrome.runtime.sendMessage({ action: "getSettings" }, function (response) {
                if (response && response.settings && response.settings.voice) {
                    // Find the voice in options
                    const voiceExists = Array.from(voiceSelectElement!.options)
                        .some(option => option.value === response.settings.voice);

                    if (voiceExists && voiceSelectElement) {
                        voiceSelectElement.value = response.settings.voice;
                    }
                }
            });
        }
    } catch (error) {
        console.log('Error fetching voices:', error);

        // Add a default option
        if (voiceSelectElement) {
            voiceSelectElement.innerHTML = '<option value="af_jessica">Jessica (Default)</option>';

            // Try to restore the saved voice
            chrome.runtime.sendMessage({ action: "getSettings" }, function (response) {
                if (response && response.settings && response.settings.voice) {
                    if (response.settings.voice !== "af_jessica") {
                        // Add the saved voice as an option
                        const option = document.createElement('option');
                        option.value = response.settings.voice;
                        option.textContent = `${response.settings.voice} (Saved)`;
                        voiceSelectElement?.appendChild(option);

                        if (voiceSelectElement) {
                            voiceSelectElement.value = response.settings.voice;
                        }
                    }
                }
            });
        }
    }
}

export function hasControlPanel(): boolean {
    const panel = document.getElementById('read-aloud-control-panel');
    if (panel) {
        return panel.style.display !== 'none';
    }
    return false;
}

/**
 * Hide the control panel
 */
export function hideControlPanel(): void {
    const panel = document.getElementById('read-aloud-control-panel');
    if (panel) {
        panel.style.display = 'none';
    }
}

/**
 * Show the control panel
 */
export function showControlPanel(): void {
    const panel = document.getElementById('read-aloud-control-panel');
    if (panel) {
        panel.style.display = 'flex';
    } else {
        createControlPanel();
    }
}

/**
 * Toggle between light and dark themes
 */
function toggleTheme(): void {
    // Determine current theme and switch to opposite
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    state.theme = newTheme;

    // Update DOM with the new theme
    if (newTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) {
            themeIcon.textContent = '☀️';
        }
    } else {
        document.documentElement.removeAttribute('data-theme');
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) {
            themeIcon.textContent = '🌙';
        }
    }

    // Save theme preference
    saveThemePreference(newTheme);
}

/**
 * Apply theme to DOM
 * @param theme The theme to apply ('light' or 'dark')
 */
function applyTheme(theme: string): void {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) {
            themeIcon.textContent = '☀️';
        }
    } else {
        document.documentElement.removeAttribute('data-theme');
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) {
            themeIcon.textContent = '🌙';
        }
    }
}

/**
 * Save theme preference to storage
 * @param theme The theme to save
 */
function saveThemePreference(theme: string): void {
    chrome.runtime.sendMessage({
        action: "saveTheme",
        theme: theme
    });
}
