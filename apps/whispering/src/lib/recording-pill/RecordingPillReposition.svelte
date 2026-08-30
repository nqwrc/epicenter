<script lang="ts">
	import { cn } from '@epicenter/ui/utils';
	import CheckIcon from '@lucide/svelte/icons/check';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import XIcon from '@lucide/svelte/icons/x';

	let {
		label,
		onDragStart,
		onSave,
		onReset,
		onCancel,
	}: {
		/** The currently resolved placement, e.g. "Bottom Center". */
		label: string;
		/** Hand the window to the OS drag loop. Returns as soon as the drag
		 * starts, not when it ends. */
		onDragStart: () => void;
		onSave: () => void;
		onReset: () => void;
		onCancel: () => void;
	} = $props();

	const actionBase =
		'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/90 transition duration-150 ease-out hover:scale-[1.08] active:scale-95';

	/**
	 * A press on a button must not also grab the window. `mousedown` is where the
	 * drag starts and it bubbles before `click` ever fires, so stopping it here
	 * is what keeps the three controls clickable at all.
	 */
	function keepPressLocal(event: MouseEvent) {
		event.stopPropagation();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="wispr-pill-reposition box-border flex w-[260px] cursor-grab flex-col items-center gap-1 rounded-2xl px-3 py-2 text-white/90 select-none active:cursor-grabbing"
	onmousedown={onDragStart}
>
	<span class="truncate text-[12px] font-medium tracking-tight text-white/85">
		{label}
	</span>
	<div class="flex items-center gap-1.5">
		<button
			type="button"
			class={cn(
				actionBase,
				'bg-emerald-500/70 text-white hover:bg-emerald-500/90',
			)}
			aria-label="Save position"
			title="Save position"
			onmousedown={keepPressLocal}
			onclick={onSave}
		>
			<CheckIcon class="size-3.5" />
		</button>
		<button
			type="button"
			class={cn(actionBase, 'hover:bg-white/20')}
			aria-label="Reset to default position"
			title="Reset to default position"
			onmousedown={keepPressLocal}
			onclick={onReset}
		>
			<RotateCcwIcon class="size-3.5" />
		</button>
		<button
			type="button"
			class={cn(actionBase, 'hover:bg-[#faa2ca]/20 hover:text-[#ffd2e4]')}
			aria-label="Cancel"
			title="Cancel"
			onmousedown={keepPressLocal}
			onclick={onCancel}
		>
			<XIcon class="size-3.5" />
		</button>
	</div>
</div>

<style>
	/* The same material as `.wispr-pill` in RecordingPill.svelte, declared
	   separately rather than shared: that component's class also carries the
	   width/height transition its phase changes animate, which a static
	   placement preview has nothing to do with. */
	.wispr-pill-reposition {
		background: rgba(18, 18, 20, 0.85);
		border: 1px solid rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(16px) saturate(180%);
		-webkit-backdrop-filter: blur(16px) saturate(180%);
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.45),
			0 2px 6px rgba(0, 0, 0, 0.3);
	}
</style>
