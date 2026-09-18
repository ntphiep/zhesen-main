---
description: Vitest and Testing Library conventions for this repository
paths:
  - "test/**"
  - "vitest.config.ts"
---

# Testing rules

- Tests live in `test/`, named `*.test.ts` or `*.test.tsx`. Follow the shape of the existing
  file nearest the code under test before inventing a new one.
- Stack is Vitest plus Testing Library. Supabase is mocked with the chainable builder in
  `test/helpers/supabase.ts`. `showModal` is polyfilled in `test/setup.ts`.
- Import lifecycle hooks explicitly (`beforeEach`, `afterEach`, ...) even though
  `globals: true` is set, or `tsc` reports TS2304.
- Mock a constructor such as `Audio` with `vi.fn(function () { ... })`. An arrow function is
  not a constructor and will fail at `new`.
- Assert behaviour a user can observe, not implementation detail. A test that mocks the unit
  under test proves nothing.
- A failing test is a finding. Report it with its output. Never edit, loosen or delete a
  test to make it pass; if the test itself is wrong, say why and stop.
- `npx vitest related --run <file>` runs only the tests that import a given file. The full
  suite runs through `npm run verify`.
