<script lang="ts">
	import { onMount, afterUpdate } from 'svelte';
	import { messages, matrixClient, userPresence, currentRoomId, highlightedLink } from '$lib/stores/matrix';
	import { marked } from 'marked';
	import { getMessageBody, getMessageType, isOwnMessage } from '$lib/matrix/messages';
	import { hasServiceLink, extractAllServiceLinks, URL_REGEX } from '$lib/utils/links';
	import { fetchAvatarUrl, fetchMediaUrl } from '$lib/utils/media';
	import { formatRelativeTime, formatFullTimestamp } from '$lib/utils/time';
	import { DARKROOT_REACTIONS, toggleReaction, getMessageReactions } from '$lib/matrix/reactions';

	let messageContainer: HTMLDivElement;
	let shouldAutoScroll = true;
	let showReactionPicker: string | null = null; // Message ID currently showing reaction picker

	// Reactive maps: userId/mxcUrl → blob URL (for authenticated media)
	let avatarUrls: Record<string, string | null> = {};
	let mediaUrls: Record<string, string | null> = {};

	// Track what we've already kicked off fetches for
	const avatarFetchStarted = new Set<string>();
	const mediaFetchStarted = new Set<string>();

	// Configure marked for safe rendering
	marked.setOptions({
		breaks: true,
		gfm: true,
	});

	afterUpdate(() => {
		if (shouldAutoScroll && messageContainer) {
			messageContainer.scrollTop = messageContainer.scrollHeight;
		}
	});

	function handleScroll() {
		if (!messageContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = messageContainer;
		shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 100;
	}

	// Sidebar → chat: scroll to message and flash highlight
	$: {
		const hl = $highlightedLink;
		if (hl?.from === 'sidebar' && messageContainer) {
			const el = messageContainer.querySelector(`[data-msgid="${hl.id}"]`) as HTMLElement | null;
			if (el) {
				el.classList.remove('link-active');
				void el.offsetHeight; // force reflow to restart animation
				el.classList.add('link-active');
				el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
		}
	}

	// Update relative timestamps every 30 seconds
	let currentTime = Date.now();
	let updateInterval: ReturnType<typeof setInterval>;

	onMount(() => {
		updateInterval = setInterval(() => {
			currentTime = Date.now();
		}, 30000); // Update every 30 seconds

		return () => {
			if (updateInterval) clearInterval(updateInterval);
		};
	});

	/** Get the first letter for the avatar placeholder */
	function getInitial(userId: string): string {
		return getDisplayName(userId).charAt(0).toUpperCase();
	}

	/**
	 * Kick off an async avatar fetch for a user. Once it resolves,
	 * avatarUrls[userId] is updated and Svelte re-renders.
	 */
	function ensureAvatar(userId: string) {
		if (avatarFetchStarted.has(userId) || !$matrixClient) return;
		avatarFetchStarted.add(userId);

		const user = $matrixClient.getUser(userId);
		if (!user?.avatarUrl) {
			avatarUrls[userId] = null;
			return;
		}

		fetchAvatarUrl($matrixClient, user.avatarUrl).then((blobUrl) => {
			avatarUrls[userId] = blobUrl;
			avatarUrls = avatarUrls; // trigger reactivity
		});
	}

	/**
	 * Kick off an async media fetch for an mxc URL (for m.image messages).
	 * Once resolved, mediaUrls[mxcUrl] is updated.
	 */
	function ensureMedia(mxcUrl: string) {
		if (mediaFetchStarted.has(mxcUrl) || !$matrixClient) return;
		mediaFetchStarted.add(mxcUrl);

		fetchMediaUrl($matrixClient, mxcUrl).then((blobUrl) => {
			mediaUrls[mxcUrl] = blobUrl;
			mediaUrls = mediaUrls; // trigger reactivity
		});
	}

	/**
	 * Build an authenticated download URL for file attachments.
	 * We return a blob URL so the browser can open/download it.
	 */
	function handleFileDownload(mxcUrl: string, filename: string) {
		if (!$matrixClient) return;
		fetchMediaUrl($matrixClient, mxcUrl).then((blobUrl) => {
			if (blobUrl) {
				const a = document.createElement('a');
				a.href = blobUrl;
				a.download = filename;
				a.click();
			}
		});
	}

	// When messages change, ensure we've started fetches for any new avatars/media
	$: {
		for (const msg of $messages) {
			ensureAvatar(msg.sender);
			const type = getMessageType(msg.content);
			if (type === 'm.image' && msg.content?.url) {
				ensureMedia(msg.content.url);
			}
		}
	}

	async function handleReaction(messageId: string, reactionKey: string) {
		const message = $messages.find(m => m.id === messageId);
		if (!message || !$currentRoomId) return;

		try {
			await toggleReaction($currentRoomId, message.event, reactionKey);
			showReactionPicker = null; // Close picker after reacting
		} catch (error) {
			console.error('Failed to toggle reaction:', error);
		}
	}

	/**
	 * For messages that contain service links, replace each bare URL with a compact
	 * inline icon-anchor (service SVG + target=_blank) before passing to marked.
	 * This keeps the surrounding message text but swaps the ugly raw URL for a tiny icon.
	 */
	function renderBodyWithIconLinks(
		body: string,
		links: Array<{ service: { label: string; svgIcon: string }; url: string }>
	): string {
		let processed = body;
		for (const { service, url } of links) {
			const iconHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="msg-link-icon" title="${service.label}">${service.svgIcon}</a>`;
			processed = processed.split(url).join(iconHtml);
		}
		return marked.parse(processed) as string;
	}

	function getDisplayName(userId: string): string {
		if (!$matrixClient) return userId;
		const user = $matrixClient.getUser(userId);
		return user?.displayName || userId.split(':')[0].substring(1);
	}

	/** Get username and server parts separately for styling */
	function getUsernameParts(userId: string): { username: string; server: string } {
		if (!$matrixClient) return { username: userId, server: '' };

		const user = $matrixClient.getUser(userId);
		if (user?.displayName) {
			return { username: user.displayName, server: '' };
		}

		// Parse Matrix ID: @username:server
		const parts = userId.split(':');
		const username = parts[0]?.substring(1) || userId; // Remove @
		const server = parts[1] ? `:${parts[1]}` : '';

		return { username, server };
	}

	onMount(() => {
		if (messageContainer) {
			messageContainer.scrollTop = messageContainer.scrollHeight;
		}
	});
</script>

<div
	class="message-list"
	bind:this={messageContainer}
	on:scroll={handleScroll}
>
	{#if $messages.length === 0}
		<div class="empty-state">
			<div class="empty-icon">💬</div>
			<p class="empty-text">No messages yet</p>
			<p class="empty-hint">Be the first to send a message!</p>
		</div>
	{:else}
		{#each $messages as message, i (message.id)}
			{@const isOwn = $matrixClient && isOwnMessage(message.sender, $matrixClient)}
			{@const messageType = getMessageType(message.content)}
			{@const body = getMessageBody(message.content)}
			{@const isLink = messageType === 'm.text' && hasServiceLink(body)}
			{@const prevMessage = i > 0 ? $messages[i - 1] : null}
			{@const sameSenderAsPrev = prevMessage && prevMessage.sender === message.sender}

			<div class="msg-row" class:msg-row--own={isOwn} class:msg-row--grouped={sameSenderAsPrev} data-msgid={message.id}>
				<!-- Avatar (only on first message in a group) -->
				{#if !sameSenderAsPrev}
					{@const avatarSrc = avatarUrls[message.sender]}
					{@const presence = $userPresence[message.sender] || 'offline'}
					<div class="msg-avatar" class:msg-avatar--own={isOwn}>
						{#if avatarSrc}
							<img
								class="msg-avatar__img"
								src={avatarSrc}
								alt={getDisplayName(message.sender)}
								loading="lazy"
							/>
						{:else}
							<span class="msg-avatar__initial">{getInitial(message.sender)}</span>
						{/if}
						<!-- Presence indicator -->
						<div
							class="msg-avatar__presence"
							class:msg-avatar__presence--online={presence === 'online'}
							class:msg-avatar__presence--offline={presence === 'offline' || presence === 'unavailable'}
							title={presence === 'online' ? 'Online' : 'Offline'}
						></div>
					</div>
				{:else}
					<div class="msg-avatar-spacer"></div>
				{/if}

				<!-- Card -->
				<div class="msg-card" class:msg-card--sent={isOwn} class:msg-card--received={!isOwn}>
					<!-- Header bar (sender + time) — show on first message in group -->
					{#if !sameSenderAsPrev}
						{@const nameParts = getUsernameParts(message.sender)}
						<div class="msg-card__header" class:msg-card__header--own={isOwn}>
							<span class="msg-card__sender">
								<span class="msg-card__sender-name">{nameParts.username}</span>
								{#if nameParts.server}
									<span class="msg-card__sender-server">{nameParts.server}</span>
								{/if}
							</span>
							<span
								class="msg-card__time"
								title={formatFullTimestamp(message.timestamp)}
							>
								{formatRelativeTime(message.timestamp)}
							</span>
						</div>
					{/if}

					<!-- Body -->
					<div class="msg-card__body">
						{#if messageType === 'm.text'}
							{#if isLink}
								{@const links = extractAllServiceLinks(body)}
								<div class="msg-card__text">{@html renderBodyWithIconLinks(body, links)}</div>
								<button
									class="link-feed-badge"
									on:click={() => highlightedLink.set({ id: message.id, ts: Date.now(), from: 'chat' })}
								>
									{#each links as link}
										<span class="link-feed-badge__icon">{@html link.service.svgIcon}</span>
									{/each}
									{#if links.length === 1}
										See this {links[0].service.label} in the feed →
									{:else}
										See these links in the feed →
									{/if}
								</button>
								{#each links as link}
									<a
										class="link-open-direct"
										href={link.url}
										target="_blank"
										rel="noopener noreferrer"
									>Open Directly <span class="link-open-direct__icon">{@html link.service.svgIcon}</span></a>
								{/each}
							{:else}
								<div class="msg-card__text">{@html marked.parse(body)}</div>
							{/if}
						{:else if messageType === 'm.image'}
							{@const imageSrc = mediaUrls[message.content.url]}
							{#if imageSrc}
								<img
									src={imageSrc}
									alt={message.content.body}
									class="msg-card__image"
								/>
							{:else}
								<div class="msg-card__image-loading">Loading image...</div>
							{/if}
							{#if message.content.body}
								<p class="msg-card__caption">{message.content.body}</p>
							{/if}
						{:else if messageType === 'm.file'}
							<div class="msg-card__file">
								<span class="msg-card__file-icon">📎</span>
								<button
									class="msg-card__file-link"
									on:click={() => handleFileDownload(message.content.url, message.content.body)}
								>
									{message.content.body}
								</button>
							</div>
						{:else}
							<p class="msg-card__text">{body}</p>
						{/if}
					</div>

					<!-- Inline timestamp for grouped messages -->
					{#if sameSenderAsPrev}
						<div
							class="msg-card__time-inline"
							title={formatFullTimestamp(message.timestamp)}
						>
							{formatRelativeTime(message.timestamp)}
						</div>
					{/if}

					<!-- Reactions -->
					{#if getMessageReactions(message.event).length > 0}
						{@const reactions = getMessageReactions(message.event)}
						<div class="msg-reactions">
							{#each reactions as reaction}
								<button
									class="msg-reaction"
									class:msg-reaction--active={reaction.hasReacted}
									on:click={() => handleReaction(message.id, reaction.key)}
									title={reaction.users.map(u => getDisplayName(u)).join(', ')}
								>
									<span class="msg-reaction__label">{reaction.key}</span>
									<span class="msg-reaction__count">{reaction.count}</span>
								</button>
							{/each}
						</div>
					{/if}

					<!-- Footer (date stamp) -->
					{#if !sameSenderAsPrev}
						<div class="msg-card__footer">
							<span class="msg-card__date">{formatFullTimestamp(message.timestamp)}</span>
						</div>
					{/if}

					<!-- Add Reaction Button -->
					<button
						class="msg-card__react-btn"
						on:click={() => showReactionPicker = showReactionPicker === message.id ? null : message.id}
						title="Add reaction"
					>
						+
					</button>

					<!-- Reaction Picker -->
					{#if showReactionPicker === message.id}
						<div class="reaction-picker">
							{#each DARKROOT_REACTIONS as reaction}
								<button
									class="reaction-picker__option"
									on:click={() => handleReaction(message.id, reaction.key)}
									title={reaction.title}
								>
									{reaction.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	{/if}
</div>

<style>
	.message-list {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	/* ── Empty State ── */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-muted);
		text-align: center;
		padding: var(--space-8);
	}

	.empty-icon { font-size: 4rem; margin-bottom: var(--space-4); opacity: 0.5; }
	.empty-text { font-size: var(--text-lg); font-weight: 600; margin: 0 0 var(--space-2) 0; color: var(--text-secondary); }
	.empty-hint { font-size: var(--text-sm); margin: 0; }

	/* ── Message Row (avatar + card) ── */
	.msg-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		max-width: 80%;
	}

	.msg-row--own {
		align-self: flex-end;
		flex-direction: row-reverse;
	}

	.msg-row--grouped {
		margin-top: calc(-1 * var(--space-1));
	}

	/* ── Avatar ── */
	.msg-avatar {
		width: 32px;
		height: 32px;
		min-width: 32px;
		border-radius: var(--radius-full);
		background: var(--accent-primary-dim);
		border: 1px solid var(--accent-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		transition: box-shadow 0.2s ease, transform 0.15s ease;
		position: relative;
	}

	.msg-avatar:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
		transform: scale(1.08);
	}

	.msg-avatar--own {
		background: var(--accent-gold-dim);
		border-color: var(--accent-gold);
	}

	.msg-avatar__img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: var(--radius-full);
	}

	.msg-avatar__initial {
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--accent-primary-bright);
		line-height: 1;
	}

	.msg-avatar--own .msg-avatar__initial {
		color: var(--accent-gold-bright);
	}

	.msg-avatar-spacer {
		width: 32px;
		min-width: 32px;
		flex-shrink: 0;
	}

	/* Presence indicator dot */
	.msg-avatar__presence {
		position: absolute;
		bottom: -2px;
		right: -2px;
		width: 10px;
		height: 10px;
		border-radius: var(--radius-full);
		border: 2px solid var(--bg-base);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	.msg-avatar__presence--online {
		background: #4ade80; /* Green */
	}

	.msg-avatar__presence--offline {
		background: #6b7280; /* Gray */
	}

	/* ── Message Card ── */
	.msg-card {
		display: flex;
		flex-direction: column;
		border-radius: var(--radius-md);
		overflow: visible; /* Allow reaction picker to overflow */
		min-width: 120px;
		transition: transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease;
		position: relative;
	}

	/* Received card — elevated above the page bg so it has real depth */
	.msg-card--received {
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		box-shadow: var(--shadow-card);
	}

	.msg-card--received:hover {
		border-color: var(--border-strong);
		box-shadow: var(--shadow-card-hover);
		transform: translateY(-1px);
	}

	/* Sent card — green tint makes it clearly "yours" */
	.msg-card--sent {
		background: rgba(47, 90, 58, 0.32);
		border: 1px solid rgba(79, 138, 97, 0.38);
		box-shadow: var(--shadow-card);
	}

	.msg-card--sent:hover {
		border-color: var(--accent-primary);
		box-shadow: var(--shadow-card-hover), 0 0 12px rgba(79, 138, 97, 0.18);
		transform: translateY(-1px);
	}

	/* ── Card Header ── */
	.msg-card__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-1) var(--space-3);
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border-default);
		min-height: 28px;
	}

	.msg-card__header--own {
		background: rgba(47, 90, 58, 0.55);
		border-bottom-color: rgba(79, 138, 97, 0.45);
	}

	.msg-card__sender {
		font-size: 11px;
		font-weight: 700;
		color: var(--accent-primary-bright);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: flex;
		align-items: baseline;
	}

	.msg-card__sender-name {
		font-weight: 700;
	}

	.msg-card__sender-server {
		opacity: 0.5;
		font-weight: 400;
		margin-left: 1px;
	}

	.msg-card__header--own .msg-card__sender {
		color: var(--accent-gold-bright);
	}

	.msg-card__time {
		font-size: 10px;
		color: var(--text-dim);
		white-space: nowrap;
		flex-shrink: 0;
		font-family: var(--font-mono);
	}

	/* ── Card Footer ── */
	.msg-card__footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding: var(--space-1) var(--space-3);
		background: rgba(0, 0, 0, 0.1);
		border-top: 1px solid rgba(255, 255, 255, 0.05);
		min-height: 24px;
	}

	.msg-card__date {
		font-size: 9px;
		color: var(--text-dim);
		opacity: 0.6;
		font-family: var(--font-mono);
		font-style: italic;
	}

	/* ── Card Body ── */
	.msg-card__body {
		padding: var(--space-2) var(--space-3);
	}

	/* Text content */
	.msg-card__text {
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--text-primary);
		word-wrap: break-word;
		overflow-wrap: break-word;
	}

	.msg-card__text :global(p) {
		margin: 0;
	}

	.msg-card__text :global(p + p) {
		margin-top: var(--space-2);
	}

	.msg-card__text :global(a) {
		color: var(--accent-gold-bright);
		text-decoration: underline;
		text-decoration-color: rgba(168, 183, 109, 0.3);
	}

	.msg-card__text :global(a:hover) {
		color: var(--accent-gold);
		text-decoration-color: var(--accent-gold);
	}

	/* Inline service icon links (replace raw URL text with platform icon) */
	.msg-card__text :global(.msg-link-icon) {
		display: inline-flex;
		align-items: center;
		color: var(--accent-gold-bright);
		text-decoration: none;
		opacity: 0.8;
		vertical-align: middle;
		padding: 0 1px;
		transition: opacity var(--transition-fast), transform var(--transition-fast);
	}

	.msg-card__text :global(.msg-link-icon:hover) {
		opacity: 1;
		transform: scale(1.2);
	}

	.msg-card__text :global(.msg-link-icon svg) {
		width: 15px;
		height: 15px;
	}

	.msg-card__text :global(code) {
		background: var(--bg-elevated);
		padding: 1px 5px;
		border-radius: var(--radius-xs);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.msg-card__text :global(pre) {
		background: var(--bg-elevated);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		overflow-x: auto;
		margin: var(--space-2) 0;
	}

	.msg-card__text :global(pre code) {
		background: transparent;
		padding: 0;
	}

	/* Inline timestamp (grouped messages) */
	.msg-card__time-inline {
		padding: 0 var(--space-3) var(--space-1);
		font-size: 10px;
		color: var(--text-dim);
		text-align: right;
		font-family: var(--font-mono);
	}

	/* Image */
	.msg-card__image {
		max-width: 100%;
		max-height: 300px;
		border-radius: var(--radius-sm);
		display: block;
	}

	.msg-card__caption {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin: var(--space-1) 0 0 0;
	}

	/* File */
	.msg-card__file {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		background: var(--bg-elevated);
		border-radius: var(--radius-sm);
	}

	.msg-card__file-icon {
		font-size: var(--text-lg);
	}

	.msg-card__file a,
	.msg-card__file-link {
		color: var(--accent-primary-bright);
		text-decoration: none;
		font-size: var(--text-sm);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		font-family: inherit;
	}

	.msg-card__file a:hover,
	.msg-card__file-link:hover {
		text-decoration: underline;
	}

	.msg-card__image-loading {
		padding: var(--space-4);
		color: var(--text-dim);
		font-size: var(--text-xs);
		font-style: italic;
	}

	/* Link Feed badge (real button — triggers sidebar highlight) */
	.link-feed-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: var(--space-1);
		padding: 2px 10px;
		background: var(--accent-primary-dim);
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--accent-primary-bright);
		white-space: nowrap;
		cursor: pointer;
		font-family: inherit;
		transition: background var(--transition-fast), box-shadow var(--transition-fast);
	}

	.link-feed-badge:hover {
		background: var(--accent-primary);
		color: var(--text-primary);
		box-shadow: 0 0 0 2px var(--accent-primary-bright);
	}

	.link-feed-badge__icon {
		display: inline-flex;
		align-items: center;
	}

	.link-feed-badge__icon :global(svg) {
		width: 13px;
		height: 13px;
		flex-shrink: 0;
		vertical-align: middle;
	}

	/* Open Directly link — ghost pill, sits below the feed badge */
	.link-open-direct {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin-top: 4px;
		padding: 2px 10px;
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-secondary);
		text-decoration: none;
		font-family: inherit;
		transition: border-color var(--transition-fast), color var(--transition-fast);
	}

	.link-open-direct + .link-open-direct {
		margin-left: var(--space-1);
	}

	.link-open-direct:hover {
		border-color: var(--accent-gold);
		color: var(--accent-gold-bright);
	}

	.link-open-direct__icon {
		display: inline-flex;
		align-items: center;
	}

	.link-open-direct__icon :global(svg) {
		width: 13px;
		height: 13px;
		flex-shrink: 0;
		vertical-align: middle;
	}

	/* Chat highlight animation (triggered by sidebar → chat) */
	@keyframes chatHighlight {
		0%   { background: transparent;              box-shadow: none; }
		12%  { background: rgba(108, 184, 130, 0.22); box-shadow: inset 0 0 0 2px var(--accent-primary-bright); }
		100% { background: transparent;              box-shadow: none; }
	}

	:global(.msg-row.link-active) {
		animation: chatHighlight 1.4s ease-out forwards;
		border-radius: var(--radius-sm);
	}

	/* ── Reactions ── */
	.msg-reactions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3) var(--space-2);
	}

	.msg-reaction {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
		font-family: var(--font-body);
	}

	.msg-reaction:hover {
		background: var(--bg-elevated);
		border-color: var(--accent-primary);
		color: var(--accent-primary-bright);
	}

	.msg-reaction--active {
		background: var(--accent-primary-dim);
		border-color: var(--accent-primary);
		color: var(--accent-primary-bright);
	}

	.msg-reaction__label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.msg-reaction__count {
		font-size: 10px;
		font-weight: 700;
		font-family: var(--font-mono);
	}

	/* Add Reaction Button */
	.msg-card__react-btn {
		position: absolute;
		top: -8px;
		right: 8px;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-full);
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		color: var(--text-muted);
		font-size: 14px;
		font-weight: 700;
		display: none;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all var(--transition-fast);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
	}

	.msg-card:hover .msg-card__react-btn {
		display: flex;
	}

	.msg-card__react-btn:hover {
		background: var(--accent-primary);
		border-color: var(--accent-primary-bright);
		color: var(--text-primary);
		transform: scale(1.1);
	}

	/* Reaction Picker */
	.reaction-picker {
		position: absolute;
		top: -48px;
		right: 8px;
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		padding: var(--space-2);
		display: flex;
		gap: var(--space-1);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 100;
		animation: slideDown 0.15s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.reaction-picker__option {
		padding: 6px 12px;
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		cursor: pointer;
		transition: all var(--transition-fast);
		white-space: nowrap;
	}

	.reaction-picker__option:hover {
		background: var(--accent-primary-dim);
		border-color: var(--accent-primary);
		color: var(--accent-primary-bright);
		transform: translateY(-2px);
	}
</style>
