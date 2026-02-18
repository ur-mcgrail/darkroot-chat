/**
 * Matrix Admin API Functions
 *
 * Requires admin access token.
 * See: https://matrix-org.github.io/synapse/latest/usage/administration/admin_api/
 */

import { get } from 'svelte/store';
import { matrixClient } from '$lib/stores/matrix';

export interface RegistrationToken {
	token: string;
	uses_allowed: number | null;
	pending: number;
	completed: number;
	expiry_time: number | null;
}

export interface CreateTokenOptions {
	token?: string; // Optional custom token, otherwise auto-generated
	uses_allowed?: number | null; // null = unlimited
	expiry_time?: number | null; // Unix timestamp in milliseconds, null = never expires
	length?: number; // Length of auto-generated token (default 16)
}

/**
 * Get the admin API base URL
 */
function getAdminApiUrl(): string {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');
	return `${client.baseUrl}/_synapse/admin/v1`;
}

/**
 * Get access token for admin API calls
 */
function getAccessToken(): string {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');
	const token = client.getAccessToken();
	if (!token) throw new Error('No access token available');
	return token;
}

/**
 * Check if current user is a server admin
 */
export async function isServerAdmin(): Promise<boolean> {
	const client = get(matrixClient);
	if (!client) return false;

	try {
		const userId = client.getUserId();
		if (!userId) return false;

		const url = `${getAdminApiUrl()}/users/${encodeURIComponent(userId)}/admin`;
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${getAccessToken()}`,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) return false;

		const data = await response.json();
		return data.admin === true;
	} catch (error) {
		console.error('Failed to check admin status:', error);
		return false;
	}
}

/**
 * Create a new registration token
 */
export async function createRegistrationToken(
	options: CreateTokenOptions = {}
): Promise<RegistrationToken> {
	const url = `${getAdminApiUrl()}/registration_tokens/new`;

	const body: any = {};
	if (options.token) body.token = options.token;
	if (options.uses_allowed !== undefined) body.uses_allowed = options.uses_allowed;
	if (options.expiry_time !== undefined) body.expiry_time = options.expiry_time;
	if (options.length) body.length = options.length;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${getAccessToken()}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to create registration token');
	}

	return await response.json();
}

/**
 * List all registration tokens
 */
export async function listRegistrationTokens(): Promise<RegistrationToken[]> {
	const url = `${getAdminApiUrl()}/registration_tokens`;

	const response = await fetch(url, {
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${getAccessToken()}`,
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to list registration tokens');
	}

	const data = await response.json();
	return data.registration_tokens || [];
}

/**
 * Get details of a specific registration token
 */
export async function getRegistrationToken(token: string): Promise<RegistrationToken> {
	const url = `${getAdminApiUrl()}/registration_tokens/${encodeURIComponent(token)}`;

	const response = await fetch(url, {
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${getAccessToken()}`,
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to get registration token');
	}

	return await response.json();
}

/**
 * Update a registration token
 */
export async function updateRegistrationToken(
	token: string,
	options: Partial<CreateTokenOptions>
): Promise<RegistrationToken> {
	const url = `${getAdminApiUrl()}/registration_tokens/${encodeURIComponent(token)}`;

	const response = await fetch(url, {
		method: 'PUT',
		headers: {
			'Authorization': `Bearer ${getAccessToken()}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(options),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to update registration token');
	}

	return await response.json();
}

/**
 * Delete a registration token
 */
export async function deleteRegistrationToken(token: string): Promise<void> {
	const url = `${getAdminApiUrl()}/registration_tokens/${encodeURIComponent(token)}`;

	const response = await fetch(url, {
		method: 'DELETE',
		headers: {
			'Authorization': `Bearer ${getAccessToken()}`,
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to delete registration token');
	}
}

/**
 * Generate an invite link with registration token
 */
export function generateInviteLink(token: string, baseUrl: string = window.location.origin): string {
	return `${baseUrl}/register?token=${encodeURIComponent(token)}`;
}

// ── User management ───────────────────────────────────────────────────────────

export interface MatrixUser {
	name: string;          // full Matrix ID e.g. @user:darkroot.local
	displayname: string | null;
	is_guest: boolean;
	admin: boolean;
	deactivated: boolean;
}

/**
 * List all non-guest users on the server (admin only)
 */
export async function listUsers(limit = 200): Promise<MatrixUser[]> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');
	const baseUrl = `${client.baseUrl}/_synapse/admin/v2`;
	const url = `${baseUrl}/users?from=0&limit=${limit}&guests=false`;

	const response = await fetch(url, {
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${getAccessToken()}`,
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to list users');
	}

	const data = await response.json();
	return data.users || [];
}

/**
 * Reset a user's password (admin only). Logs out all devices.
 */
export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
	const url = `${getAdminApiUrl()}/reset_password/${encodeURIComponent(userId)}`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${getAccessToken()}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ new_password: newPassword, logout_devices: true }),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Failed to reset password');
	}
}

/**
 * Generate a readable temporary password for admin-initiated resets.
 * Format: Adjective-Noun-NNNN — easy to read aloud or type from memory.
 */
export function generateTempPassword(): string {
	const adjectives = [
		'Amber', 'Ashen', 'Bone', 'Cinder', 'Dark', 'Ember', 'Frost',
		'Grim', 'Hollow', 'Iron', 'Jade', 'Lost', 'Moss', 'Noble',
		'Ochre', 'Pine', 'Quiet', 'Root', 'Stone', 'Thorn', 'Void', 'Wisp',
	];
	const nouns = [
		'Bonfire', 'Coil', 'Drake', 'Ember', 'Flame', 'Grove', 'Hunter',
		'Kindle', 'Lance', 'Marsh', 'Night', 'Oak', 'Pyre', 'River',
		'Shade', 'Tower', 'Vale', 'Wyrm', 'Crest', 'Forge',
	];
	const num = Math.floor(1000 + Math.random() * 9000);
	const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
	const noun = nouns[Math.floor(Math.random() * nouns.length)];
	return `${adj}-${noun}-${num}`;
}
