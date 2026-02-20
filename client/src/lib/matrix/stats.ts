/**
 * Room Statistics — computed from the Matrix event timeline.
 *
 * loadFullHistory() paginates backwards through the room until we reach the
 * beginning of time (or the server has no more pages), then computeStats()
 * derives metrics from whatever events are in the live timeline.
 */

import * as sdk from 'matrix-js-sdk';

export interface ChatterStat {
	userId: string;
	displayName: string;
	count: number;
	words: number;
	avgWords: number;
}

export interface DayStat {
	date: string;   // YYYY-MM-DD
	label: string;  // "Mon 17"
	count: number;
}

export interface RoomStats {
	totalMessages: number;
	totalWords: number;
	avgWordsPerMessage: number;
	uniqueSenders: number;
	topChatters: ChatterStat[];
	last14Days: DayStat[];
	hourlyDistribution: number[]; // index = hour 0–23
	peakHour: number;
	longestMessage: {
		userId: string;
		displayName: string;
		words: number;
		preview: string;
	} | null;
}

/**
 * Paginate backwards through the room's live timeline until no more pages.
 * Calls onProgress(eventCount) after each page so the UI can update.
 */
export async function loadFullHistory(
	client: sdk.MatrixClient,
	room: sdk.Room,
	onProgress?: (count: number) => void
): Promise<void> {
	const timeline = room.getLiveTimeline();
	let hasMore = true;

	while (hasMore) {
		try {
			const result = await client.paginateEventTimeline(timeline, {
				backwards: true,
				limit: 100,
			});
			onProgress?.(timeline.getEvents().length);
			// paginateEventTimeline returns false when there are no more pages
			if (!result) hasMore = false;
		} catch {
			hasMore = false;
		}
	}
}

/**
 * Derive stats from whatever events are currently in the live timeline.
 * Safe to call while history is still loading — stats update as pages arrive.
 */
export function computeStats(room: sdk.Room, client: sdk.MatrixClient): RoomStats {
	const events = room.getLiveTimeline().getEvents();

	// Only real text messages — exclude redacted, edits, images/files
	const messageEvents = events.filter(e => {
		if (e.getType() !== 'm.room.message') return false;
		if (e.isRedacted()) return false;
		const rel = e.getContent()['m.relates_to'];
		if (rel?.rel_type === 'm.replace') return false;
		const msgtype = e.getContent().msgtype;
		return msgtype === 'm.text' || msgtype === 'm.emote' || msgtype === 'm.notice';
	});

	const getDisplayName = (userId: string): string => {
		const u = client.getUser(userId);
		return u?.displayName || userId.split(':')[0].slice(1);
	};

	// Per-user aggregation
	const userMap = new Map<string, { count: number; words: number }>();
	for (const e of messageEvents) {
		const sender = e.getSender() || 'unknown';
		const body: string = e.getContent().body || '';
		const wc = body.trim().length > 0 ? body.trim().split(/\s+/).length : 0;
		if (!userMap.has(sender)) userMap.set(sender, { count: 0, words: 0 });
		const s = userMap.get(sender)!;
		s.count++;
		s.words += wc;
	}

	const topChatters: ChatterStat[] = [...userMap.entries()]
		.map(([userId, { count, words }]) => ({
			userId,
			displayName: getDisplayName(userId),
			count,
			words,
			avgWords: count > 0 ? Math.round(words / count) : 0,
		}))
		.sort((a, b) => b.count - a.count);

	const totalMessages = messageEvents.length;
	const totalWords = topChatters.reduce((s, c) => s + c.words, 0);
	const avgWordsPerMessage = totalMessages > 0 ? Math.round(totalWords / totalMessages) : 0;

	// Last 14 days
	const now = new Date();
	const last14Days: DayStat[] = [];
	for (let i = 13; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		last14Days.push({
			date: d.toISOString().slice(0, 10),
			label: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
			count: 0,
		});
	}

	const hourlyDistribution = new Array(24).fill(0) as number[];

	for (const e of messageEvents) {
		const d = new Date(e.getTs());
		const dateStr = d.toISOString().slice(0, 10);
		hourlyDistribution[d.getHours()]++;
		const day = last14Days.find(x => x.date === dateStr);
		if (day) day.count++;
	}

	const peakHour = hourlyDistribution.indexOf(Math.max(...hourlyDistribution));

	// Longest message
	let longestMessage: RoomStats['longestMessage'] = null;
	let maxWords = 0;
	for (const e of messageEvents) {
		const body: string = e.getContent().body || '';
		const wc = body.trim().length > 0 ? body.trim().split(/\s+/).length : 0;
		if (wc > maxWords) {
			maxWords = wc;
			const sender = e.getSender() || '';
			longestMessage = {
				userId: sender,
				displayName: getDisplayName(sender),
				words: wc,
				preview: body.slice(0, 120) + (body.length > 120 ? '…' : ''),
			};
		}
	}

	return {
		totalMessages,
		totalWords,
		avgWordsPerMessage,
		uniqueSenders: userMap.size,
		topChatters,
		last14Days,
		hourlyDistribution,
		peakHour,
		longestMessage,
	};
}
