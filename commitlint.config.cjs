module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'refactor', 'test', 'docs', 'style', 'perf', 'ci', 'build'],
    ],
    'scope-empty': [1, 'never'],
    'subject-case': [0],
  },
};
