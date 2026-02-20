<script lang="ts">
	import { onMount, afterUpdate } from 'svelte';
	import { messages, matrixClient, userPresence, currentRoomId, highlightedLink } from '$lib/stores/matrix';
	import { marked } from 'marked';
	import { getMessageBody, getMessageType, isOwnMessage, editMessage, deleteMessage } from '$lib/matrix/messages';
	import { hasServiceLink, extractAllServiceLinks, URL_REGEX } from '$lib/utils/links';
	import { fetchAvatarUrl, fetchMediaUrl } from '$lib/utils/media';
	import { formatRelativeTime, formatFullTimestamp } from '$lib/utils/time';
	import { DARKROOT_REACTIONS, toggleReaction, getMessageReactions, getDsEmoji } from '$lib/matrix/reactions';

	let messageContainer: HTMLDivElement;
	let shouldAutoScroll = true;
	let showReactionPicker: string | null = null; // Message ID currently showing reaction picker
	let editingMessageId: string | null = null;   // Message ID currently being edited
	let editText = '';                             // Draft text while editing

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

	function startEdit(message: { id: string; content: any }) {
		editingMessageId = message.id;
		editText = message.content?.body || '';
		showReactionPicker = null;
	}

	function cancelEdit() {
		editingMessageId = null;
		editText = '';
	}

	async function saveEdit(message: { id: string }) {
		if (!$currentRoomId || !editText.trim()) return;
		try {
			await editMessage($currentRoomId, message.id, editText.trim());
		} catch (err) {
			console.error('Failed to edit message:', err);
		} finally {
			cancelEdit();
		}
	}

	async function handleDelete(message: { id: string }) {
		if (!$currentRoomId) return;
		try {
			await deleteMessage($currentRoomId, message.id);
		} catch (err) {
			console.error('Failed to delete message:', err);
		}
	}

	function handleEditKeyDown(event: KeyboardEvent, message: { id: string }) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			saveEdit(message);
		} else if (event.key === 'Escape') {
			cancelEdit();
		}
	}

	function isEdited(event: any): boolean {
		return typeof event.replacingEvent === 'function' && event.replacingEvent() !== null;
	}
</script>

<div
	class="message-list"
	bind:this={messageContainer}
	on:scroll={handleScroll}
>
	{#if $messages.length === 0}
		<div class="empty-state">
			<div class="empty-icon" aria-hidden="true">
				<svg viewBox="0 0 32 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="16" y1="4" x2="16" y2="30"/>
					<line x1="10" y1="20" x2="22" y2="20"/>
					<line x1="16" y1="30" x2="16" y2="37"/>
					<path d="M11 35 Q16 38 21 35"/>
					<path d="M14 9 C13 7 11.5 5 14 3 C14 6.5 13 7.5 15 8.5"/>
					<path d="M18 9 C19 7 20.5 5 18 3 C18 6.5 19 7.5 17 8.5"/>
				</svg>
			</div>
			<p class="empty-text">no messages yet</p>
			<p class="empty-hint">be the first to speak into the dark</p>
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

					<!-- Body / Edit mode -->
					{#if editingMessageId === message.id}
						<div class="msg-edit">
							<textarea
								class="msg-edit__textarea"
								bind:value={editText}
								on:keydown={(e) => handleEditKeyDown(e, message)}
								rows="2"
								autofocus
							></textarea>
							<div class="msg-edit__hint">Enter to save · Esc to cancel</div>
							<div class="msg-edit__actions">
								<button class="msg-edit__btn msg-edit__btn--cancel" on:click={cancelEdit}>Cancel</button>
								<button class="msg-edit__btn msg-edit__btn--save" on:click={() => saveEdit(message)}>Save</button>
							</div>
						</div>
					{:else}
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
									<div class="msg-card__text">
										{@html marked.parse(body)}
										{#if isEdited(message.event)}<span class="msg-edited">(edited)</span>{/if}
									</div>
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
									<span class="msg-card__file-icon">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
										<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
									</svg>
								</span>
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
					{/if}

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
								{@const emoji = getDsEmoji(reaction.key)}
								<button
									class="msg-reaction"
									class:msg-reaction--active={reaction.hasReacted}
									on:click={() => handleReaction(message.id, reaction.key)}
									title="{emoji?.title ?? reaction.key} · {reaction.users.map(u => getDisplayName(u)).join(', ')}"
								>
									{#if emoji}
										<img src={emoji.image} alt={emoji.label} class="msg-reaction__img" />
									{:else}
										<span class="msg-reaction__label">{reaction.key}</span>
									{/if}
									<span class="msg-reaction__count">{reaction.count}</span>
								</button>
							{/each}
						</div>
					{/if}

					</div>

				<!-- Hover action toolbar — sits at row level so it targets the whole message -->
				{#if editingMessageId !== message.id}
					<div class="msg-card__actions">
						{#if isOwn}
							<button
								class="msg-action-btn"
								on:click={() => startEdit(message)}
								title="Edit message"
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
									<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
									<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
								</svg>
							</button>
							<button
								class="msg-action-btn msg-action-btn--danger"
								on:click={() => handleDelete(message)}
								title="Delete message"
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
									<polyline points="3 6 5 6 21 6"/>
									<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
									<path d="M10 11v6M14 11v6"/>
									<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
								</svg>
							</button>
						{/if}
						<button
							class="msg-action-btn"
							on:click={() => showReactionPicker = showReactionPicker === message.id ? null : message.id}
							title="Add reaction"
						>+</button>
					</div>
				{/if}

				<!-- Reaction Picker -->
				{#if showReactionPicker === message.id}
					<div class="reaction-picker">
						{#each DARKROOT_REACTIONS as reaction}
							<button
								class="reaction-picker__option"
								on:click={() => handleReaction(message.id, reaction.key)}
								title={reaction.title}
							>
								<img src={reaction.image} alt={reaction.label} class="reaction-picker__img" />
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>

<style>
	.message-list {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-2) var(--space-3);
		display: flex;
		flex-direction: column;
		gap: 1px;
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
		gap: var(--space-3);
	}

	.empty-icon {
		width: 56px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-dim);
		opacity: 0.35;
	}

	.empty-icon :global(svg) {
		width: 100%;
		height: 100%;
	}

	.empty-text {
		font-size: var(--text-sm);
		font-weight: 600;
		margin: 0;
		color: var(--text-secondary);
		font-family: var(--font-display);
		letter-spacing: 0.06em;
		font-variant: small-caps;
	}

	.empty-hint {
		font-size: var(--text-xs);
		margin: 0;
		color: var(--text-dim);
		font-style: italic;
	}

	/* ── Message Row ── */
	.msg-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: 2px var(--space-1);
		width: 100%;
		border-radius: var(--radius-sm);
		transition: background var(--transition-fast);
		position: relative; /* anchor for the actions toolbar */
	}

	.msg-row:hover {
		background: rgba(255, 255, 255, 0.02);
	}

	/* Own messages: no layout flip — accent is on the card itself */
	.msg-row--own { /* intentionally no layout change */ }

	.msg-row--grouped {
		margin-top: -1px;
	}

	/* ── Avatar ── */
	.msg-avatar {
		width: 32px;
		height: 32px;
		min-width: 32px;
		border-radius: var(--radius-full);
		background: var(--accent-primary-dim);
		border: 1px solid rgba(79, 138, 97, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		position: relative;
		margin-top: 1px;
	}

	.msg-avatar--own {
		background: var(--accent-gold-dim);
		border-color: rgba(150, 168, 92, 0.3);
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

	/* Presence dot */
	.msg-avatar__presence {
		position: absolute;
		bottom: -2px;
		right: -2px;
		width: 9px;
		height: 9px;
		border-radius: var(--radius-full);
		border: 2px solid var(--bg-base);
	}

	.msg-avatar__presence--online  { background: #4ade80; }
	.msg-avatar__presence--offline { background: #4b5563; }

	/* ── Message Card ── */
	.msg-card {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		position: relative;
		overflow: visible;
	}

	/* Received: no special treatment */
	.msg-card--received { /* clean baseline */ }

	/* Sent: left-border accent + very faint tint */
	.msg-card--sent {
		border-left: 2px solid rgba(79, 138, 97, 0.28);
		padding-left: var(--space-2);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}

	/* ── Card Header ── */
	.msg-card__header {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: 0 0 2px 0;
	}

	.msg-card__sender {
		font-size: 12px;
		font-weight: 700;
		color: var(--accent-primary-bright);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: flex;
		align-items: baseline;
		gap: 1px;
	}

	.msg-card__sender-name { font-weight: 700; }

	.msg-card__sender-server {
		opacity: 0.45;
		font-weight: 400;
		font-size: 10px;
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
		opacity: 0.65;
	}

	/* ── Card Body ── */
	.msg-card__body {
		padding: 1px 0;
	}

	/* Text content */
	.msg-card__text {
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-primary);
		word-wrap: break-word;
		overflow-wrap: break-word;
	}

	.msg-card__text :global(p)      { margin: 0; }
	.msg-card__text :global(p + p)  { margin-top: 3px; }

	.msg-card__text :global(a) {
		color: var(--accent-gold-bright);
		text-decoration: underline;
		text-decoration-color: rgba(168, 183, 109, 0.3);
	}

	.msg-card__text :global(a:hover) {
		color: var(--accent-gold);
		text-decoration-color: var(--accent-gold);
	}

	/* Inline service icon links */
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
		background: rgba(0, 0, 0, 0.28);
		padding: 1px 5px;
		border-radius: 3px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--accent-primary-bright);
	}

	.msg-card__text :global(pre) {
		background: rgba(0, 0, 0, 0.22);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border-left: 2px solid var(--accent-primary-dim);
		overflow-x: auto;
		margin: 3px 0;
	}

	.msg-card__text :global(pre code) {
		background: transparent;
		padding: 0;
		border-radius: 0;
	}

	.msg-card__text :global(blockquote) {
		border-left: 2px solid var(--border-default);
		padding-left: var(--space-3);
		margin: 3px 0;
		color: var(--text-secondary);
		font-style: italic;
	}

	/* Inline timestamp (grouped messages) — hover-reveal */
	.msg-card__time-inline {
		font-size: 10px;
		color: var(--text-dim);
		font-family: var(--font-mono);
		opacity: 0;
		transition: opacity var(--transition-fast);
		padding-top: 1px;
		line-height: 1;
	}

	.msg-row:hover .msg-card__time-inline {
		opacity: 0.55;
	}

	/* Image */
	.msg-card__image {
		max-width: min(100%, 320px);
		max-height: 260px;
		border-radius: var(--radius-sm);
		display: block;
		margin-top: var(--space-1);
		border: 1px solid var(--border-subtle);
	}

	.msg-card__caption {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin: 2px 0 0 0;
	}

	/* File attachment */
	.msg-card__file {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		background: rgba(0, 0, 0, 0.18);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		margin-top: var(--space-1);
	}

	.msg-card__file-icon {
		display: flex;
		align-items: center;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.msg-card__file-icon :global(svg) {
		width: 14px;
		height: 14px;
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
		padding: var(--space-2);
		color: var(--text-dim);
		font-size: var(--text-xs);
		font-style: italic;
	}

	/* Link Feed badge */
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

	.link-feed-badge__icon { display: inline-flex; align-items: center; }

	.link-feed-badge__icon :global(svg) {
		width: 13px;
		height: 13px;
		flex-shrink: 0;
		vertical-align: middle;
	}

	/* Open Directly link */
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

	.link-open-direct + .link-open-direct { margin-left: var(--space-1); }

	.link-open-direct:hover {
		border-color: var(--accent-gold);
		color: var(--accent-gold-bright);
	}

	.link-open-direct__icon { display: inline-flex; align-items: center; }

	.link-open-direct__icon :global(svg) {
		width: 13px;
		height: 13px;
		flex-shrink: 0;
		vertical-align: middle;
	}

	/* Chat highlight animation (sidebar → chat) */
	@keyframes chatHighlight {
		0%   { background: transparent;               box-shadow: none; }
		12%  { background: rgba(108, 184, 130, 0.18); box-shadow: inset 0 0 0 1px var(--accent-primary-bright); }
		100% { background: transparent;               box-shadow: none; }
	}

	:global(.msg-row.link-active) {
		animation: chatHighlight 1.4s ease-out forwards;
		border-radius: var(--radius-sm);
	}

	/* ── Reactions ── */
	.msg-reactions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding-top: var(--space-1);
	}

	.msg-reaction {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 1px 7px;
		background: transparent;
		border: 1px solid var(--border-subtle);
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

	.msg-reaction__img {
		width: 14px;
		height: 14px;
		object-fit: contain;
		image-rendering: pixelated;
		flex-shrink: 0;
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

	/* ── Hover action toolbar (edit + delete + react) ── */
	/* Anchored to .msg-row (position: relative), floats at top-right of the full row */
	.msg-card__actions {
		position: absolute;
		top: 2px;
		right: 4px;
		display: flex;
		align-items: center;
		gap: 2px;
		opacity: 0;
		transition: opacity var(--transition-fast);
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		padding: 2px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		z-index: 10;
	}

	.msg-row:hover .msg-card__actions {
		opacity: 1;
	}

	.msg-action-btn {
		width: 22px;
		height: 22px;
		border-radius: var(--radius-sm);
		background: transparent;
		border: none;
		color: var(--text-dim);
		font-size: 13px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all var(--transition-fast);
		line-height: 1;
		padding: 0;
	}

	.msg-action-btn:hover {
		background: var(--accent-primary-dim);
		color: var(--accent-primary-bright);
	}

	.msg-action-btn--danger:hover {
		background: rgba(211, 95, 95, 0.15);
		color: #d35f5f;
	}

	/* ── Inline Edit Mode ── */
	.msg-edit {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-1) 0;
	}

	.msg-edit__textarea {
		width: 100%;
		min-height: 52px;
		max-height: 200px;
		padding: var(--space-2);
		background: var(--bg-base);
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		resize: none;
		box-shadow: var(--shadow-glow-green);
		line-height: 1.5;
		box-sizing: border-box;
	}

	.msg-edit__textarea:focus {
		outline: none;
	}

	.msg-edit__hint {
		font-size: 10px;
		color: var(--text-dim);
		font-style: italic;
	}

	.msg-edit__actions {
		display: flex;
		gap: var(--space-2);
	}

	.msg-edit__btn {
		padding: 2px var(--space-3);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
		font-family: var(--font-display);
		letter-spacing: 0.05em;
		transition: all var(--transition-fast);
	}

	.msg-edit__btn--save {
		background: rgba(47, 90, 58, 0.45);
		border: 1px solid var(--accent-primary);
		color: var(--accent-primary-bright);
	}

	.msg-edit__btn--save:hover {
		background: var(--accent-primary);
		color: var(--text-primary);
		box-shadow: var(--shadow-glow-green);
	}

	.msg-edit__btn--cancel {
		background: transparent;
		border: 1px solid var(--border-default);
		color: var(--text-dim);
	}

	.msg-edit__btn--cancel:hover {
		border-color: var(--border-default);
		color: var(--text-muted);
	}

	/* Edited indicator */
	.msg-edited {
		font-size: 10px;
		color: var(--text-dim);
		font-style: italic;
		margin-left: 4px;
		opacity: 0.6;
	}

	/* Reaction Picker — anchored to .msg-row, opens above the actions toolbar */
	.reaction-picker {
		position: absolute;
		top: 30px;
		right: 4px;
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		padding: var(--space-2);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		width: 206px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 100;
		animation: slideDown 0.15s ease-out;
	}

	@keyframes slideDown {
		from { opacity: 0; transform: translateY(-6px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.reaction-picker__option {
		width: 36px;
		height: 36px;
		padding: 4px;
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.reaction-picker__option:hover {
		background: var(--accent-primary-dim);
		border-color: var(--accent-primary);
		transform: scale(1.12) translateY(-1px);
	}

	.reaction-picker__img {
		width: 24px;
		height: 24px;
		object-fit: contain;
		image-rendering: pixelated;
	}
</style>
