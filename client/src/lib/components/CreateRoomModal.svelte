<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { createRoom } from '$lib/matrix/rooms';

	const dispatch = createEventDispatcher();

	let roomName = '';
	let roomTopic = '';
	let roomVisibility: 'public' | 'private' = 'public';
	let creating = false;
	let error = '';

	export let show = false;

	async function handleCreate() {
		if (!roomName.trim()) {
			error = 'Room name is required';
			return;
		}

		creating = true;
		error = '';

		try {
			const room = await createRoom(roomName.trim(), roomTopic.trim() || undefined, roomVisibility);
			console.log('Room created:', room.roomId);

			// Reset form
			roomName = '';
			roomTopic = '';

			// Close modal and notify parent
			dispatch('created', { room });
			show = false;
		} catch (err: any) {
			console.error('Failed to create room:', err);
			error = err.message || 'Failed to create room. Please try again.';
		} finally {
			creating = false;
		}
	}

	function handleCancel() {
		roomName = '';
		roomTopic = '';
		roomVisibility = 'public';
		error = '';
		show = false;
		dispatch('cancel');
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleCancel();
		} else if (event.key === 'Enter' && event.metaKey) {
			handleCreate();
		}
	}
</script>

{#if show}
	<div class="modal-overlay" on:click={handleCancel} on:keydown={handleKeyDown} role="presentation">
		<div class="modal-content" on:click|stopPropagation role="dialog" aria-modal="true">
			<div class="modal-header">
				<h2>Create New Room</h2>
				<button class="close-button" on:click={handleCancel} aria-label="Close">×</button>
			</div>

			<form class="modal-body" on:submit|preventDefault={handleCreate}>
				<!-- Room Name -->
				<div class="form-group">
					<label for="room-name">Room Name *</label>
					<input
						id="room-name"
						type="text"
						bind:value={roomName}
						placeholder="General, Random, Dev Team..."
						disabled={creating}
						autofocus
						class="input"
					/>
				</div>

				<!-- Room Topic -->
				<div class="form-group">
					<label for="room-topic">Topic (optional)</label>
					<input
						id="room-topic"
						type="text"
						bind:value={roomTopic}
						placeholder="What's this room about?"
						disabled={creating}
						class="input"
					/>
				</div>

				<!-- Visibility Toggle -->
				<div class="form-group">
					<label>Visibility</label>
					<div class="visibility-toggle">
						<button
							type="button"
							class="visibility-btn"
							class:active={roomVisibility === 'public'}
							on:click={() => roomVisibility = 'public'}
							disabled={creating}
						>
							🌐 Public
						</button>
						<button
							type="button"
							class="visibility-btn"
							class:active={roomVisibility === 'private'}
							on:click={() => roomVisibility = 'private'}
							disabled={creating}
						>
							🔒 Private
						</button>
					</div>
					<p class="visibility-hint">
						{#if roomVisibility === 'public'}
							Discoverable by everyone — anyone can join freely.
						{:else}
							Hidden from room directory — invite only.
						{/if}
					</p>
				</div>

				<!-- Error Message -->
				{#if error}
					<div class="error-message">
						⚠️ {error}
					</div>
				{/if}

				<!-- Actions -->
				<div class="modal-actions">
					<button
						type="button"
						class="btn-secondary"
						on:click={handleCancel}
						disabled={creating}
					>
						Cancel
					</button>
					<button
						type="submit"
						class="btn-primary"
						disabled={creating || !roomName.trim()}
					>
						{creating ? 'Creating...' : 'Create Room'}
					</button>
				</div>

				<p class="hint">
					💡 Tip: Press <kbd>⌘ + Enter</kbd> to create quickly
				</p>
			</form>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: var(--bg-elevated);
		border-radius: var(--radius-lg);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		max-width: 500px;
		width: 90%;
		max-height: 90vh;
		overflow: auto;
		border: 1px solid var(--border-default);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-5);
		border-bottom: 1px solid var(--border-subtle);
	}

	.modal-header h2 {
		margin: 0;
		font-size: var(--text-2xl);
		font-family: var(--font-display);
		color: var(--accent-primary-bright);
	}

	.close-button {
		background: none;
		border: none;
		font-size: 2rem;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		transition: all var(--transition-fast);
	}

	.close-button:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.modal-body {
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.form-group label {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
	}

	.input {
		padding: var(--space-3);
		background: var(--bg-base);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: var(--text-base);
		font-family: var(--font-body);
		transition: all var(--transition-fast);
	}

	.input:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: var(--shadow-glow-green);
		background: var(--bg-surface);
	}

	.input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.input::placeholder {
		color: var(--text-dim);
	}

	.error-message {
		padding: var(--space-3);
		background: rgba(211, 95, 95, 0.1);
		border: 1px solid rgba(211, 95, 95, 0.3);
		border-radius: var(--radius-sm);
		color: var(--status-live);
		font-size: var(--text-sm);
	}

	.modal-actions {
		display: flex;
		gap: var(--space-3);
		justify-content: flex-end;
		margin-top: var(--space-2);
	}

	.btn-secondary,
	.btn-primary {
		padding: var(--space-3) var(--space-5);
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.btn-secondary {
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		color: var(--text-secondary);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--bg-hover);
		border-color: var(--border-strong);
	}

	.btn-primary {
		background: var(--accent-primary);
		border: 1px solid var(--accent-primary-bright);
		color: var(--text-primary);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-primary-bright);
		box-shadow: var(--shadow-glow-green);
	}

	.btn-secondary:disabled,
	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.hint {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin: 0;
		text-align: center;
	}

	kbd {
		background: var(--bg-base);
		padding: 2px 6px;
		border-radius: var(--radius-xs);
		border: 1px solid var(--border-subtle);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.visibility-toggle {
		display: flex;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.visibility-btn {
		flex: 1;
		padding: var(--space-3);
		background: var(--bg-base);
		border: none;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.visibility-btn:first-child {
		border-right: 1px solid var(--border-default);
	}

	.visibility-btn.active {
		background: var(--accent-primary-dim);
		color: var(--accent-primary-bright);
		font-weight: 600;
	}

	.visibility-btn:hover:not(:disabled):not(.active) {
		background: var(--bg-hover);
		color: var(--text-secondary);
	}

	.visibility-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.visibility-hint {
		margin: var(--space-1) 0 0 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
		font-style: italic;
	}
</style>
