// Text reader module for Custom Read Aloud extension
import { splitLongSentence } from './textProcessor';
import { getAudio } from './audioManager';
import { highlightFirstWordBeforeLoad, setupWordHighlighting } from './textHighlighter';
import { findNextTextNode } from './domTraversal';
import { state, subscribe } from './state';
import { initializeSettings } from '../helpers';

// Track the current reading process to ensure only one runs at a time
let currentReadingPromise: Promise<void> | null = null;
let shouldCancelCurrentReading = false;
let currentElement: HTMLElement | null = null;


export async function playAudio(
    element: HTMLElement,
    textStart: number,
    nextElement: HTMLElement | null
): Promise<void> {
    // Check immediately if we should cancel
    if (!state.reading || shouldCancelCurrentReading || element !== currentElement) return;
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
        if (!state.reading || shouldCancelCurrentReading || element !== currentElement) break;

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
        await new Promise<void>(async (resolve, reject) => {
            // Check again if we should cancel
            if (!state.reading || shouldCancelCurrentReading || element !== currentElement) {
                resolve();
                return;
            }

            let audio = document.getElementById("readAloudAudio") as HTMLAudioElement | null;
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
                setupWordHighlighting(audio!, sent, element, contentBeforeSelection, contentToRead, () => {
                    if (!hasResolved) {
                        hasResolved = true;
                        resolve();
                    }
                });
                audio!.play().catch(e => console.error("Playback error:", e));
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


export async function processElement(element: HTMLElement, wordStart: number): Promise<void> {
    await initializeSettings();
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

    if (!state.reading) return;

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
        } finally {
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

export function pauseAudio(): void {
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
        const audioEl = audio as HTMLAudioElement;
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

export function initSubscribeForReading(): void {
    subscribe((key, newValue) => {
        if (key === 'reading') {
            if (!newValue) {
                console.log("Reading paused");
                pauseAudio();
            }
        }
    })
}


export function cancelAllReadingOperations(): Promise<void> {
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