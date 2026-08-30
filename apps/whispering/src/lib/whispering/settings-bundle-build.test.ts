import { expect, test } from 'bun:test';
import type { WhisperingApp } from './app';
import {
	buildSettingsBundle,
	countBundleCategories,
} from './settings-bundle-build';

const FAKE_SETTINGS: Record<string, unknown> = {
	soundManualStart: true,
	soundManualStop: false,
	soundManualCancel: true,
	soundVadStart: true,
	soundVadCapture: true,
	soundVadStop: true,
	soundTranscriptionComplete: true,
	soundRecipeComplete: true,
	outputTranscriptionClipboard: true,
	commandModeEnabled: true,
	dictionary: ['Kubernetes'],
};

const app = {
	settings: { get: (key: string) => FAKE_SETTINGS[key] },
	snippets: {
		all: [{ id: 's1', trigger: 'brb', replacement: 'be right back' }],
	},
	recipes: {
		all: [
			{
				id: 'r1',
				name: 'Email',
				instructions: 'Make it an email.',
				icon: null,
			},
		],
	},
} as unknown as WhisperingApp;

test('includes only checked preference categories, with exactly their keys', () => {
	const bundle = buildSettingsBundle(
		app,
		{ preferences: ['sounds', 'commandMode'], snippets: false, recipes: false },
		'2026-08-30T00:00:00.000Z',
	);
	expect(Object.keys(bundle.preferences).sort()).toEqual([
		'commandMode',
		'sounds',
	]);
	expect(bundle.preferences.sounds).toEqual({
		soundManualStart: true,
		soundManualStop: false,
		soundManualCancel: true,
		soundVadStart: true,
		soundVadCapture: true,
		soundVadStop: true,
		soundTranscriptionComplete: true,
		soundRecipeComplete: true,
	});
	expect(bundle.preferences.commandMode).toEqual({ commandModeEnabled: true });
});

test('an unchecked table category is absent from the bundle entirely', () => {
	const bundle = buildSettingsBundle(
		app,
		{ preferences: [], snippets: false, recipes: true },
		'2026-08-30T00:00:00.000Z',
	);
	expect(bundle.snippets).toBeUndefined();
	expect(bundle.recipes).toEqual([
		{ name: 'Email', instructions: 'Make it an email.', icon: null },
	]);
});

test('table rows travel without their minted ids', () => {
	const bundle = buildSettingsBundle(
		app,
		{ preferences: [], snippets: true, recipes: true },
		'2026-08-30T00:00:00.000Z',
	);
	expect(bundle.snippets).toEqual([
		{ trigger: 'brb', replacement: 'be right back' },
	]);
	expect(JSON.stringify(bundle)).not.toContain('s1');
});

test('carries the given exportedAt verbatim', () => {
	const bundle = buildSettingsBundle(
		app,
		{ preferences: [], snippets: false, recipes: false },
		'2026-08-30T00:00:00.000Z',
	);
	expect(bundle.version).toBe(1);
	expect(bundle.exportedAt).toBe('2026-08-30T00:00:00.000Z');
});

test('counts preference and table categories together', () => {
	const bundle = buildSettingsBundle(
		app,
		{ preferences: ['sounds', 'commandMode'], snippets: true, recipes: false },
		'2026-08-30T00:00:00.000Z',
	);
	expect(countBundleCategories(bundle)).toBe(3);
});

test('an empty selection counts as nothing to export', () => {
	const bundle = buildSettingsBundle(
		app,
		{ preferences: [], snippets: false, recipes: false },
		'2026-08-30T00:00:00.000Z',
	);
	expect(countBundleCategories(bundle)).toBe(0);
});
