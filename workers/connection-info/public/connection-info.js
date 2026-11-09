const content = document.getElementById('content');
const refreshButton = document.getElementById('refresh');

function element(tag, className, text) {
	const node = document.createElement(tag);

	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;

	return node;
}

function display(value) {
	return typeof value === 'string' && value.trim() ? value : 'Unknown';
}

function createLoading() {
	const loading = element('div', 'loading');
	loading.append(element('div', 'spinner'));
	return loading;
}

function createError(message) {
	const error = element('div', 'error');
	error.append(
		element('h3', undefined, 'Error Loading Data'),
		element('p', undefined, message)
	);
	return error;
}

function createCopyButton(value) {
	const button = element('button', 'copy-btn', 'Copy');
	button.type = 'button';

	button.addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(value);
			button.textContent = 'Copied!';
			button.classList.add('copied');
			setTimeout(() => {
				button.textContent = 'Copy';
				button.classList.remove('copied');
			}, 2000);
		} catch {
			button.textContent = 'Copy failed';
			setTimeout(() => {
				button.textContent = 'Copy';
			}, 2000);
		}
	});

	return button;
}

function createRow(label, value, className) {
	const row = element('div', 'data-row');
	const valueClass = className ? `data-value ${className}` : 'data-value';

	row.append(
		element('span', 'data-label', label),
		element('span', valueClass, value)
	);

	return row;
}

function createCard(icon, title, rows, copyValue) {
	const card = element('div', 'info-card');

	if (copyValue) card.append(createCopyButton(copyValue));

	const iconElement = element('span', 'card-icon', icon);
	iconElement.setAttribute('aria-hidden', 'true');

	card.append(iconElement, element('div', 'card-title', title));

	for (const row of rows) {
		card.append(createRow(row.label, row.value, row.className));
	}

	return card;
}

function createSpeedTestSection() {
	const section = element('div', 'speed-test-section');
	const link = element('a', 'speed-test-btn', '🚀 Run Speed Test');

	link.href = 'https://speed.cloudflare.com';
	link.target = '_blank';
	link.rel = 'noopener noreferrer';

	section.append(
		element('p', 'speed-test-copy', 'Want to test your full connection speed?'),
		link
	);

	return section;
}

function formatTimestamp(value) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

function render(data, latency) {
	const grid = element('div', 'info-grid fade-in');
	const performanceCard = createCard('⚡', 'Performance', [
		{ label: 'Latency', value: `${latency} ms`, className: 'latency-display' },
	]);

	performanceCard.append(createSpeedTestSection());

	grid.append(
		createCard('🌐', 'Network Identity', [
			{ label: 'IP Address', value: display(data.ip), className: 'ip' },
			{ label: 'Provider', value: display(data.isp) },
			{ label: 'Cloudflare POP', value: display(data.pop) },
			{ label: 'Country', value: display(data.country) },
		], display(data.ip)),
		createCard('🔒', 'Protocol & Security', [
			{ label: 'HTTP Protocol', value: display(data.http) },
			{ label: 'TLS Version', value: display(data.tls) },
			{ label: 'WARP VPN', value: data.warp === 'on' ? 'Active' : 'Off' },
		]),
		createCard('💻', 'Device Profile', [
			{ label: 'Browser', value: display(data.browser) },
			{ label: 'Operating System', value: display(data.os) },
			{ label: 'Screen Resolution', value: `${window.screen.width}×${window.screen.height}`, className: 'resolution-value' },
			{ label: 'Timezone', value: Intl.DateTimeFormat().resolvedOptions().timeZone, className: 'timezone-value' },
		]),
		performanceCard
	);

	content.replaceChildren(
		grid,
		element('div', 'timestamp', `Last updated: ${formatTimestamp(data.timestamp)}`)
	);
}

async function loadData() {
	refreshButton.disabled = true;
	content.replaceChildren(createLoading());

	try {
		const started = performance.now();
		const response = await fetch('/api/connection-info', {
			headers: { Accept: 'application/json' },
			cache: 'no-store',
		});
		const latency = Math.round(performance.now() - started);

		if (!response.ok) {
			throw new Error(`Request failed (${response.status})`);
		}

		const data = await response.json();

		if (!data || typeof data !== 'object') {
			throw new Error('Invalid response');
		}

		render(data, latency);
	} catch (error) {
		content.replaceChildren(createError(
			error instanceof Error ? error.message : 'Unable to load connection information.'
		));
	} finally {
		refreshButton.disabled = false;
	}
}

refreshButton.addEventListener('click', loadData);
loadData();
