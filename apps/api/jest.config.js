/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Map workspace packages to their TS source so tests don't depend on a
  // prior `tsup`/`tsc` build of @ivy/common and @ivy/types.
  moduleNameMapper: {
    '^@ivy/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@ivy/common$': '<rootDir>/../../packages/common/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // Decorators (NestJS) require these; isolatedModules keeps it fast.
        tsconfig: {
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          target: 'ES2021',
          isolatedModules: true,
        },
      },
    ],
  },
};
