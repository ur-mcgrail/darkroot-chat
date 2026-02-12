/**
 * Matrix Message Management
 */

import * as sdk from 'matrix-js-sdk';
import { get } from 'svelte/store';
import { matrixClient, messages, currentRoomId, type Message } from '$lib/stores/matrix';

/**
 * Fetch messages for a room and update store
 */
export async function fetchRoomMessages(roomId: string): Promise<void> {
	const client = get(matrixClient);
	if (!client) {
		console.error('Matrix client not initialized');
		return;
	}

	const room = client.getRoom(roomId);
	if (!room) {
		console.error('Room not found:', roomId);
		return;
	}

	// Get timeline events
	const timeline = room.getLiveTimeline();
	const events = timeline.getEvents();

	// Filter to only message events and map to our format
	const messageEvents = events
		.filter(event => event.getType() === 'm.room.message')
		.map(event => ({
			id: event.getId() || '',
			sender: event.getSender() || '',
			content: event.getContent(),
			timestamp: event.getTs(),
			event: event
		}));

	// Update messages store
	messages.set(messageEvents);

	console.log(`Loaded ${messageEvents.length} messages for room ${roomId}`);
}

/**
 * Send a text message to a room
 */
export async function sendMessage(roomId: string, text: string): Promise<void> {
	const client = get(matrixClient);
	if (!client) {
		throw new Error('Matrix client not initialized');
	}

	if (!text.trim()) {
		return; // Don't send empty messages
	}

	try {
		await client.sendTextMessage(roomId, text.trim());
		console.log('Message sent:', text);
	} catch (error) {
		console.error('Failed to send message:', error);
		throw error;
	}
}

/**
 * Send an image message to a room
 */
export async function sendImage(roomId: string, file: File): Promise<void> {
	const client = get(matrixClient);
	if (!client) {
		throw new Error('Matrix client not initialized');
	}

	try {
		// Upload the file to the homeserver
		const uploadResponse = await client.uploadContent(file);

		// Send image message
		await client.sendMessage(roomId, {
			msgtype: 'm.image',
			body: file.name,
			url: uploadResponse.content_uri,
			info: {
				mimetype: file.type,
				size: file.size,
			}
		});

		console.log('Image sent:', file.name);
	} catch (error) {
		console.error('Failed to send image:', error);
		throw error;
	}
}

/**
 * Send a file message to a room
 */
export async function sendFile(roomId: string, file: File): Promise<void> {
	const client = get(matrixClient);
	if (!client) {
		throw new Error('Matrix client not initialized');
	}

	try {
		// Upload the file
		const uploadResponse = await client.uploadContent(file);

		// Send file message
		await client.sendMessage(roomId, {
			msgtype: 'm.file',
			body: file.name,
			url: uploadResponse.content_uri,
			info: {
				mimetype: file.type,
				size: file.size,
			}
		});

		console.log('File sent:', file.name);
	} catch (error) {
		console.error('Failed to send file:', error);
		throw error;
	}
}

/**
 * Set up message event listeners for real-time updates
 */
export function setupMessageListeners(client: sdk.MatrixClient): void {
	// Listen for new timeline events (messages)
	client.on(sdk.RoomEvent.Timeline, async (event, room, toStartOfTimeline) => {
		// Ignore events added to the start of the timeline (pagination)
		if (toStartOfTimeline) return;

		// Only process message events for the current room
		const currentRoom = get(currentRoomId);
		if (!room || room.roomId !== currentRoom) return;

		if (event.getType() === 'm.room.message') {
			console.log('New message received:', event.getContent());

			// Refresh messages for current room
			await fetchRoomMessages(room.roomId);
		}
	});

	console.log('Message listeners set up');
}

/**
 * Get message body text (handles different message types)
 */
export function getMessageBody(content: any): string {
	// Handle formatted messages (markdown)
	if (content.format === 'org.matrix.custom.html' && content.formatted_body) {
		return content.formatted_body;
	}

	return content.body || '';
}

/**
 * Get message type
 */
export function getMessageType(content: any): string {
	return content.msgtype || 'm.text';
}

/**
 * Check if message is from current user
 */
export function isOwnMessage(senderId: string, client: sdk.MatrixClient): boolean {
	return senderId === client.getUserId();
}
