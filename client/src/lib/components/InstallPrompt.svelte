<script lang="ts">
	import { onMount } from 'svelte';

	let showPrompt = false;
	let showIOSHint = false;
	let deferredPrompt: any = null;
	let dismissed = false;

	// Check if already installed as PWA
	function isStandalone(): boolean {
		return (
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as any).standalone === true
		);
	}

	// Check if running iOS Safari (no beforeinstallprompt support)
	function isIOSSafari(): boolean {
		const ua = navigator.userAgent;
		const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);
		return isIOS && isSafari;
	}

	onMount(() => {
		// Don't show if already installed
		if (isStandalone()) return;

		// Check if user previously dismissed
		const dismissedAt = localStorage.getItem('darkroot_install_dismissed');
		if (dismissedAt) {
			// Re-show after 7 days
			const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
			if (daysSince < 7) return;
		}

		// Android / Chrome: listen for the install prompt
		window.addEventListener('beforeinstallprompt', (e: Event) => {
			e.preventDefault();
			deferredPrompt = e;
			showPrompt = true;
		});

		// iOS Safari: show manual instructions
		if (isIOSSafari()) {
			showIOSHint = true;
			showPrompt = true;
		}
	});

	async function handleInstall() {
		if (deferredPrompt) {
			deferredPrompt.prompt();
			const result = await deferredPrompt.userChoice;
			if (result.outcome === 'accepted') {
				showPrompt = false;
			}
			deferredPrompt = null;
		}
	}

	function handleDismiss() {
		showPrompt = false;
		dismissed = true;
		localStorage.setItem('darkroot_install_dismissed', Date.now().toString());
	}
</script>

{#if showPrompt && !dismissed}
	<div class="install-banner">
		<div class="install-banner__content">
			<span class="install-banner__icon">📲</span>
			{#if showIOSHint}
				<span class="install-banner__text">
					Install Darkroot: tap
					<span class="install-banner__share-icon">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
							<polyline points="16 6 12 2 8 6"/>
							<line x1="12" y1="2" x2="12" y2="15"/>
						</svg>
					</span>
					Share then <strong>Add to Home Screen</strong>
				</span>
			{:else}
				<span class="install-banner__text">
					Install <strong>Darkroot</strong> for the full experience
				</span>
				<button class="install-banner__button" on:click={handleInstall}>
					Install
				</button>
			{/if}
		</div>
		<button class="install-banner__close" on:click={handleDismiss} title="Dismiss">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				<line x1="18" y1="6" x2="6" y2="18"/>
				<line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>
	</div>
{/if}

<style>
	.install-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
		background: var(--accent-primary-dim);
		border-bottom: 1px solid var(--accent-primary);
		flex-shrink: 0;
		animation: slideDown 0.3s ease-out;
	}

	.install-banner__content {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1;
		min-width: 0;
	}

	.install-banner__icon {
		font-size: var(--text-base);
		flex-shrink: 0;
	}

	.install-banner__text {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.install-banner__text strong {
		color: var(--accent-primary-bright);
	}

	.install-banner__share-icon {
		display: inline-flex;
		vertical-align: middle;
		color: var(--accent-primary-bright);
	}

	.install-banner__button {
		padding: var(--space-1) var(--space-4);
		background: var(--accent-primary);
		border: 1px solid var(--accent-primary-bright);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-weight: 600;
		font-size: var(--text-xs);
		cursor: pointer;
		white-space: nowrap;
		transition: all var(--transition-fast);
		flex-shrink: 0;
	}

	.install-banner__button:hover {
		background: var(--accent-primary-bright);
		box-shadow: var(--shadow-glow-green);
	}

	.install-banner__close {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		background: transparent;
		border: none;
		color: var(--text-dim);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: color var(--transition-fast);
		flex-shrink: 0;
	}

	.install-banner__close:hover {
		color: var(--text-secondary);
	}

	@keyframes slideDown {
		from {
			transform: translateY(-100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
</style>
