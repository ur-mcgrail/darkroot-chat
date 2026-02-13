<script lang="ts">
	import { onMount } from 'svelte';
	import { isLoggedIn, currentUser } from '$lib/stores/matrix';
	import { logout } from '$lib/matrix/client';
	import { goto } from '$app/navigation';
	import { isServerAdmin } from '$lib/matrix/admin';
	import RoomList from '$lib/components/RoomList.svelte';
	import RoomView from '$lib/components/RoomView.svelte';
	import AdminPanel from '$lib/components/AdminPanel.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';

	let showAdminPanel = false;
	let isAdmin = false;

	onMount(async () => {
		// Check if user is admin
		if ($isLoggedIn) {
			isAdmin = await isServerAdmin();
		}
	});

	async function handleLogout() {
		await logout();
		await goto('/login');
	}

	function handleOpenAdmin() {
		showAdminPanel = true;
	}

	function handleSettings() {
		goto('/settings');
	}
</script>

<svelte:head>
	<title>Darkroot Chat</title>
</svelte:head>

{#if $isLoggedIn && $currentUser}
	<div class="chat-container">
		<!-- PWA Install Prompt -->
		<InstallPrompt />

		<!-- Top Bar -->
		<div class="top-bar">
			<div class="top-bar__user">
				<span class="top-bar__username">{$currentUser.userId}</span>
			</div>
			<div class="top-bar__actions">
				{#if isAdmin}
					<button class="top-bar__admin" on:click={handleOpenAdmin} title="Admin Panel">
						⚙️
					</button>
				{/if}
				<button class="top-bar__settings" on:click={handleSettings} title="Profile">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="3"/>
						<path d="M12 1v6m0 6v6M5 5l4 4m6 6l4 4M1 12h6m6 0h6M5 19l4-4m6-6l4-4"/>
					</svg>
				</button>
				<button class="top-bar__logout" on:click={handleLogout} title="Logout">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
						<polyline points="16 17 21 12 16 7"/>
						<line x1="21" y1="12" x2="9" y2="12"/>
					</svg>
				</button>
			</div>
		</div>

		<!-- Main Chat Layout -->
		<div class="chat-layout">
			<RoomList />
			<RoomView />
		</div>
	</div>

	<!-- Admin Panel Modal -->
	<AdminPanel bind:show={showAdminPanel} />
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

	.top-bar__actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.top-bar__admin,
	.top-bar__settings,
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

	.top-bar__admin {
		font-size: var(--text-base);
	}

	.top-bar__admin:hover,
	.top-bar__settings:hover,
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
