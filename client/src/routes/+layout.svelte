<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { isLoggedIn } from '$lib/stores/matrix';
	import { restoreSession } from '$lib/matrix/client';
	import '../app.css';

	let loading = true;
	let error = '';

	// Public routes that don't require authentication
	const PUBLIC_ROUTES = ['/login', '/register'];

	function isPublicRoute(pathname: string): boolean {
		return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
	}

	onMount(async () => {
		// Auto-reload when a new service worker takes control (i.e. after a deploy).
		// Without this, the page keeps running old JS bundles until the user manually
		// refreshes, because Workbox's autoUpdate only swaps the SW — not the page.
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				window.location.reload();
			});
		}

		try {
			// Attempt to restore session from localStorage
			const restored = await restoreSession();

			if (restored) {
				console.log('Session restored successfully');
				// Redirect to main app if on login/register page
				if (isPublicRoute($page.url.pathname)) {
					await goto('/');
				}
			} else {
				// No session found, redirect to login if not on a public route
				if (!isPublicRoute($page.url.pathname)) {
					await goto('/login');
				}
			}
		} catch (err) {
			console.error('Session restoration error:', err);
			error = 'Failed to restore session';
			// Redirect to login on error (unless on a public route)
			if (!isPublicRoute($page.url.pathname)) {
				await goto('/login');
			}
		} finally {
			loading = false;
		}
	});

	// Reactive redirect if user logs out
	$: if (!loading && !$isLoggedIn && !isPublicRoute($page.url.pathname)) {
		goto('/login');
	}
</script>

{#if loading}
	<div class="loading">
		<span>Loading Darkroot...</span>
	</div>
{:else if error}
	<div class="error">
		<div class="error-icon">⚠️</div>
		<div class="error-message">{error}</div>
		<button class="error-button" on:click={() => window.location.reload()}>
			Reload
		</button>
	</div>
{:else}
	<slot />
{/if}
