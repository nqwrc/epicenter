import { type InterfaceLocale, reconcileLocale } from '$lib/i18n';
import type { WhisperingApp } from '$lib/whispering/app';

/**
 * Keep the running document in the language the setting names.
 *
 * Reading the setting inside the `$effect` is what makes this cover both cases
 * that matter with one rule: the value the store produces at boot, and a value
 * that arrives later because the person changed it here or on another device.
 * `reconcileLocale` decides which of those needs a reload and which is already
 * correct, so this effect never reloads on its own and cannot loop: once the
 * cache and the document agree, re-running it is a no-op.
 */
export function synchronizeInterfaceLocale(app: WhisperingApp): void {
	$effect(() => {
		reconcileLocale(app.settings.get('interfaceLocale') as InterfaceLocale);
	});
}
