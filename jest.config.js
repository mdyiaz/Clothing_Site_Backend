module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!**/main.ts'],
  coverageDirectory: '../coverage',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.spec.json' }],
    '^.+\\.js$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.spec.json' }],
  },
  // @nestjs/schedule ships ESM-only — transform it back to CommonJS for jest.
  transformIgnorePatterns: ['node_modules/(?!@nestjs/schedule/)'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/$1',
  },
};
