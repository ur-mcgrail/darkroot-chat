<script lang="ts">
	import { afterUpdate, onMount } from 'svelte';
	import { messages, matrixClient } from '$lib/stores/matrix';
	import { getMessageBody, getMessageType, isOwnMessage } from '$lib/matrix/messages';
	import {
		hasServiceLink,
		extractAllServiceLinks,
		getContextText,
		displayUrl,
		fetchLinkMeta,
		LINK_SERVICES,
		type LinkMeta,
	} from '$lib/utils/links';

	export let visible = true;

	let scrollContainer: HTMLDivElement;
	let shouldAutoScroll = true;

	// Map of url → metadata (reactive)
	let metaMap: Record<string, LinkMeta> = {};

	// Filter messages to only those with configured service links
	$: linkMessages = $messages.filter((msg) => {
		if (getMessageType(msg.content) !== 'm.text') return false;
		return hasServiceLink(getMessageBody(msg.content));
	});

	// Whenever link messages change, fetch metadata for new URLs
	$: {
		for (const msg of linkMessages) {
			const body = getMessageBody(msg.content);
			const links = extractAllServiceLinks(body);
			for (const { url } of links) {
				if (!(url in metaMap)) {
					// Mark as loading so we don't re-fetch
					metaMap[url] = {};
					fetchLinkMeta(url).then((meta) => {
						metaMap[url] = meta;
						metaMap = metaMap; // trigger reactivity
					});
				}
			}
		}
	}

	// Get display name for a user
	function getDisplayName(userId: string): string {
		if (!$matrixClient) return userId;
		const user = $matrixClient.getUser(userId);
		return user?.displayName || userId.split(':')[0].substring(1);
	}

	// Format timestamp
	function formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const isToday = date.toDateString() === now.toDateString();
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		const isYesterday = date.toDateString() === yesterday.toDateString();

		const time = date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true,
		});

		if (isToday) return time;
		if (isYesterday) return `Yesterday ${time}`;
		return (
			date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
			` ${time}`
		);
	}

	// Auto-scroll to bottom
	afterUpdate(() => {
		if (shouldAutoScroll && scrollContainer) {
			scrollContainer.scrollTop = scrollContainer.scrollHeight;
		}
	});

	function handleScroll() {
		if (!scrollContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
		shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 80;
	}
</script>

{#if visible}
	<div class="link-feed">
		<!-- Header -->
		<div class="link-feed__header">
			<span class="link-feed__title">
				<span class="link-feed__title-icon">🔗</span>
				Link Feed
			</span>
			{#if linkMessages.length > 0}
				<span class="link-feed__count">{linkMessages.length}</span>
			{/if}
		</div>

		<!-- Service legend -->
		<div class="link-feed__services">
			{#each LINK_SERVICES as svc}
				<span class="link-feed__service-chip" title={svc.label}>
					{svc.icon}
				</span>
			{/each}
		</div>

		<!-- Messages -->
		<div
			class="link-feed__messages"
			bind:this={scrollContainer}
			on:scroll={handleScroll}
		>
			{#if linkMessages.length === 0}
				<div class="link-feed__empty">
					<p class="link-feed__empty-text">No links yet</p>
					<p class="link-feed__empty-hint">
						Links to IG, YouTube, Bluesky, etc. will appear here
					</p>
				</div>
			{:else}
				{#each linkMessages as message, i (message.id)}
					{@const isOwn = $matrixClient && isOwnMessage(message.sender, $matrixClient)}
					{@const body = getMessageBody(message.content)}
					{@const context = getContextText(body)}
					{@const serviceLinks = extractAllServiceLinks(body)}
					{@const prevMsg = i > 0 ? linkMessages[i - 1] : null}
					{@const sameSender = prevMsg && prevMsg.sender === message.sender}

					<div class="link-msg" class:link-msg--own={isOwn} class:link-msg--grouped={sameSender}>
						<!-- Sender + time -->
						{#if !sameSender}
							<div class="link-msg__meta">
								<span class="link-msg__sender" class:link-msg__sender--own={isOwn}>
									{getDisplayName(message.sender)}
								</span>
								<span class="link-msg__time">{formatTime(message.timestamp)}</span>
							</div>
						{/if}

						<!-- Context text -->
						{#if context}
							<p class="link-msg__context">{context}</p>
						{/if}

						<!-- Link cards with metadata -->
						{#each serviceLinks as { service, url }}
							{@const meta = metaMap[url] || {}}
							<a
								class="link-msg__card"
								href={url}
								target="_blank"
								rel="noopener noreferrer"
							>
								<!-- Thumbnail (if available) -->
								{#if meta.thumbnail}
									<div class="link-msg__thumb-wrap">
										<img
											class="link-msg__thumb"
											src={meta.thumbnail}
											alt=""
											loading="lazy"
										/>
									</div>
								{/if}

								<div class="link-msg__card-body">
									<div class="link-msg__card-header">
										<span class="link-msg__card-icon">{service.icon}</span>
										<span class="link-msg__card-service">{service.label}</span>
									</div>

									{#if meta.title}
										<span class="link-msg__card-title">{meta.title}</span>
									{/if}

									{#if meta.author}
										<span class="link-msg__card-author">by {meta.author}</span>
									{/if}

									<span class="link-msg__card-url">{displayUrl(url)}</span>
								</div>

								<span class="link-msg__card-arrow">→</span>
							</a>
						{/each}

						<!-- Timestamp on grouped messages -->
						{#if sameSender}
							<div class="link-msg__time-inline">{formatTime(message.timestamp)}</div>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	</div>
{/if}

<style>
	.link-feed {
		width: 300px;
		min-width: 300px;
		display: flex;
		flex-direction: column;
		background: var(--bg-surface);
		border-left: 1px solid var(--border-default);
		height: 100%;
		overflow: hidden;
		/* Slightly smaller base font for the whole sidebar */
		font-size: 13px;
	}

	/* Header */
	.link-feed__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		background: var(--bg-elevated);
		border-bottom: 1px solid var(--border-default);
		flex-shrink: 0;
	}

	.link-feed__title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 12px;
		font-weight: 700;
		color: var(--text-primary);
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.link-feed__title-icon {
		font-size: 14px;
	}

	.link-feed__count {
		background: var(--accent-primary-dim);
		color: var(--accent-primary-bright);
		font-size: 10px;
		padding: 1px 7px;
		border-radius: var(--radius-full);
		font-weight: 600;
	}

	/* Service legend */
	.link-feed__services {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: var(--space-1) var(--space-3);
		border-bottom: 1px solid var(--border-default);
		background: var(--bg-elevated);
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	.link-feed__service-chip {
		font-size: 11px;
		opacity: 0.65;
		cursor: default;
		transition: opacity var(--transition-fast);
	}

	.link-feed__service-chip:hover {
		opacity: 1;
		transform: scale(1.15);
	}

	/* Messages area */
	.link-feed__messages {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	/* Empty state */
	.link-feed__empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: var(--space-8) var(--space-3);
		color: var(--text-muted);
		flex: 1;
	}

	.link-feed__empty-text {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.link-feed__empty-hint {
		margin: var(--space-2) 0 0 0;
		font-size: 11px;
		color: var(--text-dim);
		line-height: 1.5;
	}

	/* Individual link message */
	.link-msg {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.link-msg--grouped {
		margin-top: calc(-1 * var(--space-1));
	}

	.link-msg__meta {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-2);
		padding: 0 2px;
	}

	.link-msg__sender {
		font-size: 11px;
		font-weight: 700;
		color: var(--accent-primary-bright);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.link-msg__sender--own {
		color: var(--accent-gold);
	}

	.link-msg__time {
		font-size: 10px;
		color: var(--text-dim);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.link-msg__time-inline {
		font-size: 10px;
		color: var(--text-dim);
		padding: 0 2px;
		text-align: right;
	}

	.link-msg__context {
		margin: 0;
		padding: var(--space-1) var(--space-2);
		font-size: 12px;
		color: var(--text-secondary);
		line-height: 1.5;
		background: var(--bg-base);
		border-radius: var(--radius-sm);
	}

	/* Link card */
	.link-msg__card {
		display: flex;
		flex-direction: column;
		gap: 0;
		background: var(--bg-base);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: var(--text-primary);
		transition: all var(--transition-fast);
		cursor: pointer;
		overflow: hidden;
		position: relative;
	}

	.link-msg__card:hover {
		border-color: var(--accent-primary);
	}

	/* Thumbnail */
	.link-msg__thumb-wrap {
		width: 100%;
		max-height: 140px;
		overflow: hidden;
		background: var(--bg-base);
	}

	.link-msg__thumb {
		width: 100%;
		height: auto;
		display: block;
		object-fit: cover;
		max-height: 140px;
	}

	/* Card body (below thumbnail) */
	.link-msg__card-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-2);
	}

	.link-msg__card-header {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.link-msg__card-icon {
		font-size: 13px;
		flex-shrink: 0;
	}

	.link-msg__card-service {
		font-size: 10px;
		font-weight: 700;
		color: var(--accent-gold-bright);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.link-msg__card-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.link-msg__card-author {
		font-size: 10px;
		color: var(--text-muted);
		font-style: italic;
	}

	.link-msg__card-url {
		font-size: 10px;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.link-msg__card-arrow {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-dim);
		font-size: 12px;
		opacity: 0;
		transition: all var(--transition-fast);
	}

	.link-msg__card:hover .link-msg__card-arrow {
		opacity: 1;
		right: 6px;
		color: var(--accent-primary-bright);
	}

	/* Scrollbar */
	.link-feed__messages::-webkit-scrollbar {
		width: 4px;
	}

	.link-feed__messages::-webkit-scrollbar-track {
		background: transparent;
	}

	.link-feed__messages::-webkit-scrollbar-thumb {
		background: var(--border-default);
		border-radius: 4px;
	}

	.link-feed__messages::-webkit-scrollbar-thumb:hover {
		background: var(--text-dim);
	}
</style>
