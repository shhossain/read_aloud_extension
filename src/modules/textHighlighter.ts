// Highlighting and text display module for Custom Read Aloud extension

import { state, subscribeToKey } from "./state";

export function highlightFirstWordBeforeLoad(
    sentence: string,
    element: HTMLElement,
    contentBeforeSelection: string,
    contentToRead: string
): void {
    // Get first word from sentence
    const words = sentence.split(/\s+/).filter(word => word.length > 0);
    if (words.length === 0) return;

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
export function setupWordHighlighting(
    audio: HTMLAudioElement,
    sent: string,
    element: HTMLElement,
    contentBeforeSelection: string,
    contentToRead: string,
    resolve: () => void
): void {

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
    let highlightInterval: any;

    // Highlight the first word immediately
    highlightWord(0);

    const unsubscribeReading = subscribeToKey("reading", (newValue: boolean, oldValue: boolean) => {
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
        } else {
            unsubscribeReading();
            clearInterval(highlightInterval);
        }
    }, timePerWord * 1000);


    // Function to highlight current word
    function highlightWord(index: number): void {
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


export function clearHighlights(): void {
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
