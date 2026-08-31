/**
 * The guard's one probe, bounded and fail-open at the call boundary.
 *
 * The host command already degrades platform refusals to `unknown`, but the
 * call itself can still reject (a missing capability, a non-Tauri host) or
 * stall: on Windows, UI Automation's focused-element query is a cross-process
 * call, and a hung target application blocks it for the UIA timeout. Delivery
 * must never wait on that, and "a probe failure can never fail a dictation"
 * has to hold at this boundary, not just inside the host, so both a rejection
 * and a timeout collapse to `unknown` here.
 */
import type { FocusedFieldKind } from '#platform/context';
import { services } from '$lib/services';

const PROBE_TIMEOUT_MS = 1500;

export function probeFocusedField(): Promise<FocusedFieldKind> {
	const probe = services.context.getForegroundContext().then(
		(context) => context.focusedField,
		(): FocusedFieldKind => 'unknown',
	);
	const timeout = new Promise<FocusedFieldKind>((resolve) => {
		setTimeout(() => resolve('unknown'), PROBE_TIMEOUT_MS);
	});
	return Promise.race([probe, timeout]);
}
