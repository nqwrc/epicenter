/**
 * Whether the capture pipeline row is expanded.
 *
 * Module state, not component state, because the three capture surfaces are
 * separate branches on the record screen: each mounts its own disclosure, and a
 * component-local flag would collapse the row every time the person switched
 * surface with the switcher sitting directly above it. The same reason keeps it
 * open across a navigation away and back.
 */
class CapturePipelineDisclosure {
	open = $state(false);

	toggle() {
		this.open = !this.open;
	}

	/**
	 * Open on the transition into a blocked state, so the fix is already showing
	 * when the person arrives. Only that transition opens it: once open, nothing
	 * closes the row but the person, which is what keeps a field they are typing
	 * into from unmounting the moment their input counts as configured.
	 */
	openForBlocker() {
		this.open = true;
	}
}

export const capturePipelineDisclosure = new CapturePipelineDisclosure();
