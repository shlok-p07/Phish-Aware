import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Registers window/document/etc. as globals so component tests can render
// with @testing-library/react under `bun test`. Only the tests that actually
// import React components pay for this -- pure-logic test files are
// unaffected either way since this just adds globals, it doesn't change how
// existing tests run.
GlobalRegistrator.register();
