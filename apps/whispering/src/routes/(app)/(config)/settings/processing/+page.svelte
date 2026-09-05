<script lang="ts">
	import * as Field from '@epicenter/ui/field';
	import {
		CompletionRuntimeConfig,
		SettingSwitch,
		TranscriptionRuntimeConfig,
	} from '$lib/components/settings';
</script>

<svelte:head> <title>Privacy & Processing - Whispering</title> </svelte:head>

<Field.Set>
	<Field.Legend>Privacy &amp; Processing</Field.Legend>
	<Field.Description>
		Choose where each stage of the pipeline runs. Audio is transcribed first,
		then Polish and Recipes clean up the text. Each stage can stay on this
		device or go to a provider you pick.
	</Field.Description>
	<Field.Separator />
	<Field.Group>
		<Field.Set>
			<Field.Legend variant="label">Audio (transcription)</Field.Legend>
			<Field.Description>
				Where your recording is turned into text.
			</Field.Description>
			<TranscriptionRuntimeConfig />
		</Field.Set>

		<Field.Separator />

		<Field.Set>
			<Field.Legend variant="label">Text (Polish &amp; Recipes)</Field.Legend>
			<Field.Description>
				Where transcript text goes for AI cleanup.
			</Field.Description>
			<CompletionRuntimeConfig />
		</Field.Set>

		<Field.Separator />

		<Field.Set>
			<Field.Legend variant="label">Password fields</Field.Legend>
			<Field.Description>
				Detection is best-effort: it blocks when a password field is detected,
				and passes when the system cannot say. Not a security guarantee.
			</Field.Description>
			<Field.Group>
				<SettingSwitch
					key="secureFieldGuardEnabled"
					label="Hold delivery when a password field has focus"
					description="The transcript stays in your history instead of being pasted or copied."
				/>
				<SettingSwitch
					key="secureFieldCaptureGateEnabled"
					label="Also refuse to start recording"
					description="Stops a dictated secret from ever reaching a transcription or AI provider, but can visibly refuse a recording. Manual recording only."
				/>
			</Field.Group>
		</Field.Set>
	</Field.Group>
</Field.Set>
