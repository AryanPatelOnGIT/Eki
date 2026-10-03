# Isolated browser QA

From the repository root, run `npx vite --config e2e/fixtures/vite.config.mts`, then open `http://127.0.0.1:3100/`.

The fixture renders the actual passenger workspace, route carousel, settings panel and application CSS. Hook inputs and settings persistence are synthetic and exist only in memory. It has no Firebase connection, credentials or backend writes. Settings changes disappear on a server restart.

Choose pending, forward, reverse, multiple or mixed services and click the route card. Verify Back, Routes and Profile; select the second bus for multiple services. Device opens the configured route and stationary hardware position without pretending a ride has started. Empty and completed expose no selectable service. Inactive panels must be absent from the accessibility tree and must not intercept pointer clicks. Check at desktop size and a 390 × 844 CSS mobile viewport. Set `EKI_QA_PORT` to use another port. Scenario selection refreshes synthetic timestamps; quiet device data intentionally expires.

The passenger map and timeline use their actual application logic with a synthetic Google Maps SDK adapter (labelled on screen). The adapter draws configured stops and positions without requesting Google tiles or road geometry. Boarding, profile, feedback and chat children remain placeholders; their actual components have separate interaction tests. This fixture does not measure real GPS, Google compositor paint or network-to-map latency and does not replace Firebase emulator or hardware acceptance tests.
