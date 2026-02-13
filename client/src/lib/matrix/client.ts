/**
 * Matrix Client Wrapper for Darkroot
 *
 * Handles Matrix JS SDK integration, authentication, and session management.
 */

import * as sdk from 'matrix-js-sdk';
import { get } from 'svelte/store';
import { matrixClient, isLoggedIn, currentUser, syncState } from '$lib/stores/matrix';
import { setupRoomListeners } from './rooms';
import { setupMessageListeners } from './messages';
import { setupTypingListeners } from './typing';
import { setupPresenceListeners } from './presence';

const STORAGE_PREFIX = 'darkroot_';

/**
 * Get stored credentials from localStorage
 */
export function getStoredCredentials() {
	if (typeof window === 'undefined') return null;

	const accessToken = localStorage.getItem(`${STORAGE_PREFIX}access_token`);
	const userId = localStorage.getItem(`${STORAGE_PREFIX}user_id`);
	const homeserverUrl = localStorage.getItem(`${STORAGE_PREFIX}homeserver_url`);
	const deviceId = localStorage.getItem(`${STORAGE_PREFIX}device_id`);

	if (!accessToken || !userId || !homeserverUrl) {
		return null;
	}

	return { accessToken, userId, homeserverUrl, deviceId };
}

/**
 * Store credentials in localStorage
 */
function storeCredentials(accessToken: string, userId: string, homeserverUrl: string, deviceId?: string) {
	localStorage.setItem(`${STORAGE_PREFIX}access_token`, accessToken);
	localStorage.setItem(`${STORAGE_PREFIX}user_id`, userId);
	localStorage.setItem(`${STORAGE_PREFIX}homeserver_url`, homeserverUrl);
	if (deviceId) {
		localStorage.setItem(`${STORAGE_PREFIX}device_id`, deviceId);
	}
}

/**
 * Clear stored credentials
 */
function clearCredentials() {
	localStorage.removeItem(`${STORAGE_PREFIX}access_token`);
	localStorage.removeItem(`${STORAGE_PREFIX}user_id`);
	localStorage.removeItem(`${STORAGE_PREFIX}homeserver_url`);
	localStorage.removeItem(`${STORAGE_PREFIX}device_id`);
}

/**
 * Create a Matrix client instance
 */
export function createClient(homeserverUrl: string, accessToken?: string, userId?: string) {
	const client = sdk.createClient({
		baseUrl: homeserverUrl,
		accessToken,
		userId,
	});

	// Set up event listeners
	client.on(sdk.ClientEvent.Sync, (state) => {
		console.log('Sync state:', state);
		syncState.set(state as 'PREPARED' | 'SYNCING' | 'ERROR');
	});

	matrixClient.set(client);
	return client;
}

/**
 * Login with username and password
 */
export async function loginWithPassword(
	username: string,
	password: string,
	homeserverUrl: string
): Promise<void> {
	try {
		// Create temporary client for login
		const tempClient = sdk.createClient({ baseUrl: homeserverUrl });

		// Attempt login
		const response = await tempClient.loginWithPassword(username, password);

		console.log('Login successful:', response);

		// Store credentials
		storeCredentials(
			response.access_token,
			response.user_id,
			homeserverUrl,
			response.device_id
		);

		// Create authenticated client
		const client = createClient(homeserverUrl, response.access_token, response.user_id);

		// Start syncing
		await startClient(client);

		// Update stores
		isLoggedIn.set(true);
		const user = client.getUser(response.user_id);
		currentUser.set(user);

	} catch (error) {
		console.error('Login failed:', error);
		throw error;
	}
}

/**
 * Restore session from stored credentials
 */
export async function restoreSession(): Promise<boolean> {
	const creds = getStoredCredentials();

	if (!creds) {
		return false;
	}

	try {
		const client = createClient(creds.homeserverUrl, creds.accessToken, creds.userId);

		// Verify the session is valid
		await client.getVersions();

		// Start syncing
		await startClient(client);

		// Update stores
		isLoggedIn.set(true);
		const user = client.getUser(creds.userId);
		currentUser.set(user);

		console.log('Session restored for:', creds.userId);
		return true;

	} catch (error) {
		console.error('Failed to restore session:', error);
		clearCredentials();
		return false;
	}
}

/**
 * Start the Matrix client sync
 */
export async function startClient(client: sdk.MatrixClient): Promise<void> {
	// Set up event listeners
	setupRoomListeners(client);
	setupMessageListeners(client);
	setupTypingListeners(client);
	setupPresenceListeners(client);

	// Start syncing
	await client.startClient({ initialSyncLimit: 20 });
}

/**
 * Logout and clear session
 */
export async function logout(): Promise<void> {
	const client = get(matrixClient);

	if (client) {
		try {
			await client.logout();
		} catch (error) {
			console.error('Logout error:', error);
		}

		client.stopClient();
	}

	// Clear stored credentials
	clearCredentials();

	// Reset stores
	matrixClient.set(null);
	isLoggedIn.set(false);
	currentUser.set(null);
	syncState.set('PREPARED');
}

/**
 * Get current Matrix client
 */
export function getClient(): sdk.MatrixClient | null {
	return get(matrixClient);
}
