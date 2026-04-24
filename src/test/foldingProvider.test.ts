import assert from "node:assert/strict";
import * as vscode from "vscode";
import { TemplateLiteralFoldingProvider } from "../foldingProvider";

async function getFoldingRanges(
  content: string
): Promise<vscode.FoldingRange[]> {
  const document = await vscode.workspace.openTextDocument({
    language: "javascript",
    content,
  });

  const provider = new TemplateLiteralFoldingProvider(["html", "dom"]);
  const ranges = provider.provideFoldingRanges(
    document,
    { rangeLimit: 5000 },
    new vscode.CancellationTokenSource().token
  );

  return Array.isArray(ranges) ? ranges : [];
}

suite("TemplateLiteralFoldingProvider", () => {
  test("creates a folding range for multiline dom templates", async () => {
    const ranges = await getFoldingRanges([
      "const view = dom`",
      '  <section>',
      '    <p>Hello</p>',
      '  </section>',
      "`;",
    ].join("\n"));

    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].start, 0);
    assert.equal(ranges[0].end, 4);
  });

  test("does not fold templates shorter than 3 lines", async () => {
    const ranges = await getFoldingRanges([
      "const view = dom`<div></div>`;",
    ].join("\n"));

    assert.equal(ranges.length, 0);
  });

  test("keeps only outermost range for nested tagged templates", async () => {
    const ranges = await getFoldingRanges([
      "const view = dom`",
      '  <div>',
      '    ${items.map((item) => dom`',
      '      <span>${item}</span>',
      '    `)}',
      '  </div>',
      "`;",
    ].join("\n"));

    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].start, 0);
    assert.equal(ranges[0].end, 6);
  });

  test("ignores tagged templates inside block comments", async () => {
    const ranges = await getFoldingRanges([
      "/*",
      "dom`",
      '  <div>',
      '    <span>Ignored</span>',
      '  </div>',
      "`",
      "*/",
    ].join("\n"));

    assert.equal(ranges.length, 0);
  });

  test("supports html comment marker tags", async () => {
    const ranges = await getFoldingRanges([
      "const view = renderer /* html */ `",
      '  <article>',
      '    <h2>Title</h2>',
      '  </article>',
      "`;",
    ].join("\n"));

    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].start, 0);
    assert.equal(ranges[0].end, 4);
  });
});
