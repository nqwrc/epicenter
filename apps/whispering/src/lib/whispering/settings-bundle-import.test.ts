import { expect, test } from 'bun:test';
import { expectErr } from 'wellcrafted/testing';
import type { WhisperingApp } from './app';
import {
	applySettingsBundle,
	availableCategoriesIn,
	parseSettingsBundle,
} from './settings-bundle-import';
import type { SettingsBundleFile } from './settings-bundle-types';

const DEFAULTS: Record<string, unknown> = {
	soundManualStart: false,
	soundManualStop: false,
	commandModeEnabled: false,
};

function makeApp() {
	const values: Record<string, unknown> = { ...DEFAULTS };
	const snippetRows: { id: string; trigger: string; replacement: string }[] =
		[];
	const recipeRows: {
		id: string;
		name: string;
		instructions: string;
		icon: string | null;
	}[] = [];

	return {
		settings: {
			get: (key: string) => values[key],
			set: (key: string, value: unknown) => {
				values[key] = value;
			},
			getDefault: (key: string) => DEFAULTS[key],
		},
		snippets: {
			get all() {
				return snippetRows;
			},
			set: (row: (typeof snippetRows)[number]) => snippetRows.push(row),
		},
		recipes: {
			get all() {
				return recipeRows;
			},
			set: (row: (typeof recipeRows)[number]) => recipeRows.push(row),
		},
	} as unknown as WhisperingApp;
}

test('rejects text that is not JSON', () => {
	expect(expectErr(parseSettingsBundle('not json'))).toEqual({
		type: 'NotJson',
	});
});

test('rejects a bare value or array', () => {
	expect(expectErr(parseSettingsBundle('[]'))).toEqual({ type: 'NotAnObject' });
});

test('rejects a missing or unsupported version', () => {
	expect(expectErr(parseSettingsBundle('{}'))).toEqual({
		type: 'MissingVersion',
	});
	expect(expectErr(parseSettingsBundle('{"version":2}'))).toEqual({
		type: 'UnsupportedVersion',
		version: 2,
	});
});

test('availableCategoriesIn reports only what the file actually has', () => {
	const file: SettingsBundleFile = {
		version: 1,
		exportedAt: 'now',
		preferences: { sounds: { soundManualStart: true } },
		snippets: [{ trigger: 'brb', replacement: 'be right back' }],
	};
	expect(availableCategoriesIn(file)).toEqual({
		preferences: ['sounds'],
		snippets: true,
		recipes: false,
	});
});

test('applies only checked-and-present categories, leaves the rest untouched', () => {
	const app = makeApp();
	const file: SettingsBundleFile = {
		version: 1,
		exportedAt: 'now',
		preferences: {
			sounds: { soundManualStart: true, soundManualStop: true },
			commandMode: { commandModeEnabled: true },
		},
	};
	const summary = applySettingsBundle(app, file, {
		preferences: ['sounds'],
		snippets: false,
		recipes: false,
	});
	expect(summary.appliedPreferenceCategories).toEqual(['sounds']);
	expect(app.settings.get('soundManualStart')).toBe(true);
	expect(app.settings.get('soundManualStop')).toBe(true);
	// Not checked, so untouched even though the file carries it.
	expect(app.settings.get('commandModeEnabled')).toBe(false);
});

test('skips one malformed field without dropping the rest of its category', () => {
	const app = makeApp();
	const file: SettingsBundleFile = {
		version: 1,
		exportedAt: 'now',
		preferences: {
			sounds: { soundManualStart: 'not a boolean', soundManualStop: true },
		},
	};
	const summary = applySettingsBundle(app, file, {
		preferences: ['sounds'],
		snippets: false,
		recipes: false,
	});
	expect(summary.skippedFields).toBe(1);
	expect(summary.appliedPreferenceCategories).toEqual(['sounds']);
	expect(app.settings.get('soundManualStart')).toBe(false); // unchanged
	expect(app.settings.get('soundManualStop')).toBe(true); // applied
});

test('a checked category the file does not carry is reported as not applied', () => {
	const app = makeApp();
	const file: SettingsBundleFile = {
		version: 1,
		exportedAt: 'now',
		preferences: { sounds: { soundManualStart: true } },
	};
	const summary = applySettingsBundle(app, file, {
		preferences: ['sounds', 'commandMode'],
		snippets: false,
		recipes: false,
	});
	expect(summary.appliedPreferenceCategories).toEqual(['sounds']);
});

test('snippets import dedupes against the live table', () => {
	const app = makeApp();
	app.snippets.set({ id: 'existing', trigger: 'brb', replacement: 'old' });
	const file: SettingsBundleFile = {
		version: 1,
		exportedAt: 'now',
		preferences: {},
		snippets: [
			{ trigger: 'brb', replacement: 'new' },
			{ trigger: 'omw', replacement: 'on my way' },
		],
	};
	const summary = applySettingsBundle(app, file, {
		preferences: [],
		snippets: true,
		recipes: false,
	});
	expect(summary.snippets).toEqual({
		created: 1,
		skippedDuplicate: 1,
		rejected: 0,
	});
	expect(app.snippets.all.map((row) => row.trigger)).toEqual(['brb', 'omw']);
	// The existing row keeps its own replacement: import appends, never overwrites.
	expect(app.snippets.all[0]?.replacement).toBe('old');
});

test('recipes import appends the new ones and counts the rejected', () => {
	const app = makeApp();
	const file: SettingsBundleFile = {
		version: 1,
		exportedAt: 'now',
		preferences: {},
		recipes: [
			{ name: 'Email', instructions: 'Make it an email.', icon: null },
			{ name: '', instructions: 'no name', icon: null },
		],
	};
	const summary = applySettingsBundle(app, file, {
		preferences: [],
		snippets: false,
		recipes: true,
	});
	expect(summary.recipes).toEqual({
		created: 1,
		skippedDuplicate: 0,
		rejected: 1,
	});
	expect(app.recipes.all.map((row) => row.name)).toEqual(['Email']);
});

test('an unchecked table category is left alone even when the file has it', () => {
	const app = makeApp();
	const file: SettingsBundleFile = {
		version: 1,
		exportedAt: 'now',
		preferences: {},
		snippets: [{ trigger: 'brb', replacement: 'be right back' }],
	};
	const summary = applySettingsBundle(app, file, {
		preferences: [],
		snippets: false,
		recipes: false,
	});
	expect(summary.snippets).toBeUndefined();
	expect(app.snippets.all).toEqual([]);
});
