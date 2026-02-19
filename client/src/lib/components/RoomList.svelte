<script lang="ts">
	import { onMount } from 'svelte';
	import { rooms, currentRoomId, matrixClient } from '$lib/stores/matrix';
	import { setCurrentRoom, getRoomName, getLastMessagePreview, getUnreadCount, listPublicRooms, joinRoom } from '$lib/matrix/rooms';
	import { getClient } from '$lib/matrix/client';
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

	// Load discoverable rooms on mount and when joined rooms change
	onMount(() => {
		loadDiscoverableRooms();
	});

	$: if ($rooms) {
		loadDiscoverableRooms();
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

	function getRoomInitial(room: sdk.Room): string {
		const name = getRoomName(room);
		return name.charAt(0).toUpperCase();
	}

	function handleCreateRoom() {
		showCreateModal = true;
	}

	function handleRoomCreated(event: CustomEvent) {
		const { room } = event.detail;
		setCurrentRoom(room.roomId);
	}
</script>

<div class="room-list">
	<!-- Header -->
	<div class="room-list__header">
		<h2 class="room-list__title">Darkroot</h2>
		<button class="room-list__add-button" on:click={handleCreateRoom} title="Create Room">+</button>
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
			{@const initial = getRoomInitial(room)}

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
					<div class="room-item__preview">
						{#if isInvited}You have been invited{:else}{lastMessage}{/if}
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
		overflow-y: auto;
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
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--accent-primary-bright);
		font-family: var(--font-display);
		margin: 0;
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

	.room-item__preview {
		font-size: var(--text-xs);
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 2px;
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
</style>
