<script lang="ts">
	import { afterUpdate } from 'svelte';
	import { messages, matrixClient, highlightedLink } from '$lib/stores/matrix';
	import { getMessageBody, getMessageType, isOwnMessage } from '$lib/matrix/messages';
	import {
		hasServiceLink,
		extractAllServiceLinks,
		displayUrl,
		fetchLinkMeta,
		LINK_SERVICES,
		type LinkMeta,
	} from '$lib/utils/links';

	export let visible = true;

	let scrollContainer: HTMLDivElement;
	let shouldAutoScroll = true;
	let linkCardEls: Record<string, HTMLElement> = {};

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

	// Format timestamp for sender strip
	function formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const isToday = date.toDateString() === now.toDateString();
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		const isYesterday = date.toDateString() === yesterday.toDateString();
		const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
		if (isToday) return time;
		if (isYesterday) return `Yesterday ${time}`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` ${time}`;
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

	// Chat → sidebar: scroll to card and flash highlight
	$: {
		const hl = $highlightedLink;
		if (hl?.from === 'chat' && scrollContainer) {
			const el = linkCardEls[hl.id];
			if (el) {
				el.classList.remove('link-active');
				void el.offsetHeight; // force reflow to restart animation
				el.classList.add('link-active');
				el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
		}
	}
</script>

{#if visible}
	<div class="link-feed">
		<!-- Header -->
		<div class="link-feed__header">
			<span class="link-feed__title">
				darkroot.rooms
			</span>
			{#if linkMessages.length > 0}
				<span class="link-feed__count">{linkMessages.length}</span>
			{/if}
		</div>

		<!-- Service legend -->
		<div class="link-feed__services">
			{#each LINK_SERVICES as svc}
				<span class="link-feed__service-chip" title={svc.label}>
					{@html svc.svgIcon}
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
				{#each linkMessages as message (message.id)}
					{@const isOwn = $matrixClient && isOwnMessage(message.sender, $matrixClient)}
					{@const body = getMessageBody(message.content)}
					{@const serviceLinks = extractAllServiceLinks(body)}

					<div class="link-msg" class:link-msg--own={isOwn} bind:this={linkCardEls[message.id]}>
						<!-- Sender strip — thin left bar + name + time -->
						<div class="link-msg__sender-strip">
							<span class="link-msg__sender-name">{getDisplayName(message.sender)}</span>
							<span class="link-msg__sender-time">{formatTime(message.timestamp)}</span>
						</div>

						<!-- Link cards -->
						{#each serviceLinks as { service, url }}
							{@const meta = metaMap[url] || {}}
							<a
								class="link-msg__card"
								href={url}
								target="_blank"
								rel="noopener noreferrer"
							>
								<div class="link-msg__card-body">
									<div class="link-msg__card-header">
										<span class="link-msg__card-icon">{@html service.svgIcon}</span>
										<span class="link-msg__card-service">{service.label}</span>
									</div>

									{#if meta.title}
										<span class="link-msg__card-title">{meta.title}</span>
									{/if}

									<span class="link-msg__card-url">{displayUrl(url)}</span>
								</div>

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

								<span class="link-msg__card-arrow">→</span>
							</a>
						{/each}

						<!-- Jump to chat (hover reveal) -->
						<button
							class="link-msg__jump"
							on:click={() => highlightedLink.set({ id: message.id, ts: Date.now(), from: 'sidebar' })}
							title="Jump to chat message"
						>↑ chat</button>
					</div>
				{/each}
			{/if}
		</div>
	</div>
{/if}

<style>
	.link-feed {
		width: 260px;
		min-width: 260px;
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
		padding: 2px var(--space-3);
		border-bottom: 1px solid var(--border-default);
		background: var(--bg-elevated);
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	.link-feed__service-chip {
		display: inline-flex;
		align-items: center;
		opacity: 0.6;
		cursor: default;
		transition: opacity var(--transition-fast), transform var(--transition-fast);
		color: var(--text-secondary);
	}

	.link-feed__service-chip :global(svg) {
		width: 12px;
		height: 12px;
	}

	.link-feed__service-chip:hover {
		opacity: 1;
		transform: scale(1.2);
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

	/* Individual link message — left bar is the sender color cue */
	.link-msg {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		position: relative;
		border-left: 2px solid var(--accent-primary);
		padding-left: var(--space-2);
	}

	.link-msg--own {
		border-left-color: var(--accent-gold);
	}

	/* Jump-to-chat button (hover reveal, top-right corner) */
	.link-msg__jump {
		position: absolute;
		top: 2px;
		right: 0;
		opacity: 0;
		font-size: 10px;
		padding: 1px 6px;
		background: var(--bg-surface);
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-full);
		color: var(--accent-primary-bright);
		cursor: pointer;
		font-family: inherit;
		font-weight: 600;
		transition: opacity 0.15s;
		z-index: 10;
	}

	.link-msg:hover .link-msg__jump {
		opacity: 1;
	}

	.link-msg__jump:hover {
		background: var(--accent-primary);
		color: var(--text-primary);
	}

	/* Sidebar highlight — snaps in at 12% then fades */
	@keyframes sidebarHighlight {
		0%   { background: transparent;               outline: 2px solid transparent; outline-offset: 2px; }
		12%  { background: rgba(108, 184, 130, 0.22); outline-color: var(--accent-primary-bright); }
		100% { background: transparent;               outline-color: transparent; }
	}

	.link-msg.link-active {
		animation: sidebarHighlight 1.4s ease-out forwards;
		border-radius: var(--radius-sm);
	}

	/* Sender strip — thin left bar + name + time on one line */
	.link-msg__sender-strip {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: 0 2px 2px 0;
	}

	.link-msg__sender-name {
		font-size: 10px;
		font-weight: 700;
		color: var(--accent-primary-bright);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.link-msg--own .link-msg__sender-name {
		color: var(--accent-gold-bright);
	}

	.link-msg__sender-time {
		font-size: 10px;
		color: var(--text-dim);
		white-space: nowrap;
		flex-shrink: 0;
		font-family: var(--font-mono);
	}

	/* Link card — compact inline layout */
	.link-msg__card {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		gap: 0;
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: var(--text-primary);
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
		cursor: pointer;
		overflow: hidden;
		position: relative;
	}

	.link-msg__card:hover {
		border-color: var(--accent-primary);
		box-shadow: var(--shadow-card);
	}

	/* Card body (left side) */
	.link-msg__card-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-2);
	}

	/* Inline thumbnail (right side, 72×72) */
	.link-msg__thumb-wrap {
		width: 72px;
		min-width: 72px;
		border-left: 1px solid var(--border-subtle, var(--border-default));
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
		overflow: hidden;
		background: var(--bg-base);
	}

	.link-msg__thumb {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: cover;
	}

	.link-msg__card-header {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.link-msg__card-icon {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--accent-gold-bright);
	}

	.link-msg__card-icon :global(svg) {
		width: 13px;
		height: 13px;
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
