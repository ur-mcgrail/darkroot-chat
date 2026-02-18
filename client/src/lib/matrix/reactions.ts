/**
 * Matrix Message Reactions
 */

import * as sdk from 'matrix-js-sdk';
import { get } from 'svelte/store';
import { matrixClient } from '$lib/stores/matrix';

export interface Reaction {
	key: string; // The reaction text (e.g., "Praise")
	count: number;
	users: string[]; // User IDs who reacted
	hasReacted: boolean; // Did current user react with this?
}

/**
 * Darkroot-themed reactions (text-based, no emojis)
 */
export const DARKROOT_REACTIONS = [
	{ key: 'Praise', label: 'Praise', title: 'Praise the sun!' },
	{ key: 'Humanity', label: 'Humanity', title: 'Restore humanity' },
	{ key: 'Estus', label: 'Estus', title: 'Take a swig' },
	{ key: 'Bonfire', label: 'Bonfire', title: 'Rest at bonfire' }
] as const;

/**
 * Send a reaction to a message
 */
export async function sendReaction(
	roomId: string,
	eventId: string,
	reactionKey: string
): Promise<void> {
	const client = get(matrixClient);
	if (!client) {
		throw new Error('Matrix client not initialized');
	}

	try {
		await client.sendEvent(roomId, 'm.reaction', {
			'm.relates_to': {
				rel_type: 'm.annotation',
				event_id: eventId,
				key: reactionKey
			}
		});
		console.log('Reaction sent:', reactionKey);
	} catch (error) {
		console.error('Failed to send reaction:', error);
		throw error;
	}
}

/**
 * Remove a reaction from a message
 */
export async function removeReaction(
	roomId: string,
	reactionEventId: string
): Promise<void> {
	const client = get(matrixClient);
	if (!client) {
		throw new Error('Matrix client not initialized');
	}

	try {
		await client.redactEvent(roomId, reactionEventId);
		console.log('Reaction removed');
	} catch (error) {
		console.error('Failed to remove reaction:', error);
		throw error;
	}
}

/**
 * Get aggregated reactions for a message (SDK v40+ compatible).
 * Uses room.relations.getChildEventsForEvent instead of the removed event.getRelations().
 */
export function getMessageReactions(event: sdk.MatrixEvent): Reaction[] {
	const client = get(matrixClient);
	if (!client || !event) return [];

	const eventId = event.getId();
	const roomId = event.getRoomId();
	if (!eventId || !roomId) return [];

	const room = client.getRoom(roomId);
	if (!room) return [];

	const currentUserId = client.getUserId();

	// SDK v40: use room.relations.getChildEventsForEvent
	const relations = room.relations.getChildEventsForEvent(
		eventId,
		'm.annotation',
		'm.reaction'
	);

	const annotationsBySender = relations?.getAnnotationsBySender() || {};

	// Build a map from reaction key → { users, eventIds }
	const reactionMap = new Map<string, { users: string[]; eventIds: Map<string, string> }>();

	for (const [userId, events] of Object.entries(annotationsBySender)) {
		for (const reactionEvent of events) {
			const content = reactionEvent.getContent();
			const relatesTo = content['m.relates_to'];
			if (!relatesTo || relatesTo.rel_type !== 'm.annotation') continue;

			const key = relatesTo.key;
			const reactionEventId = reactionEvent.getId();
			if (!key || !reactionEventId) continue;

			if (!reactionMap.has(key)) {
				reactionMap.set(key, { users: [], eventIds: new Map() });
			}
			const bucket = reactionMap.get(key)!;
			if (!bucket.users.includes(userId)) {
				bucket.users.push(userId);
				bucket.eventIds.set(userId, reactionEventId);
			}
		}
	}

	const reactions: Reaction[] = [];
	for (const [key, data] of reactionMap.entries()) {
		reactions.push({
			key,
			count: data.users.length,
			users: data.users,
			hasReacted: currentUserId ? data.users.includes(currentUserId) : false
		});
	}

	return reactions.sort((a, b) => b.count - a.count);
}

/**
 * Toggle a reaction (add if not reacted, remove if already reacted).
 * SDK v40+ compatible.
 */
export async function toggleReaction(
	roomId: string,
	messageEvent: sdk.MatrixEvent,
	reactionKey: string
): Promise<void> {
	const client = get(matrixClient);
	if (!client) return;

	const currentUserId = client.getUserId();
	const messageId = messageEvent.getId();
	if (!currentUserId || !messageId) return;

	const room = client.getRoom(roomId);
	if (!room) return;

	// Find existing reaction by current user with this key
	const relations = room.relations.getChildEventsForEvent(
		messageId,
		'm.annotation',
		'm.reaction'
	);
	const annotationsBySender = relations?.getAnnotationsBySender() || {};
	const myReactions = annotationsBySender[currentUserId];

	let existingReactionId: string | undefined;
	if (myReactions) {
		for (const e of myReactions) {
			const content = e.getContent();
			if (content['m.relates_to']?.key === reactionKey) {
				existingReactionId = e.getId() ?? undefined;
				break;
			}
		}
	}

	if (existingReactionId) {
		await removeReaction(roomId, existingReactionId);
	} else {
		await sendReaction(roomId, messageId, reactionKey);
	}
}
