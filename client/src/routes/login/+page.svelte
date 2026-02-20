<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { loginWithPassword } from '$lib/matrix/client';
	import { isLoggedIn } from '$lib/stores/matrix';

	const HOMESERVER_PROD = 'https://chat.warrenmcgrail.com';
	const HOMESERVER_DEV  = 'http://192.168.1.161:8008';

	let username = '';
	let password = '';
	let serverEnv: 'prod' | 'dev' = 'prod';
	$: homeserverUrl = serverEnv === 'prod' ? HOMESERVER_PROD : HOMESERVER_DEV;
	let loading = false;
	let error = '';
	let ready = false;

	onMount(() => {
		const t = setTimeout(() => { ready = true; }, 100);
		return () => clearTimeout(t);
	});

	async function handleLogin() {
		if (!username || !password) {
			error = 'Please enter both username and password';
			return;
		}
		loading = true;
		error = '';
		try {
			await loginWithPassword(username, password, homeserverUrl);
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
		if (event.key === 'Enter') handleLogin();
	}

	$: if ($isLoggedIn) goto('/');
</script>

<svelte:head>
	<title>Login — Darkroot Chat</title>
</svelte:head>

<div class="scene" class:ready>

	<!-- Atmospheric depth layers -->
	<div class="scene-bg" aria-hidden="true">
		<div class="scene-bg__glow"></div>
		<div class="scene-bg__vignette scene-bg__vignette--bottom"></div>
		<div class="scene-bg__vignette scene-bg__vignette--top"></div>
	</div>

	<!-- Floating ember particles -->
	<div class="embers" aria-hidden="true">
		{#each Array(14).fill(0) as _, i}
			<span class="ember" style="
				--x: {20 + (i * 47 % 62)}%;
				--d: {(i * 0.27).toFixed(2)}s;
				--dur: {(2.6 + (i * 0.33) % 1.9).toFixed(2)}s;
				--sz: {(1.2 + (i * 0.4) % 2.2).toFixed(1)}px;
				--drift: {((i % 2 === 0 ? 1 : -1) * (6 + (i * 5) % 28))}px;
			"></span>
		{/each}
	</div>

	<!-- Login card -->
	<main class="card" role="main">

		<!-- Bonfire hero mark -->
		<div class="bonfire" class:bonfire--kindling={loading} aria-hidden="true">
			<div class="bonfire__pool"></div>
			<img class="bonfire__img" src="/emoji/bonfire.png" alt="" />
		</div>

		<!-- Title -->
		<header class="card__header">
			<h1 class="card__title">Darkroot</h1>
			<div class="card__ornament">
				<span class="card__ornament-line"></span>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor"
					width="7" height="7" class="card__ornament-gem" aria-hidden="true">
					<path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5Z"/>
				</svg>
				<span class="card__ornament-line"></span>
			</div>
			<p class="card__subtitle">
				{loading ? 'crossing the fog gate...' : 'rest at the bonfire'}
			</p>
		</header>

		<!-- Form -->
		<form class="form" on:submit|preventDefault={handleLogin} novalidate>

			<div class="field">
				<label class="field__label" for="username">Username</label>
				<input
					id="username"
					type="text"
					class="field__input"
					bind:value={username}
					on:keypress={handleKeyPress}
					placeholder="bearer_of_the_curse"
					autocomplete="username"
					autocapitalize="off"
					spellcheck="false"
					disabled={loading}
				/>
			</div>

			<div class="field">
				<label class="field__label" for="password">Password</label>
				<input
					id="password"
					type="password"
					class="field__input"
					bind:value={password}
					on:keypress={handleKeyPress}
					placeholder="••••••••"
					autocomplete="current-password"
					disabled={loading}
				/>
			</div>

			<!-- Server environment toggle -->
			<div class="env-toggle" role="group" aria-label="Server environment">
				<button
					type="button"
					class="env-toggle__btn"
					class:active={serverEnv === 'prod'}
					on:click={() => serverEnv = 'prod'}
					disabled={loading}
				>Production</button>
				<button
					type="button"
					class="env-toggle__btn"
					class:active={serverEnv === 'dev'}
					on:click={() => serverEnv = 'dev'}
					disabled={loading}
				>Development</button>
			</div>

			{#if error}
				<p class="error" role="alert">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
						width="12" height="12" aria-hidden="true" style="flex-shrink:0;margin-top:1px">
						<path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/>
					</svg>
					{error}
				</p>
			{/if}

			<button type="submit" class="submit" disabled={loading}>
				{#if loading}
					<span class="submit__dots" aria-hidden="true">
						<span></span><span></span><span></span>
					</span>
					Crossing the fog...
				{:else}
					Enter the Forest
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
						width="13" height="13" aria-hidden="true">
						<path fill-rule="evenodd" d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.22 4.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H2.75A.75.75 0 0 1 2 8Z"/>
					</svg>
				{/if}
			</button>

		</form>

		<footer class="card__footer">
			<a href="/register" class="card__footer-link">
				Have an invitation? <em>Create an account →</em>
			</a>
			{#if import.meta.env.VITE_BUILD_VERSION}
				<p class="card__version">{import.meta.env.VITE_BUILD_VERSION}</p>
			{/if}
		</footer>

	</main>
</div>

<style>
/* ═══════════════════════════════════════════
   SCENE — full-viewport atmospheric stage
═══════════════════════════════════════════ */
.scene {
	position: relative;
	min-height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--space-4);
	background: var(--bg-deepest);
	overflow: hidden;
}

.scene-bg {
	position: fixed;
	inset: 0;
	pointer-events: none;
	z-index: 0;
}

/* Central ember-glow — the bonfire's warmth spreading upward */
.scene-bg__glow {
	position: absolute;
	bottom: 22%;
	left: 50%;
	transform: translateX(-50%);
	width: 72vw;
	max-width: 720px;
	height: 55vh;
	background: radial-gradient(
		ellipse at 50% 85%,
		rgba(79, 138, 97, 0.13) 0%,
		rgba(79, 138, 97, 0.05) 38%,
		transparent 68%
	);
	animation: glowBreathe 5.5s ease-in-out infinite alternate;
}

@keyframes glowBreathe {
	from { opacity: 0.65; transform: translateX(-50%) scaleY(0.90); }
	to   { opacity: 1;    transform: translateX(-50%) scaleY(1.10); }
}

/* Vignette edges — forest closing in */
.scene-bg__vignette {
	position: absolute;
	left: 0;
	right: 0;
}

.scene-bg__vignette--bottom {
	bottom: 0;
	height: 35vh;
	background: linear-gradient(to top, rgba(8, 11, 8, 0.75) 0%, transparent 100%);
}

.scene-bg__vignette--top {
	top: 0;
	height: 25vh;
	background: linear-gradient(to bottom, rgba(8, 11, 8, 0.55) 0%, transparent 100%);
}

/* ═══════════════════════════════════════════
   EMBERS — floating sparks rising from below
═══════════════════════════════════════════ */
.embers {
	position: fixed;
	inset: 0;
	pointer-events: none;
	z-index: 1;
}

.ember {
	position: absolute;
	bottom: 38%;
	left: var(--x);
	width: var(--sz);
	height: var(--sz);
	border-radius: 50%;
	background: var(--accent-gold-bright);
	box-shadow: 0 0 4px 1px rgba(200, 216, 128, 0.5);
	opacity: 0;
	animation: emberRise var(--dur) var(--d) infinite ease-out;
}

@keyframes emberRise {
	0%   { opacity: 0;   transform: translateY(0)      translateX(0);            }
	8%   { opacity: 0.9;                                                          }
	88%  { opacity: 0;   transform: translateY(-42vh)  translateX(var(--drift)); }
	100% { opacity: 0;   transform: translateY(-44vh)  translateX(var(--drift)); }
}

/* ═══════════════════════════════════════════
   CARD — the stone tablet
═══════════════════════════════════════════ */
.card {
	position: relative;
	z-index: 10;
	width: 100%;
	max-width: 390px;
	background: rgba(15, 20, 15, 0.9);
	backdrop-filter: blur(24px);
	-webkit-backdrop-filter: blur(24px);
	border: 1px solid var(--border-default);
	border-top-color: rgba(150, 168, 92, 0.5);
	border-radius: var(--radius-lg);
	padding: var(--space-8) var(--space-8) var(--space-6);
	box-shadow:
		var(--shadow-xl),
		0 0 0 1px rgba(79, 138, 97, 0.05) inset,
		0 1px 0 rgba(200, 216, 128, 0.08) inset;

	/* Entrance: rises from the fog */
	opacity: 0;
	transform: translateY(28px);
	transition:
		opacity 0.75s cubic-bezier(0.16, 1, 0.3, 1),
		transform 0.75s cubic-bezier(0.16, 1, 0.3, 1);
	transition-delay: 0.1s;
}

.scene.ready .card {
	opacity: 1;
	transform: translateY(0);
}

/* Gold gradient shimmer along the top edge */
.card::before {
	content: '';
	position: absolute;
	top: 0;
	left: 12%;
	right: 12%;
	height: 1px;
	background: linear-gradient(
		90deg,
		transparent,
		rgba(150, 168, 92, 0.5),
		rgba(200, 216, 128, 0.8),
		rgba(150, 168, 92, 0.5),
		transparent
	);
}

/* ═══════════════════════════════════════════
   BONFIRE HERO MARK
═══════════════════════════════════════════ */
.bonfire {
	position: relative;
	display: flex;
	justify-content: center;
	align-items: flex-end;
	height: 84px;
	margin-bottom: var(--space-4);
}

/* Light pool on the ground below the bonfire */
.bonfire__pool {
	position: absolute;
	bottom: 0;
	left: 50%;
	transform: translateX(-50%);
	width: 110px;
	height: 44px;
	background: radial-gradient(
		ellipse at 50% 100%,
		rgba(200, 216, 128, 0.20) 0%,
		rgba(150, 168, 92, 0.07) 50%,
		transparent 72%
	);
	border-radius: 50%;
	animation: poolFlicker 3.5s ease-in-out infinite;
}

@keyframes poolFlicker {
	0%, 100% { opacity: 0.8; transform: translateX(-50%) scaleX(1);    }
	30%      { opacity: 1;   transform: translateX(-50%) scaleX(1.06); }
	55%      { opacity: 0.7; transform: translateX(-50%) scaleX(0.94); }
	78%      { opacity: 0.95;transform: translateX(-50%) scaleX(1.03); }
}

.bonfire__img {
	width: 68px;
	height: 68px;
	image-rendering: pixelated;
	filter:
		drop-shadow(0 0 6px rgba(200, 216, 128, 0.65))
		drop-shadow(0 0 18px rgba(150, 168, 92, 0.40))
		drop-shadow(0 0 38px rgba(79, 138, 97, 0.20));
	animation: bonfireFlicker 3.5s ease-in-out infinite;
}

@keyframes bonfireFlicker {
	0%   { filter: drop-shadow(0 0 6px  rgba(200,216,128,0.60)) drop-shadow(0 0 16px rgba(150,168,92,0.35)) drop-shadow(0 0 32px rgba(79,138,97,0.18)); }
	18%  { filter: drop-shadow(0 0 11px rgba(200,216,128,0.88)) drop-shadow(0 0 28px rgba(150,168,92,0.52)) drop-shadow(0 0 52px rgba(79,138,97,0.30)); }
	42%  { filter: drop-shadow(0 0 4px  rgba(200,216,128,0.48)) drop-shadow(0 0 13px rgba(150,168,92,0.26)) drop-shadow(0 0 26px rgba(79,138,97,0.14)); }
	63%  { filter: drop-shadow(0 0 9px  rgba(200,216,128,0.78)) drop-shadow(0 0 24px rgba(150,168,92,0.46)) drop-shadow(0 0 44px rgba(79,138,97,0.26)); }
	80%  { filter: drop-shadow(0 0 5px  rgba(200,216,128,0.50)) drop-shadow(0 0 14px rgba(150,168,92,0.28)) drop-shadow(0 0 28px rgba(79,138,97,0.15)); }
	100% { filter: drop-shadow(0 0 6px  rgba(200,216,128,0.60)) drop-shadow(0 0 16px rgba(150,168,92,0.35)) drop-shadow(0 0 32px rgba(79,138,97,0.18)); }
}

/* Loading: bonfire kindles intensely */
.bonfire--kindling .bonfire__img {
	animation: bonfireKindling 0.45s ease-in-out infinite alternate;
}

.bonfire--kindling .bonfire__pool {
	animation: poolKindling 0.45s ease-in-out infinite alternate;
}

@keyframes bonfireKindling {
	from {
		filter: drop-shadow(0 0 5px rgba(200,216,128,0.45)) drop-shadow(0 0 14px rgba(150,168,92,0.28)) drop-shadow(0 0 24px rgba(79,138,97,0.14));
		transform: scaleY(0.96) scaleX(1.02);
	}
	to {
		filter: drop-shadow(0 0 16px rgba(200,216,128,0.98)) drop-shadow(0 0 36px rgba(150,168,92,0.65)) drop-shadow(0 0 60px rgba(79,138,97,0.38));
		transform: scaleY(1.05) scaleX(0.98);
	}
}

@keyframes poolKindling {
	from { opacity: 0.6;  transform: translateX(-50%) scaleX(0.9);  }
	to   { opacity: 1;    transform: translateX(-50%) scaleX(1.12); }
}

/* ═══════════════════════════════════════════
   CARD HEADER
═══════════════════════════════════════════ */
.card__header {
	text-align: center;
	margin-bottom: var(--space-6);
}

.card__title {
	margin: 0 0 var(--space-3);
	font-family: var(--font-display);
	font-size: clamp(1.8rem, 5vw, 2.2rem);
	font-weight: 700;
	color: var(--accent-gold-bright);
	letter-spacing: 0.14em;
	text-transform: uppercase;
	line-height: 1;
}

/* Decorative rule: ─── ✦ ─── */
.card__ornament {
	display: flex;
	align-items: center;
	gap: 10px;
	margin: 0 auto var(--space-3);
	max-width: 180px;
}

.card__ornament-line {
	flex: 1;
	height: 1px;
	background: var(--border-default);
}

.card__ornament-gem {
	color: rgba(150, 168, 92, 0.55);
	flex-shrink: 0;
}

.card__subtitle {
	margin: 0;
	font-size: var(--text-sm);
	color: var(--text-muted);
	font-style: italic;
	letter-spacing: 0.04em;
	min-height: 1.4em;
	transition: color var(--transition-base);
}

/* ═══════════════════════════════════════════
   FORM & FIELDS
═══════════════════════════════════════════ */
.form {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.field {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.field__label {
	font-size: 10px;
	font-weight: 700;
	color: var(--text-dim);
	text-transform: uppercase;
	letter-spacing: 0.15em;
	padding-left: 2px;
	transition: color var(--transition-fast);
}

.field:focus-within .field__label {
	color: var(--accent-primary-bright);
}

.field__input {
	padding: 11px 14px;
	background: rgba(8, 11, 8, 0.65);
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-md);
	color: var(--text-primary);
	font-size: var(--text-sm);
	font-family: var(--font-body);
	outline: none;
	width: 100%;
	box-sizing: border-box;
	transition:
		border-color var(--transition-fast),
		box-shadow var(--transition-fast),
		background var(--transition-fast);
}

.field__input::placeholder {
	color: var(--text-dim);
	font-style: italic;
}

.field__input:focus {
	border-color: var(--border-strong);
	background: rgba(8, 11, 8, 0.85);
	box-shadow:
		0 0 0 3px rgba(79, 138, 97, 0.10),
		var(--shadow-glow-green);
}

.field__input:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.field__input--mono {
	font-family: var(--font-mono);
	font-size: var(--text-xs);
}

/* ═══════════════════════════════════════════
   SERVER ENVIRONMENT TOGGLE
═══════════════════════════════════════════ */
.env-toggle {
	display: flex;
	border: 1px solid var(--border-subtle);
	border-radius: var(--radius-sm);
	overflow: hidden;
	align-self: flex-start;
}

.env-toggle__btn {
	flex: 1;
	padding: 5px 14px;
	background: transparent;
	border: none;
	color: var(--text-dim);
	font-size: var(--text-xs);
	font-family: var(--font-body);
	letter-spacing: 0.05em;
	cursor: pointer;
	transition: all var(--transition-fast);
	white-space: nowrap;
}

.env-toggle__btn + .env-toggle__btn {
	border-left: 1px solid var(--border-subtle);
}

.env-toggle__btn:hover:not(:disabled):not(.active) {
	color: var(--text-muted);
	background: var(--bg-hover);
}

.env-toggle__btn.active {
	background: var(--accent-primary-dim);
	color: var(--accent-primary-bright);
}

.env-toggle__btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

/* ═══════════════════════════════════════════
   ERROR STATE
═══════════════════════════════════════════ */
.error {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	margin: 0;
	padding: 10px 14px;
	background: rgba(160, 50, 50, 0.12);
	border: 1px solid rgba(180, 60, 60, 0.32);
	border-radius: var(--radius-md);
	color: #df8888;
	font-size: var(--text-xs);
	line-height: 1.5;
	animation: errorShake 0.38s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

@keyframes errorShake {
	10%, 90%       { transform: translateX(-2px); }
	20%, 80%       { transform: translateX(3px);  }
	30%, 50%, 70%  { transform: translateX(-3px); }
	40%, 60%       { transform: translateX(3px);  }
}

/* ═══════════════════════════════════════════
   SUBMIT BUTTON
═══════════════════════════════════════════ */
.submit {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	margin-top: 6px;
	padding: 13px var(--space-4);
	background: linear-gradient(135deg, var(--accent-gold-dim) 0%, var(--accent-gold) 100%);
	border: 1px solid var(--accent-gold-soft);
	border-radius: var(--radius-md);
	color: #080c08;
	font-size: var(--text-sm);
	font-weight: 700;
	font-family: var(--font-body);
	letter-spacing: 0.07em;
	text-transform: uppercase;
	cursor: pointer;
	width: 100%;
	transition:
		background var(--transition-fast),
		box-shadow var(--transition-fast),
		transform var(--transition-fast),
		opacity var(--transition-fast);
}

.submit:hover:not(:disabled) {
	background: linear-gradient(135deg, var(--accent-gold) 0%, var(--accent-gold-bright) 100%);
	box-shadow: var(--shadow-glow-gold), 0 4px 20px rgba(0, 0, 0, 0.45);
	transform: translateY(-1px);
}

.submit:active:not(:disabled) {
	transform: translateY(0);
	box-shadow: var(--shadow-glow-gold);
}

.submit:disabled {
	opacity: 0.65;
	cursor: not-allowed;
}

/* Breathing dot indicator during load */
.submit__dots {
	display: inline-flex;
	align-items: center;
	gap: 3px;
}

.submit__dots span {
	display: block;
	width: 4px;
	height: 4px;
	border-radius: 50%;
	background: currentColor;
	animation: dotBreathe 1.1s ease-in-out infinite;
}

.submit__dots span:nth-child(2) { animation-delay: 0.18s; }
.submit__dots span:nth-child(3) { animation-delay: 0.36s; }

@keyframes dotBreathe {
	0%, 80%, 100% { opacity: 0.25; transform: scale(0.75); }
	40%           { opacity: 1;    transform: scale(1);    }
}

/* ═══════════════════════════════════════════
   CARD FOOTER
═══════════════════════════════════════════ */
.card__footer {
	margin-top: var(--space-5);
	padding-top: var(--space-4);
	border-top: 1px solid var(--border-subtle);
	text-align: center;
}

.card__footer-link {
	font-size: var(--text-xs);
	color: var(--text-dim);
	text-decoration: none;
	letter-spacing: 0.02em;
	transition: color var(--transition-fast);
}

.card__footer-link em {
	color: var(--accent-primary-bright);
	font-style: normal;
	transition: color var(--transition-fast);
}

.card__footer-link:hover { color: var(--text-muted); }
.card__footer-link:hover em { color: var(--accent-gold-bright); }

.card__version {
	margin: var(--space-3) 0 0;
	font-size: 10px;
	font-family: var(--font-mono);
	color: var(--text-dim);
	opacity: 0.45;
	letter-spacing: 0.06em;
}

/* ═══════════════════════════════════════════
   MOBILE
═══════════════════════════════════════════ */
@media (max-width: 480px) {
	.card {
		padding: var(--space-6) var(--space-5) var(--space-5);
		border-radius: var(--radius-md);
		max-width: 100%;
	}

	.bonfire { height: 68px; }
	.bonfire__svg { width: 54px; height: 54px; }
	.card__title { font-size: 1.75rem; }
}
</style>
