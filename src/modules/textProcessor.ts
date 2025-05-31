export function splitLongSentence(sentence: string, minChars: number = 50, maxChars: number = 100): string[] {
    // Define delimiters in order of preference (stronger to weaker)
    const delimiters = [
        { pattern: /[.!?]+\s+/, priority: 1 }, // Sentence endings
        { pattern: /;\s*/, priority: 2 },      // Semicolon
        { pattern: /,\s+(?:but|however|although|though|yet|nevertheless)\s+/, priority: 3 }, // Contrasting conjunctions
        { pattern: /,\s+(?:and|or)\s+/, priority: 4 }, // Coordinating conjunctions
        { pattern: /,\s*/, priority: 5 },      // Regular comma
        { pattern: /\s+(?:but|however|although|though|yet|nevertheless)\s+/, priority: 6 }, // Contrasting words without comma
        { pattern: /\s+(?:and|or)\s+/, priority: 7 }, // Coordinating words without comma
    ];

    function findBestSplitPoint(text: string): { index: number; priority: number; matchLength: number } | null {
        let bestSplit = null;

        for (const delimiter of delimiters) {
            const matches = Array.from(text.matchAll(new RegExp(delimiter.pattern, 'gi')));

            for (const match of matches) {
                const splitIndex = match.index! + match[0].length;
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

    function forceSplitAtMaxChars(text: string): string[] {
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

    function splitRecursively(text: string): string[] {
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

