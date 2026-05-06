(function () {
	function updateButton(button, input) {
		const hasFile = Boolean(input?.files && input.files.length);
		button.hidden = !hasFile;
		button.disabled = !hasFile;
	}

	function initClearButton(button) {
		const inputId = button.dataset.clearFile;
		const input = inputId ? document.getElementById(inputId) : null;
		if (!input || input.type !== 'file') return;

		updateButton(button, input);
		input.addEventListener('change', () => updateButton(button, input));
		button.addEventListener('click', () => {
			input.value = '';
			input.dispatchEvent(new Event('change', { bubbles: true }));
			updateButton(button, input);
		});
	}

	for (const button of document.querySelectorAll('[data-clear-file]')) {
		initClearButton(button);
	}
})();
