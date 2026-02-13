<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isLoggedIn, matrixClient } from '$lib/stores/matrix';
	import { fetchAvatarUrl, fetchMediaUrl } from '$lib/utils/media';

	const MAX_NAME_LENGTH = 16;

	let loading = true;
	let userId = '';
	let serverSuffix = ''; // e.g. ":darkroot.local"

	// Display name
	let currentDisplayName = '';
	let newDisplayName = '';
	let changingDisplayName = false;
	let displayNameError = '';
	let displayNameSuccess = '';

	// Avatar
	let currentAvatarUrl: string | null = null;
	let currentAvatarMxc: string | null = null; // raw mxc:// url
	let avatarPreview: string | null = null;
	let avatarFile: File | null = null;
	let uploadingAvatar = false;
	let avatarError = '';
	let avatarSuccess = '';
	let fileInput: HTMLInputElement;

	// Password
	let currentPassword = '';
	let newPassword = '';
	let confirmNewPassword = '';
	let changingPassword = false;
	let passwordError = '';
	let passwordSuccess = '';

	onMount(async () => {
		if (!$isLoggedIn || !$matrixClient) {
			goto('/login');
			return;
		}

		userId = $matrixClient.getUserId() || '';
		// Extract the server suffix (everything from the colon)
		const colonIdx = userId.indexOf(':');
		serverSuffix = colonIdx >= 0 ? userId.substring(colonIdx) : '';

		// Fetch profile directly from the API — more reliable than the cached User object
		try {
			const profile = await $matrixClient.getProfileInfo(userId);
			currentDisplayName = profile.displayname || '';
			newDisplayName = currentDisplayName;

			if (profile.avatar_url) {
				currentAvatarMxc = profile.avatar_url;
				// Load avatar asynchronously via authenticated endpoint
				loadAvatar(profile.avatar_url);
			}
		} catch (err) {
			console.error('Failed to load profile:', err);
			// Fallback to cached user
			const user = $matrixClient.getUser(userId);
			if (user) {
				currentDisplayName = user.displayName || '';
				newDisplayName = currentDisplayName;
				if (user.avatarUrl) {
					currentAvatarMxc = user.avatarUrl;
					loadAvatar(user.avatarUrl);
				}
			}
		}

		loading = false;
	});

	/** Enforce max length on name input */
	function handleNameInput() {
		if (newDisplayName.length > MAX_NAME_LENGTH) {
			newDisplayName = newDisplayName.substring(0, MAX_NAME_LENGTH);
		}
	}

	/**
	 * Load avatar from mxc:// URL using authenticated media endpoint.
	 * Updates currentAvatarUrl reactively.
	 */
	async function loadAvatar(mxcUrl: string) {
		if (!$matrixClient || !mxcUrl) return;
		const blobUrl = await fetchAvatarUrl($matrixClient, mxcUrl);
		if (blobUrl) {
			currentAvatarUrl = blobUrl;
		}
	}

	// ── Avatar ──

	function handleAvatarClick() {
		fileInput?.click();
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		// Validate
		if (!file.type.startsWith('image/')) {
			avatarError = 'Please select an image file';
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			avatarError = 'Image must be under 5 MB';
			return;
		}

		avatarFile = file;
		avatarError = '';

		// Generate preview
		const reader = new FileReader();
		reader.onload = () => {
			avatarPreview = reader.result as string;
		};
		reader.readAsDataURL(file);
	}

	async function handleUploadAvatar() {
		if (!$matrixClient || !avatarFile) return;

		uploadingAvatar = true;
		avatarError = '';
		avatarSuccess = '';

		// Keep a copy of the preview so we can use it as a fallback
		const savedPreview = avatarPreview;

		try {
			// Upload image to Matrix content repository
			const uploadRes = await $matrixClient.uploadContent(avatarFile, {
				type: avatarFile.type,
				name: avatarFile.name
			});

			// The response shape can vary by SDK version — try both common formats
			const mxcUrl: string | undefined =
				uploadRes?.content_uri ??
				(uploadRes as any)?.content_uri ??
				(typeof uploadRes === 'string' ? uploadRes : undefined);

			if (!mxcUrl || !mxcUrl.startsWith('mxc://')) {
				console.error('Unexpected uploadContent response:', uploadRes);
				throw new Error('Upload succeeded but server returned an unexpected response');
			}

			// Set as user avatar
			await $matrixClient.setAvatarUrl(mxcUrl);

			// Use the saved preview immediately so the user sees something
			currentAvatarUrl = savedPreview;
			currentAvatarMxc = mxcUrl;

			// Then load the real thumbnail via authenticated endpoint (replaces preview)
			loadAvatar(mxcUrl);
			avatarPreview = null;
			avatarFile = null;
			avatarSuccess = 'Avatar updated!';
			setTimeout(() => { avatarSuccess = ''; }, 3000);
		} catch (err: any) {
			console.error('Avatar upload failed:', err);
			avatarError = err.message || 'Failed to upload avatar';
			// Keep the preview so the user can retry
			avatarPreview = savedPreview;
		} finally {
			uploadingAvatar = false;
		}
	}

	function cancelAvatarChange() {
		avatarPreview = null;
		avatarFile = null;
		avatarError = '';
	}

	// ── Display Name ──

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
			displayNameSuccess = 'Display name updated!';
			setTimeout(() => { displayNameSuccess = ''; }, 3000);
		} catch (err: any) {
			console.error('Failed to change display name:', err);
			displayNameError = err.message || 'Failed to update display name';
		} finally {
			changingDisplayName = false;
		}
	}

	// ── Password ──

	async function handleChangePassword() {
		if (!$matrixClient) return;

		passwordError = '';
		passwordSuccess = '';

		if (!currentPassword) { passwordError = 'Current password is required'; return; }
		if (!newPassword) { passwordError = 'New password is required'; return; }
		if (newPassword.length < 8) { passwordError = 'New password must be at least 8 characters'; return; }
		if (newPassword !== confirmNewPassword) { passwordError = 'New passwords do not match'; return; }
		if (newPassword === currentPassword) { passwordError = 'New password must be different'; return; }

		changingPassword = true;

		try {
			await $matrixClient.setPassword(
				{
					type: 'm.login.password',
					identifier: { type: 'm.id.user', user: userId },
					password: currentPassword,
				},
				newPassword
			);

			currentPassword = '';
			newPassword = '';
			confirmNewPassword = '';
			passwordSuccess = 'Password changed!';
			setTimeout(() => { passwordSuccess = ''; }, 3000);
		} catch (err: any) {
			console.error('Failed to change password:', err);
			if (err.errcode === 'M_FORBIDDEN') passwordError = 'Current password is incorrect';
			else if (err.errcode === 'M_WEAK_PASSWORD') passwordError = 'New password is too weak';
			else passwordError = err.message || 'Failed to change password';
		} finally {
			changingPassword = false;
		}
	}

	function handleBack() {
		goto('/');
	}

	function getInitial(): string {
		return (currentDisplayName || userId).charAt(0).toUpperCase();
	}
</script>

<svelte:head>
	<title>Account - Darkroot Chat</title>
</svelte:head>

<div class="account-page">
	{#if loading}
		<div class="loading">Loading account...</div>
	{:else}
		<div class="account-content">
			<!-- Back button -->
			<button class="back-btn" on:click={handleBack}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
				Back to Chat
			</button>

			<!-- Profile Hero -->
			<div class="hero">
				<div class="hero__avatar-area">
					<button class="hero__avatar" on:click={handleAvatarClick} title="Change avatar">
						{#if avatarPreview}
							<img src={avatarPreview} alt="Preview" class="hero__avatar-img" />
							<div class="hero__avatar-badge">Preview</div>
						{:else if currentAvatarUrl}
							<img src={currentAvatarUrl} alt={currentDisplayName} class="hero__avatar-img" />
							<div class="hero__avatar-overlay">
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
							</div>
						{:else}
							<span class="hero__avatar-initial">{getInitial()}</span>
							<div class="hero__avatar-overlay">
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
							</div>
						{/if}
					</button>
					<input
						bind:this={fileInput}
						type="file"
						accept="image/png,image/jpeg,image/gif,image/webp"
						on:change={handleFileSelect}
						style="display:none"
					/>
				</div>
				<div class="hero__info">
					<h1 class="hero__name">{currentDisplayName || userId.split(':')[0].substring(1)}</h1>
					<p class="hero__id">{userId}</p>
					{#if currentDisplayName && currentDisplayName !== userId.split(':')[0].substring(1)}
						<p class="hero__aka">aka {userId.split(':')[0].substring(1)}</p>
					{/if}
				</div>
			</div>

			<!-- Avatar actions (when a new file is selected) -->
			{#if avatarPreview}
				<div class="section avatar-actions">
					<p class="avatar-actions__hint">New avatar selected. Save it?</p>
					<div class="avatar-actions__buttons">
						<button class="btn btn--primary" on:click={handleUploadAvatar} disabled={uploadingAvatar}>
							{uploadingAvatar ? 'Uploading...' : 'Save Avatar'}
						</button>
						<button class="btn btn--ghost" on:click={cancelAvatarChange} disabled={uploadingAvatar}>
							Cancel
						</button>
					</div>
				</div>
			{/if}

			{#if avatarError}
				<div class="flash flash--error">{avatarError}</div>
			{/if}
			{#if avatarSuccess}
				<div class="flash flash--success">{avatarSuccess}</div>
			{/if}

			<!-- Display Name -->
			<section class="section">
				<h2 class="section__title">Display Name</h2>
				<p class="section__desc">This is how other users see you in chat. Max {MAX_NAME_LENGTH} characters.</p>

				<form class="form" on:submit|preventDefault={handleChangeDisplayName}>
					<div class="form__field">
						<label for="display-name">Display Name</label>
						<div class="name-input-row">
							<input
								id="display-name"
								type="text"
								class="name-input"
								bind:value={newDisplayName}
								on:input={handleNameInput}
								placeholder="Your name"
								maxlength={MAX_NAME_LENGTH}
								disabled={changingDisplayName}
							/>
							<span class="name-suffix">{serverSuffix}</span>
						</div>
						<span class="name-counter" class:name-counter--max={newDisplayName.length >= MAX_NAME_LENGTH}>
							{newDisplayName.length}/{MAX_NAME_LENGTH}
						</span>
					</div>

					{#if displayNameError}
						<div class="flash flash--error">{displayNameError}</div>
					{/if}
					{#if displayNameSuccess}
						<div class="flash flash--success">{displayNameSuccess}</div>
					{/if}

					<button
						type="submit"
						class="btn btn--primary"
						disabled={changingDisplayName || newDisplayName === currentDisplayName || !newDisplayName.trim()}
					>
						{changingDisplayName ? 'Updating...' : 'Update Display Name'}
					</button>
				</form>
			</section>

			<!-- Password -->
			<section class="section">
				<h2 class="section__title">Change Password</h2>
				<p class="section__desc">Keep your account secure with a strong password.</p>

				<form class="form" on:submit|preventDefault={handleChangePassword}>
					<div class="form__field">
						<label for="cur-pw">Current Password</label>
						<input id="cur-pw" type="password" bind:value={currentPassword} placeholder="Enter current password" disabled={changingPassword} autocomplete="current-password" />
					</div>

					<div class="form__field">
						<label for="new-pw">New Password</label>
						<input id="new-pw" type="password" bind:value={newPassword} placeholder="Min 8 characters" disabled={changingPassword} autocomplete="new-password" />
					</div>

					<div class="form__field">
						<label for="confirm-pw">Confirm New Password</label>
						<input id="confirm-pw" type="password" bind:value={confirmNewPassword} placeholder="Re-enter new password" disabled={changingPassword} autocomplete="new-password" />
					</div>

					{#if passwordError}
						<div class="flash flash--error">{passwordError}</div>
					{/if}
					{#if passwordSuccess}
						<div class="flash flash--success">{passwordSuccess}</div>
					{/if}

					<button
						type="submit"
						class="btn btn--primary"
						disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword}
					>
						{changingPassword ? 'Changing...' : 'Change Password'}
					</button>
				</form>
			</section>
		</div>
	{/if}
</div>

<style>
	/* ── Page ── */
	.account-page {
		position: fixed;
		inset: 0;
		background: var(--bg-base);
		overflow-y: auto;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		color: var(--text-muted);
		font-size: var(--text-lg);
	}

	.account-content {
		max-width: 560px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4) var(--space-8);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	/* ── Back Button ── */
	.back-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		align-self: flex-start;
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: var(--text-xs);
		transition: all var(--transition-fast);
	}

	.back-btn:hover {
		background: var(--bg-hover);
		border-color: var(--accent-primary);
		color: var(--text-primary);
	}

	/* ── Hero ── */
	.hero {
		display: flex;
		align-items: center;
		gap: var(--space-5);
		padding: var(--space-5);
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		box-shadow: 0 2px 8px rgba(0,0,0,0.25);
	}

	.hero__avatar-area {
		flex-shrink: 0;
	}

	.hero__avatar {
		position: relative;
		width: 80px;
		height: 80px;
		border-radius: var(--radius-full);
		background: var(--accent-primary-dim);
		border: 2px solid var(--accent-primary);
		cursor: pointer;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
		padding: 0;
	}

	.hero__avatar:hover {
		border-color: var(--accent-primary-bright);
		box-shadow: 0 0 16px rgba(74, 124, 89, 0.3);
	}

	.hero__avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: var(--radius-full);
	}

	.hero__avatar-initial {
		font-size: 28px;
		font-weight: 700;
		color: var(--accent-primary-bright);
		line-height: 1;
	}

	.hero__avatar-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.5);
		opacity: 0;
		transition: opacity 0.2s ease;
		color: var(--text-primary);
		border-radius: var(--radius-full);
	}

	.hero__avatar:hover .hero__avatar-overlay {
		opacity: 1;
	}

	.hero__avatar-badge {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--accent-primary);
		color: var(--text-primary);
		font-size: 9px;
		font-weight: 700;
		text-transform: uppercase;
		text-align: center;
		padding: 2px 0;
		letter-spacing: 0.05em;
	}

	.hero__info {
		min-width: 0;
	}

	.hero__name {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--text-primary);
		font-family: var(--font-display);
	}

	.hero__id {
		margin: var(--space-1) 0 0 0;
		font-size: var(--text-xs);
		color: var(--text-dim);
		font-family: var(--font-mono);
		word-break: break-all;
	}

	.hero__aka {
		margin: 2px 0 0 0;
		font-size: 10px;
		color: var(--text-dim);
		font-style: italic;
	}

	/* ── Avatar Actions ── */
	.avatar-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.avatar-actions__hint {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.avatar-actions__buttons {
		display: flex;
		gap: var(--space-2);
	}

	/* ── Section ── */
	.section {
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
		box-shadow: 0 1px 4px rgba(0,0,0,0.2);
	}

	.section__title {
		margin: 0 0 var(--space-1) 0;
		font-size: var(--text-base);
		font-weight: 700;
		color: var(--text-primary);
	}

	.section__desc {
		margin: 0 0 var(--space-4) 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	/* ── Form ── */
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.form__field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.form__field label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-secondary);
	}

	.form__field input {
		padding: var(--space-2) var(--space-3);
		background: var(--bg-base);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-family: var(--font-body);
		transition: all var(--transition-fast);
	}

	.form__field input:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: var(--shadow-glow-green);
	}

	.form__field input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ── Name input with suffix ── */
	.name-input-row {
		display: flex;
		align-items: stretch;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		overflow: hidden;
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
	}

	.name-input-row:focus-within {
		border-color: var(--accent-primary);
		box-shadow: var(--shadow-glow-green);
	}

	.name-input {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-base);
		border: none;
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-family: var(--font-body);
		min-width: 0;
	}

	.name-input:focus {
		outline: none;
	}

	.name-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.name-suffix {
		display: flex;
		align-items: center;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-elevated);
		color: var(--text-dim);
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		white-space: nowrap;
		border-left: 1px solid var(--border-default);
		user-select: none;
	}

	.name-counter {
		font-size: 10px;
		color: var(--text-dim);
		text-align: right;
		margin-top: 2px;
	}

	.name-counter--max {
		color: var(--accent-gold);
	}

	/* ── Flash messages ── */
	.flash {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.flash--error {
		background: rgba(211, 95, 95, 0.1);
		border: 1px solid rgba(211, 95, 95, 0.3);
		color: var(--status-live);
	}

	.flash--success {
		background: rgba(74, 124, 89, 0.1);
		border: 1px solid rgba(74, 124, 89, 0.3);
		color: var(--accent-primary-bright);
	}

	/* ── Buttons ── */
	.btn {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: var(--text-xs);
		cursor: pointer;
		transition: all var(--transition-fast);
		white-space: nowrap;
	}

	.btn--primary {
		background: var(--accent-primary);
		border: 1px solid var(--accent-primary-bright);
		color: var(--text-primary);
	}

	.btn--primary:hover:not(:disabled) {
		background: var(--accent-primary-bright);
		box-shadow: var(--shadow-glow-green);
	}

	.btn--primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn--ghost {
		background: transparent;
		border: 1px solid var(--border-default);
		color: var(--text-muted);
	}

	.btn--ghost:hover:not(:disabled) {
		border-color: var(--text-dim);
		color: var(--text-secondary);
	}
</style>
