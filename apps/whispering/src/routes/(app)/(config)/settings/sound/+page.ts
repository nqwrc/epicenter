import { redirect } from '@sveltejs/kit';
import { whisperingPath } from '$lib/constants/urls';

// Sound merged into Capture. The anchor lands on the section it used to be.
export function load() {
	redirect(308, whisperingPath('/settings#sounds'));
}
