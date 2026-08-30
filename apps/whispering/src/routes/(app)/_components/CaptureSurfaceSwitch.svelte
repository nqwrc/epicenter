<script lang="ts">
	import * as ToggleGroup from '@epicenter/ui/toggle-group';
	import {
		CAPTURE_SURFACE_META,
		CAPTURE_SURFACE_OPTIONS,
		type CaptureSurface,
	} from '$lib/constants/audio';
	import { selectCaptureSurface } from '$lib/operations/recording';
	import { captureSurface } from '$lib/state/capture-surface.svelte';
	import { getWhisperingApp } from '$lib/whispering/context';

	// Glyphs only, and small. The surface is a mode the person sets once and
	// rarely revisits, so it sits in the corner of the capture card rather than
	// spending a full-width row above it. The label survives as the accessible
	// name and the tooltip.
	const app = getWhisperingApp();
</script>

<ToggleGroup.Root
	type="single"
	bind:value={
		() => captureSurface.current(app),
		(surface) => {
			if (!surface) return;
			void selectCaptureSurface(app, surface as CaptureSurface);
		}
	}
	class="w-auto gap-0.5"
	aria-label="Capture surface"
>
	{#each CAPTURE_SURFACE_OPTIONS as option (option.value)}
		{@const SurfaceIcon = CAPTURE_SURFACE_META[option.value].Icon}
		<ToggleGroup.Item
			value={option.value}
			title={option.label}
			aria-label="Switch to {option.label.toLowerCase()}"
			class="size-8 min-w-0 px-0"
		>
			<SurfaceIcon class="size-4" />
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
