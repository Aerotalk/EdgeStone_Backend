// Basic setup for Jest tests
require('dotenv').config();

// Increase timeout for slow db operations if needed
jest.setTimeout(30000);

// Silence console logs during tests to keep output clean, optionally
// global.console = {
//   ...console,
//   log: jest.fn(),
//   error: jest.fn(),
// };
