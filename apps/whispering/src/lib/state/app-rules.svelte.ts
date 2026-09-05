import { nanoid } from 'nanoid/non-secure';
import type { AppRule } from '$lib/workspace';

export function generateDefaultAppRule(): AppRule {
	return {
		id: nanoid(),
		name: '',
		matchWindowsExe: null,
		matchMacosBundleId: null,
		polishInstructions: null,
		recipeId: null,
		enabled: true,
	};
}
