<script lang="ts">
	import { Button } from '@epicenter/ui/button';
	import * as Field from '@epicenter/ui/field';
	import OutputDeliveryControls from '$lib/components/OutputDeliveryControls.svelte';
	import { tauri } from '#platform/tauri';
	import { formatAnchorLabel } from '$lib/recording-overlay/anchor-position';
	import {
		cancelOverlayRepositionSession,
		startOverlayRepositionSession,
	} from '$lib/recording-overlay/window-manager.tauri';
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

	// A session fills the screen with the overlay window and takes its clicks, so
	// this button doubles as the way out: while one is running it cancels rather
	// than going dead, and that path does not depend on the overlay answering.
	let repositioning = $state(false);

	async function toggleReposition() {
		if (repositioning) {
			await cancelOverlayRepositionSession();
			return;
		}
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
							variant={repositioning ? 'secondary' : 'outline'}
							size="sm"
							onclick={toggleReposition}
						>
							{repositioning ? 'Cancel repositioning' : 'Reposition'}
						</Button>
					</div>
					{#if repositioning}
						<p class="text-muted-foreground text-sm">
							Drag the pill on your screen, then save it there.
						</p>
					{/if}
				</Field.Group>
			</Field.Set>
		{/if}
	</Field.Group>
</Field.Set>
