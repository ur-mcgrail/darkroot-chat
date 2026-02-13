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
 * Get aggregated reactions for a message
 */
export function getMessageReactions(event: sdk.MatrixEvent): Reaction[] {
	const client = get(matrixClient);
	if (!client) return [];

	const currentUserId = client.getUserId();
	const relations = event.getRelation();

	// Get all reaction events for this message
	const reactionEvents = event
		.getRelations()
		?.getChildEvents()
		?.filter(e => e.getType() === 'm.reaction') || [];

	// Group reactions by key
	const reactionMap = new Map<string, { users: string[]; eventIds: Map<string, string> }>();

	for (const reactionEvent of reactionEvents) {
		const content = reactionEvent.getContent();
		const relatesTo = content['m.relates_to'];

		if (!relatesTo || relatesTo.rel_type !== 'm.annotation') continue;

		const key = relatesTo.key;
		const userId = reactionEvent.getSender();
		const eventId = reactionEvent.getId();

		if (!userId || !eventId) continue;

		if (!reactionMap.has(key)) {
			reactionMap.set(key, { users: [], eventIds: new Map() });
		}

		const reaction = reactionMap.get(key)!;
		if (!reaction.users.includes(userId)) {
			reaction.users.push(userId);
			reaction.eventIds.set(userId, eventId);
		}
	}

	// Convert to Reaction array
	const reactions: Reaction[] = [];
	for (const [key, data] of reactionMap.entries()) {
		reactions.push({
			key,
			count: data.users.length,
			users: data.users,
			hasReacted: currentUserId ? data.users.includes(currentUserId) : false
		});
	}

	return reactions.sort((a, b) => b.count - a.count); // Sort by count descending
}

/**
 * Toggle a reaction (add if not reacted, remove if already reacted)
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

	// Find if user already reacted with this key
	const reactionEvents = messageEvent
		.getRelations()
		?.getChildEvents()
		?.filter(e => e.getType() === 'm.reaction') || [];

	const existingReaction = reactionEvents.find(e => {
		const content = e.getContent();
		const relatesTo = content['m.relates_to'];
		return (
			relatesTo?.key === reactionKey &&
			e.getSender() === currentUserId
		);
	});

	if (existingReaction) {
		// Remove reaction
		const reactionId = existingReaction.getId();
		if (reactionId) {
			await removeReaction(roomId, reactionId);
		}
	} else {
		// Add reaction
		await sendReaction(roomId, messageId, reactionKey);
	}
}
