import { planActionTestCases } from "./planActions.test";
import { snapTestCases } from "./snap.test";
import { topologyTestCases } from "./topology.test";

const testCases = [...snapTestCases, ...topologyTestCases, ...planActionTestCases];
let failures = 0;

for (const testCase of testCases) {
  try {
    const passed = testCase.run();
    if (passed) {
      console.log(`ok - ${testCase.name}`);
    } else {
      failures += 1;
      console.error(`not ok - ${testCase.name}`);
    }
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${testCase.name}`);
    console.error(error);
  }
}

if (failures > 0) {
  throw new Error(`${failures} of ${testCases.length} tests failed.`);
}

console.log(`${testCases.length} tests passed.`);
