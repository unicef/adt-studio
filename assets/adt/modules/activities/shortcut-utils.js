export const isTypingTarget = (target) => {
    if (!target) {
        return false;
    }

    const tagName = target.tagName?.toLowerCase();
    const interactiveTags = ['input', 'textarea', 'select', 'button'];
    if (interactiveTags.includes(tagName)) {
        return true;
    }

    return Boolean(target.isContentEditable);
};
