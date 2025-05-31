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
    const state = new Proxy(defaultState, handler);
    // Add the state manager to the exported object for external use
    const subscribe = (listener) => stateManager.addListener(listener);
    const subscribeToKey = (key, listener) => stateManager.addKeyListener(key, listener);

    // Settings and cache management
    let API_BASE = "";
    let VOICE = "af_jessica";
    let API_KEY = "";
    let MODEL = "";
    let SPEED = 1.5;
    let INITIALIZED = false;
    const mem = new Map();
    const memAccessOrder = []; // Track access order for LRU eviction
    const MEM_LIMIT = 100; // Maximum number of items to store in memory cache
    const signals = new Map();
    const audioQueue = [];
    let isProcessingAudio = false;
    const MAX_RETRY_ATTEMPTS = 3;
    const FETCH_TIMEOUT = 30000; // 30 seconds timeout for fetch requests
    window.globalAudio = null;
    function initSettings() {
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
    function updateSettings(settings) {
        API_BASE = settings.apiBase || API_BASE;
        VOICE = settings.voice || VOICE;
        SPEED = settings.speed || SPEED;
        MODEL = settings.model || MODEL;
        API_KEY = settings.apiKey || API_KEY;
        console.log("TTS settings updated:", settings);
    }
    function saveCache(key, value) {
        // Use a function to safely update the cache to avoid race conditions
        const updateCache = () => {
            // If the key already exists in the cache, update its position
            if (mem.has(key)) {
                const index = memAccessOrder.indexOf(key);
                if (index !== -1) {
                    memAccessOrder.splice(index, 1);
                }
            }
            else if (mem.size >= MEM_LIMIT) {
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
    function getCache(key) {
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
    function cleanupSignal(key) {
        signals.delete(key);
    }
    function abortAll() {
        console.log(`Aborting ${signals.size} connections`);
        signals.forEach((controller) => {
            controller.abort();
        });
        signals.clear();
    }
    async function getAudio(text, preload = false) {
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
            if (preload)
                return null;
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
    async function processAudioQueue() {
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
        const item = audioQueue.shift();
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
            }
            else {
                handleAudioError(item, resolve, null);
            }
        }
        catch (error) {
            console.error("Error processing audio:", error);
            handleAudioError(item, resolve, error);
        }
        finally {
            isProcessingAudio = false;
            setTimeout(() => processAudioQueue(), 0);
        }
    }
    function handleAudioError(item, resolve, error) {
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
        }
        else {
            console.error("Max retry attempts reached:", item.text.substring(0, 30));
            mem.delete(item.text);
            cleanupSignal(item.text);
            resolve(null);
        }
    }
    async function fetchAudio(text) {
        if (!state.reading)
            return null;
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
        let headers = {
            "Content-Type": "application/json"
        };
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
        }
        catch (error) {
            clearTimeout(timeout); // Clear the timeout
            if (error.name === 'AbortError') {
                console.log("Fetch aborted for:", text.substring(0, 30));
                return null;
            }
            // Categorize errors for better handling
            if (error instanceof TypeError) {
                console.error("Network error (possibly offline):", error.message);
            }
            else {
                console.error("Fetch error:", error);
            }
            throw error;
        }
    }

    // Highlighting and text display module for Custom Read Aloud extension
    function highlightFirstWordBeforeLoad(sentence, element, contentBeforeSelection, contentToRead) {
        // Get first word from sentence
        const words = sentence.split(/\s+/).filter(word => word.length > 0);
        if (words.length === 0)
            return;
        const firstWord = words[0];
        const sentenceStartIndex = contentToRead.indexOf(sentence);
        // Find the actual position of the first word within the sentence
        const firstWordInSentence = sentence.indexOf(firstWord);
        // The actual start position in the content
        const wordStartIndex = sentenceStartIndex + firstWordInSentence;
        const wordEndIndex = wordStartIndex + firstWord.length;
        // Apply highlighting to the element with a different class
        let highlightedContent = contentToRead.substring(0, wordStartIndex);
        highlightedContent += `<span class="read-preload-highlight">${firstWord}</span>`;
        highlightedContent += contentToRead.substring(wordEndIndex);
        element.innerHTML = contentBeforeSelection + highlightedContent;
        // Scroll to the element
        element.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest"
        });
    }
    function setupWordHighlighting(audio, sent, element, contentBeforeSelection, contentToRead, resolve) {
        if (!state.reading) {
            resolve();
            return;
        }
        // Get words from sentence
        const words = sent.split(/\s+/).filter(word => word.length > 0);
        if (words.length === 0) {
            resolve();
            return;
        }
        clearHighlights();
        const audioDuration = audio.duration;
        const timePerWord = audioDuration / words.length;
        let currentWordIndex = 0;
        let highlightInterval;
        // Highlight the first word immediately
        highlightWord(0);
        const unsubscribeReading = subscribeToKey("reading", (newValue, oldValue) => {
            if (!newValue) {
                console.log("Reading stopped, clearing highlights");
                unsubscribeReading();
                clearInterval(highlightInterval);
                clearHighlights();
                element.innerHTML = contentBeforeSelection + contentToRead;
                resolve();
            }
        });
        // Set interval to highlight words based on timing
        highlightInterval = setInterval(() => {
            currentWordIndex++;
            if (currentWordIndex < words.length) {
                highlightWord(currentWordIndex);
            }
            else {
                unsubscribeReading();
                clearInterval(highlightInterval);
            }
        }, timePerWord * 1000);
        // Function to highlight current word
        function highlightWord(index) {
            // Find the current word in the sentence
            const wordToHighlight = words[index];
            const sentenceStartIndex = contentToRead.indexOf(sent);
            // Calculate the start and end positions of the word in the sentence
            let wordStartPos = 0;
            let currentPos = 0;
            // Find the exact position of the word by walking through the sentence
            for (let i = 0; i <= index; i++) {
                // Find the word after the current position
                wordStartPos = sent.indexOf(words[i], currentPos);
                if (i < index) {
                    // Move past this word for the next iteration
                    currentPos = wordStartPos + words[i].length;
                }
            }
            // The actual start position in the content
            const wordStartIndex = sentenceStartIndex + wordStartPos;
            // Apply highlighting to the element
            let highlightedContent = contentToRead.substring(0, wordStartIndex);
            highlightedContent += `<span class="read-highlight">${wordToHighlight}</span>`;
            highlightedContent += contentToRead.substring(wordStartIndex + wordToHighlight.length);
            element.innerHTML = contentBeforeSelection + highlightedContent;
        }
        audio.addEventListener("ended", () => {
            clearInterval(highlightInterval);
            resolve();
        });
        // scroll to the element
        element.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest"
        });
    }
    function clearHighlights() {
        const highlightSelectors = ['.read-highlight', '.read-preload-highlight'];
        highlightSelectors.forEach(selector => {
            const existingHighlights = document.querySelectorAll(selector);
            existingHighlights.forEach(el => {
                const parent = el.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(el.textContent || ""), el);
                    parent.normalize();
                }
            });
        });
    }

    function splitLongSentence(sentence, minChars = 50, maxChars = 100) {
        // Define delimiters in order of preference (stronger to weaker)
        const delimiters = [
            { pattern: /[.!?]+\s+/, priority: 1 }, // Sentence endings
            { pattern: /;\s*/, priority: 2 }, // Semicolon
            { pattern: /,\s+(?:but|however|although|though|yet|nevertheless)\s+/, priority: 3 }, // Contrasting conjunctions
            { pattern: /,\s+(?:and|or)\s+/, priority: 4 }, // Coordinating conjunctions
            { pattern: /,\s*/, priority: 5 }, // Regular comma
            { pattern: /\s+(?:but|however|although|though|yet|nevertheless)\s+/, priority: 6 }, // Contrasting words without comma
            { pattern: /\s+(?:and|or)\s+/, priority: 7 }, // Coordinating words without comma
        ];
        function findBestSplitPoint(text) {
            let bestSplit = null;
            for (const delimiter of delimiters) {
                const matches = Array.from(text.matchAll(new RegExp(delimiter.pattern, 'gi')));
                for (const match of matches) {
                    const splitIndex = match.index + match[0].length;
                    const leftPart = text.substring(0, splitIndex).trim();
                    const rightPart = text.substring(splitIndex).trim();
                    // Both parts must meet minimum length requirement
                    if (leftPart.length >= minChars && rightPart.length >= minChars) {
                        if (!bestSplit || delimiter.priority < bestSplit.priority) {
                            bestSplit = {
                                index: splitIndex,
                                priority: delimiter.priority,
                                matchLength: match[0].length
                            };
                        }
                    }
                }
            }
            return bestSplit;
        }
        function forceSplitAtMaxChars(text) {
            // Find the best word boundary within maxChars limit
            let splitIndex = maxChars;
            // Look backward for a word boundary (space)
            for (let i = maxChars; i >= maxChars * 0.7; i--) {
                if (text[i] === ' ') {
                    splitIndex = i;
                    break;
                }
            }
            const leftPart = text.substring(0, splitIndex).trim();
            const rightPart = text.substring(splitIndex).trim();
            return [leftPart, ...splitRecursively(rightPart)];
        }
        function splitRecursively(text) {
            const trimmed = text.trim();
            // If text is short enough, return as is
            if (trimmed.length <= maxChars) {
                return [trimmed];
            }
            // Force split if text exceeds maxChars and no good split point exists
            if (trimmed.length > maxChars) {
                const splitPoint = findBestSplitPoint(trimmed);
                if (!splitPoint) {
                    // Force split at maxChars boundary
                    return forceSplitAtMaxChars(trimmed);
                }
                // Check if the best split point creates reasonable parts
                const leftPart = trimmed.substring(0, splitPoint.index).trim();
                const rightPart = trimmed.substring(splitPoint.index).trim();
                // If left part is too long, force split it
                if (leftPart.length > maxChars) {
                    return forceSplitAtMaxChars(trimmed);
                }
                // Recursively split both parts
                const leftSplits = splitRecursively(leftPart);
                const rightSplits = splitRecursively(rightPart);
                return [...leftSplits, ...rightSplits];
            }
            // For shorter texts, use the original logic
            if (trimmed.length <= minChars * 2) {
                return [trimmed];
            }
            const splitPoint = findBestSplitPoint(trimmed);
            // If no valid split point found, return the whole text
            if (!splitPoint) {
                return [trimmed];
            }
            const leftPart = trimmed.substring(0, splitPoint.index).trim();
            const rightPart = trimmed.substring(splitPoint.index).trim();
            // Recursively split both parts
            const leftSplits = splitRecursively(leftPart);
            const rightSplits = splitRecursively(rightPart);
            return [...leftSplits, ...rightSplits];
        }
        // Handle empty or very short sentences
        if (!sentence || sentence.trim().length <= minChars) {
            return [sentence.trim()];
        }
        return splitRecursively(sentence).filter(part => part.length > 0);
    }

    // DOM traversal and element finding module for Custom Read Aloud extension
    /**
     * Find the first element containing readable text
     * @param {HTMLElement} element - Starting element
     * @returns {HTMLElement|null} First element with readable text or null
     */
    function findFirstTextNode(element) {
        if (!element)
            return null;
        // Skip non-content elements
        const skipTags = ['SCRIPT', 'STYLE', 'META', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS'];
        if (skipTags.includes(element.tagName)) {
            return null;
        }
        // Check if this element directly contains text and has no element children
        if (element.childElementCount === 0 && element.textContent && element.textContent.trim()) {
            return element;
        }
        // Search through all children
        for (let i = 0; i < element.children.length; i++) {
            const result = findFirstTextNode(element.children[i]);
            if (result) {
                return result;
            }
        }
        return null;
    }
    /**
     * Find the next element containing readable text
     * @param {HTMLElement} element - Current element
     * @returns {HTMLElement|null} Next element with readable text or null
     */
    function findNextTextNode(element) {
        if (!element)
            return null;
        // Check next siblings first
        let nextSibling = element.nextElementSibling;
        while (nextSibling) {
            const textNode = findFirstTextNode(nextSibling);
            if (textNode) {
                return textNode;
            }
            nextSibling = nextSibling.nextElementSibling;
        }
        // If no suitable sibling found, go up to parent and check its next siblings
        let parent = element.parentElement;
        while (parent) {
            const parentNextSibling = parent.nextElementSibling;
            if (parentNextSibling) {
                const textNode = findFirstTextNode(parentNextSibling);
                if (textNode) {
                    return textNode;
                }
                // Check all siblings of the parent
                let nextParentSibling = parentNextSibling.nextElementSibling;
                while (nextParentSibling) {
                    const textNode = findFirstTextNode(nextParentSibling);
                    if (textNode) {
                        return textNode;
                    }
                    nextParentSibling = nextParentSibling.nextElementSibling;
                }
            }
            // Move up to the next parent
            parent = parent.parentElement;
        }
        return null; // No next text node found in the document
    }

    // Text reader module for Custom Read Aloud extension
    // Track the current reading process to ensure only one runs at a time
    let currentReadingPromise = null;
    let shouldCancelCurrentReading = false;
    let currentElement = null;
    async function playAudio(element, textStart, nextElement) {
        // Check immediately if we should cancel
        if (!state.reading || shouldCancelCurrentReading || element !== currentElement)
            return;
        console.log("Playing audio for element:", element, "at text start:", textStart);
        const text = element.textContent?.slice(textStart) || "";
        const sentences = splitLongSentence(text);
        console.log("Sentences to read:", sentences);
        // Preload audio for sentences
        sentences.forEach(sent => {
            getAudio(sent, true);
        });
        // Create a wrapper for the original element content to apply highlighting
        // const originalContent = element.innerHTML;
        const contentBeforeSelection = element.textContent?.slice(0, textStart) || "";
        const contentToRead = element.textContent?.slice(textStart) || "";
        // Remove any existing highlight spans
        const existingHighlights = document.querySelectorAll('.read-highlight');
        existingHighlights.forEach(el => {
            const parent = el.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(el.textContent || ""), el);
                parent.normalize();
            }
        });
        for (let i = 0; i < sentences.length; i++) {
            // Check in each iteration if we should cancel
            if (!state.reading || shouldCancelCurrentReading || element !== currentElement)
                break;
            const sent = sentences[i];
            console.log("Sent", sent);
            highlightFirstWordBeforeLoad(sent, element, contentBeforeSelection, contentToRead);
            // If last sentence, preload next element if it exists
            if (i === sentences.length - 1 && nextElement) {
                const nextNextElement = findNextTextNode(nextElement);
                const ntext = nextElement.textContent || "";
                const nnextText = nextNextElement ? nextNextElement.textContent || "" : "";
                const nsentences = [...splitLongSentence(ntext), ...splitLongSentence(nnextText)];
                nsentences.forEach(sent => {
                    getAudio(sent, true);
                });
            }
            await new Promise(async (resolve, reject) => {
                // Check again if we should cancel
                if (!state.reading || shouldCancelCurrentReading || element !== currentElement) {
                    resolve();
                    return;
                }
                let audio = document.getElementById("readAloudAudio");
                if (!audio) {
                    audio = document.createElement("audio");
                    audio.id = "readAloudAudio";
                    document.body.appendChild(audio);
                }
                window.globalAudio = audio;
                const result = await getAudio(sent);
                if (!result) {
                    resolve();
                    return;
                }
                // Check once more after awaiting getAudio if we should cancel
                if (!state.reading || shouldCancelCurrentReading || element !== currentElement) {
                    resolve();
                    return;
                }
                // Handle regular blob
                const audioUrl = URL.createObjectURL(result);
                audio.src = audioUrl;
                // Add flag to prevent multiple resolves
                let hasResolved = false;
                audio.onloadedmetadata = function () {
                    setupWordHighlighting(audio, sent, element, contentBeforeSelection, contentToRead, () => {
                        if (!hasResolved) {
                            hasResolved = true;
                            resolve();
                        }
                    });
                    audio.play().catch(e => console.error("Playback error:", e));
                };
                audio.onerror = function (e) {
                    if (!hasResolved) {
                        hasResolved = true;
                        reject(e);
                    }
                };
                // Ensure we always resolve on audio end
                audio.onended = function () {
                    if (!hasResolved) {
                        hasResolved = true;
                        resolve();
                    }
                };
            });
            // add a delay between sentences
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        // Clean up audio element if it exists
        document.getElementById("readAloudAudio")?.remove();
    }
    async function processElement(element, wordStart) {
        await initializeSettings$1();
        // Cancel any existing reading process immediately
        shouldCancelCurrentReading = true;
        currentElement = element;
        // Immediately stop and cleanup any playing audio
        if (window.globalAudio) {
            window.globalAudio.pause();
            window.globalAudio.src = '';
        }
        // Reset the cancel flag so the new reading can start
        shouldCancelCurrentReading = false;
        if (!state.reading)
            return;
        // Create and store a new reading promise
        let nextElement = findNextTextNode(element);
        console.log("Next element found:", nextElement);
        currentReadingPromise = (async () => {
            try {
                await playAudio(element, wordStart, nextElement);
                if (state.reading && !shouldCancelCurrentReading) {
                    if (element === currentElement && nextElement) {
                        const nextWordStart = 0; // Start from the beginning of the next element
                        await processElement(nextElement, nextWordStart);
                    }
                }
            }
            finally {
                // Clear the reference when done or if there was an error
                // Only clear if this promise is still the current one
                // This prevents a new process from being cleared by an old one
                const thisPromise = currentReadingPromise;
                if (currentReadingPromise === thisPromise) {
                    currentReadingPromise = null;
                }
            }
        })();
        // Return the promise so the caller can wait for it if needed
        return currentReadingPromise;
    }
    function pauseAudio() {
        // Set the cancel flag
        shouldCancelCurrentReading = true;
        // Stop and clean up global audio if it exists
        if (window.globalAudio) {
            window.globalAudio.pause();
            window.globalAudio.src = '';
            window.globalAudio.load();
        }
        // Also pause any other audio elements that might exist
        const audioEls = document.querySelectorAll("#readAloudAudio");
        audioEls.forEach(audio => {
            const audioEl = audio;
            if (audioEl) {
                audioEl.pause();
                // Release the media resources
                audioEl.src = '';
                audioEl.load();
            }
        });
        // Reset promise tracking immediately
        currentReadingPromise = null;
    }
    function initSubscribeForReading() {
        subscribe((key, newValue) => {
            if (key === 'reading') {
                if (!newValue) {
                    console.log("Reading paused");
                    pauseAudio();
                }
            }
        });
    }
    function cancelAllReadingOperations() {
        return new Promise((resolve) => {
            // Log the cancellation for debugging
            console.log("Cancelling all reading operations");
            // Set cancel flag and state
            shouldCancelCurrentReading = true;
            state.reading = false;
            // Immediate cleanup of audio elements
            if (window.globalAudio) {
                window.globalAudio.pause();
                window.globalAudio.src = '';
                window.globalAudio.load();
                window.globalAudio = null;
            }
            // Remove any existing audio elements from DOM
            document.querySelectorAll("#readAloudAudio").forEach(el => el.remove());
            // Reset the current reading promise
            currentReadingPromise = null;
            // Resolve immediately - no need for timeout
            resolve();
        });
    }

    let isInitialized = false;
    function clearPreviousSession() {
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
    async function initializeSettings$1() {
        if (isInitialized) {
            return; // Already initialized
        }
        // Initialize settings
        await initSettings();
        // Initialize subscription for reading
        initSubscribeForReading();
        isInitialized = true; // Mark as initialized
    }

    function createControlPanel() {
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
    function initializeSettings() {
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
            }
            else {
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
    function updateControlSettings(settings) {
        // if (speedRangeElement && speedValueElement) {
        //     speedRangeElement.value = settings.speed.toString();
        //     speedValueElement.textContent = `${settings.speed}x`;
        // }
        const speedRange = document.getElementById('read-aloud-speed');
        const speedValue = document.getElementById('read-aloud-speed-value');
        if (speedRange && speedValue) {
            speedRange.value = settings.speed.toString();
            speedValue.textContent = `${settings.speed.toFixed(1)}x`;
        }
    }
    function attachEventListeners() {
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
                setExtensionActive();
            });
        }
        if (settingsToggle && settingsDropdown) {
            settingsToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                settingsDropdown.classList.toggle('open');
            });
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                const target = e.target;
                if (!settingsDropdown.contains(target) && !settingsToggle.contains(target)) {
                    settingsDropdown.classList.remove('open');
                }
            });
        }
        // Speed range
        if (speedRangeElement && speedValueElement) {
            speedRangeElement.addEventListener('input', () => {
                const speed = parseFloat(speedRangeElement.value);
                speedValueElement.textContent = `${speed.toFixed(1)}x`;
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
                }
                else {
                    waveElement.classList.remove('active');
                }
            }
            // disable/enable stop button
            if (stopButton) {
                if (newValue) {
                    stopButton.classList.remove('disabled');
                    stopButton.removeAttribute('disabled');
                }
                else {
                    stopButton.classList.add('disabled');
                    stopButton.setAttribute('disabled', 'true');
                }
            }
        });
    }
    function setExtensionActive(active) {
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
    function saveSettings() {
        const speedRangeElement = document.getElementById('read-aloud-speed');
        const voiceSelectElement = document.getElementById('read-aloud-voice');
        console.log('Saving settings...');
        chrome.runtime.sendMessage({ action: "getSettings" }, function (response) {
            if (response && response.settings) {
                const settings = { ...response.settings };
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
    async function fetchVoices(settings) {
        const voiceSelectElement = document.getElementById('read-aloud-voice');
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
                        const voiceExists = Array.from(voiceSelectElement.options)
                            .some(option => option.value === response.settings.voice);
                        if (voiceExists && voiceSelectElement) {
                            voiceSelectElement.value = response.settings.voice;
                        }
                    }
                });
            }
        }
        catch (error) {
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
    function hasControlPanel() {
        const panel = document.getElementById('read-aloud-control-panel');
        if (panel) {
            return panel.style.display !== 'none';
        }
        return false;
    }
    /**
     * Hide the control panel
     */
    function hideControlPanel() {
        const panel = document.getElementById('read-aloud-control-panel');
        if (panel) {
            panel.style.display = 'none';
        }
    }
    /**
     * Show the control panel
     */
    function showControlPanel() {
        const panel = document.getElementById('read-aloud-control-panel');
        if (panel) {
            panel.style.display = 'flex';
        }
        else {
            createControlPanel();
        }
    }
    /**
     * Toggle between light and dark themes
     */
    function toggleTheme() {
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
        }
        else {
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
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            const themeIcon = document.getElementById('theme-icon');
            if (themeIcon) {
                themeIcon.textContent = '☀️';
            }
        }
        else {
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
    function saveThemePreference(theme) {
        chrome.runtime.sendMessage({
            action: "saveTheme",
            theme: theme
        });
    }

    async function handleContextMenuClick() {
        showControlPanel();
        const selection = window.getSelection();
        if (!selection)
            return;
        if (selection.rangeCount === 0)
            return;
        const range = selection.getRangeAt(0);
        let node = range.startContainer;
        let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        element = findFirstTextNode(element);
        if (!element)
            return;
        clearPreviousSession().then(() => {
            const offset = range.startOffset || 0;
            let text = range.startContainer.textContent || "";
            const before = text.slice(0, offset);
            const wordStart = before.lastIndexOf(" ") + 1;
            // Start the new reading process immediately
            state.reading = true;
            processElement(element, wordStart);
        });
    }
    /**
     * Initialize the extension when the content script is loaded
     */
    function initializeExtension() {
        // // Check extension state and show/hide control panel accordingly
        // chrome.runtime.sendMessage({ action: "getState" }, function (response) {
        //     if (response && response.active) {
        //         showControlPanel();
        //     } else {
        //         hideControlPanel();
        //     }
        // });    // Listen for clicks
        document.addEventListener("click", function (event) {
            if (!hasControlPanel())
                return;
            // Get the clicked element
            const clickedElement = event.target;
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
                    if (selection && selection.rangeCount === 0)
                        return;
                    const range = selection.getRangeAt(0);
                    let text = range.startContainer.textContent || "";
                    const offset = range.startOffset;
                    // Find the start and end index of the clicked word
                    const before = text.slice(0, offset);
                    text.slice(offset);
                    const wordStart = before.lastIndexOf(" ") + 1;
                    // Start the new reading process
                    state.reading = true;
                    processElement(element, wordStart);
                })
                    .catch((error) => {
                    console.error("Error during reading process:", error);
                });
            }
            else {
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
            }
            else if (message.action === "updateSettings") {
                // Update control panel if needed
                sendResponse({ success: true });
            }
            else if (message.action === "startReadingFromContextMenu") {
                console.log("Start reading from context menu");
                handleContextMenuClick();
                sendResponse({ success: true });
            }
            else if (message.action === "themeChanged") {
                // Apply theme change from another tab or the popup
                if (message.theme) {
                    document.documentElement.setAttribute("data-theme", message.theme);
                }
                else {
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

})();
//# sourceMappingURL=bundle.js.map
