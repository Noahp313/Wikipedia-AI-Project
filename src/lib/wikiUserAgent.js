// Wikimedia's User-Agent policy asks API clients to include a contact
// (email or URL) so they can reach the operator instead of blocking requests.
const contact = process.env.WIKI_CONTACT;

export const WIKI_USER_AGENT = contact ? `WikAi/1.0 (${contact})` : `WikAi/1.0`;
