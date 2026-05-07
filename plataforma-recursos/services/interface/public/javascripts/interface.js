(function () {
	const toggle = document.querySelector('[data-nav-toggle]')
	const panel = document.querySelector('[data-nav-panel]')

	if (!toggle || !panel) return

	function setOpen(open) {
		toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
		panel.classList.toggle('is-open', open)
	}

	setOpen(false)

	toggle.addEventListener('click', function () {
		const isOpen = toggle.getAttribute('aria-expanded') === 'true'
		setOpen(!isOpen)
	})

	for (const link of panel.querySelectorAll('a')) {
		link.addEventListener('click', function () {
			if (window.innerWidth <= 900) setOpen(false)
		})
	}

	window.addEventListener('resize', function () {
		if (window.innerWidth > 900) setOpen(false)
	})
})()
