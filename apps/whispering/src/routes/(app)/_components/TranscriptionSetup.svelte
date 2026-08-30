<script lang="ts">
	import { Button } from '@epicenter/ui/button';
	import { Link } from '@epicenter/ui/link';
	import ProviderConfigFields from '$lib/components/settings/ProviderConfigFields.svelte';
	import { whisperingPath } from '$lib/constants/urls';
	import {
		getSelectedTranscriptionProvider,
		getTranscriptionReadiness,
	} from '$lib/settings/transcription-validation';
	import { localRoute } from '$lib/state/local-route.svelte';
	import { getWhisperingApp } from '$lib/whispering/context';
	import { tauri } from '#platform/tauri';

	// The one required credential, asked for where the blocker is reported. This
	// is onboarding, not configuration: a cloud provider needs a single API key,
	// so we render just that field (via `secretsOnly`) and delegate the full
	// provider/model/endpoint choice to Privacy & Processing. A self-hosted setup
	// (a server URL and a model id) is too heavy for the capture card and routes
	// there instead.
	const app = getWhisperingApp();

	const readiness = $derived(getTranscriptionReadiness(app));

	const inlineKeyProvider = $derived.by(() => {
		const provider = getSelectedTranscriptionProvider(app);
		return provider?.access === 'key' ? provider : null;
	});

	// The local route is the one blocker Whispering cannot clear anywhere in its
	// own settings: there is no key, endpoint, or model for this app to set, and
	// the active model belongs to the host (ADR-0180). So the action goes to the
	// surface that owns the fix rather than to a Whispering page that would only
	// repeat the same sentence and a second button.
	const needsHomeTranscriptionSetup = $derived(
		Boolean(tauri) &&
			getSelectedTranscriptionProvider(app)?.access === 'onDevice',
	);
</script>

<div class="flex w-full flex-col gap-2">
	<h2 class="text-base font-semibold">Set up transcription</h2>
	<p class="text-muted-foreground text-sm">
		{readiness.primaryIssue ??
			'Choose how Whispering turns your speech into text.'}
	</p>

	{#if inlineKeyProvider}
		<ProviderConfigFields provider={inlineKeyProvider.id} secretsOnly />
		<p class="text-muted-foreground text-sm">
			<Link href={whisperingPath('/settings/processing')}>
				Change provider, model, or endpoint in Privacy &amp; Processing
			</Link>
		</p>
	{:else if needsHomeTranscriptionSetup}
		<Button
			variant="outline"
			class="w-full"
			onclick={() => localRoute.openHomeTranscription()}
		>
			Set up in Epicenter Home
		</Button>
		<p class="text-muted-foreground text-sm">
			Or <Link href={whisperingPath('/settings/processing')}>
				transcribe with a cloud provider
			</Link> instead.
		</p>
	{:else}
		<Button
			href={whisperingPath('/settings/processing')}
			variant="outline"
			class="w-full"
		>
			Set up in Privacy &amp; Processing
		</Button>
	{/if}
</div>
