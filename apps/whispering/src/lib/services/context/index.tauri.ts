import { commands } from '$lib/tauri/commands';
import type { ContextService } from './types';

export type { ContextService, ForegroundContext, FocusedFieldKind } from './types';

export const ContextServiceLive = {
	getForegroundContext: () => commands.getForegroundContext(),
} satisfies ContextService;
