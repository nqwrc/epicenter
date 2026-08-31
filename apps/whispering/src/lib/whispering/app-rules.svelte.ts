/**
 * Per-application dictation rules, read straight out of the document.
 *
 * The snippets accessor's shape: every row is the person's own, identity is
 * the minted row id (ADR-0206), and matching is someone else's pure function
 * (`operations/match-app-rule.ts`).
 */
import type { NonconformingRow } from '@epicenter/data';
import type { AppRule, WhisperingData } from '../workspace';

export function createWhisperingAppRules({
	table,
}: {
	table: WhisperingData['tables']['appRules'];
}) {
	let rows = $state.raw<AppRule[]>([]);
	let nonconforming = $state.raw<NonconformingRow[]>([]);

	function read(): void {
		const listed = table.list();
		rows = listed.rows;
		nonconforming = listed.nonconforming;
	}

	read();
	const stop = table.subscribe(read);

	return {
		[Symbol.dispose]: stop,
		/** Every saved rule, ordered by name for a stable settings table. */
		get all(): AppRule[] {
			return rows.toSorted((left, right) =>
				left.name.localeCompare(right.name),
			);
		},
		get count(): number {
			return rows.length;
		},
		get nonconforming(): NonconformingRow[] {
			return nonconforming;
		},
		/** Save a rule. An id this store has never seen mints a new row. */
		set({ id, ...fields }: AppRule): void {
			const isRow = rows.some((row) => row.id === id);
			if (isRow) {
				const result = table.update(id, fields);
				if (result.error !== null) throw result.error;
			} else {
				table.create(fields);
			}
			read();
		},
		delete(id: string): void {
			table.delete(id);
			read();
		},
	};
}

export type WhisperingAppRules = ReturnType<typeof createWhisperingAppRules>;
