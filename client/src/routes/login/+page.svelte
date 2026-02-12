<script lang="ts">
	import { goto } from '$app/navigation';
	import { loginWithPassword } from '$lib/matrix/client';
	import { isLoggedIn } from '$lib/stores/matrix';
	import { HOMESERVER_URL } from '$lib/config';

	let username = '';
	let password = '';
	let homeserverUrl = HOMESERVER_URL; // From environment config
	let loading = false;
	let error = '';

	async function handleLogin() {
		if (!username || !password) {
			error = 'Please enter both username and password';
			return;
		}

		loading = true;
		error = '';

		try {
			await loginWithPassword(username, password, homeserverUrl);
			// Redirect to main app after successful login
			await goto('/');
		} catch (err: any) {
			console.error('Login error:', err);

			if (err.errcode === 'M_FORBIDDEN') {
				error = 'Invalid username or password';
			} else if (err.name === 'ConnectionError') {
				error = 'Cannot connect to homeserver. Is it running?';
			} else {
				error = err.message || 'Login failed. Please try again.';
			}
		} finally {
			loading = false;
		}
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleLogin();
		}
	}

	// If already logged in, redirect
	$: if ($isLoggedIn) {
		goto('/');
	}
</script>

<svelte:head>
	<title>Login - Darkroot Chat</title>
</svelte:head>

<div class="login-container">
	<div class="login-card card-lordran darkroot">
		<!-- Logo / Title -->
		<div class="login-header">
			<h1 class="login-title heading-display darkroot">🌲 Darkroot</h1>
			<p class="login-subtitle">Enter the forest...</p>
		</div>

		<!-- Login Form -->
		<form class="login-form" on:submit|preventDefault={handleLogin}>
			<!-- Username -->
			<div class="form-group">
				<label for="username" class="form-label">Username</label>
				<input
					id="username"
					type="text"
					class="form-input"
					bind:value={username}
					on:keypress={handleKeyPress}
					placeholder="admin"
					autocomplete="username"
					disabled={loading}
				/>
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
					autocomplete="current-password"
					disabled={loading}
				/>
			</div>

			<!-- Homeserver URL -->
			<div class="form-group">
				<label for="homeserver" class="form-label">Homeserver</label>
				<input
					id="homeserver"
					type="text"
					class="form-input"
					bind:value={homeserverUrl}
					on:keypress={handleKeyPress}
					placeholder="http://192.168.1.161:8008"
					disabled={loading}
				/>
			</div>

			<!-- Error Message -->
			{#if error}
				<div class="login-error">
					⚠️ {error}
				</div>
			{/if}

			<!-- Submit Button -->
			<button
				type="submit"
				class="login-button btn-lordran-gold darkroot"
				disabled={loading}
			>
				{loading ? 'Entering...' : 'Enter the Forest'}
			</button>
		</form>

		<!-- Footer -->
		<div class="login-footer">
			<p class="login-hint">
				Default: <code>admin</code> / <code>darkroot_admin_2026</code>
			</p>
		</div>
	</div>
</div>

<style>
	.login-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: var(--space-4);
		background: var(--bg-base);
	}

	.login-card {
		width: 100%;
		max-width: 420px;
		padding: var(--space-8);
	}

	.login-header {
		text-align: center;
		margin-bottom: var(--space-6);
	}

	.login-title {
		margin: 0 0 var(--space-2) 0;
		font-size: var(--text-4xl);
	}

	.login-subtitle {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-base);
		font-style: italic;
	}

	.login-form {
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

	.login-error {
		padding: var(--space-3);
		background: rgba(211, 95, 95, 0.1);
		border: 1px solid rgba(211, 95, 95, 0.3);
		border-radius: var(--radius-sm);
		color: var(--status-live);
		font-size: var(--text-sm);
		text-align: center;
	}

	.login-button {
		margin-top: var(--space-2);
		padding: var(--space-4);
		font-size: var(--text-base);
		width: 100%;
	}

	.login-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.login-footer {
		margin-top: var(--space-6);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
		text-align: center;
	}

	.login-hint {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.login-hint code {
		padding: 2px 6px;
		background: var(--bg-base);
		border-radius: var(--radius-xs);
		font-family: var(--font-mono);
		color: var(--accent-primary-bright);
	}
</style>
