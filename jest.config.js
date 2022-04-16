/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testPathIgnorePatterns: [".*_output"],
    collectCoverageFrom: [
        "src/**/*.ts",
        "!**/node_modules/**",
        "!__tests__/*_output"
    ],
    maxWorkers: 1
};
