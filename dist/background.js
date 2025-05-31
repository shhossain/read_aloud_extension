(function () {
    'use strict';

    const defaultState = {
        theme: 'light',
        settings: {
            apiBase: "https://api.example.com/v1",
            voice: "af_jessica",
            speed: 1.0
        }
    };

    // Extension state
    let extensionState = {
        active: false,
        tabsWithContentScripts: new Set(),
        ttsSettings: defaultState.settings,
        theme: defaultState.theme
    };
    // Create context menu items
    function createContextMenus() {
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: "readFromHere",
                title: "Read aloud from here",
                contexts: ["page", "selection", "link"]
            });
        });
    }
    // Initialize or restore the extension state
    function initializeExtension() {
        chrome.storage.local.get(['active', 'ttsSettings', 'theme'], function (result) {
            // extensionState.active = result.active === undefined ? false : result.active;
            // Initialize TTS settings from storage or use defaults
            if (result.ttsSettings) {
                extensionState.ttsSettings = result.ttsSettings;
            }
            // Initialize theme from storage
            if (result.theme) {
                extensionState.theme = result.theme;
            }
            updateIcon();
            // Create context menu
            createContextMenus();
        });
    }
    // Update the extension icon based on the active state
    function updateIcon() {
        const iconPath = extensionState.active ?
            {
                '16': chrome.runtime.getURL('images/icon16-active.png'),
                '48': chrome.runtime.getURL('images/icon48-active.png'),
                '128': chrome.runtime.getURL('images/icon128-active.png')
            } : {
            '16': chrome.runtime.getURL('images/icon16.png'),
            '48': chrome.runtime.getURL('images/icon48.png'),
            '128': chrome.runtime.getURL('images/icon128.png')
        };
        chrome.action.setIcon({ path: iconPath });
    }
    // Toggle the extension state
    function toggleExtension() {
        extensionState.active = !extensionState.active;
        chrome.storage.local.set({ active: extensionState.active });
        updateIcon();
        // Notify all tabs with content scripts about the state change
        extensionState.tabsWithContentScripts.forEach(tabId => {
            chrome.tabs.sendMessage(tabId, {
                action: "extensionStateChanged",
                active: extensionState.active
            }).catch(() => {
                // If sending fails, the tab might have been closed or refreshed
                extensionState.tabsWithContentScripts.delete(tabId);
            });
        });
        return extensionState.active;
    }
    // Listen for messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "toggleActive") {
            const isActive = toggleExtension();
            sendResponse({ active: isActive });
        }
        else if (message.action === "getState") {
            sendResponse({ active: extensionState.active });
        }
        else if (message.action === "contentScriptLoaded" && sender.tab && sender.tab.id !== undefined) {
            // Track which tabs have the content script loaded
            extensionState.tabsWithContentScripts.add(sender.tab.id);
            // Send current state to the tab that just loaded
            chrome.tabs.sendMessage(sender.tab.id, {
                action: "extensionStateChanged",
                active: extensionState.active
            }).catch(error => console.log("Error sending initial state:", error));
            sendResponse({ acknowledged: true });
        }
        // else if (message.action === "stopReading") {
        //     // Send message to stop reading in all tabs with content scripts
        //     extensionState.tabsWithContentScripts.forEach(tabId => {
        //         chrome.tabs.sendMessage(tabId, { action: "stopReading" })
        //             .catch(() => {
        //                 // If sending fails, the tab might have been closed or refreshed
        //                 extensionState.tabsWithContentScripts.delete(tabId);
        //             });
        //     });
        //     sendResponse({ success: true });
        // }
        else if (message.action === "updateSettings" && message.settings) {
            // Update settings in extension state
            extensionState.ttsSettings = message.settings;
            // Save settings to storage
            chrome.storage.local.set({ ttsSettings: message.settings });
            // Broadcast settings to all tabs with content scripts
            extensionState.tabsWithContentScripts.forEach(tabId => {
                chrome.tabs.sendMessage(tabId, {
                    action: "updateSettings",
                    settings: message.settings
                }).catch(() => {
                    // If sending fails, the tab might have been closed or refreshed
                    extensionState.tabsWithContentScripts.delete(tabId);
                });
            });
            sendResponse({ success: true });
        }
        else if (message.action === "getSettings") {
            // Return current settings
            sendResponse({ settings: extensionState.ttsSettings });
        }
        else if (message.action === "saveTheme" && message.theme) {
            // Save theme preference
            extensionState.theme = message.theme;
            chrome.storage.local.set({ theme: message.theme });
            // Notify all tabs with content scripts about the theme change
            extensionState.tabsWithContentScripts.forEach(tabId => {
                chrome.tabs.sendMessage(tabId, {
                    action: "themeChanged",
                    theme: message.theme
                }).catch(() => {
                    // If sending fails, the tab might have been closed or refreshed
                    extensionState.tabsWithContentScripts.delete(tabId);
                });
            });
            sendResponse({ success: true });
        }
        else if (message.action === "getTheme") {
            // Return current theme
            sendResponse({ theme: extensionState.theme });
        }
        // Return true to indicate async response
        return true;
    });
    // Listen for tab close events to clean up our tab tracking
    chrome.tabs.onRemoved.addListener((tabId) => {
        extensionState.tabsWithContentScripts.delete(tabId);
    });
    // Handle context menu clicks
    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === "readFromHere" && tab && tab.id !== undefined) {
            const tabId = tab.id;
            // Make sure the extension is active
            if (!extensionState.active) {
                toggleExtension();
            }
            // Check if this tab has our content script loaded
            if (extensionState.tabsWithContentScripts.has(tabId)) {
                // Send message to content script to start reading from the clicked position
                chrome.tabs.sendMessage(tabId, {
                    action: "startReadingFromContextMenu"
                }).catch(error => {
                    console.error("Error sending read command to tab:", error);
                    // Remove tab from the set if the message fails
                    extensionState.tabsWithContentScripts.delete(tabId);
                });
            }
            else {
                // The content script might not be loaded yet
                // We'll need to inject it (but this will happen automatically when needed)
                console.log("Content script not detected in this tab");
            }
        }
    });
    // Initialize the extension when the background script loads
    initializeExtension();

})();
//# sourceMappingURL=background.js.map
