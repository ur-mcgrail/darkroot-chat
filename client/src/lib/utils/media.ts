/**
 * Authenticated media utilities for Matrix.
 *
 * Synapse 1.98+ moved to authenticated media endpoints at
 * /_matrix/client/v1/media/ which require an Authorization header.
 * Since <img src="…"> can't send headers, we fetch the binary data
 * with fetch(), create an object URL from the blob, and use that.
 */

import type { MatrixClient } from 'matrix-js-sdk';

/** Simple in-memory cache: mxc URL → blob object URL */
const blobCache = new Map<string, string>();

/** Pending fetches to avoid duplicate requests for the same mxc URL */
const pendingFetches = new Map<string, Promise<string | null>>();

/**
 * Parse an mxc:// URL into server name and media ID.
 */
function parseMxc(mxcUrl: string): { serverName: string; mediaId: string } | null {
	if (!mxcUrl?.startsWith('mxc://')) return null;
	const stripped = mxcUrl.replace('mxc://', '');
	const slashIdx = stripped.indexOf('/');
	if (slashIdx < 0) return null;
	return {
		serverName: stripped.substring(0, slashIdx),
		mediaId: stripped.substring(slashIdx + 1)
	};
}

/**
 * Fetch a Matrix media resource using the authenticated endpoint and
 * return a blob: URL suitable for <img src="…">.
 *
 * @param client  - Active MatrixClient (needs getHomeserverUrl + getAccessToken)
 * @param mxcUrl  - The mxc:// content URI
 * @param width   - Thumbnail width  (omit for full download)
 * @param height  - Thumbnail height (omit for full download)
 * @param method  - Thumbnail method: 'crop' or 'scale' (default 'crop')
 * @returns       - A blob: URL or null on failure
 */
export async function fetchMediaUrl(
	client: MatrixClient,
	mxcUrl: string,
	width?: number,
	height?: number,
	method: 'crop' | 'scale' = 'crop'
): Promise<string | null> {
	if (!client || !mxcUrl) return null;

	// Build a cache key that includes dimensions
	const cacheKey = width && height ? `${mxcUrl}|${width}x${height}|${method}` : mxcUrl;

	// Return cached blob URL if we already have it
	if (blobCache.has(cacheKey)) {
		return blobCache.get(cacheKey)!;
	}

	// If already fetching this URL, wait for the existing request
	if (pendingFetches.has(cacheKey)) {
		return pendingFetches.get(cacheKey)!;
	}

	const promise = _doFetch(client, mxcUrl, cacheKey, width, height, method);
	pendingFetches.set(cacheKey, promise);

	try {
		return await promise;
	} finally {
		pendingFetches.delete(cacheKey);
	}
}

async function _doFetch(
	client: MatrixClient,
	mxcUrl: string,
	cacheKey: string,
	width?: number,
	height?: number,
	method?: string
): Promise<string | null> {
	const parsed = parseMxc(mxcUrl);
	if (!parsed) return null;

	const baseUrl = client.getHomeserverUrl();
	const accessToken = client.getAccessToken();
	if (!baseUrl || !accessToken) return null;

	const { serverName, mediaId } = parsed;

	// Build the authenticated endpoint URL
	let url: string;
	if (width && height) {
		url = `${baseUrl}/_matrix/client/v1/media/thumbnail/${serverName}/${mediaId}?width=${width}&height=${height}&method=${method || 'crop'}`;
	} else {
		url = `${baseUrl}/_matrix/client/v1/media/download/${serverName}/${mediaId}`;
	}

	try {
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
			signal: AbortSignal.timeout(15000)
		});

		if (!res.ok) {
			console.warn(`Media fetch failed: ${res.status} for ${mxcUrl}`);
			return null;
		}

		const blob = await res.blob();
		const objectUrl = URL.createObjectURL(blob);
		blobCache.set(cacheKey, objectUrl);
		return objectUrl;
	} catch (err) {
		console.warn('Media fetch error:', err);
		return null;
	}
}

/**
 * Convenience: fetch a user avatar thumbnail (128×128 crop).
 */
export async function fetchAvatarUrl(
	client: MatrixClient,
	mxcUrl: string
): Promise<string | null> {
	return fetchMediaUrl(client, mxcUrl, 128, 128, 'crop');
}
