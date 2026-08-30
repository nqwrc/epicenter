<script lang="ts">
	import { Button } from '@epicenter/ui/button';
	import * as Field from '@epicenter/ui/field';
	import OutputDeliveryControls from '$lib/components/OutputDeliveryControls.svelte';
	import { tauri } from '#platform/tauri';
	import { formatAnchorLabel } from '$lib/recording-overlay/anchor-position';
	import { startOverlayRepositionSession } from '$lib/recording-overlay/window-manager.tauri';
	import { report } from '$lib/report';
	import { getWhisperingApp } from '$lib/whispering/context';
	import AutostartSwitch from './AutostartSwitch.svelte';

	const app = getWhisperingApp();

	const overlayAnchorLabel = $derived(
		formatAnchorLabel({
			xAnchor: app.settings.get('recordingOverlayXAnchor'),
			xMarginPx: app.settings.get('recordingOverlayXMarginPx'),
			yAnchor: app.settings.get('recordingOverlayYAnchor'),
			yMarginPx: app.settings.get('recordingOverlayYMarginPx'),
		}),
	);

	// The session runs on the overlay window, so this page has nothing to show
	// while it is open beyond saying where to look.
	let repositioning = $state(false);

	async function reposition() {
		repositioning = true;
		const { error } = await startOverlayRepositionSession(app);
		repositioning = false;
		if (error) {
			report.error({ title: "Couldn't start repositioning", cause: error });
		}
	}
</script>

<svelte:head> <title>Settings - Whispering</title> </svelte:head>

<Field.Set>
	<Field.Legend>General</Field.Legend>
	<Field.Description>
		Configure your general Whispering preferences.
	</Field.Description>
	<Field.Group>
		<Field.Set>
			<Field.Legend variant="label">Transcription output</Field.Legend>
			<Field.Description>
				Applies immediately after an audio transcription finishes.
			</Field.Description>
			<Field.Group>
				<OutputDeliveryControls scope="transcription" />
			</Field.Group>
		</Field.Set>

		<Field.Set>
			<Field.Legend variant="label">Recipe output</Field.Legend>
			<Field.Description>
				Applies after you run a Recipe on your selection or clipboard.
			</Field.Description>
			<Field.Group>
				<OutputDeliveryControls scope="recipe" />
			</Field.Group>
		</Field.Set>

		{#if tauri}
			<AutostartSwitch autostart={tauri.autostart} />

			<Field.Set>
				<Field.Legend variant="label">Recording pill position</Field.Legend>
				<Field.Description>
					Where the floating pill appears while you dictate. Currently: {overlayAnchorLabel}.
				</Field.Description>
				<Field.Group>
					<div class="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={repositioning}
							onclick={reposition}
						>
							{repositioning ? 'Drag the pill on your screen...' : 'Reposition'}
						</Button>
					</div>
				</Field.Group>
			</Field.Set>
		{/if}
	</Field.Group>
</Field.Set>
