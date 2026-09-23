// Wikipedia boilerplate sections with no encyclopedic content of their own — excluded from source text.
const SKIP_SECTIONS = new Set([
    "references",
    "external links",
    "see also",
    "further reading",
    "notes",
    "bibliography",
    "sources",
    "citations",
    "gallery",
])

export function parseSections(extract) {
    const parts = extract.split(/^==\s*([^=]+?)\s*==\s*$/m);

    const sections = [{title: "Lead", text: parts[0].trim()}];

    for (let i = 1; i < parts.length; i += 2) {
        const title = parts[i].trim();
        const text = parts[i + 1].trim();

        if (!SKIP_SECTIONS.has(title.toLowerCase()) && text.length > 0) {
            sections.push({title, text});
        }
    }

    return sections;
}

const STUB_CHARS = 200;

export function buildSourceText(sections, maxChars = 14000) {
    let out = "";
    let used = 0;

    for (const section of sections) {
        const isLead = section.title === "Lead";
        const remaining = maxChars - used;

        if (remaining <= 0) {
            // no budget left — still include a short stub, tagged truncated
            const stub = section.text.slice(0, STUB_CHARS);
            const block = `\n\n== ${section.title} [TRUNCATED] ==\n${stub}`;
            out += block;
            used += block.length;
            continue;
        }

        const fullBlock = isLead
            ? section.text
            : `\n\n== ${section.title} ==\n${section.text}`;

        if (fullBlock.length <= remaining) {
            out += fullBlock;
            used += fullBlock.length;
            continue;
        }

        // partially fits — cut it and mark truncated
        const cutText = section.text.slice(0, Math.max(remaining - 40, STUB_CHARS));
        const block = isLead
            ? cutText
            : `\n\n== ${section.title} [TRUNCATED] ==\n${cutText}`;
        out += block;
        used += block.length;
    }

    return out;
}