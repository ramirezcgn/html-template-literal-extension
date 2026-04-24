import assert from "node:assert/strict";
import { isInsideComment } from "../utils";

suite("utils.isInsideComment", () => {
  test("returns true inside block comment", () => {
    const text = "const a = 1; /* block comment */ const b = 2;";
    const position = text.indexOf("comment");
    assert.equal(isInsideComment(text, position), true);
  });

  test("returns false outside block comment", () => {
    const text = "const a = 1; /* block comment */ const b = 2;";
    const position = text.indexOf("const b");
    assert.equal(isInsideComment(text, position), false);
  });

  test("ignores comment markers inside strings", () => {
    const text = "const s = '/* not a comment */'; const x = 1;";
    const position = text.indexOf("const x");
    assert.equal(isInsideComment(text, position), false);
  });

  test("handles template literals with interpolation before comment", () => {
    const text = [
      "const value = `prefix ${compute('x')} suffix`;",
      "/* real comment */",
      "const done = true;",
    ].join("\n");

    const position = text.indexOf("real comment");
    assert.equal(isInsideComment(text, position), true);
  });
});
