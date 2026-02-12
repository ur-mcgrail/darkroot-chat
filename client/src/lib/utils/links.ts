/**
 * Link detection & service configuration for Darkroot Chat
 *
 * Messages containing links from these services get diverted to the
 * Link Feed sidebar instead of appearing in the main chat.
 */

export interface LinkService {
	id: string;
	label: string;
	icon: string;
	color: string;
	patterns: RegExp[];
}

/**
 * Configured services whose links get diverted to the Link Feed.
 * Add or remove services here to control what gets pulled out of the main chat.
 */
export const LINK_SERVICES: LinkService[] = [
	{
		id: 'instagram',
		label: 'Instagram',
		icon: '📸',
		color: '#E4405F',
		patterns: [/instagram\.com/i, /instagr\.am/i],
	},
	{
		id: 'youtube',
		label: 'YouTube',
		icon: '▶️',
		color: '#FF0000',
		patterns: [/youtube\.com/i, /youtu\.be/i],
	},
	{
		id: 'bluesky',
		label: 'Bluesky',
		icon: '🦋',
		color: '#0085FF',
		patterns: [/bsky\.app/i, /bsky\.social/i],
	},
	{
		id: 'twitter',
		label: 'X / Twitter',
		icon: '𝕏',
		color: '#1DA1F2',
		patterns: [/twitter\.com/i, /x\.com\/(?!$)/i], // x.com but not bare domain
	},
	{
		id: 'tiktok',
		label: 'TikTok',
		icon: '🎵',
		color: '#010101',
		patterns: [/tiktok\.com/i],
	},
	{
		id: 'reddit',
		label: 'Reddit',
		icon: '🟠',
		color: '#FF4500',
		patterns: [/reddit\.com/i, /redd\.it/i],
	},
	{
		id: 'spotify',
		label: 'Spotify',
		icon: '🎧',
		color: '#1DB954',
		patterns: [/open\.spotify\.com/i, /spotify\.com/i],
	},
	{
		id: 'twitch',
		label: 'Twitch',
		icon: '🎮',
		color: '#9146FF',
		patterns: [/twitch\.tv/i],
	},
];

/** General URL regex */
export const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

/**
 * Check if a message body contains a link from any configured service.
 * Returns the matching service, or null if no match.
 */
export function detectServiceLink(body: string): { service: LinkService; urls: string[] } | null {
	URL_REGEX.lastIndex = 0;
	const urls = body.match(URL_REGEX);
	if (!urls) return null;

	for (const service of LINK_SERVICES) {
		const matchingUrls = urls.filter((url) =>
			service.patterns.some((p) => p.test(url))
		);
		if (matchingUrls.length > 0) {
			return { service, urls: matchingUrls };
		}
	}

	return null;
}

/**
 * Check if a message body contains ANY configured service link.
 * Used as a quick boolean check for filtering.
 */
export function hasServiceLink(body: string): boolean {
	return detectServiceLink(body) !== null;
}

/**
 * Extract all service links from a message body.
 * A single message can contain links from multiple services.
 */
export function extractAllServiceLinks(body: string): { service: LinkService; url: string }[] {
	URL_REGEX.lastIndex = 0;
	const urls = body.match(URL_REGEX);
	if (!urls) return [];

	const results: { service: LinkService; url: string }[] = [];
	const uniqueUrls = [...new Set(urls)];

	for (const url of uniqueUrls) {
		for (const service of LINK_SERVICES) {
			if (service.patterns.some((p) => p.test(url))) {
				results.push({ service, url });
				break; // first matching service wins for this URL
			}
		}
	}

	return results;
}

/**
 * Get the "context" text from a message — everything that ISN'T a URL.
 */
export function getContextText(body: string): string {
	const stripped = body.replace(URL_REGEX, '').replace(/\s+/g, ' ').trim();
	return stripped;
}

/**
 * Truncate a URL for display
 */
export function displayUrl(url: string): string {
	try {
		const u = new URL(url);
		const path = u.pathname + u.search;
		const full = u.hostname.replace('www.', '') + (path.length > 1 ? path : '');
		return full.length > 55 ? full.substring(0, 52) + '...' : full;
	} catch {
		return url.length > 55 ? url.substring(0, 52) + '...' : url;
	}
}

// ── Link Metadata ──────────────────────────────────────────────

export interface LinkMeta {
	title?: string;
	description?: string;
	thumbnail?: string;
	author?: string;
	provider?: string;
}

/** In-memory cache so we don't re-fetch the same URL */
const metaCache = new Map<string, LinkMeta>();

/**
 * Fetch metadata for a URL via noembed.com (free oEmbed proxy, CORS-friendly).
 * Returns whatever metadata is available; never throws.
 */
export async function fetchLinkMeta(url: string): Promise<LinkMeta> {
	if (metaCache.has(url)) return metaCache.get(url)!;

	const meta: LinkMeta = {};

	try {
		const res = await fetch(
			`https://noembed.com/embed?url=${encodeURIComponent(url)}`,
			{ signal: AbortSignal.timeout(5000) }
		);

		if (res.ok) {
			const data = await res.json();
			if (data && !data.error) {
				meta.title = data.title || undefined;
				meta.author = data.author_name || undefined;
				meta.provider = data.provider_name || undefined;
				meta.thumbnail = data.thumbnail_url || undefined;
				// noembed doesn't return descriptions, but we capture what we can
			}
		}
	} catch {
		// Silently fail — metadata is best-effort
	}

	metaCache.set(url, meta);
	return meta;
}
