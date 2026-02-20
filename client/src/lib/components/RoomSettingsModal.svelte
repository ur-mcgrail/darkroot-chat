<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type * as sdk from 'matrix-js-sdk';
	import { matrixClient } from '$lib/stores/matrix';
	import { isServerAdmin, listUsers } from '$lib/matrix/admin';
	import {
		setRoomName,
		setRoomTopic,
		setRoomJoinRules,
		inviteUser,
		kickUser,
		getRoomJoinRule,
		canEditRoom,
		setRoomAvatarFromUrl,
		clearRoomAvatar,
		inviteAllServerUsersToRoom,
	} from '$lib/matrix/rooms';
	import { DARKROOT_REACTIONS } from '$lib/matrix/reactions';
	import { getRoomIcon } from '$lib/utils/roomIcons';
	import { fetchMediaUrl } from '$lib/utils/media';

	export let show = false;
	export let room: sdk.Room | null = null;

	const dispatch = createEventDispatcher();

	type Tab = 'general' | 'members';
	let activeTab: Tab = 'general';

	// General tab state
	let editName = '';
	let editTopic = '';
	let editJoinRule: 'public' | 'invite' = 'public';
	let saving = false;
	let saveError = '';
	let saveSuccess = false;

	// Icon tab state
	let selectedIconImage: string | null = null; // '/emoji/bonfire.png' or 'default' or null
	let applyingIcon = false;
	let iconError = '';
	let iconSuccess = false;
	let currentAvatarBlobUrl: string | null = null;

	// Members tab state
	let members: { userId: string; displayName: string; powerLevel: number }[] = [];
	let allUsers: { name: string; displayname: string | null }[] = [];
	let inviteSearch = '';
	let inviting = false;
	let inviteError = '';
	let kickingUserId = '';

	// Invite-all state
	let inviteAllRunning = false;
	let inviteAllProgress: { attempted: number; total: number } | null = null;
	let inviteAllResult: { invited: number; failed: string[] } | null = null;

	// Permission check
	let canEdit = false;
	let myUserId = '';

	$: client = $matrixClient;

	$: if (show && room) {
		initModal();
	}

	async function initModal() {
		if (!room || !client) return;

		myUserId = client.getUserId() || '';
		canEdit = canEditRoom(room, myUserId);

		// Load general tab values
		editName = room.name || '';
		// Load current room avatar
		const mxcUrl = room.getMxcAvatarUrl() || '';
		if (mxcUrl && client) {
			fetchMediaUrl(client, mxcUrl, 48, 48, 'crop').then(url => { currentAvatarBlobUrl = url; });
		} else {
			currentAvatarBlobUrl = null;
		}
		selectedIconImage = null;
		iconError = '';
		iconSuccess = false;
		const topicEvent = room.currentState.getStateEvents('m.room.topic', '');
		editTopic = topicEvent?.getContent()?.topic || '';
		editJoinRule = getRoomJoinRule(room);

		// Load members
		loadMembers();

		// If can edit, also fetch all users for invite dropdown
		if (canEdit) {
			try {
				allUsers = await listUsers();
			} catch {
				allUsers = [];
			}
		}
	}

	function loadMembers() {
		if (!room) return;
		members = room.getJoinedMembers().map(m => ({
			userId: m.userId,
			displayName: m.name || m.userId.split(':')[0].substring(1),
			powerLevel: m.powerLevel ?? 0,
		})).sort((a, b) => b.powerLevel - a.powerLevel || a.displayName.localeCompare(b.displayName));
	}

	async function handleSave() {
		if (!room) return;
		saving = true;
		saveError = '';
		saveSuccess = false;

		try {
			const currentName = room.name || '';
			const topicEvent = room.currentState.getStateEvents('m.room.topic', '');
			const currentTopic = topicEvent?.getContent()?.topic || '';
			const currentJoinRule = getRoomJoinRule(room);

			if (editName.trim() && editName.trim() !== currentName) {
				await setRoomName(room.roomId, editName.trim());
			}
			if (editTopic !== currentTopic) {
				await setRoomTopic(room.roomId, editTopic);
			}
			if (editJoinRule !== currentJoinRule) {
				await setRoomJoinRules(room.roomId, editJoinRule);
			}

			saveSuccess = true;
			setTimeout(() => { saveSuccess = false; }, 3000);
		} catch (err: any) {
			saveError = err.message || 'Failed to save changes.';
		} finally {
			saving = false;
		}
	}

	async function handleKick(userId: string) {
		if (!room) return;
		kickingUserId = userId;
		try {
			await kickUser(room.roomId, userId);
			loadMembers();
		} catch (err: any) {
			console.error('Kick failed:', err);
		} finally {
			kickingUserId = '';
		}
	}

	async function handleInvite(userId: string) {
		if (!room) return;
		inviting = true;
		inviteError = '';
		try {
			await inviteUser(room.roomId, userId);
			inviteSearch = '';
			// Refresh member list
			setTimeout(loadMembers, 500);
		} catch (err: any) {
			inviteError = err.message || 'Failed to invite user.';
		} finally {
			inviting = false;
		}
	}

	async function handleInviteAll() {
		if (!room) return;
		inviteAllRunning = true;
		inviteAllProgress = null;
		inviteAllResult = null;
		try {
			const result = await inviteAllServerUsersToRoom(room.roomId, (attempted, total) => {
				inviteAllProgress = { attempted, total };
			});
			inviteAllResult = result;
			// Refresh member list after a short delay
			setTimeout(loadMembers, 800);
		} catch (err: any) {
			inviteAllResult = { invited: 0, failed: [err.message || 'Unknown error'] };
		} finally {
			inviteAllRunning = false;
			inviteAllProgress = null;
		}
	}

	// Filter users for invite: only non-joined, matching search
	$: joinedIds = new Set(members.map(m => m.userId));
	$: filteredUsers = allUsers.filter(u =>
		!joinedIds.has(u.name) &&
		u.name !== myUserId &&
		(inviteSearch === '' ||
			u.name.toLowerCase().includes(inviteSearch.toLowerCase()) ||
			(u.displayname || '').toLowerCase().includes(inviteSearch.toLowerCase()))
	);

	async function handleApplyIcon() {
		if (!room) return;
		applyingIcon = true;
		iconError = '';
		iconSuccess = false;
		try {
			if (selectedIconImage === 'default') {
				await clearRoomAvatar(room.roomId);
				currentAvatarBlobUrl = null;
			} else if (selectedIconImage) {
				await setRoomAvatarFromUrl(room.roomId, selectedIconImage);
				// Brief delay then re-fetch to reflect new avatar
				await new Promise(r => setTimeout(r, 600));
				const updatedMxc = client?.getRoom(room.roomId)?.getMxcAvatarUrl() || '';
				if (updatedMxc && client) {
					currentAvatarBlobUrl = await fetchMediaUrl(client, updatedMxc, 48, 48, 'crop');
				}
			}
			iconSuccess = true;
			selectedIconImage = null;
			setTimeout(() => { iconSuccess = false; }, 3000);
		} catch (err: any) {
			iconError = err.message || 'Failed to apply icon.';
		} finally {
			applyingIcon = false;
		}
	}

	function handleClose() {
		show = false;
		activeTab = 'general';
		saveError = '';
		saveSuccess = false;
		inviteError = '';
		inviteSearch = '';
		dispatch('close');
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') handleClose();
	}
</script>

{#if show && room}
	<div class="modal-overlay" on:click={handleClose} on:keydown={handleKeyDown} role="presentation">
		<div class="modal-content" on:click|stopPropagation role="dialog" aria-modal="true" aria-label="Room Settings">
			<!-- Header -->
			<div class="modal-header">
				<h2><span class="path-dim">darkroot.chat.rooms.</span>settings</h2>
				<button class="close-btn" on:click={handleClose} aria-label="Close">×</button>
			</div>

			<!-- Tabs -->
			<div class="tabs">
				<button
					class="tab-btn"
					class:active={activeTab === 'general'}
					on:click={() => activeTab = 'general'}
				>
					General
				</button>
				<button
					class="tab-btn"
					class:active={activeTab === 'members'}
					on:click={() => activeTab = 'members'}
				>
					Members ({members.length})
				</button>
			</div>

			<!-- Tab Content -->
			<div class="tab-content">

				<!-- ── General Tab ── -->
				{#if activeTab === 'general'}
					<div class="section">
						<div class="form-group">
							<label>Room Name</label>
							{#if canEdit}
								<input
									type="text"
									class="input"
									bind:value={editName}
									placeholder="Room name"
									disabled={saving}
								/>
							{:else}
								<p class="read-only">{editName || 'Unnamed Room'}</p>
							{/if}
						</div>

						<div class="form-group">
							<label>Topic / Description</label>
							{#if canEdit}
								<textarea
									class="input textarea"
									bind:value={editTopic}
									placeholder="What's this room about?"
									disabled={saving}
									rows="3"
								></textarea>
							{:else}
								<p class="read-only">{editTopic || 'No topic set.'}</p>
							{/if}
						</div>

						<div class="form-group">
							<label>Visibility</label>
							{#if canEdit}
								<div class="visibility-toggle">
									<button
										type="button"
										class="visibility-btn"
										class:active={editJoinRule === 'public'}
										on:click={() => editJoinRule = 'public'}
										disabled={saving}
									>
										🌐 Public
									</button>
									<button
										type="button"
										class="visibility-btn"
										class:active={editJoinRule === 'invite'}
										on:click={() => editJoinRule = 'invite'}
										disabled={saving}
									>
										🔒 Private
									</button>
								</div>
								<p class="field-hint">
									{#if editJoinRule === 'public'}
										Discoverable by everyone — anyone can join freely.
									{:else}
										Hidden from room directory — invite only.
									{/if}
								</p>
							{:else}
								<p class="read-only">
									{editJoinRule === 'public' ? '🌐 Public' : '🔒 Private'}
								</p>
							{/if}
						</div>

						<!-- Room Icon Picker -->
						<div class="form-group">
							<label>Room Icon</label>
							<div class="icon-preview-row">
								<div class="icon-preview">
									{#if selectedIconImage === 'default'}
										{@html getRoomIcon(editName || room.name || '')}
									{:else if selectedIconImage}
										<img src={selectedIconImage} alt="Selected icon" class="icon-preview__img" />
									{:else if currentAvatarBlobUrl}
										<img src={currentAvatarBlobUrl} alt="Room icon" class="icon-preview__img" />
									{:else}
										{@html getRoomIcon(editName || room.name || '')}
									{/if}
								</div>
								<p class="icon-preview__label">
									{#if selectedIconImage === 'default'}
										Auto-assigned (will reset on apply)
									{:else if selectedIconImage}
										{DARKROOT_REACTIONS.find(r => r.image === selectedIconImage)?.title ?? 'Selected'}
									{:else if currentAvatarBlobUrl}
										Custom icon set
									{:else}
										Auto-assigned
									{/if}
								</p>
							</div>
							{#if canEdit}
								<div class="icon-picker">
									<button
										class="icon-picker__option"
										class:selected={selectedIconImage === 'default'}
										on:click={() => selectedIconImage = 'default'}
										title="Reset to auto-assigned icon"
									>
										<div class="icon-picker__option-svg">
											{@html getRoomIcon(editName || room.name || '')}
										</div>
										<span class="icon-picker__option-label">Default</span>
									</button>
									{#each DARKROOT_REACTIONS as reaction}
										<button
											class="icon-picker__option"
											class:selected={selectedIconImage === reaction.image}
											on:click={() => selectedIconImage = reaction.image}
											title={reaction.title}
										>
											<img src={reaction.image} alt={reaction.label} class="icon-picker__option-img" />
											<span class="icon-picker__option-label">{reaction.label}</span>
										</button>
									{/each}
								</div>
								{#if iconError}
									<p class="save-error">⚠️ {iconError}</p>
								{/if}
								{#if iconSuccess}
									<p class="save-success">✓ Icon applied</p>
								{/if}
								{#if selectedIconImage !== null}
									<button class="btn-apply-icon" on:click={handleApplyIcon} disabled={applyingIcon}>
										{applyingIcon ? 'Applying…' : 'Apply Icon'}
									</button>
								{/if}
							{/if}
						</div>

						{#if canEdit}
							<div class="save-row">
								{#if saveError}
									<p class="save-error">⚠️ {saveError}</p>
								{/if}
								{#if saveSuccess}
									<p class="save-success">✓ Saved</p>
								{/if}
								<button class="btn-primary" on:click={handleSave} disabled={saving}>
									{saving ? 'Saving…' : 'Save Changes'}
								</button>
							</div>
						{/if}
					</div>
				{/if}

				<!-- ── Members Tab ── -->
				{#if activeTab === 'members'}
					<div class="section members-section">
						<!-- Member list -->
						<div class="member-list">
							{#each members as member (member.userId)}
								<div class="member-row">
									<div class="member-avatar">
										{member.displayName.charAt(0).toUpperCase()}
									</div>
									<div class="member-info">
										<span class="member-name">{member.displayName}</span>
										<span class="member-id">{member.userId}</span>
									</div>
									{#if member.powerLevel >= 100}
										<span class="member-badge">Admin</span>
									{/if}
									{#if canEdit && member.userId !== myUserId}
										<button
											class="kick-btn"
											on:click={() => handleKick(member.userId)}
											disabled={kickingUserId === member.userId}
											title="Kick {member.displayName}"
										>
											{kickingUserId === member.userId ? '…' : 'Kick'}
										</button>
									{/if}
								</div>
							{/each}
						</div>

						<!-- Invite section -->
						{#if canEdit}
							<div class="invite-section">
								<h3 class="invite-title">Invite User</h3>
								<input
									type="text"
									class="input"
									bind:value={inviteSearch}
									placeholder="Search by name or Matrix ID…"
									disabled={inviting}
								/>
								{#if inviteError}
									<p class="save-error">⚠️ {inviteError}</p>
								{/if}
								{#if filteredUsers.length > 0}
									<div class="user-dropdown">
										{#each filteredUsers.slice(0, 8) as user (user.name)}
											<button
												class="user-option"
												on:click={() => handleInvite(user.name)}
												disabled={inviting}
											>
												<span class="user-option__avatar">
													{(user.displayname || user.name).charAt(user.displayname ? 0 : 1).toUpperCase()}
												</span>
												<span class="user-option__info">
													<span class="user-option__display">{user.displayname || user.name.split(':')[0].substring(1)}</span>
													<span class="user-option__id">{user.name}</span>
												</span>
											</button>
										{/each}
									</div>
								{:else if inviteSearch && filteredUsers.length === 0}
									<p class="no-results">No users found matching "{inviteSearch}"</p>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Invite all -->
					<div class="invite-all-section">
						<div class="invite-all-row">
							<div class="invite-all-info">
								<span class="invite-all-label">Invite All Server Users</span>
								<span class="invite-all-hint">Invite every active account on the server that hasn’t joined yet</span>
							</div>
							<button
								class="btn-invite-all"
								on:click={handleInviteAll}
								disabled={inviteAllRunning}
							>
								{#if inviteAllRunning}
									{#if inviteAllProgress}
										{inviteAllProgress.attempted}/{inviteAllProgress.total}
									{:else}
										Loading…
									{/if}
								{:else}
									Invite All
								{/if}
							</button>
						</div>
						{#if inviteAllResult}
							<p class="invite-all-result">
								{#if inviteAllResult.invited > 0}
									✓ Invited {inviteAllResult.invited} user{inviteAllResult.invited !== 1 ? 's' : ''}
								{/if}
								{#if inviteAllResult.failed.length > 0}
									<span class="invite-all-failed">· {inviteAllResult.failed.length} failed</span>
								{/if}
								{#if inviteAllResult.invited === 0 && inviteAllResult.failed.length === 0}
									Everyone is already here
								{/if}
							</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: var(--bg-elevated);
		border-radius: var(--radius-lg);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		width: 90%;
		max-width: 520px;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border-default);
		overflow: hidden;
	}

	/* Header */
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-5);
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 12px;
		font-family: var(--font-mono);
		letter-spacing: 0.02em;
		color: var(--accent-primary-bright);
	}

	.modal-header h2 :global(.path-dim) {
		color: var(--text-dim);
		opacity: 0.6;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 2rem;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		transition: all var(--transition-fast);
	}

	.close-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	/* Tabs */
	.tabs {
		display: flex;
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}

	.tab-btn {
		flex: 1;
		padding: var(--space-3) var(--space-4);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-fast);
		margin-bottom: -1px;
	}

	.tab-btn.active {
		color: var(--accent-primary-bright);
		border-bottom-color: var(--accent-primary-bright);
	}

	.tab-btn:hover:not(.active) {
		color: var(--text-secondary);
	}

	/* Content */
	.tab-content {
		flex: 1;
		overflow-y: auto;
	}

	.section {
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* Form */
	.form-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.form-group label {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
	}

	.input {
		padding: var(--space-3);
		background: var(--bg-base);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-family: var(--font-body);
		transition: all var(--transition-fast);
	}

	.input:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: var(--shadow-glow-green);
	}

	.input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.textarea {
		resize: vertical;
		min-height: 72px;
	}

	.read-only {
		margin: 0;
		padding: var(--space-3);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: var(--text-sm);
	}

	.field-hint {
		margin: var(--space-1) 0 0 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
		font-style: italic;
	}

	/* Visibility toggle */
	.visibility-toggle {
		display: flex;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.visibility-btn {
		flex: 1;
		padding: var(--space-3);
		background: var(--bg-base);
		border: none;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.visibility-btn:first-child {
		border-right: 1px solid var(--border-default);
	}

	.visibility-btn.active {
		background: var(--accent-primary-dim);
		color: var(--accent-primary-bright);
		font-weight: 600;
	}

	.visibility-btn:hover:not(:disabled):not(.active) {
		background: var(--bg-hover);
		color: var(--text-secondary);
	}

	.visibility-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Save row */
	.save-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-3);
	}

	.save-error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--status-live);
		flex: 1;
	}

	.save-success {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--accent-primary-bright);
		flex: 1;
	}

	.btn-primary {
		padding: var(--space-3) var(--space-5);
		background: var(--accent-primary);
		border: 1px solid var(--accent-primary-bright);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-primary-bright);
		box-shadow: var(--shadow-glow-green);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Members */
	.members-section {
		gap: var(--space-5);
	}

	.member-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.member-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	.member-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--accent-primary-dim);
		color: var(--accent-primary-bright);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: var(--text-sm);
		flex-shrink: 0;
	}

	.member-info {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}

	.member-name {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.member-id {
		font-size: var(--text-xs);
		color: var(--text-dim);
		font-family: var(--font-mono);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.member-badge {
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--accent-primary-bright);
		background: var(--accent-primary-dim);
		padding: 2px 8px;
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	.kick-btn {
		padding: var(--space-1) var(--space-3);
		background: transparent;
		border: 1px solid rgba(211, 95, 95, 0.4);
		border-radius: var(--radius-sm);
		color: var(--status-live);
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-fast);
		flex-shrink: 0;
	}

	.kick-btn:hover:not(:disabled) {
		background: rgba(211, 95, 95, 0.1);
		border-color: var(--status-live);
	}

	.kick-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Invite section */
	.invite-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
	}

	.invite-title {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.user-dropdown {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.user-option {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
		background: var(--bg-base);
		border: none;
		border-bottom: 1px solid var(--border-subtle);
		cursor: pointer;
		text-align: left;
		transition: background var(--transition-fast);
		width: 100%;
	}

	.user-option:last-child {
		border-bottom: none;
	}

	.user-option:hover:not(:disabled) {
		background: var(--bg-hover);
	}

	.user-option:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.user-option__avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--accent-primary-dim);
		color: var(--accent-primary-bright);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: var(--text-xs);
		flex-shrink: 0;
	}

	.user-option__info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.user-option__display {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-primary);
	}

	.user-option__id {
		font-size: var(--text-xs);
		color: var(--text-dim);
		font-family: var(--font-mono);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.no-results {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-dim);
		font-style: italic;
		text-align: center;
		padding: var(--space-3);
	}

	/* ── Icon Picker ── */
	.icon-preview-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.icon-preview {
		width: 48px;
		height: 48px;
		border-radius: var(--radius-sm);
		background: var(--accent-primary-dim);
		border: 1px solid var(--border-default);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent-primary-bright);
		flex-shrink: 0;
		overflow: hidden;
	}

	.icon-preview :global(svg) {
		width: 28px;
		height: 28px;
	}

	.icon-preview__img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		image-rendering: pixelated;
	}

	.icon-preview__label {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
		font-style: italic;
	}

	.icon-picker {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	.icon-picker__option {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: var(--space-2);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
		width: 56px;
	}

	.icon-picker__option:hover {
		background: var(--bg-hover);
		border-color: var(--border-default);
	}

	.icon-picker__option.selected {
		background: var(--accent-primary-dim);
		border-color: var(--accent-primary);
		box-shadow: 0 0 0 1px var(--accent-primary);
	}

	.icon-picker__option-img {
		width: 28px;
		height: 28px;
		object-fit: contain;
		image-rendering: pixelated;
	}

	.icon-picker__option-svg {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--accent-primary-bright);
	}

	.icon-picker__option-svg :global(svg) {
		width: 22px;
		height: 22px;
	}

	.icon-picker__option-label {
		font-size: 9px;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.4px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 52px;
		text-align: center;
	}

	.icon-picker__option.selected .icon-picker__option-label {
		color: var(--accent-primary-bright);
	}

	.btn-apply-icon {
		padding: var(--space-2) var(--space-4);
		background: var(--accent-gold-dim);
		border: 1px solid var(--accent-gold);
		border-radius: var(--radius-md);
		color: var(--accent-gold-bright);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
		align-self: flex-start;
	}

	.btn-apply-icon:hover:not(:disabled) {
		background: var(--accent-gold);
		color: var(--bg-deepest);
		box-shadow: var(--shadow-glow-gold);
	}

	.btn-apply-icon:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Invite All */
	.invite-all-section {
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.invite-all-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.invite-all-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.invite-all-label {
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.invite-all-hint {
		font-size: var(--text-xs);
		color: var(--text-dim);
		font-style: italic;
	}

	.btn-invite-all {
		padding: var(--space-2) var(--space-4);
		background: transparent;
		border: 1px solid var(--accent-gold);
		border-radius: var(--radius-md);
		color: var(--accent-gold-bright);
		font-weight: 700;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
		white-space: nowrap;
		flex-shrink: 0;
		min-width: 90px;
		font-family: var(--font-mono);
		letter-spacing: 0.02em;
	}

	.btn-invite-all:hover:not(:disabled) {
		background: var(--accent-gold-dim);
		box-shadow: var(--shadow-glow-gold);
	}

	.btn-invite-all:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.invite-all-result {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--accent-primary-bright);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.invite-all-failed {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
</style>
