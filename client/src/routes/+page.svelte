<script lang="ts">
	import { onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { isLoggedIn, currentUser, currentRoom, currentRoomId, rooms, userPresence, matrixClient, syncState, highlightedLink } from '$lib/stores/matrix';
	import { logout } from '$lib/matrix/client';
	import { goto } from '$app/navigation';
	import { isServerAdmin } from '$lib/matrix/admin';
	import { getRoomName, ensureGeneralRoom, setCurrentRoom } from '$lib/matrix/rooms';
	import RoomList from '$lib/components/RoomList.svelte';
	import RoomView from '$lib/components/RoomView.svelte';
	import AdminPanel from '$lib/components/AdminPanel.svelte';
	import LinkSidebar from '$lib/components/LinkSidebar.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';

	let showAdminPanel = false;
	let isAdmin = false;

	// Mobile layout state
	type MobileTab = 'chat' | 'rooms' | 'profile';
	let mobileTab: MobileTab = 'rooms';
	let isMobile = false;
	let linksDrawerOpen = false;

	// Auto-switch to chat view when a room is selected on mobile
	$: if ($currentRoomId && isMobile) mobileTab = 'chat';

	// Badge tap in chat → open links drawer on mobile
	$: if ($highlightedLink?.from === 'chat' && isMobile) linksDrawerOpen = true;

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

	// Auto-resume: restore last used room (or default to The Bonfire) after sync
	let resumeAttempted = false;
	$: if ($syncState === 'PREPARED' && $isLoggedIn && $rooms.length > 0 && !resumeAttempted) {
		resumeAttempted = true;
		autoResumeRoom();
	}

	// Persist the active room so we can restore it on next login
	$: if ($currentRoomId) {
		try { localStorage.setItem('darkroot_lastRoomId', $currentRoomId); } catch {}
	}

	function autoResumeRoom() {
		if ($currentRoomId) return; // already selected (e.g. URL deep-link)
		// 1. Resume last used room if still joined
		try {
			const lastId = localStorage.getItem('darkroot_lastRoomId');
			if (lastId && $rooms.find(r => r.roomId === lastId)) {
				setCurrentRoom(lastId);
				return;
			}
		} catch {}
		// 2. Fallback: The Bonfire
		const bonfire = $rooms.find(r => /bonfire/i.test(r.name));
		if (bonfire) setCurrentRoom(bonfire.roomId);
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
			<!-- Left: wordmark -->
			<div class="top-bar__brand">
				<img src="/emoji/bonfire.png" alt="" class="top-bar__brand-icon" aria-hidden="true" />
				<span class="top-bar__wordmark">Darkroot</span>
			</div>
			<!-- Right: display name + actions -->
			<div class="top-bar__right">
				<span class="top-bar__username">
					{$matrixClient?.getUser($currentUser.userId)?.displayName || $currentUser.userId.split(':')[0].substring(1)}
				</span>
				<div class="top-bar__actions">
					{#if isAdmin}
						<button class="top-bar__btn" on:click={() => showAdminPanel = true} title="Admin Panel">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<circle cx="12" cy="12" r="3"/>
								<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
							</svg>
						</button>
					{/if}
					<button class="top-bar__btn" on:click={handleSettings} title="Settings">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="3"/>
							<path d="M12 1v6m0 6v6M5 5l4 4m6 6l4 4M1 12h6m6 0h6M5 19l4-4m6-6l4-4"/>
						</svg>
					</button>
					<button class="top-bar__btn" on:click={handleLogout} title="Logout">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
							<polyline points="16 17 21 12 16 7"/>
							<line x1="21" y1="12" x2="9" y2="12"/>
						</svg>
					</button>
				</div>
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
				<div class="mobile-brand">
				<img src="/emoji/bonfire.png" alt="" class="mobile-brand__icon" aria-hidden="true" />
				<span class="mobile-brand__wordmark">Darkroot</span>
			</div>
			{/if}
			<div class="mobile-header-actions">
				<button class="mobile-icon-btn" on:click={() => linksDrawerOpen = true} title="Link Feed" aria-label="Open Link Feed">
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
					</svg>
				</button>
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

			<!-- Online users panel (mobile only) -->
			{#if isMobile}
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

		<!-- ── Link feed drawer (mobile) ─────────────────────────────────── -->
		{#if isMobile && linksDrawerOpen}
			<div
				class="links-backdrop"
				on:click={() => linksDrawerOpen = false}
				on:keydown={(e) => e.key === 'Escape' && (linksDrawerOpen = false)}
				role="presentation"
				transition:fade={{ duration: 200 }}
			></div>
			<div
				class="links-drawer"
				transition:fly={{ x: 340, duration: 280, easing: cubicOut }}
			>
				<div class="links-drawer__header">
					<span class="links-drawer__title">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
						Link Feed
					</span>
					<button class="links-drawer__close" on:click={() => linksDrawerOpen = false} aria-label="Close">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</button>
				</div>
				<div class="links-drawer__body">
					<LinkSidebar visible={true} />
				</div>
			</div>
		{/if}

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
		padding: 0 var(--space-4);
		background: var(--bg-deepest);
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
		height: 48px;
	}

	.top-bar__brand {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.top-bar__brand-icon {
		width: 16px;
		height: 16px;
		image-rendering: pixelated;
		opacity: 0.82;
		filter:
			drop-shadow(0 0 3px rgba(200, 216, 128, 0.55))
			drop-shadow(0 0 7px rgba(150, 168, 92, 0.30));
	}

	.top-bar__wordmark {
		font-family: var(--font-display);
		font-size: 11px;
		font-variant: small-caps;
		letter-spacing: 0.22em;
		text-transform: lowercase;
		color: var(--accent-gold);
		user-select: none;
	}

	.top-bar__right {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.top-bar__username {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-dim);
		letter-spacing: 0.03em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 200px;
	}

	.top-bar__actions {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.top-bar__btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-dim);
		cursor: pointer;
		transition: color var(--transition-base), background var(--transition-base);
	}

	.top-bar__btn:hover {
		color: var(--accent-primary-bright);
		background: rgba(79, 138, 97, 0.08);
	}

	.top-bar__btn:active {
		background: rgba(79, 138, 97, 0.14);
	}

	/* ── Mobile header ── */
	.mobile-header {
		display: none;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-3);
		background: var(--bg-deepest);
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
		height: 48px;
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

	.mobile-brand {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
	}

	.mobile-brand__icon {
		width: 16px;
		height: 16px;
		image-rendering: pixelated;
		opacity: 0.82;
		filter:
			drop-shadow(0 0 3px rgba(200, 216, 128, 0.55))
			drop-shadow(0 0 7px rgba(150, 168, 92, 0.30));
	}

	.mobile-brand__wordmark {
		font-family: var(--font-display);
		font-size: 11px;
		font-variant: small-caps;
		letter-spacing: 0.22em;
		text-transform: lowercase;
		color: var(--accent-gold);
		user-select: none;
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
		color: var(--accent-primary-bright);
		display: flex;
		align-items: center;
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

	/* ── Link feed drawer (mobile) ── */
	.links-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(2px);
		z-index: 200;
	}

	.links-drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 88vw;
		max-width: 360px;
		background: var(--bg-surface);
		border-left: 1px solid var(--border-default);
		box-shadow: -8px 0 32px rgba(0, 0, 0, 0.4);
		z-index: 201;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.links-drawer__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
		background: var(--bg-elevated);
		border-bottom: 1px solid var(--border-default);
		flex-shrink: 0;
		min-height: 52px;
	}

	.links-drawer__title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-display);
		font-size: 13px;
		font-weight: 700;
		color: var(--text-primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.links-drawer__close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
		flex-shrink: 0;
	}

	.links-drawer__close:hover {
		background: var(--bg-hover);
		border-color: var(--accent-primary);
		color: var(--text-primary);
	}

	.links-drawer__body {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	/* Make LinkSidebar fill the full drawer width */
	.links-drawer__body :global(.link-feed) {
		width: 100%;
		min-width: 0;
		border-left: none;
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
