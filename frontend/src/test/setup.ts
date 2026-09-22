import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Testing Library only registers its own cleanup when Vitest exposes its API as
// globals, which this suite does not: every file imports what it uses. Unmounting
// between tests is what keeps queries unambiguous, so it is done here instead.
afterEach(cleanup);
