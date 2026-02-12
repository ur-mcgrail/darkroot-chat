<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { isLoggedIn } from '$lib/stores/matrix';
	import { restoreSession } from '$lib/matrix/client';
	import '../app.css';

	let loading = true;
	let error = '';

	onMount(async () => {
		try {
			// Attempt to restore session from localStorage
			const restored = await restoreSession();

			if (restored) {
				console.log('Session restored successfully');
				// Redirect to main app if on login page
				if ($page.url.pathname === '/login') {
					await goto('/');
				}
			} else {
				// No session found, redirect to login if not already there
				if ($page.url.pathname !== '/login') {
					await goto('/login');
				}
			}
		} catch (err) {
			console.error('Session restoration error:', err);
			error = 'Failed to restore session';
			// Redirect to login on error
			if ($page.url.pathname !== '/login') {
				await goto('/login');
			}
		} finally {
			loading = false;
		}
	});

	// Reactive redirect if user logs out
	$: if (!loading && !$isLoggedIn && $page.url.pathname !== '/login') {
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
