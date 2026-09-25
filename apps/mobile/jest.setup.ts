// Jest setup: native modules the tests touch indirectly.
import { jest } from '@jest/globals';
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
