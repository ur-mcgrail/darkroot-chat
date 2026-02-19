<script lang="ts">
	import { onMount } from 'svelte';
	import { isLoggedIn, currentUser, currentRoom, currentRoomId, rooms, userPresence, matrixClient, syncState } from '$lib/stores/matrix';
	import { logout } from '$lib/matrix/client';
	import { goto } from '$app/navigation';
	import { isServerAdmin } from '$lib/matrix/admin';
	import { getRoomName, ensureGeneralRoom } from '$lib/matrix/rooms';
	import RoomList from '$lib/components/RoomList.svelte';
	import RoomView from '$lib/components/RoomView.svelte';
	import AdminPanel from '$lib/components/AdminPanel.svelte';
	import LinkSidebar from '$lib/components/LinkSidebar.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';

	let showAdminPanel = false;
	let isAdmin = false;

	// Mobile layout state
	type MobileTab = 'chat' | 'rooms' | 'links' | 'profile';
	let mobileTab: MobileTab = 'rooms';
	let isMobile = false;

	// Auto-switch to chat view when a room is selected on mobile
	$: if ($currentRoomId && isMobile) mobileTab = 'chat';

	// Build online users list — recomputed only when presence changes (not every message)
	let onlineUsers: { userId: string; displayName: string; presence: string }[] = [];
	$: {
		const client = $matrixClient;
		const presence = $userPresence;
		if (client) {
			try {
				const myId = client.getUserId();
				const seen = new Set<string>();
				onlineUsers = client.getRooms()
					.flatMap((r: any) => {
						try { return r.getJoinedMembers(); } catch { return []; }
					})
					.filter((m: any) => {
						if (!m?.userId || m.userId === myId || seen.has(m.userId)) return false;
						seen.add(m.userId);
						return true;
					})
					.map((m: any) => ({
						userId: m.userId,
						displayName: m.name || m.userId.split(':')[0].substring(1),
						presence: presence[m.userId] || 'offline',
					}))
					.sort((a: any, b: any) => {
						const ao = a.presence === 'online' ? 0 : 1;
						const bo = b.presence === 'online' ? 0 : 1;
						return ao !== bo ? ao - bo : a.displayName.localeCompare(b.displayName);
					});
			} catch (e) {
				// ignore transient errors during room member enumeration
			}
		}
	}

	// Auto-join General room once client is synced
	let generalJoinAttempted = false;
	$: if ($syncState === 'PREPARED' && $isLoggedIn && !generalJoinAttempted) {
		generalJoinAttempted = true;
		ensureGeneralRoom();
	}

	onMount(async () => {
		if ($isLoggedIn) isAdmin = await isServerAdmin();

		const checkMobile = () => { isMobile = window.innerWidth <= 768; };
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	});

	async function handleLogout() {
		await logout();
		await goto('/login');
	}

	function handleSettings() { goto('/settings'); }
	function setTab(tab: MobileTab) { mobileTab = tab; }
</script>

<svelte:head>
	<title>Darkroot Chat</title>
</svelte:head>

{#if $isLoggedIn && $currentUser}
	<div class="chat-container">
		<InstallPrompt />

		<!-- ── Desktop top bar ────────────────────────────────────────────── -->
		<div class="top-bar">
			<div class="top-bar__user">
				<span class="top-bar__username">{$currentUser.userId}</span>
			</div>
			<div class="top-bar__actions">
				{#if isAdmin}
					<button class="top-bar__btn" on:click={() => showAdminPanel = true} title="Admin Panel">⚙️</button>
				{/if}
				<button class="top-bar__btn" on:click={handleSettings} title="Settings">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="3"/>
						<path d="M12 1v6m0 6v6M5 5l4 4m6 6l4 4M1 12h6m6 0h6M5 19l4-4m6-6l4-4"/>
					</svg>
				</button>
				<button class="top-bar__btn" on:click={handleLogout} title="Logout">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
						<polyline points="16 17 21 12 16 7"/>
						<line x1="21" y1="12" x2="9" y2="12"/>
					</svg>
				</button>
			</div>
		</div>

		<!-- ── Mobile header ──────────────────────────────────────────────── -->
		<div class="mobile-header">
			{#if mobileTab === 'chat' && $currentRoomId}
				<button class="mobile-back" on:click={() => setTab('rooms')}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<polyline points="15 18 9 12 15 6"/>
					</svg>
				</button>
				<span class="mobile-title">{$currentRoom ? getRoomName($currentRoom) : 'Chat'}</span>
			{:else}
				<span class="mobile-wordmark">Darkroot</span>
			{/if}
			<div class="mobile-header-actions">
				{#if isAdmin}
					<button class="mobile-icon-btn" on:click={() => showAdminPanel = true} title="Admin">⚙️</button>
				{/if}
			</div>
		</div>

		<!-- ── Main layout ────────────────────────────────────────────────── -->
		<div class="chat-layout">

			<!-- Room list panel -->
			<div class="panel panel--rooms"
				class:panel--hidden={isMobile && mobileTab !== 'rooms'}
				class:panel--chat-active={isMobile && mobileTab === 'chat' && $currentRoomId}>
				<RoomList />
			</div>

			<!-- Chat panel -->
			<div class="panel panel--chat"
				class:panel--hidden={isMobile && mobileTab !== 'chat'}>
				<RoomView showLinks={!isMobile} />
			</div>

			<!-- Link feed panel (mobile only) -->
			{#if isMobile}
				<div class="panel panel--full" class:panel--hidden={mobileTab !== 'links'}>
					<div class="mobile-panel-header">Link Feed</div>
					<div class="mobile-links-wrap">
						<LinkSidebar visible={mobileTab === 'links'} />
					</div>
				</div>

				<!-- Online users panel (mobile only) -->
				<div class="panel panel--full" class:panel--hidden={mobileTab !== 'profile'}>
					<div class="profile-panel">
						<!-- Avatar -->
						<div class="profile-avatar">
							{$currentUser.userId.charAt(1).toUpperCase()}
						</div>
						<div class="profile-name">
							{$matrixClient?.getUser($currentUser.userId)?.displayName || $currentUser.userId.split(':')[0].substring(1)}
						</div>
						<div class="profile-id">{$currentUser.userId}</div>

						<!-- Online users -->
						<div class="online-section">
							<h3 class="online-section__title">Who's Online</h3>
							{#if onlineUsers.length === 0}
								<p class="online-empty">No other users found</p>
							{:else}
								<div class="online-list">
									{#each onlineUsers as user (user.userId)}
										<div class="online-user">
											<span class="presence-dot" class:is-online={user.presence === 'online'}></span>
											<span class="online-user__name">{user.displayName}</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Actions -->
						<div class="profile-actions">
							<button class="profile-btn" on:click={handleSettings}>Settings</button>
							{#if isAdmin}
								<button class="profile-btn" on:click={() => showAdminPanel = true}>Admin Panel</button>
							{/if}
							<button class="profile-btn profile-btn--danger" on:click={handleLogout}>Logout</button>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- ── Mobile bottom nav ──────────────────────────────────────────── -->
		<nav class="bottom-nav">
			<button class="nav-btn" class:nav-btn--active={mobileTab === 'chat'} on:click={() => setTab('chat')}>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
				</svg>
				<span>Chat</span>
			</button>
			<button class="nav-btn" class:nav-btn--active={mobileTab === 'rooms'} on:click={() => setTab('rooms')}>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
					<polyline points="9 22 9 12 15 12 15 22"/>
				</svg>
				<span>Rooms</span>
			</button>
			<button class="nav-btn" class:nav-btn--active={mobileTab === 'links'} on:click={() => setTab('links')}>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
					<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
				</svg>
				<span>Links</span>
			</button>
			<button class="nav-btn" class:nav-btn--active={mobileTab === 'profile'} on:click={() => setTab('profile')}>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
					<circle cx="12" cy="7" r="4"/>
				</svg>
				<span>Profile</span>
			</button>
		</nav>
	</div>

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

	/* ── Desktop top bar ── */
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

	.top-bar__btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-2);
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		cursor: pointer;
		font-size: var(--text-base);
		transition: all var(--transition-fast);
	}

	.top-bar__btn:hover {
		background: var(--bg-hover);
		color: var(--text-secondary);
		border-color: var(--accent-primary);
	}

	/* ── Mobile header ── */
	.mobile-header {
		display: none;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-3);
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border-default);
		flex-shrink: 0;
		height: 52px;
	}

	.mobile-back {
		background: none;
		border: none;
		color: var(--accent-primary-bright);
		cursor: pointer;
		display: flex;
		align-items: center;
		padding: var(--space-1);
		border-radius: var(--radius-sm);
	}

	.mobile-wordmark {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		color: var(--accent-primary-bright);
		letter-spacing: 0.05em;
		flex: 1;
	}

	.mobile-title {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text-primary);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mobile-header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
	}

	.mobile-icon-btn {
		background: none;
		border: none;
		font-size: var(--text-xl);
		cursor: pointer;
		padding: var(--space-1);
	}

	/* ── Main layout ── */
	.chat-layout {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	/* Desktop panels - transparent wrappers */
	.panel--rooms {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.panel--chat {
		display: flex;
		flex: 1;
		overflow: hidden;
		min-width: 0;
	}

	/* ── Bottom nav ── */
	.bottom-nav {
		display: none;
		background: var(--bg-surface);
		border-top: 1px solid var(--border-default);
		flex-shrink: 0;
	}

	.nav-btn {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: var(--space-2) 0;
		background: none;
		border: none;
		color: var(--text-dim);
		cursor: pointer;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		transition: color var(--transition-fast);
		padding-bottom: max(var(--space-2), env(safe-area-inset-bottom));
	}

	.nav-btn:hover,
	.nav-btn--active {
		color: var(--accent-primary-bright);
	}

	/* ── Mobile profile + online panel ── */
	.profile-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-6) var(--space-4);
		overflow-y: auto;
		width: 100%;
	}

	.profile-avatar {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		background: var(--accent-primary);
		color: var(--text-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		font-weight: 700;
		border: 2px solid var(--accent-primary-bright);
	}

	.profile-name {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--text-primary);
	}

	.profile-id {
		font-size: var(--text-xs);
		color: var(--text-dim);
		font-family: var(--font-mono);
	}

	.online-section {
		width: 100%;
		max-width: 320px;
	}

	.online-section__title {
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin: 0 0 var(--space-3) 0;
	}

	.online-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.online-user {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-surface);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
	}

	.presence-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-dim);
		flex-shrink: 0;
	}

	.presence-dot.is-online {
		background: var(--accent-primary-bright);
		box-shadow: 0 0 6px var(--accent-primary);
	}

	.online-user__name {
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	.online-empty {
		font-size: var(--text-sm);
		color: var(--text-dim);
		margin: 0;
	}

	.profile-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: 100%;
		max-width: 320px;
	}

	.profile-btn {
		padding: var(--space-3) var(--space-4);
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		text-align: center;
		transition: all var(--transition-fast);
	}

	.profile-btn:hover {
		background: var(--bg-hover);
		border-color: var(--accent-primary);
	}

	.profile-btn--danger {
		color: var(--status-live);
		border-color: rgba(211, 95, 95, 0.3);
	}

	.profile-btn--danger:hover {
		background: rgba(211, 95, 95, 0.1);
		border-color: var(--status-live);
	}

	/* ── Mobile link panel ── */
	.mobile-panel-header {
		padding: var(--space-3) var(--space-4);
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}

	.mobile-links-wrap {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.loading-container {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		color: var(--text-secondary);
	}

	/* ── Mobile overrides ── */
	@media (max-width: 768px) {
		.top-bar { display: none; }
		.mobile-header { display: flex; }
		.bottom-nav { display: flex; }

		.chat-layout {
			position: relative;
		}

		/* All panels fill the content area on mobile */
		.panel--rooms,
		.panel--chat,
		.panel--full {
			position: absolute;
			inset: 0;
			display: flex;
			flex-direction: column;
			width: 100%;
			overflow: hidden;
		}

		.panel--hidden {
			display: none;
		}
	}
</style>
