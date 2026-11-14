/**
 * Window event that `api` (lib/client) fires after every successful mutation.
 * Listen through `useDataChanged` (components/layout/ShellContext). Kept in its
 * own module so tests that mock lib/client still share the name.
 */
export const DATA_CHANGED = "mb:data-changed";
