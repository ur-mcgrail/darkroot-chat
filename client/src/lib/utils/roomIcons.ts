/**
 * Dark Souls themed room icons.
 * All SVGs use fill="currentColor" so they inherit the avatar's text color
 * and work with the Darkroot theme tokens automatically.
 *
 * Icon set:
 *   estus   — Estus Flask silhouette
 *   ring    — covenant ring with gem setting
 *   fog     — fog gate / mist door frame
 *   shield  — kite shield
 *   skull   — undead hollow skull
 *
 * Assignment:
 *   • All rooms → deterministic hash pick from the set
 *     (consistent across sessions, unique per room)
 *   • If a Matrix room avatar is set, the avatar takes priority in the UI
 */

const ICONS = {

	// ── Estus Flask ─────────────────────────────────────────────────────────
	// Stopper on top, narrow neck widening at the shoulder into a round body.
	estus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <rect x="10.5" y="2" width="3" height="2" rx="0.5"/>
  <path d="M10.5 4 L10.5 7.5 Q9 8 8.5 9.5 L8.5 17 Q8.5 22 12 22 Q15.5 22 15.5 17 L15.5 9.5 Q15 8 13.5 7.5 L13.5 4Z"/>
</svg>`,

	// ── Ring ────────────────────────────────────────────────────────────────
	// Band rendered with evenodd hole; diamond gem setting at the top.
	ring: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <path fill-rule="evenodd" d="M12 4.5 A8 8 0 0 1 20 12.5 A8 8 0 0 1 12 20.5 A8 8 0 0 1 4 12.5 A8 8 0 0 1 12 4.5 Z M12 8.5 A4 4 0 0 0 8 12.5 A4 4 0 0 0 12 16.5 A4 4 0 0 0 16 12.5 A4 4 0 0 0 12 8.5 Z"/>
  <path d="M9.5 3.5 L12 2 L14.5 3.5 L12 5.5Z"/>
</svg>`,

	// ── Fog Gate ────────────────────────────────────────────────────────────
	// Archway frame (top bar + two side pillars) with two misty vertical planks.
	fog: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <rect x="2" y="2" width="20" height="2.5" rx="1"/>
  <rect x="2" y="2" width="2.5" height="20" rx="1"/>
  <rect x="19.5" y="2" width="2.5" height="20" rx="1"/>
  <rect x="8" y="4.5" width="1.5" height="17.5" rx="0.5" opacity="0.7"/>
  <rect x="14.5" y="4.5" width="1.5" height="17.5" rx="0.5" opacity="0.7"/>
</svg>`,

	// ── Shield ──────────────────────────────────────────────────────────────
	// Classic kite / heater shield with a subtle inner bevel.
	shield: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <path d="M12 22 L3.5 11 L3.5 3.5 L20.5 3.5 L20.5 11Z"/>
  <path d="M12 18.5 L6.5 11 L6.5 6.5 L17.5 6.5 L17.5 11Z" opacity="0.22"/>
</svg>`,

	// ── Skull ───────────────────────────────────────────────────────────────
	// Undead/hollow skull: dome + jaw with eye-socket holes (evenodd) + three teeth.
	skull: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <path fill-rule="evenodd" d="M12 2 C7 2 3.5 6 3.5 10.5 C3.5 13.5 5 16 7.5 17 L7.5 19.5 Q7.5 20.5 8.5 20.5 L15.5 20.5 Q16.5 20.5 16.5 19.5 L16.5 17 C19 16 20.5 13.5 20.5 10.5 C20.5 6 17 2 12 2 Z M8.5 8.5 A2.2 2.2 0 0 0 6.3 10.7 A2.2 2.2 0 0 0 8.5 12.9 A2.2 2.2 0 0 0 10.7 10.7 A2.2 2.2 0 0 0 8.5 8.5 Z M15.5 8.5 A2.2 2.2 0 0 0 13.3 10.7 A2.2 2.2 0 0 0 15.5 12.9 A2.2 2.2 0 0 0 17.7 10.7 A2.2 2.2 0 0 0 15.5 8.5 Z"/>
  <rect x="9.5" y="20.5" width="1.5" height="2" rx="0.3"/>
  <rect x="11.5" y="20.5" width="1.5" height="2" rx="0.3"/>
  <rect x="13.5" y="20.5" width="1.5" height="2" rx="0.3"/>
</svg>`,

} as const;

type IconKey = keyof typeof ICONS;
const ICON_KEYS = Object.keys(ICONS) as IconKey[];

/** djb2-style hash — deterministic, stable across sessions */
function hashName(s: string): number {
	let h = 5381;
	for (let i = 0; i < s.length; i++) {
		h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
	}
	return h;
}

/** Returns a consistent SVG icon for a room, chosen by hashing the room name. */
export function getRoomIcon(roomName: string): string {
	return ICONS[ICON_KEYS[hashName(roomName) % ICON_KEYS.length]];
}
