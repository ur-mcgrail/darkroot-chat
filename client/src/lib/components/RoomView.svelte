<script lang="ts">
	import { onMount } from 'svelte';
	import { currentRoom, currentRoomId } from '$lib/stores/matrix';
	import { getRoomName } from '$lib/matrix/rooms';
	import { fetchRoomMessages, sendMessage } from '$lib/matrix/messages';
	import MessageList from './MessageList.svelte';

	let messageText = '';
	let sending = false;
	let textareaElement: HTMLTextAreaElement;

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

	async function handleSendMessage() {
		if (!$currentRoomId || !messageText.trim() || sending) {
			return;
		}

		sending = true;

		try {
			await sendMessage($currentRoomId, messageText);
			messageText = ''; // Clear input

			// Reset textarea height
			if (textareaElement) {
				textareaElement.style.height = 'auto';
			}
		} catch (error) {
			console.error('Failed to send message:', error);
			alert('Failed to send message. Please try again.');
		} finally {
			sending = false;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		// Send on Enter (without Shift)
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSendMessage();
		}
	}

	// Auto-resize textarea
	function handleInput() {
		if (!textareaElement) return;

		textareaElement.style.height = 'auto';
		textareaElement.style.height = `${Math.min(textareaElement.scrollHeight, 200)}px`;
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
		<!-- Room Header -->
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
		</div>

		<!-- Message List -->
		<MessageList />

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
					<!-- <label class="file-upload-button">
						<input
							type="file"
							on:change={handleFileUpload}
							accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
							style="display: none;"
						/>
						📎
					</label> -->
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
</div>

<style>
	.room-view {
		display: flex;
		flex-direction: column;
		flex: 1;
		height: 100%;
		background: var(--bg-base);
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
</style>
