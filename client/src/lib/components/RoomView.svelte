<script lang="ts">
	import { onMount } from 'svelte';
	import { currentRoom, currentRoomId, typingUsers, matrixClient } from '$lib/stores/matrix';
	import { getRoomName, joinRoom, leaveRoom } from '$lib/matrix/rooms';
	import { fetchRoomMessages, sendMessage, sendImage, sendFile } from '$lib/matrix/messages';
	import { handleTyping, stopTyping } from '$lib/matrix/typing';
	import { getRoomIcon } from '$lib/utils/roomIcons';
	import { fetchMediaUrl } from '$lib/utils/media';
	import MessageList from './MessageList.svelte';
	import LinkSidebar from './LinkSidebar.svelte';
	import RoomSettingsModal from './RoomSettingsModal.svelte';
	import StatsPanel from './StatsPanel.svelte';

	// When false, the link panel and its toggle button are hidden (e.g. on mobile)
	export let showLinks = true;

	let messageText = '';
	let sending = false;
	let textareaElement: HTMLTextAreaElement;
	let showLinkSidebar = true;
	let showXWarning = false;
	let showRoomSettings = false;
	let showStats = false;

	// Invite acceptance
	let acceptingInvite = false;
	let decliningInvite = false;
	$: isInvited = $currentRoom?.getMyMembership() === 'invite';

	async function handleAcceptInvite() {
		if (!$currentRoom) return;
		acceptingInvite = true;
		try {
			await joinRoom($currentRoom.roomId);
		} catch (err) {
			console.error('Failed to accept invite:', err);
		} finally {
			acceptingInvite = false;
		}
	}

	async function handleDeclineInvite() {
		if (!$currentRoom) return;
		decliningInvite = true;
		try {
			await leaveRoom($currentRoom.roomId);
		} catch (err) {
			console.error('Failed to decline invite:', err);
		} finally {
			decliningInvite = false;
		}
	}

	$: if (!showLinks) showLinkSidebar = false;

	// X / Twitter link detection
	const X_LINK_REGEX = /https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^\s]+/i;

	$: roomName = $currentRoom ? getRoomName($currentRoom) : '';
	$: roomTopic = $currentRoom?.currentState.getStateEvents('m.room.topic', '')?.getContent()?.topic || '';

	// Room avatar for header — fetch when room changes
	let headerAvatarUrl: string | null = null;
	let _headerAvatarKey = '';
	$: {
		const mxcUrl = $currentRoom?.getMxcAvatarUrl() || '';
		const key = `${$currentRoom?.roomId}:${mxcUrl}`;
		if (key !== _headerAvatarKey && $matrixClient) {
			_headerAvatarKey = key;
			if (mxcUrl) {
				fetchMediaUrl($matrixClient, mxcUrl, 56, 56, 'crop').then(url => { headerAvatarUrl = url; });
			} else {
				headerAvatarUrl = null;
			}
		}
	}

	// Load messages when room changes
	$: if ($currentRoomId) {
		loadMessages($currentRoomId);
	}

	async function loadMessages(roomId: string) {
		try {
			await fetchRoomMessages(roomId);
		} catch (error) {
			console.error('Failed to load messages:', error);
		}
	}

	/** Actually send the message (no checks) */
	async function doSend() {
		if (!$currentRoomId || !messageText.trim() || sending) return;

		sending = true;
		try {
			await sendMessage($currentRoomId, messageText);
			stopTyping($currentRoomId); // Stop typing notification
			messageText = '';
			if (textareaElement) textareaElement.style.height = 'auto';
		} catch (error) {
			console.error('Failed to send message:', error);
			alert('Failed to send message. Please try again.');
		} finally {
			sending = false;
		}
	}

	/** Intercept send — check for X/Twitter links first */
	async function handleSendMessage() {
		if (!$currentRoomId || !messageText.trim() || sending) return;

		if (X_LINK_REGEX.test(messageText)) {
			showXWarning = true;
			return;
		}

		await doSend();
	}

	function confirmXSend() {
		showXWarning = false;
		doSend();
	}

	function cancelXSend() {
		showXWarning = false;
		// Leave the message in the textarea so they can edit it
	}

	function handleKeyDown(event: KeyboardEvent) {
		// Send on Enter (without Shift)
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSendMessage();
		}
	}

	// Auto-resize textarea and send typing notification
	function handleInput() {
		if (!textareaElement) return;

		textareaElement.style.height = 'auto';
		textareaElement.style.height = `${Math.min(textareaElement.scrollHeight, 200)}px`;

		// Send typing notification if user is typing
		if ($currentRoomId && messageText.trim()) {
			handleTyping($currentRoomId);
		}
	}

	async function uploadFile(file: File) {
		if (!$currentRoomId) return;
		sending = true;
		try {
			if (file.type.startsWith('image/')) {
				await sendImage($currentRoomId, file);
			} else {
				await sendFile($currentRoomId, file);
			}
		} catch (error) {
			console.error('Failed to upload file:', error);
			alert('Failed to send file. Please try again.');
		} finally {
			sending = false;
		}
	}

	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		input.value = ''; // reset so the same file can be re-selected
		await uploadFile(file);
	}

	let isDragging = false;

	async function handleDropFile(e: DragEvent) {
		isDragging = false;
		const file = e.dataTransfer?.files[0];
		if (!file) return;
		await uploadFile(file);
	}
</script>

<div class="room-view">
	{#if $currentRoom && isInvited}
		<!-- Invite Gate — shown when user has pending invite to this room -->
		<div class="invite-gate">
			<div class="invite-gate__icon" aria-hidden="true">
				{@html getRoomIcon(roomName)}
			</div>
			<h2 class="invite-gate__title">{roomName}</h2>
			<p class="invite-gate__text">You have been invited to join this chamber.</p>
			<div class="invite-gate__actions">
				<button
					class="invite-gate__accept"
					on:click={handleAcceptInvite}
					disabled={acceptingInvite || decliningInvite}
				>
					{acceptingInvite ? 'Entering…' : 'Accept Invitation'}
				</button>
				<button
					class="invite-gate__decline"
					on:click={handleDeclineInvite}
					disabled={acceptingInvite || decliningInvite}
				>
					{decliningInvite ? '…' : 'Decline'}
				</button>
			</div>
		</div>
	{:else if $currentRoom}
		<!-- Room Header (spans full width including sidebar) -->
		<div class="room-header">
			<div class="room-header__info">
				<div class="room-header__icon" aria-hidden="true">
					{#if headerAvatarUrl}
						<img class="room-header__icon-img" src={headerAvatarUrl} alt="" />
					{:else}
						{@html getRoomIcon(roomName)}
					{/if}
				</div>
				<div class="room-header__details">
					<h2 class="room-header__name">{roomName}</h2>
					{#if roomTopic}
						<p class="room-header__topic">{roomTopic}</p>
					{:else}
						<p class="room-header__topic room-header__topic--empty">no description — set one in room settings</p>
					{/if}
				</div>
			</div>
			<div class="room-header__actions">
				<!-- Stats -->
				<button
					class="room-header__action-btn"
					class:active={showStats}
					on:click={() => showStats = !showStats}
					title="Chamber statistics"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="20" x2="18" y2="10"/>
						<line x1="12" y1="20" x2="12" y2="4"/>
						<line x1="6" y1="20" x2="6" y2="14"/>
					</svg>
				</button>
				<!-- Room settings gear -->
				<button
					class="room-header__action-btn"
					on:click={() => showRoomSettings = true}
					title="Room settings"
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="3"/>
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
					</svg>
				</button>
				{#if showLinks}
				<button
					class="room-header__action-btn"
					class:active={showLinkSidebar}
					on:click={() => showLinkSidebar = !showLinkSidebar}
					title={showLinkSidebar ? 'Hide links panel' : 'Show links panel'}
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
					</svg>
				</button>
				{/if}
			</div>
		</div>

		<!-- Chat body + Link sidebar -->
		<div class="room-body">
			<!-- Main chat column -->
			<div
				class="room-body__chat"
				on:dragover|preventDefault={() => isDragging = true}
				on:dragleave|self={() => isDragging = false}
				on:drop|preventDefault={handleDropFile}
			>
				<!-- Message List -->
				<MessageList />

				<!-- Drag overlay -->
				{#if isDragging}
					<div class="drag-overlay" aria-hidden="true">
						<div class="drag-overlay__icon">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
							</svg>
						</div>
						<span class="drag-overlay__text">drop to attach</span>
					</div>
				{/if}

				<!-- Typing Indicators -->
				{#if $typingUsers.length > 0}
					<div class="typing-indicator">
						<div class="typing-indicator__content">
							<div class="typing-indicator__dots">
								<span></span>
								<span></span>
								<span></span>
							</div>
							<span class="typing-indicator__text">
								{#if $typingUsers.length === 1}
									{#if $matrixClient}
										{@const user = $matrixClient.getUser($typingUsers[0])}
										{user?.displayName || $typingUsers[0].split(':')[0].substring(1)} is typing...
									{/if}
								{:else if $typingUsers.length === 2}
									{#if $matrixClient}
										{@const user1 = $matrixClient.getUser($typingUsers[0])}
										{@const user2 = $matrixClient.getUser($typingUsers[1])}
										{user1?.displayName || $typingUsers[0].split(':')[0].substring(1)} and {user2?.displayName || $typingUsers[1].split(':')[0].substring(1)} are typing...
									{/if}
								{:else}
									Several people are typing...
								{/if}
							</span>
						</div>
					</div>
				{/if}
			</div>

			<!-- Link Sidebar -->
			{#if showLinks}<LinkSidebar visible={showLinkSidebar} />{/if}
		</div>

		<!-- Message Input — full width beneath chat + sidebar -->
		<div class="message-input">
			<input
				type="file"
				id="file-input-hidden"
				style="display:none"
				on:change={handleFileUpload}
			/>
			<button
				class="message-input__attach"
				on:click={() => document.getElementById('file-input-hidden')?.click()}
				title="Attach file"
				disabled={sending}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
					<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
				</svg>
			</button>
			<textarea
				bind:this={textareaElement}
				bind:value={messageText}
				on:keydown={handleKeyDown}
				on:input={handleInput}
				class="message-input__textarea"
				placeholder="speak into the dark…"
				disabled={sending}
				rows="2"
			></textarea>
			<button
				class="message-input__send-button"
				on:click={handleSendMessage}
				disabled={sending || !messageText.trim()}
			>
				{sending ? '…' : 'Send'}
			</button>
		</div>
	{:else}
		<!-- No Room Selected — Fog Gate idle screen -->
		<div class="no-room" aria-label="No chamber selected">
			<div class="no-room__bg" aria-hidden="true"></div>
			<div class="no-room__embers" aria-hidden="true">
				<span class="nr-ember" style="--x:14%;  --d:0.00s; --dur:3.8s; --sz:1.5px; --drift:14px;"></span>
				<span class="nr-ember" style="--x:28%;  --d:0.55s; --dur:4.4s; --sz:1.0px; --drift:-18px;"></span>
				<span class="nr-ember" style="--x:43%;  --d:1.10s; --dur:3.5s; --sz:2.0px; --drift:10px;"></span>
				<span class="nr-ember" style="--x:57%;  --d:0.30s; --dur:4.9s; --sz:1.2px; --drift:-12px;"></span>
				<span class="nr-ember" style="--x:68%;  --d:1.70s; --dur:3.2s; --sz:1.8px; --drift:20px;"></span>
				<span class="nr-ember" style="--x:80%;  --d:0.85s; --dur:4.1s; --sz:1.0px; --drift:-8px;"></span>
				<span class="nr-ember" style="--x:35%;  --d:2.20s; --dur:3.7s; --sz:1.4px; --drift:16px;"></span>
				<span class="nr-ember" style="--x:72%;  --d:1.40s; --dur:4.6s; --sz:1.1px; --drift:-22px;"></span>
			</div>
			<div class="no-room__content">
				<div class="no-room__bonfire">
					<div class="no-room__pool"></div>
					<img src="/emoji/bonfire.png" alt="" class="no-room__flame" aria-hidden="true" />
				</div>
				<p class="no-room__label">select a chamber</p>
				<div class="no-room__ornament" aria-hidden="true">
					<span class="no-room__ornament-line"></span>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor"
						width="6" height="6" class="no-room__ornament-gem">
						<path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5Z"/>
					</svg>
					<span class="no-room__ornament-line"></span>
				</div>
			</div>
		</div>
	{/if}

	<!-- Stats Panel -->
	<StatsPanel bind:show={showStats} room={$currentRoom} />

	<!-- Room Settings Modal -->
	<RoomSettingsModal bind:show={showRoomSettings} room={$currentRoom} />

	<!-- X / Twitter Warning Modal -->
	{#if showXWarning}
		<div class="x-warn-overlay" on:click|self={cancelXSend}>
			<div class="x-warn-modal">
				<div class="x-warn-icon">
					<span>𝕏</span>
				</div>
				<h3 class="x-warn-title">Hold up.</h3>
				<p class="x-warn-message">
					You are attempting to share a link from <strong>x.com</strong> &mdash;
					that platform is full of racists. Please think twice before posting this.
				</p>
				<div class="x-warn-actions">
					<button class="x-warn-cancel" on:click={cancelXSend}>
						Nevermind
					</button>
					<button class="x-warn-confirm" on:click={confirmXSend}>
						Send Anyway
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.room-view {
		display: flex;
		flex-direction: column;
		flex: 1;
		height: 100%;
		background: var(--bg-base);
		overflow: hidden;
	}

	/* Room Header */
	.room-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		background: var(--bg-elevated);
		border-bottom: 1px solid var(--border-default);
		flex-shrink: 0;
		gap: var(--space-3);
	}

	.room-header__info {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
		flex: 1;
	}

	.room-header__icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent-primary-bright);
		opacity: 0.85;
	}

	.room-header__icon :global(svg) {
		width: 28px;
		height: 28px;
		display: block;
	}

	.room-header__icon-img {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		display: block;
		object-fit: cover;
	}

	.room-header__details {
		flex: 1;
		min-width: 0;
	}

	.room-header__name {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--text-primary);
		font-family: var(--font-display);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.room-header__topic {
		margin: 1px 0 0 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
		font-style: italic;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.room-header__topic--empty {
		color: var(--text-dim);
		opacity: 0.55;
	}

	.room-header__actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.room-header__action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-2);
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.room-header__action-btn:hover {
		background: var(--bg-hover);
		color: var(--text-secondary);
		border-color: var(--accent-primary);
	}

	.room-header__action-btn.active {
		background: var(--accent-primary-dim);
		color: var(--accent-primary-bright);
		border-color: var(--accent-primary);
	}

	/* Room body: chat + sidebar */
	.room-body {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.room-body__chat {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0; /* allow shrinking */
		overflow: hidden;
		position: relative; /* for drag overlay */
	}

	/* Drag-and-drop overlay */
	.drag-overlay {
		position: absolute;
		inset: var(--space-2);
		border: 2px dashed var(--accent-primary);
		border-radius: var(--radius-md);
		background: rgba(47, 90, 58, 0.07);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		z-index: 50;
		pointer-events: none;
		color: var(--accent-primary-bright);
		animation: dragPulse 1.4s ease-in-out infinite;
	}

	@keyframes dragPulse {
		0%, 100% { border-color: var(--accent-primary);        opacity: 0.85; }
		50%       { border-color: var(--accent-primary-bright); opacity: 1;    }
	}

	.drag-overlay__icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.75;
	}

	.drag-overlay__text {
		font-size: var(--text-xs);
		font-family: var(--font-display);
		letter-spacing: 0.12em;
		text-transform: lowercase;
		font-variant: small-caps;
		opacity: 0.9;
	}

	/* Typing Indicator */
	.typing-indicator {
		padding: var(--space-2) var(--space-4);
		background: var(--bg-base);
		border-top: 1px solid var(--border-default);
		flex-shrink: 0;
		min-height: 36px;
		display: flex;
		align-items: center;
	}

	.typing-indicator__content {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.typing-indicator__dots {
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.typing-indicator__dots span {
		width: 6px;
		height: 6px;
		background: var(--accent-primary-bright);
		border-radius: var(--radius-full);
		animation: typingDot 1.4s infinite;
	}

	.typing-indicator__dots span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-indicator__dots span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typingDot {
		0%, 60%, 100% {
			opacity: 0.3;
			transform: scale(0.8);
		}
		30% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.typing-indicator__text {
		font-size: var(--text-xs);
		color: var(--text-muted);
		font-style: italic;
	}

	/* Message Input — full-width dock at bottom of room-view */
	.message-input {
		display: flex;
		flex-direction: row; /* override lordran-ui global which sets column */
		align-items: flex-end;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		background: var(--bg-surface);
		border-top: 1px solid var(--border-default);
		flex-shrink: 0;
		width: 100%; /* belt-and-suspenders: stretch across the full room-view width */
	}

	/* Attach file button */
	.message-input__attach {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		color: var(--text-dim);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.message-input__attach:hover:not(:disabled) {
		background: var(--bg-hover);
		border-color: var(--border-default);
		color: var(--text-muted);
	}

	.message-input__attach:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.message-input__textarea {
		flex: 1;
		min-width: 0;
		min-height: 48px;
		max-height: 200px;
		padding: var(--space-2);
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		resize: none;
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
		line-height: 1.5;
	}

	.message-input__textarea:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: var(--shadow-glow-green);
	}

	.message-input__textarea:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.message-input__textarea::placeholder {
		color: var(--text-dim);
		font-style: italic;
		font-size: var(--text-xs);
	}

	.message-input__send-button {
		flex-shrink: 0;
		height: 36px;
		padding: 0 var(--space-5);
		background: rgba(47, 90, 58, 0.45);
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-sm);
		color: var(--accent-primary-bright);
		font-weight: 700;
		cursor: pointer;
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-family: var(--font-display);
		transition: all var(--transition-fast);
		white-space: nowrap;
	}

	.message-input__send-button:hover:not(:disabled) {
		background: var(--accent-primary);
		color: var(--text-primary);
		box-shadow: var(--shadow-glow-green);
	}

	.message-input__send-button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* ── Invite Gate ── */
	.invite-gate {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-5);
		background: var(--bg-deepest);
		padding: var(--space-8);
		text-align: center;
	}

	.invite-gate__icon {
		width: 72px;
		height: 72px;
		border-radius: var(--radius-md);
		background: var(--accent-gold-dim);
		border: 1px solid var(--accent-gold);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent-gold-bright);
		box-shadow: 0 0 24px rgba(150, 168, 92, 0.2);
	}

	.invite-gate__icon :global(svg) {
		width: 36px;
		height: 36px;
	}

	.invite-gate__title {
		margin: 0;
		font-size: var(--text-xl);
		font-family: var(--font-display);
		color: var(--accent-gold-bright);
		letter-spacing: 0.04em;
	}

	.invite-gate__text {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-muted);
		font-style: italic;
	}

	.invite-gate__actions {
		display: flex;
		gap: var(--space-3);
		align-items: center;
	}

	.invite-gate__accept {
		padding: var(--space-3) var(--space-6);
		background: var(--accent-gold-dim);
		border: 1px solid var(--accent-gold);
		border-radius: var(--radius-md);
		color: var(--accent-gold-bright);
		font-weight: 700;
		font-size: var(--text-sm);
		font-family: var(--font-display);
		letter-spacing: 0.04em;
		cursor: pointer;
		transition: all var(--transition-base);
	}

	.invite-gate__accept:hover:not(:disabled) {
		background: var(--accent-gold);
		color: var(--bg-deepest);
		box-shadow: var(--shadow-glow-gold);
	}

	.invite-gate__accept:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.invite-gate__decline {
		padding: var(--space-3) var(--space-4);
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-dim);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.invite-gate__decline:hover:not(:disabled) {
		border-color: rgba(211, 95, 95, 0.4);
		color: var(--text-muted);
	}

	.invite-gate__decline:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ── No Room Selected — Fog Gate idle screen ── */
	.no-room {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		background: var(--bg-deepest);
		overflow: hidden;
	}

	.no-room__bg {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 60% 50% at 50% 58%,
			rgba(79, 138, 97, 0.07) 0%,
			rgba(79, 138, 97, 0.025) 45%,
			transparent 72%
		);
		pointer-events: none;
		animation: nrGlowBreathe 6s ease-in-out infinite alternate;
	}

	@keyframes nrGlowBreathe {
		from { opacity: 0.6; transform: scaleY(0.92); }
		to   { opacity: 1;   transform: scaleY(1.08); }
	}

	.no-room__embers {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.nr-ember {
		position: absolute;
		bottom: 52%;
		left: var(--x);
		width: var(--sz);
		height: var(--sz);
		border-radius: 50%;
		background: var(--accent-gold-bright);
		box-shadow: 0 0 3px 1px rgba(200, 216, 128, 0.4);
		opacity: 0;
		animation: nrEmberRise var(--dur) var(--d) infinite ease-out;
	}

	@keyframes nrEmberRise {
		0%   { opacity: 0;    transform: translateY(0)      translateX(0);            }
		8%   { opacity: 0.75;                                                          }
		85%  { opacity: 0;    transform: translateY(-36vh)  translateX(var(--drift)); }
		100% { opacity: 0;    transform: translateY(-38vh)  translateX(var(--drift)); }
	}

	.no-room__content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-5);
	}

	.no-room__bonfire {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: flex-end;
		height: 108px;
	}

	.no-room__pool {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 130px;
		height: 52px;
		background: radial-gradient(
			ellipse at 50% 100%,
			rgba(200, 216, 128, 0.14) 0%,
			rgba(150, 168, 92, 0.05) 52%,
			transparent 72%
		);
		border-radius: 50%;
		animation: nrPoolFlicker 4s ease-in-out infinite;
	}

	@keyframes nrPoolFlicker {
		0%, 100% { opacity: 0.75; transform: translateX(-50%) scaleX(1);    }
		28%      { opacity: 1;    transform: translateX(-50%) scaleX(1.07); }
		55%      { opacity: 0.6;  transform: translateX(-50%) scaleX(0.93); }
		78%      { opacity: 0.9;  transform: translateX(-50%) scaleX(1.04); }
	}

	.no-room__flame {
		width: 96px;
		height: 96px;
		image-rendering: pixelated;
		filter:
			drop-shadow(0 0 7px  rgba(200, 216, 128, 0.60))
			drop-shadow(0 0 20px rgba(150, 168, 92,  0.36))
			drop-shadow(0 0 44px rgba(79,  138, 97,  0.18));
		animation: nrFlameFlicker 4s ease-in-out infinite;
	}

	@keyframes nrFlameFlicker {
		0%   { filter: drop-shadow(0 0 6px  rgba(200,216,128,0.55)) drop-shadow(0 0 18px rgba(150,168,92,0.32)) drop-shadow(0 0 36px rgba(79,138,97,0.16)); }
		15%  { filter: drop-shadow(0 0 12px rgba(200,216,128,0.85)) drop-shadow(0 0 30px rgba(150,168,92,0.50)) drop-shadow(0 0 56px rgba(79,138,97,0.28)); }
		38%  { filter: drop-shadow(0 0 4px  rgba(200,216,128,0.42)) drop-shadow(0 0 12px rgba(150,168,92,0.22)) drop-shadow(0 0 24px rgba(79,138,97,0.11)); }
		60%  { filter: drop-shadow(0 0 10px rgba(200,216,128,0.78)) drop-shadow(0 0 26px rgba(150,168,92,0.45)) drop-shadow(0 0 48px rgba(79,138,97,0.24)); }
		82%  { filter: drop-shadow(0 0 5px  rgba(200,216,128,0.48)) drop-shadow(0 0 14px rgba(150,168,92,0.26)) drop-shadow(0 0 28px rgba(79,138,97,0.13)); }
		100% { filter: drop-shadow(0 0 6px  rgba(200,216,128,0.55)) drop-shadow(0 0 18px rgba(150,168,92,0.32)) drop-shadow(0 0 36px rgba(79,138,97,0.16)); }
	}

	.no-room__label {
		margin: 0;
		font-family: var(--font-display);
		font-size: 11px;
		font-variant: small-caps;
		letter-spacing: 0.26em;
		text-transform: lowercase;
		color: var(--text-dim);
		opacity: 0.7;
		user-select: none;
	}

	.no-room__ornament {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 140px;
		opacity: 0.28;
	}

	.no-room__ornament-line {
		flex: 1;
		height: 1px;
		background: var(--accent-gold);
	}

	.no-room__ornament-gem {
		color: var(--accent-gold);
		flex-shrink: 0;
	}

	/* ── X / Twitter Warning Modal ── */
	.x-warn-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		backdrop-filter: blur(4px);
		animation: fadeIn 0.15s ease-out;
	}

	.x-warn-modal {
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
		max-width: 420px;
		width: 90%;
		text-align: center;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
		animation: slideUp 0.2s ease-out;
	}

	.x-warn-icon {
		width: 56px;
		height: 56px;
		margin: 0 auto var(--space-4) auto;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #1a1a2e;
		border: 2px solid #e74c3c;
		border-radius: var(--radius-full);
		font-size: 28px;
		color: #fff;
	}

	.x-warn-title {
		margin: 0 0 var(--space-3) 0;
		font-size: var(--text-xl);
		font-weight: 700;
		color: #e74c3c;
		font-family: var(--font-display);
	}

	.x-warn-message {
		margin: 0 0 var(--space-5) 0;
		font-size: var(--text-sm);
		color: var(--text-secondary);
		line-height: 1.7;
	}

	.x-warn-message strong {
		color: var(--text-primary);
	}

	.x-warn-actions {
		display: flex;
		gap: var(--space-3);
		justify-content: center;
	}

	.x-warn-cancel {
		padding: var(--space-3) var(--space-5);
		background: var(--accent-primary);
		border: 1px solid var(--accent-primary-bright);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.x-warn-cancel:hover {
		background: var(--accent-primary-bright);
		box-shadow: var(--shadow-glow-green);
	}

	.x-warn-confirm {
		padding: var(--space-3) var(--space-5);
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-muted);
		font-weight: 500;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.x-warn-confirm:hover {
		border-color: #e74c3c;
		color: #e74c3c;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slideUp {
		from { transform: translateY(20px); opacity: 0; }
		to { transform: translateY(0); opacity: 1; }
	}
</style>
