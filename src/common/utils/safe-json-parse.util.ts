export function safeJsonParse<T = unknown>(value: string): T | null {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const cleaned = value
        .replace(/[\u0000-\u001F]+/g, ' ')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    try {
        return JSON.parse(cleaned) as T;
    } catch {
        const jsonObjectMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonObjectMatch) {
            return null;
        }

        try {
            return JSON.parse(jsonObjectMatch[0]) as T;
        } catch {
            return null;
        }
    }
}
