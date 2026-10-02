# Isolated browser QA

From the repository root, run `npx vite --config e2e/fixtures/vite.config.mts`, then open `http://127.0.0.1:3100/`.

The fixture renders the actual passenger workspace, route carousel, settings panel and application CSS. Hook inputs and settings persistence are synthetic and exist only in memory. It has no Firebase connection, credentials or backend writes. Settings changes disappear on a server restart.

Choose pending, forward, reverse or multiple services and click the route card. Verify Back, Routes and Profile; select the second bus for multiple services. Device exposes only hardware availability; empty and completed expose no selectable service. Inactive panels must be absent from the accessibility tree and must not intercept pointer clicks. Check at desktop size and a 390 × 844 mobile viewport.

The map, boarding, profile, feedback and chat children in this fixture are placeholders. Their actual components have separate interaction tests. This fixture does not measure real GPS or network-to-map latency and does not replace Firebase emulator or hardware acceptance tests.
