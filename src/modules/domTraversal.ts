// DOM traversal and element finding module for Custom Read Aloud extension

/**
 * Find the first element containing readable text
 * @param {HTMLElement} element - Starting element
 * @returns {HTMLElement|null} First element with readable text or null
 */
export function findFirstTextNode(element: HTMLElement | null): HTMLElement | null {
    if (!element) return null;

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
        const result = findFirstTextNode(element.children[i] as HTMLElement);
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
export function findNextTextNode(element: HTMLElement | null): HTMLElement | null {
    if (!element) return null;

    // Check next siblings first
    let nextSibling = element.nextElementSibling as HTMLElement | null;
    while (nextSibling) {
        const textNode = findFirstTextNode(nextSibling);
        if (textNode) {
            return textNode;
        }
        nextSibling = nextSibling.nextElementSibling as HTMLElement | null;
    }

    // If no suitable sibling found, go up to parent and check its next siblings
    let parent = element.parentElement;
    while (parent) {
        const parentNextSibling = parent.nextElementSibling as HTMLElement | null;
        if (parentNextSibling) {
            const textNode = findFirstTextNode(parentNextSibling);
            if (textNode) {
                return textNode;
            }

            // Check all siblings of the parent
            let nextParentSibling = parentNextSibling.nextElementSibling as HTMLElement | null;
            while (nextParentSibling) {
                const textNode = findFirstTextNode(nextParentSibling);
                if (textNode) {
                    return textNode;
                }
                nextParentSibling = nextParentSibling.nextElementSibling as HTMLElement | null;
            }
        }

        // Move up to the next parent
        parent = parent.parentElement;
    }

    return null; // No next text node found in the document
}
