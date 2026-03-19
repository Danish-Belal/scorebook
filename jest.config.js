module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^../../src/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: [
    "src/services/scoring/**/*.ts",
    "src/services/fetchers/**/*.ts",
  ],
};
