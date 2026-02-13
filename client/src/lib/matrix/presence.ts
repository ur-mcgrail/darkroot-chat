/**
 * Matrix User Presence
 */

import * as sdk from 'matrix-js-sdk';
import { get } from 'svelte/store';
import { userPresence, matrixClient } from '$lib/stores/matrix';

/**
 * Set up presence event listeners
 */
export function setupPresenceListeners(client: sdk.MatrixClient): void {
	// Listen for presence updates
	client.on(sdk.UserEvent.Presence, (event, user) => {
		if (!user) return;

		const currentPresence = get(userPresence);
		const presence = user.presence as 'online' | 'offline' | 'unavailable';

		userPresence.set({
			...currentPresence,
			[user.userId]: presence
		});
	});

	// Set own presence to online
	client.setPresence({ presence: 'online' }).catch(err => {
		console.warn('Failed to set presence:', err);
	});

	console.log('Presence listeners set up');
}

/**
 * Get presence status for a user
 */
export function getUserPresence(userId: string): 'online' | 'offline' | 'unavailable' {
	const presence = get(userPresence);
	return presence[userId] || 'offline';
}

/**
 * Set user's own presence
 */
export async function setOwnPresence(status: 'online' | 'offline' | 'unavailable'): Promise<void> {
	const client = get(matrixClient);
	if (!client) return;

	try {
		await client.setPresence({ presence: status });
	} catch (error) {
		console.error('Failed to set presence:', error);
	}
}
