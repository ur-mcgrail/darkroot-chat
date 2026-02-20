<script lang="ts">
	import { get } from 'svelte/store';
	import type * as sdk from 'matrix-js-sdk';
	import { matrixClient } from '$lib/stores/matrix';
	import { loadFullHistory, computeStats, type RoomStats } from '$lib/matrix/stats';

	export let show = false;
	export let room: sdk.Room | null = null;

	let stats: RoomStats | null = null;
	let loading = false;
	let historyComplete = false;
	let loadedEvents = 0;
	let lastRoomId = '';

	// Load when panel opens or room changes
	$: if (show && room && room.roomId !== lastRoomId) {
		lastRoomId = room.roomId;
		loadStats();
	}

	async function loadStats() {
		const client = get(matrixClient);
		if (!client || !room) return;

		loading = true;
		historyComplete = false;
		loadedEvents = room.getLiveTimeline().getEvents().length;

		// Show partial stats immediately from what's in memory
		stats = computeStats(room, client);

		// Paginate backwards and keep updating stats as pages arrive
		try {
			await loadFullHistory(client, room, count => {
				loadedEvents = count;
				stats = computeStats(room!, client);
			});
			historyComplete = true;
			stats = computeStats(room, client);
		} catch {
			// Partial results are still useful
		} finally {
			loading = false;
		}
	}

	function formatHour(h: number): string {
		if (h === 0) return '12 am';
		if (h < 12) return `${h} am`;
		if (h === 12) return '12 pm';
		return `${h - 12} pm`;
	}

	function close() { show = false; }

	$: maxChatterCount = stats ? (stats.topChatters[0]?.count || 1) : 1;
	$: maxDayCount = stats ? Math.max(...stats.last14Days.map(d => d.count), 1) : 1;
	$: maxHourCount = stats ? Math.max(...stats.hourlyDistribution, 1) : 1;
</script>

{#if show}
	<!-- Backdrop -->
	<div class="stats-backdrop" on:click={close} role="none" aria-hidden="true"></div>

	<!-- Panel -->
	<div class="stats-panel" role="complementary" aria-label="Chamber statistics">
		<!-- Header -->
		<div class="stats-header">
			<div class="stats-header__title">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
					<line x1="6" y1="20" x2="6" y2="14"/>
				</svg>
				<span class="path-dim">darkroot.chat.rooms.</span>stats
			</div>
			<button class="stats-header__close" on:click={close} title="Close">✕</button>
		</div>

		<!-- Loading bar -->
		{#if loading}
			<div class="stats-loading">
				<div class="stats-loading__bar">
					<div class="stats-loading__fill"></div>
				</div>
				<span class="stats-loading__label">
					kindling history… {loadedEvents} events
				</span>
			</div>
		{:else}
			<div class="stats-complete">
				{#if historyComplete}
					<span class="stats-complete__text">full history · {loadedEvents} events</span>
				{:else}
					<span class="stats-complete__text">{loadedEvents} events loaded</span>
				{/if}
				<button class="stats-refresh" on:click={() => { lastRoomId = ''; loadStats(); lastRoomId = room?.roomId || ''; }} title="Reload statistics">
					↺
				</button>
			</div>
		{/if}

		{#if stats}
			<div class="stats-body">
				<!-- Overview grid -->
				<section class="stats-section">
					<h3 class="stats-section__title">overview</h3>
					<div class="stat-grid">
						<div class="stat-card">
							<div class="stat-card__value">{stats.totalMessages.toLocaleString()}</div>
							<div class="stat-card__label">messages</div>
						</div>
						<div class="stat-card">
							<div class="stat-card__value">{stats.totalWords.toLocaleString()}</div>
							<div class="stat-card__label">total words</div>
						</div>
						<div class="stat-card">
							<div class="stat-card__value">{stats.avgWordsPerMessage}</div>
							<div class="stat-card__label">words / msg</div>
						</div>
						<div class="stat-card">
							<div class="stat-card__value">{stats.uniqueSenders}</div>
							<div class="stat-card__label">{stats.uniqueSenders === 1 ? 'soul' : 'souls'}</div>
						</div>
					</div>
				</section>

				<!-- Top chatters -->
				{#if stats.topChatters.length > 0}
					<section class="stats-section">
						<h3 class="stats-section__title">top voices</h3>
						<div class="stat-bars">
							{#each stats.topChatters as chatter}
								{@const pct = Math.round(chatter.count / maxChatterCount * 100)}
								<div class="stat-bar">
									<div class="stat-bar__label">{chatter.displayName}</div>
									<div class="stat-bar__track">
										<div class="stat-bar__fill" style="--pct: {pct}%"></div>
									</div>
									<div class="stat-bar__meta">
										<span class="stat-bar__count">{chatter.count}</span>
										<span class="stat-bar__sub">~{chatter.avgWords}w</span>
									</div>
								</div>
							{/each}
						</div>
					</section>
				{/if}

				<!-- 14-day activity -->
				<section class="stats-section">
					<h3 class="stats-section__title">last 14 days</h3>
					<div class="day-chart">
						{#each stats.last14Days as day}
							{@const pct = Math.round(day.count / maxDayCount * 100)}
							<div
								class="day-bar"
								class:day-bar--active={day.count > 0}
								title="{day.label}: {day.count} messages"
							>
								<div class="day-bar__fill" style="--pct: {pct}%"></div>
								<div class="day-bar__label">{day.label.split(' ')[1]}</div>
							</div>
						{/each}
					</div>
					<div class="day-chart__days">
						{#each stats.last14Days as day, i}
							{#if i === 0 || day.label.startsWith('Sun')}
								<span class="day-chart__week-label">{day.label.split(' ')[0]}</span>
							{/if}
						{/each}
					</div>
				</section>

				<!-- Hourly heatmap -->
				<section class="stats-section">
					<h3 class="stats-section__title">
						hourly pattern
						{#if stats.totalMessages > 0}
							<span class="stats-section__subtitle">— peaks at {formatHour(stats.peakHour)}</span>
						{/if}
					</h3>
					<div class="hour-grid">
						{#each stats.hourlyDistribution as count, hour}
							{@const intensity = count / maxHourCount}
							<div
								class="hour-cell"
								title="{formatHour(hour)}: {count}"
								style="--intensity: {intensity}"
							>
								{#if hour % 6 === 0}
									<span class="hour-cell__label">{formatHour(hour)}</span>
								{/if}
							</div>
						{/each}
					</div>
				</section>

				<!-- Longest message -->
				{#if stats.longestMessage && stats.longestMessage.words > 5}
					<section class="stats-section">
						<h3 class="stats-section__title">longest missive</h3>
						<div class="stat-quote">
							<div class="stat-quote__meta">
								{stats.longestMessage.displayName}
								<span class="stat-quote__words">· {stats.longestMessage.words} words</span>
							</div>
							<blockquote class="stat-quote__text">
								"{stats.longestMessage.preview}"
							</blockquote>
						</div>
					</section>
				{/if}

				{#if stats.totalMessages === 0}
					<p class="stats-empty">the chamber speaks no words yet</p>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.stats-backdrop {
		position: fixed;
		inset: 0;
		z-index: 300;
		background: rgba(0, 0, 0, 0.35);
		backdrop-filter: blur(1px);
	}

	.stats-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 300px;
		z-index: 301;
		background: var(--bg-elevated);
		border-left: 1px solid var(--border-default);
		box-shadow: -12px 0 40px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Header */
	.stats-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4);
		border-bottom: 1px solid var(--border-default);
		flex-shrink: 0;
		background: var(--bg-surface);
	}

	.stats-header__title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: 11px;
		letter-spacing: 0.02em;
		color: var(--accent-primary-bright);
	}

	.stats-header__title :global(.path-dim) {
		color: var(--text-dim);
		opacity: 0.6;
	}

	.stats-header__close {
		background: transparent;
		border: none;
		color: var(--text-dim);
		cursor: pointer;
		font-size: var(--text-sm);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		transition: color var(--transition-fast);
	}

	.stats-header__close:hover { color: var(--text-primary); }

	/* Loading */
	.stats-loading {
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}

	.stats-loading__bar {
		height: 2px;
		background: var(--bg-base);
		border-radius: var(--radius-full);
		overflow: hidden;
		margin-bottom: var(--space-1);
	}

	.stats-loading__fill {
		height: 100%;
		width: 40%;
		background: var(--accent-primary);
		border-radius: var(--radius-full);
		animation: statsLoad 1.2s ease-in-out infinite;
	}

	@keyframes statsLoad {
		0%   { transform: translateX(-100%); }
		100% { transform: translateX(350%); }
	}

	.stats-loading__label {
		font-size: 10px;
		color: var(--text-dim);
		font-family: var(--font-mono);
	}

	/* Complete row */
	.stats-complete {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}

	.stats-complete__text {
		font-size: 10px;
		color: var(--text-dim);
		font-family: var(--font-mono);
	}

	.stats-refresh {
		background: transparent;
		border: none;
		color: var(--text-dim);
		cursor: pointer;
		font-size: var(--text-base);
		padding: 0 4px;
		line-height: 1;
		transition: color var(--transition-fast);
	}

	.stats-refresh:hover { color: var(--accent-primary-bright); }

	/* Body */
	.stats-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.stats-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.stats-section__title {
		margin: 0;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-dim);
		font-family: var(--font-mono);
		display: flex;
		align-items: baseline;
		gap: 4px;
	}

	.stats-section__subtitle {
		font-size: 9px;
		color: var(--text-dim);
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
	}

	/* Stat grid (overview) */
	.stat-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}

	.stat-card {
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		text-align: center;
	}

	.stat-card__value {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--accent-primary-bright);
		font-family: var(--font-display);
		line-height: 1.1;
	}

	.stat-card__label {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
		margin-top: 3px;
		font-family: var(--font-mono);
	}

	/* Horizontal bar chart */
	.stat-bars {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.stat-bar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.stat-bar__label {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		width: 80px;
		flex-shrink: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.stat-bar__track {
		flex: 1;
		height: 8px;
		background: var(--bg-base);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.stat-bar__fill {
		height: 100%;
		width: var(--pct);
		background: linear-gradient(to right, var(--accent-primary-dim), var(--accent-primary));
		border-radius: var(--radius-full);
		transition: width 0.6s ease-out;
	}

	.stat-bar__meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		flex-shrink: 0;
		gap: 1px;
	}

	.stat-bar__count {
		font-size: 11px;
		font-weight: 700;
		color: var(--text-primary);
		font-family: var(--font-mono);
		line-height: 1;
	}

	.stat-bar__sub {
		font-size: 9px;
		color: var(--text-dim);
		font-family: var(--font-mono);
		line-height: 1;
	}

	/* Day chart (14-day activity) */
	.day-chart {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 48px;
	}

	.day-bar {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		height: 100%;
		gap: 2px;
	}

	.day-bar__fill {
		width: 100%;
		height: var(--pct);
		min-height: 2px;
		background: var(--bg-surface);
		border-radius: 2px 2px 0 0;
		transition: height 0.5s ease-out;
	}

	.day-bar--active .day-bar__fill {
		background: var(--accent-primary-dim);
		border-top: 1px solid var(--accent-primary);
	}

	.day-bar__label {
		font-size: 8px;
		color: var(--text-dim);
		font-family: var(--font-mono);
		line-height: 1;
	}

	.day-chart__days {
		display: flex;
		gap: var(--space-2);
		margin-top: 2px;
	}

	.day-chart__week-label {
		font-size: 8px;
		color: var(--text-dim);
		font-family: var(--font-mono);
	}

	/* Hourly heatmap */
	.hour-grid {
		display: grid;
		grid-template-columns: repeat(24, 1fr);
		gap: 2px;
		position: relative;
	}

	.hour-cell {
		height: 20px;
		border-radius: 2px;
		background: rgba(79, 138, 97, calc(0.08 + var(--intensity) * 0.72));
		border: 1px solid rgba(79, 138, 97, calc(0.1 + var(--intensity) * 0.4));
		position: relative;
		cursor: default;
		transition: background 0.3s;
	}

	.hour-cell:hover {
		outline: 1px solid var(--accent-primary-bright);
		z-index: 1;
	}

	.hour-cell__label {
		position: absolute;
		bottom: -14px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 7px;
		color: var(--text-dim);
		font-family: var(--font-mono);
		white-space: nowrap;
	}

	/* Longest message */
	.stat-quote {
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-left: 2px solid var(--accent-primary);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		padding: var(--space-3);
	}

	.stat-quote__meta {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--accent-primary-bright);
		margin-bottom: var(--space-2);
	}

	.stat-quote__words {
		font-weight: 400;
		color: var(--text-dim);
		font-size: 10px;
	}

	.stat-quote__text {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-muted);
		font-style: italic;
		line-height: 1.55;
	}

	.stats-empty {
		text-align: center;
		color: var(--text-dim);
		font-style: italic;
		font-size: var(--text-sm);
		padding: var(--space-6) 0;
	}
</style>
