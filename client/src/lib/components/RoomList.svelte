<script lang="ts">
	import { rooms, currentRoomId } from '$lib/stores/matrix';
	import { setCurrentRoom, getRoomName, getLastMessagePreview, getUnreadCount } from '$lib/matrix/rooms';
	import { getClient } from '$lib/matrix/client';
	import CreateRoomModal from './CreateRoomModal.svelte';
	import type * as sdk from 'matrix-js-sdk';

	let showCreateModal = false;

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
		// Select the newly created room
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
		{#if $rooms.length === 0}
			<div class="room-list__empty">
				<p class="room-list__empty-text">No rooms yet</p>
			</div>
		{:else}
			{#each $rooms as room (room.roomId)}
				{@const isActive = $currentRoomId === room.roomId}
				{@const unreadCount = getUnreadCount(room)}
				{@const lastMessage = getLastMessagePreview(room)}
				{@const roomName = getRoomName(room)}
				{@const initial = getRoomInitial(room)}

				<button
					class="room-item"
					class:active={isActive}
					on:click={() => handleRoomClick(room.roomId)}
				>
					<!-- Avatar -->
					<div class="room-item__avatar">
						{initial}
					</div>

					<!-- Content -->
					<div class="room-item__content">
						<div class="room-item__name">{roomName}</div>
						<div class="room-item__preview">{lastMessage}</div>
					</div>

					<!-- Unread badge -->
					{#if unreadCount > 0}
						<div class="room-item__badge">
							{unreadCount}
						</div>
					{/if}
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
</style>
