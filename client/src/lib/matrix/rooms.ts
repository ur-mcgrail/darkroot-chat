/**
 * Matrix Rooms Management
 */

import * as sdk from 'matrix-js-sdk';
import { get } from 'svelte/store';
import { matrixClient, rooms, currentRoomId } from '$lib/stores/matrix';

/**
 * Set up room event listeners
 */
export function setupRoomListeners(client: sdk.MatrixClient) {
	// Update room list when rooms are added/updated
	client.on(sdk.ClientEvent.Room, (room: sdk.Room) => {
		console.log('Room event:', room.name);
		updateRoomList(client);
	});

	// Update when room timeline changes
	client.on(sdk.RoomEvent.Timeline, (event: sdk.MatrixEvent, room?: sdk.Room) => {
		if (room) {
			updateRoomList(client);
		}
	});

	// Update when room name changes
	client.on(sdk.RoomEvent.Name, (room: sdk.Room) => {
		console.log('Room name changed:', room.name);
		updateRoomList(client);
	});

	// Initial room list update
	updateRoomList(client);
}

/**
 * Update the rooms store with current room list
 */
export function updateRoomList(client: sdk.MatrixClient) {
	const roomList = client.getRooms();

	// Sort rooms by most recent activity
	roomList.sort((a, b) => {
		const aTimestamp = a.getLastActiveTimestamp();
		const bTimestamp = b.getLastActiveTimestamp();
		return bTimestamp - aTimestamp;
	});

	rooms.set(roomList);
}

/**
 * Get room display name
 */
export function getRoomName(room: sdk.Room): string {
	return room.name || 'Unnamed Room';
}

/**
 * Get room avatar URL
 */
export function getRoomAvatarUrl(room: sdk.Room, client: sdk.MatrixClient): string | null {
	const avatarUrl = room.getAvatarUrl(client.baseUrl, 48, 48, 'crop');
	return avatarUrl;
}

/**
 * Get last message preview for room
 */
export function getLastMessagePreview(room: sdk.Room): string {
	const timeline = room.getLiveTimeline();
	const events = timeline.getEvents();

	// Find last message event (excluding state events)
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i];
		if (event.getType() === 'm.room.message') {
			const content = event.getContent();
			const body = content.body || '';

			// Truncate long messages
			if (body.length > 50) {
				return body.substring(0, 50) + '...';
			}
			return body;
		}
	}

	return 'No messages yet';
}

/**
 * Get unread count for room
 */
export function getUnreadCount(room: sdk.Room): number {
	const notifCount = room.getUnreadNotificationCount();
	return notifCount || 0;
}

/**
 * Join a room by ID or alias
 */
export async function joinRoom(roomIdOrAlias: string): Promise<sdk.Room> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');

	const result = await client.joinRoom(roomIdOrAlias);
	return client.getRoom(result.roomId)!;
}

/**
 * Create a new room
 */
export async function createRoom(name: string, topic?: string): Promise<sdk.Room> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');

	const result = await client.createRoom({
		name,
		topic,
		visibility: 'private' as sdk.Visibility,
		preset: 'trusted_private_chat' as sdk.Preset,
	});

	return client.getRoom(result.room_id)!;
}

/**
 * Leave a room
 */
export async function leaveRoom(roomId: string): Promise<void> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');

	await client.leave(roomId);

	// Clear current room if we just left it
	if (get(currentRoomId) === roomId) {
		currentRoomId.set(null);
	}
}

/**
 * Set the current active room
 */
export function setCurrentRoom(roomId: string | null) {
	currentRoomId.set(roomId);
}
