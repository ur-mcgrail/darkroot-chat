<script lang="ts">
	import { onMount } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import {
		listRegistrationTokens,
		createRegistrationToken,
		deleteRegistrationToken,
		generateInviteLink,
		type RegistrationToken,
	} from '$lib/matrix/admin';

	const dispatch = createEventDispatcher();

	export let show = false;

	let tokens: RegistrationToken[] = [];
	let loading = true;
	let error = '';
	let creating = false;

	// New token form
	let newTokenUses: number | null = 5;
	let newTokenExpiry: number | null = null; // Days from now
	let showCreateForm = false;

	// Quick invite
	let generatingQuickInvite = false;
	let quickInviteLink = '';
	let showQuickInvite = false;

	$: if (show) {
		loadTokens();
	}

	async function loadTokens() {
		loading = true;
		error = '';

		try {
			tokens = await listRegistrationTokens();
			// Sort by creation time (newest first)
			tokens.sort((a, b) => {
				// Tokens without expiry or with later expiry come first
				if (!a.expiry_time && b.expiry_time) return -1;
				if (a.expiry_time && !b.expiry_time) return 1;
				if (!a.expiry_time && !b.expiry_time) return 0;
				return (b.expiry_time || 0) - (a.expiry_time || 0);
			});
		} catch (err: any) {
			console.error('Failed to load tokens:', err);
			error = err.message || 'Failed to load registration tokens';
		} finally {
			loading = false;
		}
	}

	async function handleCreateToken() {
		creating = true;
		error = '';

		try {
			const options: any = {
				uses_allowed: newTokenUses,
			};

			// Convert days to milliseconds timestamp
			if (newTokenExpiry && newTokenExpiry > 0) {
				const expiryDate = new Date();
				expiryDate.setDate(expiryDate.getDate() + newTokenExpiry);
				options.expiry_time = expiryDate.getTime();
			}

			await createRegistrationToken(options);

			// Reset form
			newTokenUses = 5;
			newTokenExpiry = null;
			showCreateForm = false;

			// Reload tokens
			await loadTokens();
		} catch (err: any) {
			console.error('Failed to create token:', err);
			error = err.message || 'Failed to create registration token';
		} finally {
			creating = false;
		}
	}

	async function handleDeleteToken(token: string) {
		if (!confirm(`Delete registration token "${token}"?`)) {
			return;
		}

		try {
			await deleteRegistrationToken(token);
			await loadTokens();
		} catch (err: any) {
			console.error('Failed to delete token:', err);
			error = err.message || 'Failed to delete token';
		}
	}

	async function handleGenerateQuickInvite() {
		generatingQuickInvite = true;
		error = '';

		try {
			// Create a token with sensible defaults
			const token = await createRegistrationToken({
				uses_allowed: 5,
				expiry_time: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
			});

			quickInviteLink = generateInviteLink(token.token);
			showQuickInvite = true;

			// Auto-copy to clipboard (with fallback for non-secure contexts)
			await copyToClipboard(quickInviteLink);

			// Reload tokens to show the new one
			await loadTokens();
		} catch (err: any) {
			console.error('Failed to generate invite:', err);
			error = err.message || 'Failed to generate invite link';
		} finally {
			generatingQuickInvite = false;
		}
	}

	async function copyToClipboard(text: string): Promise<void> {
		// Try modern clipboard API first
		if (navigator.clipboard && navigator.clipboard.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return;
			} catch (err) {
				console.warn('Clipboard API failed, using fallback:', err);
			}
		}

		// Fallback for non-secure contexts (HTTP, non-localhost)
		const textArea = document.createElement('textarea');
		textArea.value = text;
		textArea.style.position = 'fixed';
		textArea.style.left = '-999999px';
		textArea.style.top = '-999999px';
		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();

		try {
			document.execCommand('copy');
		} catch (err) {
			console.error('Fallback copy failed:', err);
			throw new Error('Failed to copy to clipboard');
		} finally {
			document.body.removeChild(textArea);
		}
	}

	async function handleCopyInviteLink(token: string) {
		const link = generateInviteLink(token);

		try {
			await copyToClipboard(link);
			// Show feedback
			alert(`Invite link copied to clipboard!\n\n${link}`);
		} catch (err) {
			// If copy fails, still show the link so they can copy manually
			alert(`Copy the invite link:\n\n${link}`);
		}
	}

	function handleCloseQuickInvite() {
		showQuickInvite = false;
		quickInviteLink = '';
	}

	function handleClose() {
		show = false;
		showCreateForm = false;
		dispatch('close');
	}

	function formatDate(timestamp: number | null): string {
		if (!timestamp) return 'Never';
		return new Date(timestamp).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	}

	function isExpired(timestamp: number | null): boolean {
		if (!timestamp) return false;
		return timestamp < Date.now();
	}

	function getRemainingUses(token: RegistrationToken): string {
		if (token.uses_allowed === null) return '∞';
		const remaining = token.uses_allowed - token.completed;
		return remaining > 0 ? remaining.toString() : '0';
	}
</script>

{#if show}
	<div class="modal-overlay" on:click={handleClose} role="presentation">
		<div class="modal-content" on:click|stopPropagation role="dialog" aria-modal="true">
			<!-- Header -->
			<div class="modal-header">
				<h2>⚙️ Admin Panel</h2>
				<button class="close-button" on:click={handleClose} aria-label="Close">×</button>
			</div>

			<!-- Body -->
			<div class="modal-body">
				<!-- Error Message -->
				{#if error}
					<div class="error-message">
						⚠️ {error}
					</div>
				{/if}

				<!-- Quick Invite Section -->
				<div class="quick-invite-section">
					<h3>🔗 Quick Invite</h3>
					<p class="section-hint">Generate an invite link instantly (5 uses, expires in 7 days)</p>

					{#if showQuickInvite}
						<div class="invite-result">
							<div class="invite-link-display">
								<code>{quickInviteLink}</code>
								<button
									class="btn-secondary btn-sm"
									on:click={() => copyToClipboard(quickInviteLink)}
								>
									📋 Copy Again
								</button>
							</div>
							<div class="invite-success">
								✅ Link copied to clipboard! Share it with your friends.
							</div>
							<button class="btn-secondary btn-sm" on:click={handleCloseQuickInvite}>
								Done
							</button>
						</div>
					{:else}
						<button
							class="btn-primary btn-lg"
							on:click={handleGenerateQuickInvite}
							disabled={generatingQuickInvite}
						>
							{generatingQuickInvite ? '⏳ Generating...' : '✨ Generate Invite Link'}
						</button>
					{/if}
				</div>

				<div class="divider"></div>

				<!-- Create Token Section -->
				<div class="section">
					<div class="section-header">
						<h3>Registration Tokens</h3>
						<button
							class="btn-primary btn-sm"
							on:click={() => (showCreateForm = !showCreateForm)}
							disabled={creating}
						>
							{showCreateForm ? 'Cancel' : '+ New Token'}
						</button>
					</div>

					{#if showCreateForm}
						<div class="create-form">
							<div class="form-row">
								<div class="form-group">
									<label for="uses">Uses Allowed</label>
									<input
										id="uses"
										type="number"
										bind:value={newTokenUses}
										min="1"
										placeholder="5"
										class="input"
										disabled={creating}
									/>
									<span class="hint">Leave blank for unlimited</span>
								</div>

								<div class="form-group">
									<label for="expiry">Expires In (days)</label>
									<input
										id="expiry"
										type="number"
										bind:value={newTokenExpiry}
										min="1"
										placeholder="7"
										class="input"
										disabled={creating}
									/>
									<span class="hint">Leave blank for never</span>
								</div>
							</div>

							<button
								class="btn-primary"
								on:click={handleCreateToken}
								disabled={creating}
							>
								{creating ? 'Creating...' : 'Create Token'}
							</button>
						</div>
					{/if}
				</div>

				<!-- Tokens List -->
				<div class="section">
					{#if loading}
						<div class="loading">Loading tokens...</div>
					{:else if tokens.length === 0}
						<div class="empty-state">
							<p>No registration tokens yet</p>
							<p class="hint">Create one to invite users</p>
						</div>
					{:else}
						<div class="tokens-list">
							{#each tokens as token (token.token)}
								{@const expired = isExpired(token.expiry_time)}
								{@const remainingUses = getRemainingUses(token)}

								<div class="token-card" class:expired>
									<div class="token-info">
										<div class="token-value">
											<code>{token.token}</code>
											{#if expired}
												<span class="badge badge-error">Expired</span>
											{:else if remainingUses === '0'}
												<span class="badge badge-warning">Used Up</span>
											{:else}
												<span class="badge badge-success">Active</span>
											{/if}
										</div>

										<div class="token-stats">
											<span>Uses: {token.completed} / {token.uses_allowed || '∞'}</span>
											<span>•</span>
											<span>Pending: {token.pending}</span>
											<span>•</span>
											<span>Expires: {formatDate(token.expiry_time)}</span>
										</div>
									</div>

									<div class="token-actions">
										<button
											class="btn-secondary btn-sm"
											on:click={() => handleCopyInviteLink(token.token)}
											disabled={expired || remainingUses === '0'}
										>
											📋 Copy Link
										</button>
										<button
											class="btn-danger btn-sm"
											on:click={() => handleDeleteToken(token.token)}
										>
											🗑️ Delete
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
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
		max-width: 700px;
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
		position: sticky;
		top: 0;
		background: var(--bg-elevated);
		z-index: 1;
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
		gap: var(--space-5);
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.quick-invite-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		background: var(--bg-surface);
		border-radius: var(--radius-lg);
		border: 2px solid var(--accent-primary);
	}

	.quick-invite-section h3 {
		margin: 0;
		font-size: var(--text-xl);
		color: var(--accent-primary-bright);
	}

	.section-hint {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.invite-result {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.invite-link-display {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--bg-base);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-default);
	}

	.invite-link-display code {
		flex: 1;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--accent-primary-bright);
		word-break: break-all;
	}

	.invite-success {
		padding: var(--space-3);
		background: rgba(74, 124, 89, 0.1);
		border: 1px solid rgba(74, 124, 89, 0.3);
		border-radius: var(--radius-sm);
		color: var(--accent-primary-bright);
		font-size: var(--text-sm);
		text-align: center;
	}

	.divider {
		height: 1px;
		background: var(--border-subtle);
		margin: var(--space-2) 0;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.section-header h3 {
		margin: 0;
		font-size: var(--text-lg);
		color: var(--text-primary);
		font-weight: 600;
	}

	.create-form {
		padding: var(--space-4);
		background: var(--bg-surface);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
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
	}

	.input:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: var(--shadow-glow-green);
	}

	.hint {
		font-size: var(--text-xs);
		color: var(--text-dim);
	}

	.tokens-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.token-card {
		padding: var(--space-4);
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.token-card.expired {
		opacity: 0.6;
		border-color: var(--border-subtle);
	}

	.token-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.token-value {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.token-value code {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		background: var(--bg-base);
		padding: 4px 8px;
		border-radius: var(--radius-xs);
		color: var(--accent-primary-bright);
	}

	.badge {
		padding: 2px 8px;
		border-radius: var(--radius-xs);
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
	}

	.badge-success {
		background: rgba(74, 124, 89, 0.2);
		color: var(--accent-primary-bright);
	}

	.badge-warning {
		background: rgba(139, 149, 86, 0.2);
		color: var(--accent-gold);
	}

	.badge-error {
		background: rgba(211, 95, 95, 0.2);
		color: var(--status-live);
	}

	.token-stats {
		font-size: var(--text-xs);
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.token-actions {
		display: flex;
		gap: var(--space-2);
	}

	.btn-primary,
	.btn-secondary,
	.btn-danger {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
		border: 1px solid;
	}

	.btn-sm {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
	}

	.btn-lg {
		padding: var(--space-4) var(--space-6);
		font-size: var(--text-lg);
		width: 100%;
	}

	.btn-primary {
		background: var(--accent-primary);
		border-color: var(--accent-primary-bright);
		color: var(--text-primary);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-primary-bright);
		box-shadow: var(--shadow-glow-green);
	}

	.btn-secondary {
		background: var(--bg-elevated);
		border-color: var(--border-default);
		color: var(--text-secondary);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--bg-hover);
		border-color: var(--accent-primary);
	}

	.btn-danger {
		background: rgba(211, 95, 95, 0.1);
		border-color: rgba(211, 95, 95, 0.3);
		color: var(--status-live);
	}

	.btn-danger:hover:not(:disabled) {
		background: rgba(211, 95, 95, 0.2);
		border-color: var(--status-live);
	}

	.btn-primary:disabled,
	.btn-secondary:disabled,
	.btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.loading,
	.empty-state {
		text-align: center;
		padding: var(--space-6);
		color: var(--text-muted);
	}

	.error-message {
		padding: var(--space-3);
		background: rgba(211, 95, 95, 0.1);
		border: 1px solid rgba(211, 95, 95, 0.3);
		border-radius: var(--radius-sm);
		color: var(--status-live);
		font-size: var(--text-sm);
	}
</style>
