import { clearPreviousSession } from "./helpers";
import { hasControlPanel, hideControlPanel, showControlPanel } from "./modules/controlPanel";
import { findFirstTextNode } from "./modules/domTraversal";
import { state } from "./modules/state";
import { processElement } from "./modules/textReader";

async function handleContextMenuClick() {
    showControlPanel();

    const selection = window.getSelection();
    if (!selection) return;
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    let node = range.startContainer;
    let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    element = findFirstTextNode(element as HTMLElement);

    if (!element) return;

    clearPreviousSession().then(() => {
        const offset = range.startOffset || 0;
        let text = range.startContainer.textContent || "";
        const before = text.slice(0, offset);
        const wordStart = before.lastIndexOf(" ") + 1;

        // Start the new reading process immediately
        state.reading = true;
        processElement(element as HTMLElement, wordStart);
    });
}

/**
 * Initialize the extension when the content script is loaded
 */
function initializeExtension(): void {
    // // Check extension state and show/hide control panel accordingly
    // chrome.runtime.sendMessage({ action: "getState" }, function (response) {
    //     if (response && response.active) {
    //         showControlPanel();
    //     } else {
    //         hideControlPanel();
    //     }
    // });    // Listen for clicks

    document.addEventListener("click", function (event: MouseEvent) {
        if (!hasControlPanel()) return;

        // Get the clicked element
        const clickedElement = event.target as HTMLElement;

        // Skip clicks on the control panel itself
        if (clickedElement.closest("#read-aloud-control-panel")) {
            return;
        }

        // Find the nearest ancestor (or the element itself) matching a selector
        const nearest = findFirstTextNode(clickedElement.closest("p, h1, h2, h3, h4, h5, h6, td, th, span, li"));

        console.log("Nearest matching element:", nearest); // First, ensure any existing reading is completely stopped
        if (nearest) {
        // Using our new cancelAllReadingOperations function which returns a promise
            clearPreviousSession()
                .then(() => {
                    let element = nearest;

                    const selection = window.getSelection();
                    if (selection && selection.rangeCount === 0) return;

                    const range = selection!.getRangeAt(0);
                    let text = range.startContainer.textContent || "";
                    const offset = range.startOffset;

                    // Find the start and end index of the clicked word
                    const before = text.slice(0, offset);
                    const after = text.slice(offset);

                    const wordStart = before.lastIndexOf(" ") + 1;

                    // Start the new reading process
                    state.reading = true;
                    processElement(element, wordStart);
                })
                .catch((error) => {
                    console.error("Error during reading process:", error);
                });
        } else {
            console.log("No matching element found");
        }

        // Check if the extension is active
        // chrome.runtime.sendMessage({ action: "getState" }, function (response) {
        //     if (response && response.active) {

        //     }
        // });
    }); // Send message to background.js to indicate the content script is loaded
    chrome.runtime.sendMessage({ action: "contentScriptLoaded" });
    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "stopReading") {
            console.log("Stop reading message received");
            // Use Promise to ensure we wait for the cleanup to complete
            clearPreviousSession().then(() => {
                sendResponse({ success: true });
            });
            // Return true to indicate we'll respond asynchronously
            return true;
        } else if (message.action === "updateSettings") {
            // Update control panel if needed
            sendResponse({ success: true });
        } else if (message.action === "startReadingFromContextMenu") {
            console.log("Start reading from context menu");
            handleContextMenuClick();
            sendResponse({ success: true });
        } else if (message.action === "themeChanged") {
            // Apply theme change from another tab or the popup
            if (message.theme) {
                document.documentElement.setAttribute("data-theme", message.theme);
            } else {
                document.documentElement.removeAttribute("data-theme");
            }
            sendResponse({ success: true });
        }
        // Return true to indicate async response
        return true;
    });
}

// Initialize the extension
initializeExtension();
