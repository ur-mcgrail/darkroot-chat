/**
 * Matrix Typing Indicators
 */

import * as sdk from 'matrix-js-sdk';
import { get } from 'svelte/store';
import { typingUsers, currentRoomId, matrixClient } from '$lib/stores/matrix';

let typingTimeout: ReturnType<typeof setTimeout> | null = null;
const TYPING_TIMEOUT = 5000; // 5 seconds (Matrix default)

/**
 * Send typing notification to the server
 */
export async function sendTypingNotification(roomId: string, isTyping: boolean): Promise<void> {
	const client = get(matrixClient);
	if (!client) return;

	try {
		await client.sendTyping(roomId, isTyping, TYPING_TIMEOUT);
	} catch (error) {
		console.error('Failed to send typing notification:', error);
	}
}

/**
 * Handle user typing in input field
 * Sends typing notification and auto-stops after timeout
 */
export function handleTyping(roomId: string): void {
	// Clear any existing timeout
	if (typingTimeout) {
		clearTimeout(typingTimeout);
	}

	// Send typing notification
	sendTypingNotification(roomId, true);

	// Auto-stop typing after timeout
	typingTimeout = setTimeout(() => {
		sendTypingNotification(roomId, false);
	}, TYPING_TIMEOUT);
}

/**
 * Stop typing notification (called when message is sent)
 */
export function stopTyping(roomId: string): void {
	if (typingTimeout) {
		clearTimeout(typingTimeout);
		typingTimeout = null;
	}
	sendTypingNotification(roomId, false);
}

/**
 * Set up typing event listeners
 */
export function setupTypingListeners(client: sdk.MatrixClient): void {
	client.on(sdk.RoomMemberEvent.Typing, (event, member) => {
		const currentRoom = get(currentRoomId);
		if (!currentRoom || event.getRoomId() !== currentRoom) return;

		// Get all typing members in current room
		const room = client.getRoom(currentRoom);
		if (!room) return;

		const typingMembers = room.currentState
			.getMembers()
			.filter(m => m.typing && m.userId !== client.getUserId())
			.map(m => m.userId);

		typingUsers.set(typingMembers);
	});

	console.log('Typing listeners set up');
}
