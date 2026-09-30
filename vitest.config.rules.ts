import { defineConfig } from 'vitest/config';

// Rules tests only. They talk to the Firestore emulator over the network, so
// they run in Node with a longer timeout than a unit test would need — the
// emulator's first request after start-up is slow.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
