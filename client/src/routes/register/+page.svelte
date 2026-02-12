<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { isLoggedIn } from '$lib/stores/matrix';
	import { loginWithPassword } from '$lib/matrix/client';
	import { HOMESERVER_URL } from '$lib/config';

	let username = '';
	let password = '';
	let confirmPassword = '';
	let token = '';
	let loading = false;
	let error = '';
	let success = false;
	let tokenFromUrl = false;
	let ready = false; // Controls fade-in entrance
	let usernameInput: HTMLInputElement;

	// Get token from URL query params
	onMount(async () => {
		const tokenParam = $page.url.searchParams.get('token');
		if (tokenParam) {
			token = tokenParam;
			tokenFromUrl = true;
		}

		// Trigger entrance animation
		await tick();
		ready = true;

		// Auto-focus username field after animation settles
		setTimeout(() => {
			usernameInput?.focus();
		}, 400);
	});

	// If already logged in, redirect to chat
	$: if ($isLoggedIn) {
		goto('/');
	}

	// Live username formatting: force lowercase, strip invalid chars
	function handleUsernameInput() {
		username = username.toLowerCase().replace(/[^a-z0-9._=-]/g, '');
	}

	async function handleRegister() {
		error = '';

		if (!username.trim()) {
			error = 'Username is required';
			return;
		}

		if (username.length < 3) {
			error = 'Username must be at least 3 characters';
			return;
		}

		if (!/^[a-z0-9._=-]+$/.test(username)) {
			error = 'Username can only contain lowercase letters, numbers, and .-_=';
			return;
		}

		if (!password) {
			error = 'Password is required';
			return;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		if (!token.trim()) {
			error = 'Registration token is required';
			return;
		}

		loading = true;

		try {
			const registerUrl = `${HOMESERVER_URL}/_matrix/client/v3/register`;
			const trimmedUsername = username.trim();
			const trimmedToken = token.trim();

			/**
			 * Matrix UIA (User-Interactive Auth) multi-stage registration:
			 *   1. POST with no auth → 401 + session ID + required flows
			 *   2. POST with m.login.registration_token + session → validates token
			 *   3. POST with m.login.dummy + session → completes registration
			 */

			const registrationBody = {
				username: trimmedUsername,
				password: password,
				inhibit_login: false,
			};

			// Helper: send a UIA stage and return the parsed response
			async function uiaStage(auth: Record<string, string> | undefined) {
				const body: any = { ...registrationBody };
				if (auth) body.auth = auth;

				const res = await fetch(registerUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
				const data = await res.json();
				return { status: res.status, ok: res.ok, data };
			}

			// Step 1: Initiate UIA flow — get session ID and required stages
			const step1 = await uiaStage(undefined);

			if (step1.ok) {
				// No UIA required (unlikely but handle it)
				success = true;
				await loginWithPassword(username, password, HOMESERVER_URL);
				setTimeout(() => goto('/'), 800);
				return;
			}

			if (step1.status !== 401 || !step1.data.session) {
				throw new Error(handleMatrixError(step1.data));
			}

			const session = step1.data.session;

			// Step 2: Submit registration token
			const step2 = await uiaStage({
				type: 'm.login.registration_token',
				token: trimmedToken,
				session,
			});

			// If token stage completed registration (single-stage flow), we're done
			if (step2.ok) {
				success = true;
				await loginWithPassword(username, password, HOMESERVER_URL);
				setTimeout(() => goto('/'), 800);
				return;
			}

			// Check if token was rejected
			if (step2.data.errcode === 'M_UNAUTHORIZED') {
				throw new Error('Invalid or expired invitation — ask for a new link');
			}

			// Check if token stage was accepted but more stages needed
			const completed = step2.data.completed || [];
			if (!completed.includes('m.login.registration_token')) {
				throw new Error(handleMatrixError(step2.data));
			}

			// Step 3: Complete with m.login.dummy (required second stage)
			const step3 = await uiaStage({
				type: 'm.login.dummy',
				session,
			});

			if (!step3.ok) {
				throw new Error(handleMatrixError(step3.data));
			}

			success = true;

			// Auto-login with new credentials
			await loginWithPassword(username, password, HOMESERVER_URL);

			// Brief pause so user sees the success state before redirect
			setTimeout(() => goto('/'), 800);
		} catch (err: any) {
			console.error('Registration error:', err);
			error = err.message || 'Registration failed. Please try again.';
		} finally {
			loading = false;
		}
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleRegister();
		}
	}

	function handleMatrixError(data: any): string {
		if (!data) return 'Registration failed';
		switch (data.errcode) {
			case 'M_USER_IN_USE':
				return 'That username is already taken — try another';
			case 'M_INVALID_USERNAME':
				return 'Invalid username format';
			case 'M_UNAUTHORIZED':
				return 'Invalid or expired invitation — ask for a new link';
			case 'M_WEAK_PASSWORD':
				return 'Password is too weak — try something longer';
			default:
				return data.error || 'Registration failed';
		}
	}

	function goToLogin() {
		goto('/login');
	}
</script>

<svelte:head>
	<title>{tokenFromUrl ? 'You\'re Invited' : 'Create Account'} — Darkroot Chat</title>
</svelte:head>

<div class="register-container">
	<div class="register-card card-lordran darkroot" class:ready>
		<!-- Header -->
		<div class="register-header">
			{#if tokenFromUrl}
				<h1 class="register-title heading-display darkroot">Welcome to the Forest</h1>
				<p class="register-subtitle">
					You've been invited to Darkroot Chat. Pick a name and you're in.
				</p>
			{:else}
				<h1 class="register-title heading-display darkroot">Create Account</h1>
				<p class="register-subtitle">
					Enter your invitation token to join.
				</p>
			{/if}
		</div>

		<!-- Registration Form -->
		<form class="register-form" on:submit|preventDefault={handleRegister}>
			<!-- Username -->
			<div class="form-group">
				<label for="username" class="form-label">Choose a Username</label>
				<input
					id="username"
					type="text"
					class="form-input"
					bind:value={username}
					bind:this={usernameInput}
					on:input={handleUsernameInput}
					on:keypress={handleKeyPress}
					placeholder="your_username"
					autocomplete="username"
					disabled={loading || success}
					autocapitalize="off"
					spellcheck="false"
				/>
				<span class="form-hint">Lowercase letters, numbers, and .-_= only</span>
			</div>

			<!-- Password -->
			<div class="form-group">
				<label for="password" class="form-label">Password</label>
				<input
					id="password"
					type="password"
					class="form-input"
					bind:value={password}
					on:keypress={handleKeyPress}
					placeholder="••••••••"
					autocomplete="new-password"
					disabled={loading || success}
				/>
				<span class="form-hint">At least 8 characters</span>
			</div>

			<!-- Confirm Password -->
			<div class="form-group">
				<label for="confirm-password" class="form-label">Confirm Password</label>
				<input
					id="confirm-password"
					type="password"
					class="form-input"
					bind:value={confirmPassword}
					on:keypress={handleKeyPress}
					placeholder="••••••••"
					autocomplete="new-password"
					disabled={loading || success}
				/>
			</div>

			<!-- Registration Token (only show if not from invite link) -->
			{#if !tokenFromUrl}
				<div class="form-group">
					<label for="token" class="form-label">Invitation Token</label>
					<input
						id="token"
						type="text"
						class="form-input"
						bind:value={token}
						on:keypress={handleKeyPress}
						placeholder="Paste your invitation token"
						disabled={loading || success}
						spellcheck="false"
					/>
					<span class="form-hint">Don't have one? Ask a member for an invite link.</span>
				</div>
			{/if}

			<!-- Error Message -->
			{#if error}
				<div class="register-error">
					{error}
				</div>
			{/if}

			<!-- Success Message -->
			{#if success}
				<div class="register-success">
					Account created — entering the forest...
				</div>
			{/if}

			<!-- Submit Button -->
			<button
				type="submit"
				class="register-button btn-lordran-gold darkroot"
				disabled={loading || success}
			>
				{#if success}
					Welcome!
				{:else if loading}
					Creating Account...
				{:else}
					Join Darkroot
				{/if}
			</button>
		</form>

		<!-- Footer -->
		<div class="register-footer">
			<p class="register-hint">
				Already have an account?
				<button class="link-button" on:click={goToLogin} disabled={loading}>
					Sign in
				</button>
			</p>
		</div>
	</div>
</div>

<style>
	.register-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: var(--space-4);
		background: var(--bg-base);
	}

	.register-card {
		width: 100%;
		max-width: 480px;
		padding: var(--space-8);
		opacity: 0;
		transform: translateY(12px);
		transition: opacity 0.4s ease, transform 0.4s ease;
	}

	.register-card.ready {
		opacity: 1;
		transform: translateY(0);
	}

	.register-header {
		text-align: center;
		margin-bottom: var(--space-6);
	}

	.register-title {
		margin: 0 0 var(--space-3) 0;
		font-size: var(--text-4xl);
	}

	.register-subtitle {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-base);
		line-height: 1.5;
	}

	.register-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.form-label {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
	}

	.form-input {
		padding: var(--space-3);
		background: var(--bg-base);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: var(--text-base);
		font-family: var(--font-body);
		transition: all var(--transition-fast);
	}

	.form-input:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: var(--shadow-glow-green);
		background: var(--bg-surface);
	}

	.form-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.form-input::placeholder {
		color: var(--text-dim);
	}

	.form-hint {
		font-size: var(--text-xs);
		color: var(--text-dim);
		margin-top: -4px;
	}

	.register-error {
		padding: var(--space-3);
		background: rgba(211, 95, 95, 0.1);
		border: 1px solid rgba(211, 95, 95, 0.3);
		border-radius: var(--radius-sm);
		color: var(--status-live);
		font-size: var(--text-sm);
		text-align: center;
		animation: shake 0.3s ease;
	}

	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		25% { transform: translateX(-4px); }
		75% { transform: translateX(4px); }
	}

	.register-success {
		padding: var(--space-4);
		background: rgba(74, 124, 89, 0.15);
		border: 1px solid rgba(74, 124, 89, 0.4);
		border-radius: var(--radius-md);
		color: var(--accent-primary-bright);
		font-size: var(--text-base);
		text-align: center;
		font-weight: 600;
		animation: fadeIn 0.3s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.register-button {
		margin-top: var(--space-2);
		padding: var(--space-4);
		font-size: var(--text-base);
		width: 100%;
		transition: all var(--transition-fast);
	}

	.register-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.register-footer {
		margin-top: var(--space-6);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
		text-align: center;
	}

	.register-hint {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.link-button {
		background: none;
		border: none;
		color: var(--accent-primary-bright);
		cursor: pointer;
		font-size: var(--text-sm);
		padding: 0;
		text-decoration: underline;
		transition: color var(--transition-fast);
	}

	.link-button:hover:not(:disabled) {
		color: var(--accent-gold);
	}

	.link-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
