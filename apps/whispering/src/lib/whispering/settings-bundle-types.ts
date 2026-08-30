/**
 * The settings bundle file shape, shared by export and import.
 *
 * See `specs/20260830T130918-settings-import-export.md`.
 */
import type { PreferenceCategory } from './settings-categories';

/**
 * `version` exists so a future incompatible reshape can be detected and refused
 * rather than silently misapplied. There is no migration path yet because there
 * is nothing to migrate from.
 *
 * A category the export did not include is ABSENT, not empty: the import screen
 * offers exactly what the file carries, and an empty object would offer a
 * category with nothing behind it.
 */
export type SettingsBundleFile = {
	version: 1;
	exportedAt: string;
	preferences: Partial<Record<PreferenceCategory, Record<string, unknown>>>;
	snippets?: { trigger: string; replacement: string }[];
	recipes?: { name: string; instructions: string; icon: string | null }[];
};

/** What the person checked, in either direction. */
export type SettingsBundleSelection = {
	preferences: PreferenceCategory[];
	snippets: boolean;
	recipes: boolean;
};
