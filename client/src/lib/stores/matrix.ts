/**
 * Svelte stores for Matrix state
 */

import { writable, derived } from 'svelte/store';
import type * as sdk from 'matrix-js-sdk';

// Message type for our UI
export interface Message {
	id: string;
	sender: string;
	content: any;
	timestamp: number;
	event: sdk.MatrixEvent;
}

// Matrix client instance
export const matrixClient = writable<sdk.MatrixClient | null>(null);

// Authentication state
export const isLoggedIn = writable<boolean>(false);
export const currentUser = writable<sdk.User | null>(null);

// Sync state
export const syncState = writable<'PREPARED' | 'SYNCING' | 'ERROR'>('PREPARED');

// Rooms
export const rooms = writable<sdk.Room[]>([]);
export const currentRoomId = writable<string | null>(null);

// Current room (derived)
export const currentRoom = derived(
	[rooms, currentRoomId],
	([$rooms, $currentRoomId]) => {
		if (!$currentRoomId) return null;
		return $rooms.find(r => r.roomId === $currentRoomId) || null;
	}
);

// Messages for current room
export const messages = writable<Message[]>([]);

// Typing indicators
export const typingUsers = writable<string[]>([]);

// User presence (userId -> presence state)
export const userPresence = writable<Record<string, 'online' | 'offline' | 'unavailable'>>({});

// User ID (derived from currentUser)
export const userId = derived(
	currentUser,
	($currentUser) => $currentUser?.userId || null
);
