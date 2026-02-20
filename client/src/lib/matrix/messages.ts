/**
 * Matrix Message Management
 */

import * as sdk from 'matrix-js-sdk';
import { get } from 'svelte/store';
import { matrixClient, messages, currentRoomId, type Message } from '$lib/stores/matrix';

/**
 * Fetch messages for a room and update store.
 * Also sends a read receipt for the latest message so the unread badge clears.
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

	// Filter to only message events and map to our format.
	// Exclude redacted events and replacement events (edits) — the SDK automatically
	// applies edits to the original event's content via event.getContent().
	const messageEvents = events
		.filter(event => {
			if (event.getType() !== 'm.room.message') return false;
			if (event.isRedacted()) return false;
			const relatesTo = event.getContent()['m.relates_to'];
			if (relatesTo?.rel_type === 'm.replace') return false;
			return true;
		})
		.map(event => ({
			id: event.getId() || '',
			sender: event.getSender() || '',
			content: event.getContent(),
			timestamp: event.getTs(),
			event: event
		}));

	// Update messages store
	messages.set(messageEvents);

	// Send a read receipt for the last confirmed server event in the timeline.
	// Skip local echo events (IDs start with '~') — the server rejects receipts for them.
	const lastConfirmedEvent = [...events].reverse().find(e => {
		const id = e.getId();
		return id && !id.startsWith('~');
	});
	if (lastConfirmedEvent) {
		client.sendReadReceipt(lastConfirmedEvent).catch(() => {});
	}
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

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
const ALLOWED_FILE_TYPES  = new Set(['application/pdf', 'text/plain', 'application/zip',
	'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const MAX_IMAGE_SIZE = 25 * 1024 * 1024;  // 25 MB
const MAX_FILE_SIZE  = 50 * 1024 * 1024;  // 50 MB (matches nginx client_max_body_size)

function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9._\- ]/g, '_').substring(0, 255);
}

/**
 * Send an image message to a room
 */
export async function sendImage(roomId: string, file: File): Promise<void> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');

	if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
		throw new Error(`Unsupported image type: ${file.type}`);
	}
	if (file.size > MAX_IMAGE_SIZE) {
		throw new Error(`Image too large (max 25 MB, got ${(file.size / 1024 / 1024).toFixed(1)} MB)`);
	}

	const uploadResponse = await client.uploadContent(file);
	await client.sendMessage(roomId, {
		msgtype: 'm.image',
		body: sanitizeFilename(file.name),
		url: uploadResponse.content_uri,
		info: { mimetype: file.type, size: file.size },
	});
}

/**
 * Send a file message to a room
 */
export async function sendFile(roomId: string, file: File): Promise<void> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');

	if (!ALLOWED_FILE_TYPES.has(file.type)) {
		throw new Error(`Unsupported file type: ${file.type}`);
	}
	if (file.size > MAX_FILE_SIZE) {
		throw new Error(`File too large (max 50 MB, got ${(file.size / 1024 / 1024).toFixed(1)} MB)`);
	}

	const uploadResponse = await client.uploadContent(file);
	await client.sendMessage(roomId, {
		msgtype: 'm.file',
		body: sanitizeFilename(file.name),
		url: uploadResponse.content_uri,
		info: { mimetype: file.type, size: file.size },
	});
}

/**
 * Set up message event listeners for real-time updates
 */
export function setupMessageListeners(client: sdk.MatrixClient): void {
	// Listen for new timeline events (messages and reactions)
	client.on(sdk.RoomEvent.Timeline, async (event, room, toStartOfTimeline) => {
		// Ignore events added to the start of the timeline (pagination)
		if (toStartOfTimeline) return;

		// Only process events for the current room
		const currentRoom = get(currentRoomId);
		if (!room || room.roomId !== currentRoom) return;

		const type = event.getType();

		if (type === 'm.room.message') {
			console.log('New message received:', event.getContent());
			await fetchRoomMessages(room.roomId);
			// fetchRoomMessages already sends the read receipt for us
		} else if (type === 'm.reaction') {
			// Reaction added — SDK has already updated room.relations by this point.
			// Force a re-render so getMessageReactions() picks up the new reaction.
			messages.update(msgs => [...msgs]);
		}
	});

	// Listen for redactions — re-fetch so isRedacted() filtering removes the message
	client.on(sdk.RoomEvent.Redaction, (_event, room) => {
		const currentRoom = get(currentRoomId);
		if (!room || room.roomId !== currentRoom) return;
		fetchRoomMessages(room.roomId);
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

/**
 * Edit a message by sending a replacement event (m.replace).
 * The SDK will update the original event's content automatically on next sync.
 */
export async function editMessage(roomId: string, eventId: string, newText: string): Promise<void> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');

	await client.sendMessage(roomId, {
		msgtype: 'm.text',
		body: `* ${newText}`,
		'm.new_content': {
			msgtype: 'm.text',
			body: newText,
		},
		'm.relates_to': {
			rel_type: 'm.replace',
			event_id: eventId,
		},
	} as any);
}

/**
 * Delete (redact) a message. Only works on messages sent by the current user.
 */
export async function deleteMessage(roomId: string, eventId: string): Promise<void> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');

	await client.redactEvent(roomId, eventId);
}
