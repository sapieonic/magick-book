import "@testing-library/jest-dom/vitest";

// Deterministic secret for session-token round-trip tests.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-for-vitest";
