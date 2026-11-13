// check NAME FN: prints ok when FN returns, or FAIL with its error indented.
// report: prints the failure count and exits non-zero after any failure.
let fails = 0;

export function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    fails++;
    console.log(`FAIL ${name}\n     ${error.message.replaceAll('\n', '\n     ')}`);
  }
}

export function report() {
  console.log(`${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
}
