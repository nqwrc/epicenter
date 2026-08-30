<script lang="ts">
	import { cn } from '@epicenter/ui/utils';
	import type { Snippet } from 'svelte';

	// The one card every capture surface wears. Manual and voice activated reach
	// it through RecordingActionCard; import renders into it directly. Keeping
	// the chrome here is what lets the surface switcher and the pipeline
	// disclosure sit in the same place on all three, so switching surfaces moves
	// nothing but the body.
	let {
		active = false,
		header,
		children,
		footer,
	}: {
		/** Live capture. Raises the card and tints its ring destructive. */
		active?: boolean;
		/** Right-aligned strip above the body. The surface switcher lives here. */
		header?: Snippet;
		children: Snippet;
		/** Hairline-separated strip below the body. The pipeline lives here. */
		footer?: Snippet;
	} = $props();
</script>

<div
	class={cn(
		'w-full overflow-hidden rounded-xl bg-card text-foreground shadow-sm transition-[box-shadow] duration-200',
		active && 'shadow-md ring-1 ring-destructive/25',
	)}
>
	{#if header}
		<div class="flex items-center justify-end px-3 pt-2.5">
			{@render header()}
		</div>
	{/if}

	{@render children()}

	{#if footer}
		<div class="border-border/60 border-t px-3 py-2">
			{@render footer()}
		</div>
	{/if}
</div>
