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
 * @param visibility 'public' (default) — discoverable, join freely; 'private' — invite only
 */
export async function createRoom(name: string, topic?: string, visibility: 'public' | 'private' = 'public'): Promise<sdk.Room> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');

	const isPublic = visibility === 'public';

	const result = await client.createRoom({
		name,
		topic,
		visibility: (isPublic ? 'public' : 'private') as sdk.Visibility,
		preset: (isPublic ? 'public_chat' : 'private_chat') as sdk.Preset,
		initial_state: [
			{
				type: 'm.room.history_visibility',
				state_key: '',
				content: { history_visibility: isPublic ? 'shared' : 'invited' },
			},
			...(isPublic ? [] : [{
				type: 'm.room.join_rules',
				state_key: '',
				content: { join_rule: 'invite' },
			}]),
		],
	});

	return client.getRoom(result.room_id)!;
}

/**
 * Auto-join the "General" public room if it exists and user isn't already in it
 */
export async function ensureGeneralRoom(): Promise<void> {
	const client = get(matrixClient);
	if (!client) return;

	try {
		const publicRooms = await listPublicRooms();
		const general = publicRooms.find(r => r.name.toLowerCase() === 'general');
		if (!general) return;

		// Check if already joined
		const existing = client.getRoom(general.roomId);
		if (existing && existing.getMyMembership() === 'join') return;

		await joinRoom(general.roomId);
		console.log('Auto-joined General room');
	} catch (err) {
		// Non-fatal — log and move on
		console.warn('ensureGeneralRoom failed:', err);
	}
}

/**
 * Get the join rule for a room ('public' or 'invite')
 */
export function getRoomJoinRule(room: sdk.Room): 'public' | 'invite' {
	const event = room.currentState.getStateEvents('m.room.join_rules', '');
	const rule = event?.getContent()?.join_rule;
	return rule === 'invite' ? 'invite' : 'public';
}

/**
 * Check if the current user can edit room settings (power level >= 100 or via admin check)
 */
export function canEditRoom(room: sdk.Room, userId: string): boolean {
	const member = room.getMember(userId);
	return (member?.powerLevel ?? 0) >= 100;
}

/**
 * Set room name
 */
export async function setRoomName(roomId: string, name: string): Promise<void> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');
	await client.setRoomName(roomId, name);
}

/**
 * Set room topic
 */
export async function setRoomTopic(roomId: string, topic: string): Promise<void> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');
	await client.setRoomTopic(roomId, topic);
}

/**
 * Set room join rules (and matching history visibility)
 */
export async function setRoomJoinRules(roomId: string, rule: 'public' | 'invite'): Promise<void> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');

	await client.sendStateEvent(
		roomId,
		sdk.EventType.RoomJoinRules,
		{ join_rule: rule === 'public' ? sdk.JoinRule.Public : sdk.JoinRule.Invite },
		''
	);
	await client.sendStateEvent(
		roomId,
		sdk.EventType.RoomHistoryVisibility,
		{ history_visibility: rule === 'public' ? sdk.HistoryVisibility.Shared : sdk.HistoryVisibility.Invited },
		''
	);
}

/**
 * Invite a user to a room
 */
export async function inviteUser(roomId: string, userId: string): Promise<void> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');
	await client.invite(roomId, userId);
}

/**
 * Kick a user from a room
 */
export async function kickUser(roomId: string, userId: string): Promise<void> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');
	await client.kick(roomId, userId);
}

/**
 * Invite all active, non-guest server users to a room.
 * Skips users who are already joined, deactivated, or guests.
 * @param onProgress - called after each invite attempt with (attempted, total)
 */
export async function inviteAllServerUsersToRoom(
	roomId: string,
	onProgress?: (attempted: number, total: number) => void
): Promise<{ invited: number; failed: string[] }> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');

	const { listUsers } = await import('$lib/matrix/admin');
	const allUsers = await listUsers();

	const room = client.getRoom(roomId);
	if (!room) throw new Error('Room not found');

	const joinedIds = new Set(room.getJoinedMembers().map(m => m.userId));
	const myId = client.getUserId();

	const toInvite = allUsers.filter(
		u => !u.deactivated && !u.is_guest && !joinedIds.has(u.name) && u.name !== myId
	);

	let invited = 0;
	const failed: string[] = [];

	for (let i = 0; i < toInvite.length; i++) {
		try {
			await client.invite(roomId, toInvite[i].name);
			invited++;
		} catch {
			failed.push(toInvite[i].name);
		}
		onProgress?.(i + 1, toInvite.length);
	}

	return { invited, failed };
}

/**
 * List public rooms on the server (room directory)
 */
export async function listPublicRooms(): Promise<{ roomId: string; name: string; topic: string; numMembers: number; avatarUrl: string | null }[]> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');

	const response = await client.publicRooms({});
	const chunk = response.chunk || [];

	return chunk.map((room: any) => ({
		roomId: room.room_id,
		name: room.name || 'Unnamed Room',
		topic: room.topic || '',
		numMembers: room.num_joined_members || 0,
		avatarUrl: room.avatar_url || null,
	}));
}

/**
 * Upload a static image (e.g. /emoji/bonfire.png) to Matrix media and set it
 * as the room avatar.  Works with any URL the browser can fetch() — including
 * same-origin /emoji/* paths served by the SvelteKit static dir.
 */
export async function setRoomAvatarFromUrl(roomId: string, imageUrl: string): Promise<void> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');

	const response = await fetch(imageUrl);
	if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
	const blob = await response.blob();

	// matrix-js-sdk uploadContent returns { content_uri } in most versions
	const result: any = await client.uploadContent(blob, { type: blob.type });
	const mxcUri: string = result?.content_uri ?? result;

	await client.sendStateEvent(roomId, 'm.room.avatar', { url: mxcUri }, '');
}

/**
 * Clear the room avatar state (resets display to the auto-assigned SVG icon).
 */
export async function clearRoomAvatar(roomId: string): Promise<void> {
	const client = get(matrixClient);
	if (!client) throw new Error('Matrix client not initialized');
	await client.sendStateEvent(roomId, 'm.room.avatar', { url: '' }, '');
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
