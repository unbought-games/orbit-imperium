// The JSON reporter nests describe blocks and expands each spec by project.
// Keep that ancestry when comparing inventories with repeated leaf titles.
export function* playwrightCases(suites, parents = []) {
  for (const suite of suites) {
    const path = [...parents, suite.title]
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        yield {
          file: spec.file,
          project: test.projectName,
          titlePath: [...path, spec.title],
          id: spec.id,
          expectedStatus: test.expectedStatus,
        }
      }
    }
    yield* playwrightCases(suite.suites ?? [], path)
  }
}
