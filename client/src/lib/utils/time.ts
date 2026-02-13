/**
 * Time formatting utilities
 */

/**
 * Format timestamp as relative time (e.g., "Just now", "5m ago", "2h ago")
 */
export function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 10) {
		return 'Just now';
	}
	if (seconds < 60) {
		return `${seconds}s ago`;
	}
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	if (hours < 24) {
		return `${hours}h ago`;
	}
	if (days === 1) {
		return 'Yesterday';
	}
	if (days < 7) {
		return `${days}d ago`;
	}

	// For older messages, show the date
	const date = new Date(timestamp);
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' })
	});
}

/**
 * Format timestamp as full date/time for hover tooltip
 */
export function formatFullTimestamp(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toLocaleString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		second: '2-digit',
		hour12: true
	});
}

/**
 * Format timestamp for display (today = time, older = date)
 */
export function formatTimestamp(timestamp: number): string {
	const date = new Date(timestamp);
	const now = new Date();
	const isToday = date.toDateString() === now.toDateString();

	if (isToday) {
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}
