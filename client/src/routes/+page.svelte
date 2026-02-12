<script lang="ts">
	import { isLoggedIn, currentUser } from '$lib/stores/matrix';
	import { logout } from '$lib/matrix/client';
	import { goto } from '$app/navigation';
	import RoomList from '$lib/components/RoomList.svelte';
	import RoomView from '$lib/components/RoomView.svelte';

	async function handleLogout() {
		await logout();
		await goto('/login');
	}
</script>

<svelte:head>
	<title>Darkroot Chat</title>
</svelte:head>

{#if $isLoggedIn && $currentUser}
	<div class="chat-container">
		<!-- Top Bar -->
		<div class="top-bar">
			<div class="top-bar__user">
				<span class="top-bar__username">{$currentUser.userId}</span>
			</div>
			<button class="top-bar__logout" on:click={handleLogout} title="Logout">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
					<polyline points="16 17 21 12 16 7"/>
					<line x1="21" y1="12" x2="9" y2="12"/>
				</svg>
			</button>
		</div>

		<!-- Main Chat Layout -->
		<div class="chat-layout">
			<RoomList />
			<RoomView />
		</div>
	</div>
{:else}
	<div class="loading-container">
		<p>Redirecting to login...</p>
	</div>
{/if}

<style>
	.chat-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--bg-base);
	}

	/* Top Bar */
	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border-default);
		flex-shrink: 0;
		height: 56px;
	}

	.top-bar__user {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.top-bar__username {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		font-weight: 500;
	}

	.top-bar__logout {
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

	.top-bar__logout:hover {
		background: var(--bg-hover);
		color: var(--text-secondary);
		border-color: var(--accent-primary);
	}

	/* Chat Layout */
	.chat-layout {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	/* Loading State */
	.loading-container {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		color: var(--text-secondary);
	}
</style>
