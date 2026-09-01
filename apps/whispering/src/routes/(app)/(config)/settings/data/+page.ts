import { redirect } from '@sveltejs/kit';
import { whisperingPath } from '$lib/constants/urls';

// Import & Export merged into Account & data.
export function load() {
	redirect(308, whisperingPath('/settings/account#data'));
}
