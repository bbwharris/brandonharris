(function () {
	var root = document.documentElement;
	var stored = null;

	try {
		stored = localStorage.getItem('pref-theme');
	} catch (error) {
		stored = null;
	}

	if (stored === 'dark' || stored === 'light') {
		root.dataset.theme = stored;
	} else {
		root.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}

	document.addEventListener('DOMContentLoaded', function () {
		var toggle = document.getElementById('theme-toggle');
		if (!toggle) return;

		toggle.addEventListener('click', function () {
			var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
			root.dataset.theme = next;

			try {
				localStorage.setItem('pref-theme', next);
			} catch (error) {
				// Storage unavailable; the choice applies to this page view only.
			}
		});
	});
})();
