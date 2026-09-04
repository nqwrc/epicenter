<script lang="ts">
	import { Button } from '@epicenter/ui/button';
	import { Card } from '@epicenter/ui/card';
	import * as Field from '@epicenter/ui/field';
	import { Input } from '@epicenter/ui/input';
	import { Link } from '@epicenter/ui/link';
	import * as SectionHeader from '@epicenter/ui/section-header';
	import { Textarea } from '@epicenter/ui/textarea';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import XIcon from '@lucide/svelte/icons/x';
	import { AdvancedDisclosure, SettingSwitch } from '$lib/components/settings';
	import { whisperingPath } from '$lib/constants/urls';
	import {
		buildTranscriptionPrompt,
		recognizerPromptCharBudget,
	} from '$lib/operations/build-transcription-prompt';
	import { polishDestination, polishStatus } from '$lib/operations/run-polish';
	import { PROVIDERS } from '$lib/services/transcription/providers';
	import { localRoute } from '$lib/state/local-route.svelte';
	import { getWhisperingApp } from '$lib/whispering/context';

	const app = getWhisperingApp();

	// Null when the person has added no terms: the definition cannot default an array,
	// so "never touched" and "emptied" are the same empty list here.
	const dictionary = $derived(app.settings.get('dictionary') ?? []);
	// Whether the selected recognizer clips a long Dictionary, and where.
	//
	// The bound is Whisper's, so most of this page's job is refusing to warn: a
	// route with no Whisper ceiling gets a null budget, drops nothing, and shows
	// nothing. The two facts the budget function cannot see from a pure module are
	// resolved here. One is OpenAI's model, the only picker whose menu spans a
	// Whisper decoder and the `gpt-4o-transcribe` pair. The other is a local model
	// that accepts no prompt at all: the host strips the whole thing before
	// inference, so "everything from here down is missing" would understate it into
	// a falsehood, and the honest sentence for that case already lives beside the
	// disabled System Prompt field on the transcription settings page.
	//
	// Asking the same pair of functions the transcribe path runs is what keeps this
	// page from reporting a boundary the recognizer does not actually have.
	const service = $derived(app.settings.get('transcriptionService'));
	const promptBudget = $derived(
		service === 'local' && !localRoute.capabilities.supportsPrompt
			? null
			: recognizerPromptCharBudget(
					service,
					service === 'OpenAI'
						? app.settings.get(PROVIDERS.OpenAI.modelSettingKey)
						: null,
				),
	);
	const unreached = $derived(
		buildTranscriptionPrompt(
			app.settings.get('transcriptionPrompt'),
			dictionary,
			promptBudget,
		).dropped,
	);
	// The System Prompt shares the same budget and lives on another page, so it is
	// named as a cause and offered as a remedy only when the person actually has
	// one. It defaults to empty, which is where a Dictionary long enough to clip
	// most often finds itself.
	const systemPrompt = $derived(app.settings.get('transcriptionPrompt').trim());
	// Intent (`polishEnabled`) and capability (a usable provider) are separate
	// facts; the toggle below sets intent, this surfaces when intent is on but
	// the provider is missing so the control never silently reads "on" while the
	// pipeline ships raw.
	const polish = $derived(polishStatus(app));
	const destination = $derived(polishDestination(app));

	let newTerm = $state('');

	function addTerm() {
		const term = newTerm.trim();
		newTerm = '';
		// Injection-only and order-free, so dedupe and ignore blanks; a repeated
		// term would only bloat the prompt block.
		if (!term || dictionary.includes(term)) return;
		app.settings.set('dictionary', [...dictionary, term]);
	}

	function removeTerm(term: string) {
		app.settings.set(
			'dictionary',
			dictionary.filter((t) => t !== term),
		);
	}
</script>

<svelte:head> <title>Dictation</title> </svelte:head>

<main class="mx-auto flex w-full flex-1 flex-col gap-2 px-4 py-4 sm:px-8">
	<SectionHeader.Root>
		<SectionHeader.Title
			level={1}
			class="scroll-m-20 text-4xl tracking-tight lg:text-5xl"
		>
			Dictation
		</SectionHeader.Title>
		<SectionHeader.Description>
			What happens to your words between the transcript and your cursor:
			the cleanup pass, the phrases that act instead of typing, and the
			spellings Whispering should already know.
		</SectionHeader.Description>
	</SectionHeader.Root>

	<Card class="flex flex-col gap-4 p-6">
		<Field.Set>
			<Field.Legend variant="label">Polish</Field.Legend>
			<Field.Description>
				An always-on AI pass that fixes grammar and punctuation while keeping
				your wording.
			</Field.Description>
			<Field.Group>
				<SettingSwitch
					key="polishEnabled"
					label="Polish transcripts with AI"
					description="Turn off for speed mode: the raw transcript ships instantly, with no AI call."
				/>
				{#if app.settings.get('polishEnabled')}
					<p class="text-muted-foreground text-sm">{destination}</p>
				{/if}

				{#if polish === 'needs-key'}
					<div
						class="border-amber-500/30 bg-amber-500/10 text-foreground flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm"
					>
						<KeyRoundIcon class="mt-0.5 size-4 shrink-0 text-amber-500" />
						<p>
							Polish is on, but the completion provider is not ready, so
							transcripts still ship raw. <Link
								href={whisperingPath('/settings/processing')}
								>Check completion settings</Link
							> to start cleaning them up.
						</p>
					</div>
				{/if}

				{#if app.settings.get('polishEnabled')}
					<AdvancedDisclosure>
						<Field.Field>
							<Field.Label for="polish-instructions">
								Polish instructions
							</Field.Label>
							<Textarea
								id="polish-instructions"
								placeholder={app.settings.getDefault('polishInstructions')}
								value={app.settings.get('polishInstructions')}
								onblur={(e) => {
									const next = e.currentTarget.value;
									if (next !== app.settings.get('polishInstructions'))
										app.settings.set('polishInstructions', next);
								}}
							/>
							<Field.Description>
								What Polish does to every transcript. Keep it
								meaning-preserving; reshaping (email, to-dos) belongs in
								recipes.
							</Field.Description>
						</Field.Field>
					</AdvancedDisclosure>
				{/if}
			</Field.Group>
		</Field.Set>
	</Card>

	<Card class="flex flex-col gap-4 p-6">
		<Field.Set>
			<Field.Legend variant="label">Command Mode</Field.Legend>
			<Field.Description>
				A short list of spoken phrases that do something instead of being
				typed. Say one on its own, with nothing else in the same breath.
			</Field.Description>
			<Field.Group>
				<SettingSwitch
					key="commandModeEnabled"
					label="Act on spoken commands"
					description="Off by default, because these phrases stop being text the moment you turn this on."
				/>
				{#if app.settings.get('commandModeEnabled')}
					<ul class="text-muted-foreground space-y-1 text-sm">
						<li>
							<span class="text-foreground font-medium">"scratch that"</span>
							or
							<span class="text-foreground font-medium">"undo that"</span>
							removes what was just typed at your cursor.
						</li>
						<li>
							<span class="text-foreground font-medium">"stop listening"</span>
							ends a voice activated session.
						</li>
					</ul>
				{/if}
			</Field.Group>
		</Field.Set>
	</Card>

	<Card class="flex flex-col gap-4 p-6">
		<Field.Set>
			<Field.Legend variant="label">Dictionary</Field.Legend>
			<Field.Description>
				Proper nouns and domain terms Whispering should know: names, jargon,
				product names. The AI keeps these spellings and maps obvious mishearings
				onto them.
			</Field.Description>
			<Field.Group>
				<form
					class="flex gap-2"
					onsubmit={(e) => {
						e.preventDefault();
						addTerm();
					}}
				>
					<Input placeholder="e.g. Kubernetes" bind:value={newTerm} />
					<Button type="submit" variant="outline">
						<PlusIcon class="size-4" /> Add
					</Button>
				</form>

				{#if dictionary.length > 0}
					<ul class="flex flex-wrap gap-2">
						{#each dictionary as term (term)}
							<li
								class="bg-muted/40 flex items-center gap-1 rounded-md border py-1 pr-1 pl-3 text-sm"
							>
								<span>{term}</span>
								<Button
									variant="ghost"
									size="icon"
									class="size-5"
									aria-label="Remove {term}"
									onclick={() => removeTerm(term)}
								>
									<XIcon class="size-3.5" />
								</Button>
							</li>
						{/each}
					</ul>
					{#if unreached.length > 0}
						<div
							class="border-amber-500/30 bg-amber-500/10 text-foreground flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm"
						>
							<TriangleAlertIcon class="mt-0.5 size-4 shrink-0 text-amber-500" />
							<p>
								Everything from <span class="font-medium">{unreached[0]}</span>
								onward ({unreached.length}
								{unreached.length === 1 ? 'term' : 'terms'}) does not reach the
								transcription model: it accepts only a short prompt, and your
								list is longer than that. Polish and Recipes still use every
								term.
								{#if systemPrompt}
									Your <Link href={whisperingPath('/settings/processing')}
										>transcription System Prompt</Link
									> is sent first and takes part of the same room, so remove terms
									above the cut-off, or shorten that prompt, to make room.
								{:else}
									Remove terms above the cut-off to make room.
								{/if}
							</p>
						</div>
					{/if}
				{:else}
					<Field.Description>
						No terms yet. Add the names and jargon you dictate often.
					</Field.Description>
				{/if}
			</Field.Group>
		</Field.Set>
	</Card>
</main>
