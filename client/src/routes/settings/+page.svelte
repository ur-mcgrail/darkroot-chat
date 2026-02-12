<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isLoggedIn, matrixClient } from '$lib/stores/matrix';

	let loading = true;
	let userId = '';
	let currentDisplayName = '';
	let newDisplayName = '';

	// Password change
	let currentPassword = '';
	let newPassword = '';
	let confirmNewPassword = '';
	let changingPassword = false;
	let passwordError = '';
	let passwordSuccess = '';

	// Display name change
	let changingDisplayName = false;
	let displayNameError = '';
	let displayNameSuccess = '';

	// Account info
	let deviceId = '';
	let createdAt = '';

	onMount(async () => {
		if (!$isLoggedIn || !$matrixClient) {
			goto('/login');
			return;
		}

		// Load current user info
		userId = $matrixClient.getUserId() || '';
		deviceId = $matrixClient.getDeviceId() || '';

		// Get current display name
		try {
			const user = $matrixClient.getUser(userId);
			if (user) {
				currentDisplayName = user.displayName || '';
				newDisplayName = currentDisplayName;
			}
		} catch (error) {
			console.error('Failed to load display name:', error);
		}

		loading = false;
	});

	async function handleChangeDisplayName() {
		if (!$matrixClient) return;

		displayNameError = '';
		displayNameSuccess = '';

		if (!newDisplayName.trim()) {
			displayNameError = 'Display name cannot be empty';
			return;
		}

		if (newDisplayName === currentDisplayName) {
			displayNameError = 'Display name unchanged';
			return;
		}

		changingDisplayName = true;

		try {
			await $matrixClient.setDisplayName(newDisplayName.trim());

			currentDisplayName = newDisplayName.trim();
			displayNameSuccess = 'Display name updated successfully!';

			// Clear success message after 3 seconds
			setTimeout(() => {
				displayNameSuccess = '';
			}, 3000);
		} catch (error: any) {
			console.error('Failed to change display name:', error);
			displayNameError = error.message || 'Failed to update display name';
		} finally {
			changingDisplayName = false;
		}
	}

	async function handleChangePassword() {
		if (!$matrixClient) return;

		passwordError = '';
		passwordSuccess = '';

		// Validation
		if (!currentPassword) {
			passwordError = 'Current password is required';
			return;
		}

		if (!newPassword) {
			passwordError = 'New password is required';
			return;
		}

		if (newPassword.length < 8) {
			passwordError = 'New password must be at least 8 characters';
			return;
		}

		if (newPassword !== confirmNewPassword) {
			passwordError = 'New passwords do not match';
			return;
		}

		if (newPassword === currentPassword) {
			passwordError = 'New password must be different from current password';
			return;
		}

		changingPassword = true;

		try {
			await $matrixClient.setPassword(
				{
					type: 'm.login.password',
					identifier: {
						type: 'm.id.user',
						user: userId,
					},
					password: currentPassword,
				},
				newPassword
			);

			// Clear form
			currentPassword = '';
			newPassword = '';
			confirmNewPassword = '';

			passwordSuccess = 'Password changed successfully!';

			// Clear success message after 3 seconds
			setTimeout(() => {
				passwordSuccess = '';
			}, 3000);
		} catch (error: any) {
			console.error('Failed to change password:', error);

			if (error.errcode === 'M_FORBIDDEN') {
				passwordError = 'Current password is incorrect';
			} else if (error.errcode === 'M_WEAK_PASSWORD') {
				passwordError = 'New password is too weak';
			} else {
				passwordError = error.message || 'Failed to change password';
			}
		} finally {
			changingPassword = false;
		}
	}

	function handleBack() {
		goto('/');
	}
</script>

<svelte:head>
	<title>Profile - Darkroot Chat</title>
</svelte:head>

<div class="profile-page">
	{#if loading}
		<div class="loading">Loading profile...</div>
	{:else}
		<div class="profile-content">
			<!-- Header -->
			<div class="profile-header">
				<button class="back-button" on:click={handleBack}>
					← Back to Chat
				</button>
				<h1 class="profile-title">👤 User Profile</h1>
				<p class="profile-subtitle">Manage your account and preferences</p>
			</div>

			<div class="profile-sections">
				<!-- Account Info Section -->
				<section class="settings-section">
					<h2 class="section-title">Account Information</h2>
					<div class="info-grid">
						<div class="info-item">
							<span class="info-label">User ID</span>
							<code class="info-value">{userId}</code>
						</div>
						<div class="info-item">
							<span class="info-label">Device ID</span>
							<code class="info-value">{deviceId || 'Unknown'}</code>
						</div>
					</div>
				</section>

				<!-- Display Name Section -->
				<section class="settings-section">
					<h2 class="section-title">Display Name</h2>
					<p class="section-description">
						Your display name is shown to other users in rooms and messages.
					</p>

					<form class="profile-form" on:submit|preventDefault={handleChangeDisplayName}>
						<div class="form-group">
							<label for="display-name">Display Name</label>
							<input
								id="display-name"
								type="text"
								class="input"
								bind:value={newDisplayName}
								placeholder="Your display name"
								disabled={changingDisplayName}
							/>
						</div>

						{#if displayNameError}
							<div class="error-message">⚠️ {displayNameError}</div>
						{/if}

						{#if displayNameSuccess}
							<div class="success-message">✅ {displayNameSuccess}</div>
						{/if}

						<button
							type="submit"
							class="btn-primary"
							disabled={changingDisplayName || newDisplayName === currentDisplayName}
						>
							{changingDisplayName ? 'Updating...' : 'Update Display Name'}
						</button>
					</form>
				</section>

				<!-- Change Password Section -->
				<section class="settings-section">
					<h2 class="section-title">Change Password</h2>
					<p class="section-description">
						Update your password to keep your account secure.
					</p>

					<form class="profile-form" on:submit|preventDefault={handleChangePassword}>
						<div class="form-group">
							<label for="current-password">Current Password</label>
							<input
								id="current-password"
								type="password"
								class="input"
								bind:value={currentPassword}
								placeholder="Enter current password"
								disabled={changingPassword}
								autocomplete="current-password"
							/>
						</div>

						<div class="form-group">
							<label for="new-password">New Password</label>
							<input
								id="new-password"
								type="password"
								class="input"
								bind:value={newPassword}
								placeholder="Enter new password (min 8 characters)"
								disabled={changingPassword}
								autocomplete="new-password"
							/>
						</div>

						<div class="form-group">
							<label for="confirm-password">Confirm New Password</label>
							<input
								id="confirm-password"
								type="password"
								class="input"
								bind:value={confirmNewPassword}
								placeholder="Re-enter new password"
								disabled={changingPassword}
								autocomplete="new-password"
							/>
						</div>

						{#if passwordError}
							<div class="error-message">⚠️ {passwordError}</div>
						{/if}

						{#if passwordSuccess}
							<div class="success-message">✅ {passwordSuccess}</div>
						{/if}

						<button
							type="submit"
							class="btn-primary"
							disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword}
						>
							{changingPassword ? 'Changing Password...' : 'Change Password'}
						</button>
					</form>
				</section>
			</div>
		</div>
	{/if}
</div>

<style>
	.profile-page {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: var(--bg-base);
		overflow-y: auto;
		overflow-x: hidden;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		color: var(--text-muted);
		font-size: var(--text-lg);
	}

	.profile-content {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--space-6);
		padding-bottom: var(--space-8);
	}

	.profile-header {
		margin-bottom: var(--space-6);
	}

	.profile-title {
		margin: 0 0 var(--space-2) 0;
		font-size: var(--text-4xl);
		font-family: var(--font-display);
		color: var(--accent-primary-bright);
	}

	.profile-subtitle {
		margin: 0;
		font-size: var(--text-base);
		color: var(--text-muted);
	}

	.back-button {
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: var(--text-sm);
		margin-bottom: var(--space-4);
		transition: all var(--transition-fast);
	}

	.back-button:hover {
		background: var(--bg-hover);
		border-color: var(--accent-primary);
		color: var(--text-primary);
	}

	.profile-sections {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.settings-section {
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
	}

	.section-title {
		margin: 0 0 var(--space-2) 0;
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--text-primary);
	}

	.section-description {
		margin: 0 0 var(--space-4) 0;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.info-grid {
		display: grid;
		gap: var(--space-3);
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.info-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
	}

	.info-value {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--accent-primary-bright);
		background: var(--bg-base);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-subtle);
	}

	.profile-form {
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

	.error-message {
		padding: var(--space-3);
		background: rgba(211, 95, 95, 0.1);
		border: 1px solid rgba(211, 95, 95, 0.3);
		border-radius: var(--radius-sm);
		color: var(--status-live);
		font-size: var(--text-sm);
	}

	.success-message {
		padding: var(--space-3);
		background: rgba(74, 124, 89, 0.1);
		border: 1px solid rgba(74, 124, 89, 0.3);
		border-radius: var(--radius-sm);
		color: var(--accent-primary-bright);
		font-size: var(--text-sm);
	}

	.btn-primary {
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

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-primary-bright);
		box-shadow: var(--shadow-glow-green);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
