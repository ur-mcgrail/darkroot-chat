<script lang="ts">
	import { onMount, afterUpdate } from 'svelte';
	import { messages, matrixClient } from '$lib/stores/matrix';
	import { marked } from 'marked';
	import { getMessageBody, getMessageType, isOwnMessage } from '$lib/matrix/messages';
	import { hasServiceLink, getContextText, extractAllServiceLinks, URL_REGEX } from '$lib/utils/links';

	let messageContainer: HTMLDivElement;
	let shouldAutoScroll = true;

	// Configure marked for safe rendering
	marked.setOptions({
		breaks: true, // Convert \n to <br>
		gfm: true, // GitHub Flavored Markdown
	});

	/**
	 * For messages with service links, strip the URLs out and append a
	 * "See Link Feed →" badge. Otherwise render normally.
	 */
	function renderBody(body: string, isLink: boolean): string {
		if (!isLink) return marked.parse(body) as string;

		// Get the text around the link(s)
		const context = getContextText(body);
		const links = extractAllServiceLinks(body);
		const icons = links.map((l) => l.service.icon).join(' ');

		let html = '';
		if (context) {
			html += marked.parse(context) as string;
		}
		html += `<span class="link-feed-badge">${icons} See Link Feed →</span>`;
		return html;
	}

	// Auto-scroll to bottom when messages change
	afterUpdate(() => {
		if (shouldAutoScroll && messageContainer) {
			messageContainer.scrollTop = messageContainer.scrollHeight;
		}
	});

	// Check if user is near bottom (for auto-scroll behavior)
	function handleScroll() {
		if (!messageContainer) return;

		const { scrollTop, scrollHeight, clientHeight } = messageContainer;
		const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

		// Auto-scroll if within 100px of bottom
		shouldAutoScroll = distanceFromBottom < 100;
	}

	// Format timestamp
	function formatTime(timestamp: number): string {
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

	// Get display name for user
	function getDisplayName(userId: string): string {
		if (!$matrixClient) return userId;

		const user = $matrixClient.getUser(userId);
		return user?.displayName || userId.split(':')[0].substring(1); // Remove @ and domain
	}

	// Render markdown safely
	function renderMarkdown(text: string): string {
		return marked.parse(text) as string;
	}

	onMount(() => {
		// Scroll to bottom on initial load
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

			<div class="message-wrapper" class:own={isOwn} class:grouped={sameSenderAsPrev}>
				<div class="chat-bubble" class:sent={isOwn} class:received={!isOwn}>
					<!-- Sender name (show for first message in a group from this sender) -->
					{#if !sameSenderAsPrev}
						<div class="message-sender" class:message-sender--own={isOwn}>
							{getDisplayName(message.sender)}
						</div>
					{/if}

					<!-- Message content -->
					<div class="message-content">
						{#if messageType === 'm.text'}
							{@html renderBody(body, isLink)}
						{:else if messageType === 'm.image'}
							<img
								src={$matrixClient?.mxcUrlToHttp(message.content.url) || ''}
								alt={message.content.body}
								class="message-image"
							/>
							{#if message.content.body}
								<p class="image-caption">{message.content.body}</p>
							{/if}
						{:else if messageType === 'm.file'}
							<div class="file-attachment">
								<span class="file-icon">📎</span>
								<a
									href={$matrixClient?.mxcUrlToHttp(message.content.url) || '#'}
									target="_blank"
									rel="noopener noreferrer"
								>
									{message.content.body}
								</a>
							</div>
						{:else}
							<p>{body}</p>
						{/if}
					</div>

					<!-- Timestamp -->
					<div class="message-time">
						{formatTime(message.timestamp)}
					</div>
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
		gap: var(--space-3);
	}

	/* Empty State */
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

	.empty-icon {
		font-size: 4rem;
		margin-bottom: var(--space-4);
		opacity: 0.5;
	}

	.empty-text {
		font-size: var(--text-lg);
		font-weight: 600;
		margin: 0 0 var(--space-2) 0;
		color: var(--text-secondary);
	}

	.empty-hint {
		font-size: var(--text-sm);
		margin: 0;
	}

	/* Message Wrapper */
	.message-wrapper {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}

	.message-wrapper.own {
		align-items: flex-end;
	}

	/* Grouped messages (same sender) get tighter spacing */
	.message-wrapper.grouped {
		margin-top: calc(-1 * var(--space-2));
	}

	/* Message Sender */
	.message-sender {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--accent-primary-bright);
		margin-bottom: var(--space-1);
		padding: 0 var(--space-2);
	}

	.message-sender--own {
		color: var(--accent-gold);
		text-align: right;
	}

	/* Message Content */
	.message-content {
		word-wrap: break-word;
		overflow-wrap: break-word;
	}

	.message-content :global(p) {
		margin: 0;
	}

	.message-content :global(code) {
		background: var(--bg-base);
		padding: 2px 6px;
		border-radius: var(--radius-xs);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.message-content :global(pre) {
		background: var(--bg-base);
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		overflow-x: auto;
		margin: var(--space-2) 0;
	}

	.message-content :global(pre code) {
		background: transparent;
		padding: 0;
	}

	/* Message Time */
	.message-time {
		font-size: var(--text-xs);
		color: var(--text-dim);
		margin-top: var(--space-1);
	}

	/* Images */
	.message-image {
		max-width: 400px;
		max-height: 300px;
		border-radius: var(--radius-sm);
		display: block;
		margin: var(--space-2) 0;
	}

	.image-caption {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin: var(--space-1) 0 0 0;
	}

	/* File Attachments */
	.file-attachment {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		background: var(--bg-base);
		border-radius: var(--radius-sm);
	}

	.file-icon {
		font-size: var(--text-lg);
	}

	.file-attachment a {
		color: var(--accent-primary-bright);
		text-decoration: none;
	}

	.file-attachment a:hover {
		text-decoration: underline;
	}

	/* Link Feed badge (shown in main chat instead of the actual URL) */
	.message-content :global(.link-feed-badge) {
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
		cursor: default;
	}
</style>
