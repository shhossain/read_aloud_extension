import { abortAll, initSettings } from "../modules/audioManager";
import { clearHighlights } from "../modules/textHighlighter";
import { cancelAllReadingOperations, initSubscribeForReading } from "../modules/textReader";

let isInitialized = false;

export function clearPreviousSession(): Promise<void> {
    // Use our cancelAllReadingOperations function which handles state and promises properly
    const cleanupPromise = cancelAllReadingOperations();

    // Clear any highlighting in the document
    clearHighlights();

    // Abort all pending audio fetch requests
    abortAll();

    // Remove any existing audio elements
    const audioElements = document.querySelectorAll("#readAloudAudio");
    audioElements.forEach(el => el.remove());

    return cleanupPromise;
}


export async function initializeSettings(): Promise<void> {
    if (isInitialized) {
        return; // Already initialized
    }

    // Initialize settings
    await initSettings();

    // Initialize subscription for reading
    initSubscribeForReading();
    isInitialized = true; // Mark as initialized
}