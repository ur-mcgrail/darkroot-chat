<script lang="ts">
	import { onMount } from 'svelte';
	import { currentRoom, currentRoomId, typingUsers, matrixClient } from '$lib/stores/matrix';
	import { getRoomName } from '$lib/matrix/rooms';
	import { fetchRoomMessages, sendMessage } from '$lib/matrix/messages';
	import { handleTyping, stopTyping } from '$lib/matrix/typing';
	import MessageList from './MessageList.svelte';
	import LinkSidebar from './LinkSidebar.svelte';
	import RoomSettingsModal from './RoomSettingsModal.svelte';

	// When false, the link panel and its toggle button are hidden (e.g. on mobile)
	export let showLinks = true;

	let messageText = '';
	let sending = false;
	let textareaElement: HTMLTextAreaElement;
	let showLinkSidebar = true;
	let showXWarning = false;
	let showRoomSettings = false;

	$: if (!showLinks) showLinkSidebar = false;

	// X / Twitter link detection
	const X_LINK_REGEX = /https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^\s]+/i;

	$: roomName = $currentRoom ? getRoomName($currentRoom) : '';
	$: memberCount = $currentRoom ? $currentRoom.getJoinedMemberCount() : 0;

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

	// File upload handler (future enhancement)
	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file || !$currentRoomId) return;

		// TODO: Implement file upload in next phase
		console.log('File upload not yet implemented:', file.name);
	}
</script>

<div class="room-view">
	{#if $currentRoom}
		<!-- Room Header (spans full width including sidebar) -->
		<div class="room-header">
			<div class="room-header__info">
				<div class="room-header__avatar">
					{roomName.charAt(0).toUpperCase()}
				</div>
				<div class="room-header__details">
					<h2 class="room-header__name">{roomName}</h2>
					<p class="room-header__subtitle">
						{memberCount} {memberCount === 1 ? 'member' : 'members'}
					</p>
				</div>
			</div>
			<div class="room-header__actions">
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
			<div class="room-body__chat">
				<!-- Message List -->
				<MessageList />

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

				<!-- Message Input -->
				<div class="message-input">
					<textarea
						bind:this={textareaElement}
						bind:value={messageText}
						on:keydown={handleKeyDown}
						on:input={handleInput}
						class="message-input__textarea"
						placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
						disabled={sending}
						rows="1"
					></textarea>
					<div class="message-input__actions">
						<div class="message-input__tools">
							<!-- File upload button (placeholder for now) -->
						</div>
						<button
							class="message-input__send-button"
							on:click={handleSendMessage}
							disabled={sending || !messageText.trim()}
						>
							{sending ? 'Sending...' : 'Send'}
						</button>
					</div>
				</div>
			</div>

			<!-- Link Sidebar -->
			{#if showLinks}<LinkSidebar visible={showLinkSidebar} />{/if}
		</div>
	{:else}
		<!-- No Room Selected -->
		<div class="no-room">
			<div class="no-room__content">
				<h2>🌲 Darkroot Chat</h2>
				<p>Select a room to start chatting</p>
				<p class="no-room__hint">
					or create a new room with the + button
				</p>
			</div>
		</div>
	{/if}

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
		padding: var(--space-4);
		background: var(--bg-elevated);
		border-bottom: 1px solid var(--border-default);
		flex-shrink: 0;
	}

	.room-header__info {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.room-header__avatar {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-sm);
		background: var(--accent-primary-dim);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: var(--accent-primary-bright);
		font-size: var(--text-base);
	}

	.room-header__details {
		flex: 1;
	}

	.room-header__name {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--text-primary);
		font-family: var(--font-display);
	}

	.room-header__subtitle {
		margin: 2px 0 0 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
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

	/* Message Input */
	.message-input {
		display: flex;
		flex-direction: column;
		padding: var(--space-4);
		background: var(--bg-elevated);
		border-top: 1px solid var(--border-default);
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.message-input__textarea {
		min-height: 44px;
		max-height: 200px;
		padding: var(--space-3);
		background: var(--bg-base);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: var(--font-body);
		font-size: var(--text-base);
		resize: none;
		transition: border-color var(--transition-fast);
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
	}

	.message-input__actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.message-input__tools {
		display: flex;
		gap: var(--space-2);
	}

	.message-input__send-button {
		padding: var(--space-3) var(--space-5);
		background: var(--accent-primary);
		border: 1px solid var(--accent-primary-bright);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-weight: 600;
		cursor: pointer;
		font-size: var(--text-sm);
		transition: all var(--transition-fast);
	}

	.message-input__send-button:hover:not(:disabled) {
		background: var(--accent-primary-bright);
		box-shadow: var(--shadow-glow-green);
	}

	.message-input__send-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* No Room Selected */
	.no-room {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
	}

	.no-room__content {
		text-align: center;
		max-width: 400px;
	}

	.no-room__content h2 {
		margin: 0 0 var(--space-3) 0;
		font-size: var(--text-4xl);
		color: var(--accent-primary-bright);
		font-family: var(--font-display);
	}

	.no-room__content p {
		margin: var(--space-2) 0;
		color: var(--text-secondary);
		font-size: var(--text-lg);
	}

	.no-room__hint {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-style: italic;
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
