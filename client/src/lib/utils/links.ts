/**
 * Link detection & service configuration for Darkroot Chat
 *
 * Messages containing links from these services get diverted to the
 * Link Feed sidebar instead of appearing in the main chat.
 */

export interface LinkService {
	id: string;
	label: string;
	svgIcon: string; // inline SVG string, uses currentColor fill
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
		svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
		color: '#E4405F',
		patterns: [/instagram\.com/i, /instagr\.am/i],
	},
	{
		id: 'youtube',
		label: 'YouTube',
		svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>`,
		color: '#FF0000',
		patterns: [/youtube\.com/i, /youtu\.be/i],
	},
	{
		id: 'bluesky',
		label: 'Bluesky',
		svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/></svg>`,
		color: '#0085FF',
		patterns: [/bsky\.app/i, /bsky\.social/i],
	},
	{
		id: 'twitter',
		label: 'X / Twitter',
		svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
		color: '#000000',
		patterns: [/twitter\.com/i, /x\.com\/(?!$)/i], // x.com but not bare domain
	},
	{
		id: 'tiktok',
		label: 'TikTok',
		svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
		color: '#010101',
		patterns: [/tiktok\.com/i],
	},
	{
		id: 'reddit',
		label: 'Reddit',
		svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>`,
		color: '#FF4500',
		patterns: [/reddit\.com/i, /redd\.it/i],
	},
	{
		id: 'spotify',
		label: 'Spotify',
		svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
		color: '#1DB954',
		patterns: [/open\.spotify\.com/i, /spotify\.com/i],
	},
	{
		id: 'twitch',
		label: 'Twitch',
		svgIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>`,
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
