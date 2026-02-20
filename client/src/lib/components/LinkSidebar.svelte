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
	import { fetchMediaUrl } from '$lib/utils/media';

	export let visible = true;

	// ── Tab state ─────────────────────────────────────────────
	let activeTab: 'links' | 'media' = 'links';

	// ── Link feed ─────────────────────────────────────────────
	let scrollContainer: HTMLDivElement;
	let shouldAutoScroll = true;
	let linkCardEls: Record<string, HTMLElement> = {};
	let metaMap: Record<string, LinkMeta> = {};

	$: linkMessages = $messages.filter((msg) => {
		if (getMessageType(msg.content) !== 'm.text') return false;
		return hasServiceLink(getMessageBody(msg.content));
	});

	$: {
		for (const msg of linkMessages) {
			const body = getMessageBody(msg.content);
			const links = extractAllServiceLinks(body);
			for (const { url } of links) {
				if (!(url in metaMap)) {
					metaMap[url] = {};
					fetchLinkMeta(url).then((meta) => {
						metaMap[url] = meta;
						metaMap = metaMap;
					});
				}
			}
		}
	}

	// ── Media gallery ─────────────────────────────────────────
	// Newest first so the gallery feels like a timeline flowing top-down
	$: mediaMessages = [...$messages]
		.filter((msg) => getMessageType(msg.content) === 'm.image')
		.reverse();

	// Thumbnail blob URLs — fetched once per message ID
	let thumbUrls: Record<string, string | null> = {};

	$: if ($matrixClient) {
		for (const msg of mediaMessages) {
			const mxcUrl = msg.content?.url as string | undefined;
			if (mxcUrl && !(msg.id in thumbUrls)) {
				thumbUrls[msg.id] = null; // mark loading so we don't double-fetch
				fetchMediaUrl($matrixClient, mxcUrl, 120, 120, 'crop').then((url) => {
					thumbUrls[msg.id] = url;
					thumbUrls = thumbUrls;
				});
			}
		}
	}

	// ── Lightbox ──────────────────────────────────────────────
	type Msg = (typeof $messages)[0];
	let lightboxMsg: Msg | null = null;
	let lightboxUrl: string | null = null;
	let lightboxLoading = false;

	async function openLightbox(msg: Msg) {
		lightboxMsg = msg;
		lightboxUrl = null;
		lightboxLoading = true;
		const mxcUrl = msg.content?.url as string | undefined;
		if (mxcUrl && $matrixClient) {
			lightboxUrl = await fetchMediaUrl($matrixClient, mxcUrl);
		}
		lightboxLoading = false;
	}

	function closeLightbox() {
		lightboxMsg = null;
		lightboxUrl = null;
	}

	function handleLightboxKey(e: KeyboardEvent) {
		if (e.key === 'Escape') closeLightbox();
	}

	// ── Shared helpers ────────────────────────────────────────
	function getDisplayName(userId: string): string {
		if (!$matrixClient) return userId;
		const user = $matrixClient.getUser(userId);
		return user?.displayName || userId.split(':')[0].substring(1);
	}

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

	// ── Link feed scroll + highlight ──────────────────────────
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

	$: {
		const hl = $highlightedLink;
		if (hl?.from === 'chat' && scrollContainer) {
			activeTab = 'links'; // switch to links tab so the card is visible
			const el = linkCardEls[hl.id];
			if (el) {
				el.classList.remove('link-active');
				void el.offsetHeight;
				el.classList.add('link-active');
				el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
		}
	}
</script>

<!-- Lightbox (portal-like, rendered outside the sidebar flow) -->
{#if lightboxMsg}
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<div
		class="lightbox"
		role="dialog"
		aria-modal="true"
		aria-label="Image viewer"
		on:click={closeLightbox}
		on:keydown={handleLightboxKey}
	>
		<div class="lightbox__panel" on:click|stopPropagation>
			<header class="lightbox__header">
				<div class="lightbox__meta">
					<span class="lightbox__sender">{getDisplayName(lightboxMsg.sender)}</span>
					<span class="lightbox__time">{formatTime(lightboxMsg.timestamp)}</span>
					<span class="lightbox__filename">{lightboxMsg.content?.body ?? ''}</span>
				</div>
				<div class="lightbox__actions">
					<button
						class="lightbox__jump"
						title="Jump to message in chat"
						on:click={() => {
							highlightedLink.set({ id: lightboxMsg!.id, ts: Date.now(), from: 'sidebar' });
							closeLightbox();
						}}
					>↑ chat</button>
					<button class="lightbox__close" title="Close" on:click={closeLightbox}>✕</button>
				</div>
			</header>
			<div class="lightbox__body">
				{#if lightboxLoading}
					<div class="lightbox__loading">
						<span class="lightbox__spinner"></span>
					</div>
				{:else if lightboxUrl}
					<img class="lightbox__img" src={lightboxUrl} alt={lightboxMsg.content?.body ?? 'image'} />
				{:else}
					<p class="lightbox__error">Failed to load image</p>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if visible}
	<div class="link-feed">
		<!-- Header -->
		<div class="link-feed__header">
			<span class="link-feed__title">darkroot.rooms</span>
		</div>

		<!-- Tabs -->
		<div class="link-feed__tabs" role="tablist">
			<button
				class="link-feed__tab"
				class:active={activeTab === 'links'}
				role="tab"
				aria-selected={activeTab === 'links'}
				on:click={() => (activeTab = 'links')}
			>
				Links
				{#if linkMessages.length > 0}
					<span class="link-feed__tab-count">{linkMessages.length}</span>
				{/if}
			</button>
			<button
				class="link-feed__tab"
				class:active={activeTab === 'media'}
				role="tab"
				aria-selected={activeTab === 'media'}
				on:click={() => (activeTab = 'media')}
			>
				Media
				{#if mediaMessages.length > 0}
					<span class="link-feed__tab-count">{mediaMessages.length}</span>
				{/if}
			</button>
		</div>

		<!-- ── LINKS TAB ── -->
		{#if activeTab === 'links'}
			<!-- Service legend -->
			<div class="link-feed__services">
				{#each LINK_SERVICES as svc}
					<span class="link-feed__service-chip" title={svc.label}>
						{@html svc.svgIcon}
					</span>
				{/each}
			</div>

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
							<div class="link-msg__sender-strip">
								<span class="link-msg__sender-name">{getDisplayName(message.sender)}</span>
								<span class="link-msg__sender-time">{formatTime(message.timestamp)}</span>
							</div>

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
											<img class="link-msg__thumb" src={meta.thumbnail} alt="" loading="lazy" />
										</div>
									{/if}
									<span class="link-msg__card-arrow">→</span>
								</a>
							{/each}

							<button
								class="link-msg__jump"
								on:click={() => highlightedLink.set({ id: message.id, ts: Date.now(), from: 'sidebar' })}
								title="Jump to chat message"
							>↑ chat</button>
						</div>
					{/each}
				{/if}
			</div>

		<!-- ── MEDIA TAB ── -->
		{:else}
			<div class="media-gallery">
				{#if mediaMessages.length === 0}
					<div class="link-feed__empty">
						<p class="link-feed__empty-text">No media yet</p>
						<p class="link-feed__empty-hint">Images shared in chat will appear here</p>
					</div>
				{:else}
					<div class="media-gallery__grid">
						{#each mediaMessages as msg (msg.id)}
							{@const isOwn = $matrixClient && isOwnMessage(msg.sender, $matrixClient)}
							{@const thumb = thumbUrls[msg.id]}
							<div class="media-cell" class:media-cell--own={isOwn}>
								<button
									class="media-cell__thumb-btn"
									title="View full size"
									on:click={() => openLightbox(msg)}
								>
									{#if thumb}
										<img
											class="media-cell__img"
											src={thumb}
											alt={msg.content?.body ?? 'image'}
											loading="lazy"
										/>
									{:else}
										<div class="media-cell__loading">
											<span class="media-cell__spinner"></span>
										</div>
									{/if}
								</button>
								<div class="media-cell__footer">
									<span class="media-cell__sender">{getDisplayName(msg.sender)}</span>
									<button
										class="media-cell__jump"
										title="Jump to message in chat"
										on:click={() => highlightedLink.set({ id: msg.id, ts: Date.now(), from: 'sidebar' })}
									>↑</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* ── Sidebar shell ─────────────────────────────────────── */
	.link-feed {
		width: 260px;
		min-width: 260px;
		display: flex;
		flex-direction: column;
		background: var(--bg-surface);
		border-left: 1px solid var(--border-default);
		height: 100%;
		overflow: hidden;
		font-size: 13px;
	}

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
		font-size: 12px;
		font-weight: 700;
		color: var(--text-primary);
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* ── Tabs ──────────────────────────────────────────────── */
	.link-feed__tabs {
		display: flex;
		border-bottom: 1px solid var(--border-default);
		background: var(--bg-elevated);
		flex-shrink: 0;
	}

	.link-feed__tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		padding: 7px var(--space-2);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-dim);
		font-size: 11px;
		font-weight: 600;
		font-family: var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		cursor: pointer;
		transition: color var(--transition-fast), border-color var(--transition-fast);
		margin-bottom: -1px;
	}

	.link-feed__tab:hover {
		color: var(--text-muted);
	}

	.link-feed__tab.active {
		color: var(--accent-primary-bright);
		border-bottom-color: var(--accent-primary-bright);
	}

	.link-feed__tab-count {
		background: var(--accent-primary-dim);
		color: var(--accent-primary-bright);
		font-size: 9px;
		padding: 1px 5px;
		border-radius: var(--radius-full);
		font-weight: 700;
		min-width: 16px;
		text-align: center;
	}

	.link-feed__tab.active .link-feed__tab-count {
		background: var(--accent-primary);
		color: var(--text-primary);
	}

	/* ── Service legend (links tab) ────────────────────────── */
	.link-feed__services {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 4px var(--space-3);
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

	.link-feed__service-chip :global(svg) { width: 12px; height: 12px; }
	.link-feed__service-chip:hover { opacity: 1; transform: scale(1.2); }

	/* ── Link messages ─────────────────────────────────────── */
	.link-feed__messages {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

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

	.link-msg {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		position: relative;
		border-left: 2px solid var(--accent-primary);
		padding-left: var(--space-2);
	}

	.link-msg--own { border-left-color: var(--accent-gold); }

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

	.link-msg:hover .link-msg__jump { opacity: 1; }
	.link-msg__jump:hover { background: var(--accent-primary); color: var(--text-primary); }

	@keyframes sidebarHighlight {
		0%   { background: transparent; outline: 2px solid transparent; outline-offset: 2px; }
		12%  { background: rgba(108, 184, 130, 0.22); outline-color: var(--accent-primary-bright); }
		100% { background: transparent; outline-color: transparent; }
	}

	.link-msg.link-active {
		animation: sidebarHighlight 1.4s ease-out forwards;
		border-radius: var(--radius-sm);
	}

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

	.link-msg--own .link-msg__sender-name { color: var(--accent-gold-bright); }

	.link-msg__sender-time {
		font-size: 10px;
		color: var(--text-dim);
		white-space: nowrap;
		flex-shrink: 0;
		font-family: var(--font-mono);
	}

	.link-msg__card {
		display: flex;
		flex-direction: row;
		align-items: stretch;
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

	.link-msg__card:hover { border-color: var(--accent-primary); box-shadow: var(--shadow-card); }

	.link-msg__card-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-2);
	}

	.link-msg__thumb-wrap {
		width: 72px;
		min-width: 72px;
		border-left: 1px solid var(--border-subtle, var(--border-default));
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
		overflow: hidden;
		background: var(--bg-base);
	}

	.link-msg__thumb { width: 100%; height: 100%; display: block; object-fit: cover; }

	.link-msg__card-header { display: flex; align-items: center; gap: 4px; }

	.link-msg__card-icon {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--accent-gold-bright);
	}

	.link-msg__card-icon :global(svg) { width: 13px; height: 13px; }

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

	.link-msg__card:hover .link-msg__card-arrow { opacity: 1; right: 6px; color: var(--accent-primary-bright); }

	/* ── Media gallery ─────────────────────────────────────── */
	.media-gallery {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-2);
	}

	.media-gallery__grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
	}

	.media-cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.media-cell__thumb-btn {
		aspect-ratio: 1 / 1;
		width: 100%;
		padding: 0;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--bg-elevated);
		cursor: pointer;
		transition: border-color var(--transition-fast), transform var(--transition-fast);
		position: relative;
	}

	.media-cell__thumb-btn:hover {
		border-color: var(--accent-primary);
		transform: scale(1.03);
		z-index: 1;
	}

	.media-cell--own .media-cell__thumb-btn { border-color: rgba(150, 168, 92, 0.35); }
	.media-cell--own .media-cell__thumb-btn:hover { border-color: var(--accent-gold); }

	.media-cell__img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.media-cell__loading {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.media-cell__spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--border-default);
		border-top-color: var(--accent-primary);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	.media-cell__footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2px;
		padding: 0 1px;
	}

	.media-cell__sender {
		font-size: 9px;
		color: var(--text-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
		letter-spacing: 0.02em;
		flex: 1;
		min-width: 0;
	}

	.media-cell--own .media-cell__sender { color: rgba(200, 216, 128, 0.55); }

	.media-cell__jump {
		flex-shrink: 0;
		font-size: 9px;
		padding: 0 4px;
		line-height: 16px;
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-full);
		color: var(--text-dim);
		cursor: pointer;
		font-family: inherit;
		font-weight: 700;
		opacity: 0;
		transition: opacity var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
	}

	.media-cell:hover .media-cell__jump {
		opacity: 1;
	}

	.media-cell__jump:hover {
		color: var(--accent-primary-bright);
		border-color: var(--accent-primary);
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* ── Lightbox ──────────────────────────────────────────── */
	.lightbox {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.88);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4);
		backdrop-filter: blur(6px);
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to   { opacity: 1; }
	}

	.lightbox__panel {
		display: flex;
		flex-direction: column;
		max-width: 90vw;
		max-height: 90vh;
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: 0 32px 80px rgba(0, 0, 0, 0.7);
		animation: slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes slideUp {
		from { transform: translateY(12px); opacity: 0; }
		to   { transform: translateY(0);    opacity: 1; }
	}

	.lightbox__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border-default);
		background: var(--bg-surface);
		gap: var(--space-3);
		flex-shrink: 0;
	}

	.lightbox__meta {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
	}

	.lightbox__sender {
		font-size: 12px;
		font-weight: 700;
		color: var(--accent-primary-bright);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
	}

	.lightbox__time {
		font-size: 10px;
		color: var(--text-dim);
		font-family: var(--font-mono);
		white-space: nowrap;
	}

	.lightbox__filename {
		font-size: 10px;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-mono);
	}

	.lightbox__actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.lightbox__jump {
		font-size: 11px;
		padding: 3px 10px;
		background: transparent;
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-full);
		color: var(--accent-primary-bright);
		cursor: pointer;
		font-family: inherit;
		font-weight: 600;
		transition: background var(--transition-fast);
	}

	.lightbox__jump:hover { background: var(--accent-primary-dim); }

	.lightbox__close {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		cursor: pointer;
		font-size: 12px;
		transition: color var(--transition-fast), border-color var(--transition-fast);
	}

	.lightbox__close:hover { color: var(--text-primary); border-color: var(--text-muted); }

	.lightbox__body {
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: auto;
		min-height: 120px;
		padding: var(--space-2);
	}

	.lightbox__img {
		max-width: 100%;
		max-height: calc(90vh - 80px);
		object-fit: contain;
		border-radius: var(--radius-sm);
		display: block;
	}

	.lightbox__loading {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 80px;
		height: 80px;
	}

	.lightbox__spinner {
		width: 28px;
		height: 28px;
		border: 3px solid var(--border-default);
		border-top-color: var(--accent-primary);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	.lightbox__error {
		color: var(--text-dim);
		font-size: 12px;
		padding: var(--space-4);
	}

	/* ── Scrollbar ─────────────────────────────────────────── */
	.link-feed__messages::-webkit-scrollbar,
	.media-gallery::-webkit-scrollbar { width: 4px; }

	.link-feed__messages::-webkit-scrollbar-track,
	.media-gallery::-webkit-scrollbar-track { background: transparent; }

	.link-feed__messages::-webkit-scrollbar-thumb,
	.media-gallery::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 4px; }

	.link-feed__messages::-webkit-scrollbar-thumb:hover,
	.media-gallery::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }
</style>
