<script lang="ts">
	import { onMount } from 'svelte';
	import { rooms, currentRoomId, matrixClient, userPresence } from '$lib/stores/matrix';
	import { listUsers, type MatrixUser } from '$lib/matrix/admin';
	import { setCurrentRoom, getRoomName, getLastMessagePreview, getUnreadCount, listPublicRooms, joinRoom } from '$lib/matrix/rooms';
	import CreateRoomModal from './CreateRoomModal.svelte';
	import { getRoomIcon } from '$lib/utils/roomIcons';
	import type * as sdk from 'matrix-js-sdk';
	import { fetchMediaUrl } from '$lib/utils/media';

	let showCreateModal = false;

	// Room avatar blob URLs (indexed by roomId, null if no Matrix avatar set)
	let roomAvatarUrls: Record<string, string | null> = {};
	const roomAvatarFetchStarted = new Set<string>(); // keyed by `${roomId}:${mxcUrl}`

	function ensureRoomAvatar(room: sdk.Room) {
		if (!$matrixClient) return;
		const mxcUrl = room.getMxcAvatarUrl() || '';
		const cacheKey = `${room.roomId}:${mxcUrl}`;
		if (roomAvatarFetchStarted.has(cacheKey)) return;
		roomAvatarFetchStarted.add(cacheKey);
		if (!mxcUrl) {
			roomAvatarUrls[room.roomId] = null;
			roomAvatarUrls = roomAvatarUrls;
			return;
		}
		fetchMediaUrl($matrixClient, mxcUrl, 40, 40, 'crop').then((blobUrl) => {
			roomAvatarUrls[room.roomId] = blobUrl;
			roomAvatarUrls = roomAvatarUrls;
		});
	}

	// Discoverable public rooms the user hasn't joined yet
	let discoverableRooms: { roomId: string; name: string; topic: string; numMembers: number }[] = [];
	let joiningRoomId: string | null = null;

	// Server users fetched from Synapse admin API (authoritative, same source as admin panel)
	let serverUsers: MatrixUser[] = [];

	async function refreshUsers() {
		if (!$matrixClient) return;
		try {
			const myId = $matrixClient.getUserId();
			const all = await listUsers();
			serverUsers = all.filter(u => !u.deactivated && u.name !== myId);
		} catch (err) {
			console.warn('Failed to load users:', err);
		}
	}

	// Load discoverable rooms on mount and when joined rooms change
	onMount(() => {
		loadDiscoverableRooms();
		refreshUsers();
	});

	$: if ($rooms) {
		loadDiscoverableRooms();
		refreshUsers();
		if ($matrixClient) {
			for (const room of $rooms) ensureRoomAvatar(room);
		}
	}

	async function loadDiscoverableRooms() {
		try {
			const publicRooms = await listPublicRooms();
			const joinedRoomIds = new Set($rooms.map((r) => r.roomId));
			discoverableRooms = publicRooms.filter((r) => !joinedRoomIds.has(r.roomId));
		} catch (err) {
			console.warn('Failed to load public rooms:', err);
			discoverableRooms = [];
		}
	}

	async function handleJoinRoom(roomId: string) {
		joiningRoomId = roomId;
		try {
			const room = await joinRoom(roomId);
			setCurrentRoom(room.roomId);
			// Refresh discoverable list
			await loadDiscoverableRooms();
		} catch (err: any) {
			console.error('Failed to join room:', err);
		} finally {
			joiningRoomId = null;
		}
	}

	function handleRoomClick(roomId: string) {
		setCurrentRoom(roomId);
	}

	function handleCreateRoom() {
		showCreateModal = true;
	}

	function handleRoomCreated(event: CustomEvent) {
		const { room } = event.detail;
		setCurrentRoom(room.roomId);
	}

	$: onlineUsers  = serverUsers.filter(u => ($userPresence[u.name] || 'offline') === 'online');
	$: offlineUsers = serverUsers.filter(u => ($userPresence[u.name] || 'offline') !== 'online');

	function getUserDisplayName(user: MatrixUser): string {
		return user.displayname || user.name.split(':')[0].substring(1);
	}
</script>

<div class="room-list">
	<!-- Header -->
	<div class="room-list__header">
		<h2 class="room-list__title">
			<span class="path-dim">darkroot.chat.</span>rooms
		</h2>
		<button class="room-list__add-button" on:click={handleCreateRoom} title="darkroot.chat.rooms.new">+</button>
	</div>

	<!-- Rooms -->
	<div class="room-list__rooms">
		{#if $rooms.length === 0 && discoverableRooms.length === 0}
			<div class="room-list__empty">
				<p class="room-list__empty-text">No rooms yet</p>
			</div>
		{/if}

		<!-- Joined + invited rooms -->
		{#each $rooms as room (room.roomId)}
			{@const isActive = $currentRoomId === room.roomId}
			{@const membership = room.getMyMembership()}
			{@const isInvited = membership === 'invite'}
			{@const unreadCount = getUnreadCount(room)}
			{@const lastMessage = getLastMessagePreview(room)}
			{@const roomName = getRoomName(room)}
			{@const memberCount = room.getJoinedMemberCount()}

			<button
				class="room-item"
				class:active={isActive}
				class:invited={isInvited}
				on:click={() => handleRoomClick(room.roomId)}
			>
				<div class="room-item__avatar">
					{#if roomAvatarUrls[room.roomId]}
						<img class="room-item__avatar-img" src={roomAvatarUrls[room.roomId]} alt={roomName} />
					{:else}
						{@html getRoomIcon(roomName)}
					{/if}
				</div>
				<div class="room-item__content">
					<div class="room-item__name">{roomName}</div>
					<div class="room-item__preview-row">
						<span class="room-item__preview">
							{#if isInvited}You have been invited{:else}{lastMessage}{/if}
						</span>
						{#if !isInvited}
							<span class="room-item__members" title="{memberCount} {memberCount === 1 ? 'member' : 'members'}">
								{memberCount}
							</span>
						{/if}
					</div>
				</div>
				{#if isInvited}
					<div class="room-item__invite-badge">Invited</div>
				{:else if unreadCount > 0}
					<div class="room-item__badge">
						{unreadCount}
					</div>
				{/if}
			</button>
		{/each}

		<!-- Discoverable public rooms (not yet joined) -->
		{#if discoverableRooms.length > 0}
			<div class="room-list__section-label">Available Rooms</div>
			{#each discoverableRooms as pubRoom (pubRoom.roomId)}
				<button
					class="room-item room-item--discover"
					on:click={() => handleJoinRoom(pubRoom.roomId)}
					disabled={joiningRoomId === pubRoom.roomId}
				>
					<div class="room-item__avatar room-item__avatar--discover">
						{@html getRoomIcon(pubRoom.name)}
					</div>
					<div class="room-item__content">
						<div class="room-item__name">{pubRoom.name}</div>
						<div class="room-item__preview">
							{#if joiningRoomId === pubRoom.roomId}
								Joining...
							{:else}
								{pubRoom.numMembers} member{pubRoom.numMembers !== 1 ? 's' : ''} · Click to join
							{/if}
						</div>
					</div>
				</button>
			{/each}
		{/if}
	</div>

	<!-- User List — darkroot.chat.users -->
	<div class="user-list">
		<div class="user-list__header">
			<span class="user-list__title"><span class="path-dim">darkroot.chat.</span>users</span>
			{#if onlineUsers.length > 0}
				<span class="user-list__online-count">{onlineUsers.length} online</span>
			{/if}
		</div>
		<div class="user-list__entries">
			{#if serverUsers.length === 0}
				<p class="user-list__empty">no souls detected</p>
			{:else}
				{#each onlineUsers as user (user.name)}
					<button class="user-item" title="Messages from Beyond — coming soon">
						<div class="user-item__avatar">
							<span class="user-item__initial">{getUserDisplayName(user).charAt(0).toUpperCase()}</span>
							<div class="user-item__presence user-item__presence--online"></div>
						</div>
						<span class="user-item__name">{getUserDisplayName(user)}</span>
					</button>
				{/each}
				{#each offlineUsers as user (user.name)}
					<button class="user-item user-item--offline" title="Messages from Beyond — coming soon">
						<div class="user-item__avatar">
							<span class="user-item__initial">{getUserDisplayName(user).charAt(0).toUpperCase()}</span>
							<div class="user-item__presence user-item__presence--offline"></div>
						</div>
						<span class="user-item__name">{getUserDisplayName(user)}</span>
					</button>
				{/each}
			{/if}
		</div>
	</div>
</div>

<!-- Create Room Modal -->
<CreateRoomModal bind:show={showCreateModal} on:created={handleRoomCreated} />

<style>
	.room-list {
		display: flex;
		flex-direction: column;
		width: 280px;
		background: var(--bg-elevated);
		border-right: 1px solid var(--border-default);
		overflow: hidden; /* inner sections handle their own scroll */
		flex-shrink: 0;
		height: 100%;
	}

	.room-list__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4);
		border-bottom: 1px solid var(--border-default);
		background: var(--bg-surface);
		flex-shrink: 0;
	}

	.room-list__title {
		font-size: 11px;
		font-weight: 600;
		color: var(--accent-primary-bright);
		font-family: var(--font-mono);
		letter-spacing: 0.02em;
		margin: 0;
	}

	/* Shared path-prefix dim style */
	:global(.path-dim) {
		color: var(--text-dim);
		opacity: 0.6;
	}

	.room-list__add-button {
		padding: var(--space-2);
		background: var(--accent-primary-dim);
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-sm);
		color: var(--accent-primary-bright);
		cursor: pointer;
		transition: all var(--transition-fast);
		font-size: var(--text-xl);
		line-height: 1;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.room-list__add-button:hover {
		background: var(--accent-primary);
		color: var(--text-primary);
		box-shadow: var(--shadow-glow-green);
	}

	.room-list__rooms {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2);
		overflow-y: auto;
		flex: 1;
	}

	.room-list__empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-6);
		color: var(--text-muted);
		text-align: center;
	}

	.room-list__empty-text {
		font-size: var(--text-sm);
		margin: 0;
	}

	.room-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all var(--transition-fast);
		border: 1px solid transparent;
		background: transparent;
		text-align: left;
		width: 100%;
	}

	.room-item:hover {
		background: var(--bg-hover);
		border-color: var(--border-default);
	}

	.room-item.active {
		background: var(--accent-primary-dim);
		border-color: var(--accent-primary);
		box-shadow: var(--shadow-glow-green);
	}

	.room-item__avatar {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-sm);
		background: var(--accent-primary-dim);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: var(--accent-primary-bright);
		flex-shrink: 0;
		font-size: var(--text-base);
		text-transform: uppercase;
	}

	/* Room avatar image (Matrix m.room.avatar) */
	.room-item__avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: var(--radius-sm);
		image-rendering: pixelated;
	}

	/* DS icon SVG sizing within the avatar square */
	.room-item__avatar :global(svg) {
		width: 22px;
		height: 22px;
		display: block;
	}

	/* Active room: shift avatar to gold to match the active name color */
	.room-item.active .room-item__avatar {
		color: var(--accent-gold-bright);
		background: rgba(150, 168, 92, 0.15);
		border-color: var(--accent-gold-soft);
	}

	.room-item__content {
		flex: 1;
		min-width: 0;
	}

	.room-item__name {
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: var(--text-sm);
	}

	.room-item.active .room-item__name {
		color: var(--accent-primary-bright);
	}

	.room-item__preview-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin-top: 2px;
		min-width: 0;
	}

	.room-item__preview {
		font-size: var(--text-xs);
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}

	.room-item__members {
		flex-shrink: 0;
		font-size: 10px;
		font-family: var(--font-mono);
		color: var(--text-dim);
		opacity: 0.7;
	}

	/* Invited rooms — gold tint */
	.room-item.invited {
		border-color: rgba(150, 168, 92, 0.25);
	}

	.room-item.invited .room-item__avatar {
		color: var(--accent-gold-bright);
		background: var(--accent-gold-dim);
		border-color: var(--accent-gold-soft, var(--accent-gold-dim));
	}

	.room-item.invited .room-item__name {
		color: var(--accent-gold-bright);
	}

	.room-item__invite-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 var(--space-2);
		height: 18px;
		background: var(--accent-gold-dim);
		color: var(--accent-gold-bright);
		border: 1px solid var(--accent-gold);
		border-radius: var(--radius-full);
		font-size: 9px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.room-item__badge {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 var(--space-2);
		background: var(--accent-gold);
		color: var(--text-inverse);
		border-radius: var(--radius-full);
		font-size: 10px;
		font-weight: 700;
		box-shadow: var(--shadow-glow-gold);
		flex-shrink: 0;
	}

	/* Discoverable rooms section */
	.room-list__section-label {
		padding: var(--space-3) var(--space-3) var(--space-1);
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
		border-top: 1px solid var(--border-subtle);
		margin-top: var(--space-2);
	}

	.room-item--discover {
		opacity: 0.7;
		border: 1px dashed var(--border-default);
	}

	.room-item--discover:hover {
		opacity: 1;
		border-color: var(--accent-primary);
		background: rgba(74, 124, 89, 0.08);
	}

	.room-item__avatar--discover {
		background: var(--bg-surface);
		color: var(--text-muted);
		border: 1px dashed var(--border-default);
	}

	.room-item--discover:hover .room-item__avatar--discover {
		background: var(--accent-primary-dim);
		color: var(--accent-primary-bright);
		border-color: var(--accent-primary);
	}

	/* ── User List (darkroot.users) ── */
	.user-list {
		flex-shrink: 0;
		border-top: 1px solid var(--border-default);
		background: var(--bg-surface);
		display: flex;
		flex-direction: column;
		max-height: 180px;
	}

	.user-list__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3) var(--space-1);
		flex-shrink: 0;
	}

	.user-list__title {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-dim);
		font-family: var(--font-mono);
	}

	.user-list__online-count {
		background: rgba(74, 222, 128, 0.12);
		color: #4ade80;
		border: 1px solid rgba(74, 222, 128, 0.25);
		font-size: 9px;
		padding: 0 5px;
		border-radius: var(--radius-full);
		font-weight: 700;
		font-family: var(--font-mono);
	}

	.user-list__entries {
		overflow-y: auto;
		padding: 0 var(--space-2) var(--space-2);
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.user-list__empty {
		font-size: var(--text-xs);
		color: var(--text-dim);
		font-style: italic;
		padding: var(--space-1) var(--space-2);
		margin: 0;
	}

	.user-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: background var(--transition-fast);
		background: transparent;
		border: none;
		text-align: left;
		width: 100%;
	}

	.user-item:hover {
		background: var(--bg-hover);
	}

	.user-item--offline {
		opacity: 0.4;
	}

	.user-item__avatar {
		width: 24px;
		height: 24px;
		min-width: 24px;
		border-radius: var(--radius-full);
		background: var(--accent-primary-dim);
		border: 1px solid rgba(79, 138, 97, 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		flex-shrink: 0;
	}

	.user-item--offline .user-item__avatar {
		background: var(--bg-elevated);
		border-color: var(--border-subtle);
	}

	.user-item__initial {
		font-size: 10px;
		font-weight: 700;
		color: var(--accent-primary-bright);
		line-height: 1;
	}

	.user-item--offline .user-item__initial {
		color: var(--text-dim);
	}

	.user-item__presence {
		position: absolute;
		bottom: -1px;
		right: -1px;
		width: 7px;
		height: 7px;
		border-radius: var(--radius-full);
		border: 1.5px solid var(--bg-surface);
	}

	.user-item__presence--online  { background: #4ade80; }
	.user-item__presence--offline { background: #4b5563; }

	.user-item__name {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}

	.user-item:hover .user-item__name {
		color: var(--text-primary);
	}

	.user-item--offline .user-item__name {
		color: var(--text-dim);
	}
</style>
