import { redirect } from '@sveltejs/kit';
import { whisperingPath } from '$lib/constants/urls';

// Analytics merged into Account & data.
export function load() {
	redirect(308, whisperingPath('/settings/account#analytics'));
}
