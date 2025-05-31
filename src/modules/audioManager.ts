import { TTSSettings } from "../types/common";
import { state } from "./state";

// Settings and cache management
let API_BASE = "";
let VOICE = "af_jessica";
let API_KEY = "";
let MODEL = "";
let SPEED = 1.5;
let INITIALIZED = false;

const mem = new Map<string, Blob>();
const memAccessOrder: string[] = []; // Track access order for LRU eviction
const MEM_LIMIT = 100; // Maximum number of items to store in memory cache
const signals = new Map<string, AbortController>();
const audioQueue: AudioQueueItem[] = [];
let isProcessingAudio = false;
const MAX_RETRY_ATTEMPTS = 3;
const FETCH_TIMEOUT = 30000; // 30 seconds timeout for fetch requests

// Define types
interface AudioQueueItem {
    text: string;
    resolve: (value: Blob | null) => void;
    retryCount: number;
    preload?: boolean;
}


window.globalAudio = null;

export function initSettings(): Promise<void> {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "getSettings" }, function (response) {
            if (response && response.settings) {
                state.settings = response.settings;
                updateSettings(response.settings);
            }
            INITIALIZED = true;
            resolve();
        });

        // Listen for settings updates
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === "updateSettings" && message.settings) {
                updateSettings(message.settings);
                sendResponse({ acknowledged: true });
            }
            return true; // Indicate async response
        });
    });
}

function updateSettings(settings: TTSSettings): void {
    API_BASE = settings.apiBase || API_BASE;
    VOICE = settings.voice || VOICE;
    SPEED = settings.speed || SPEED;
    MODEL = settings.model || MODEL;
    API_KEY = settings.apiKey || API_KEY;
    console.log("TTS settings updated:", settings);
}

function saveCache(key: string, value: any): void {
    // Use a function to safely update the cache to avoid race conditions
    const updateCache = () => {
        // If the key already exists in the cache, update its position
        if (mem.has(key)) {
            const index = memAccessOrder.indexOf(key);
            if (index !== -1) {
                memAccessOrder.splice(index, 1);
            }
        } else if (mem.size >= MEM_LIMIT) {
            const itemsToEvict = Math.min(5, memAccessOrder.length);
            for (let i = 0; i < itemsToEvict; i++) {
                const lruKey = memAccessOrder.shift();
                if (lruKey) {
                    mem.delete(lruKey);
                    console.log(`Cache limit reached, evicting: ${lruKey.substring(0, 30)}...`);
                }
            }
        }

        // Add/update the item in cache and mark as most recently used
        mem.set(key, value);
        memAccessOrder.push(key);
    };

    // Execute the update
    updateCache();
}

function getCache(key: string): Blob | undefined {
    const value = mem.get(key);

    // Update access order for LRU tracking if found
    if (value) {
        const index = memAccessOrder.indexOf(key);
        if (index !== -1) {
            memAccessOrder.splice(index, 1);
            memAccessOrder.push(key);
        }
    }

    return value;
}



function cleanupSignal(key: string): void {
    signals.delete(key);
}


export function abortAll(): void {
    console.log(`Aborting ${signals.size} connections`);
    signals.forEach((controller) => {
        controller.abort();
    });
    signals.clear();
}

export async function getAudio(text: string, preload = false): Promise<Blob | null> {
    // Make sure settings are initialized
    if (!INITIALIZED) {
        await initSettings();
    }

    const cached = getCache(text);
    if (cached) {
        console.log("Cache hit");
        return cached;
    }
    console.log("Cache miss");

    const prKey = `pr-${text}`;
    if (getCache(prKey)) {
        if (preload) return null;
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (!state.reading) {
                    console.log("State is not reading, aborting audio polling");
                    clearInterval(checkInterval);
                    mem.delete(prKey);
                    resolve(null);
                    return;
                }
                const cachedResult = getCache(text);
                if (cachedResult) {
                    console.log("Cache found during polling");
                    clearInterval(checkInterval);
                    resolve(cachedResult);
                }
            }, 100);
        });
    }

    // Add to queue and return a promise
    return new Promise((resolve) => {
        audioQueue.push({
            text,
            resolve,
            retryCount: 0
        });
        processAudioQueue();
    });
}


async function processAudioQueue(): Promise<void> {
    if (isProcessingAudio || audioQueue.length === 0) {
        return;
    }
    if (!state.reading) {
        // clear the queue if not reading
        while (audioQueue.length > 0) {
            const item = audioQueue.shift();
            if (item) {
                item.resolve(null);
            }
        }
        return;
    }

    isProcessingAudio = true;
    const item = audioQueue.shift()!;
    const { text, resolve } = item;

    try {
        // Mark as in progress
        saveCache(`pr-${text}`, true);

        const audioBlob = await fetchAudio(text);
        if (audioBlob) {
            mem.delete(`pr-${text}`);
            saveCache(text, audioBlob);
            cleanupSignal(text); // Clean up the signal after successful fetch
            resolve(audioBlob);
        } else {
            handleAudioError(item, resolve, null);
        }
    } catch (error: any) {
        console.error("Error processing audio:", error);
        handleAudioError(item, resolve, error);
    } finally {
        isProcessingAudio = false;
        setTimeout(() => processAudioQueue(), 0);
    }
}

function handleAudioError(
    item: AudioQueueItem,
    resolve: (value: Blob | null) => void,
    error: Error | null
): void {
    // Clean up resources
    mem.delete(`pr-${item.text}`);

    // If abort error
    if (error === null || (error && error.name === 'AbortError')) {
        console.log("Fetch aborted for:", item.text.substring(0, 30));
        cleanupSignal(item.text);
        resolve(null);
        return;
    }

    if (item.retryCount < MAX_RETRY_ATTEMPTS) {
        console.log(`Retrying audio request (${item.retryCount + 1}/${MAX_RETRY_ATTEMPTS}): ${item.text.substring(0, 30)}...`);
        item.retryCount += 1;
        audioQueue.unshift(item);
    } else {
        console.error("Max retry attempts reached:", item.text.substring(0, 30));
        mem.delete(item.text);
        cleanupSignal(item.text);
        resolve(null);
    }
}

async function fetchAudio(text: string): Promise<Blob | null> {
    if (!state.reading) return null;

    // Create an AbortController for this request
    const abortController = signals.get(text) || new AbortController();
    if (!signals.has(text)) {
        signals.set(text, abortController);
    }

    // Create a timeout that will abort the request if it takes too long
    const timeout = setTimeout(() => {
        abortController.abort();
        console.log(`Request timed out after ${FETCH_TIMEOUT / 1000}s:`, text.substring(0, 30));
    }, FETCH_TIMEOUT);

    let body = {
        model: MODEL || "kokoro",
        input: text,
        voice: VOICE,
        response_format: "mp3",
        speed: SPEED,
    };

    let headers: Record<string, string> = {
        "Content-Type": "application/json"
    }
    if (API_KEY) {
        headers["Authorization"] = `Bearer ${API_KEY}`;
    }

    try {
        const response = await fetch(`${API_BASE}/audio/speech`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: abortController.signal
        });

        clearTimeout(timeout); // Clear the timeout since the request completed

        if (!response.ok) {
            console.error("API error:", response.status, response.statusText);
            return null;
        }

        return await response.blob();
    } catch (error) {
        clearTimeout(timeout); // Clear the timeout

        if ((error as Error).name === 'AbortError') {
            console.log("Fetch aborted for:", text.substring(0, 30));
            return null;
        }

        // Categorize errors for better handling
        if (error instanceof TypeError) {
            console.error("Network error (possibly offline):", error.message);
        } else {
            console.error("Fetch error:", error);
        }

        throw error;
    }
}