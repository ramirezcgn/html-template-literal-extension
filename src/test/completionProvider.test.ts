import assert from "node:assert/strict";
import * as vscode from "vscode";
import { TemplateLiteralCompletionProvider } from "../completionProvider";

const CURSOR = "__CURSOR__";

async function openDocumentWithCursor(content: string): Promise<{
  document: vscode.TextDocument;
  position: vscode.Position;
}> {
  const cursorIndex = content.indexOf(CURSOR);
  assert.ok(cursorIndex >= 0, "Fixture must include cursor marker");

  const source = content.replace(CURSOR, "");
  const document = await vscode.workspace.openTextDocument({
    language: "javascript",
    content: source,
  });

  return {
    document,
    position: document.positionAt(cursorIndex),
  };
}

async function getCompletionLabels(content: string): Promise<string[]> {
  const { document, position } = await openDocumentWithCursor(content);
  const provider = new TemplateLiteralCompletionProvider(["html", "dom"]);

  const result = provider.provideCompletionItems(
    document,
    position,
    new vscode.CancellationTokenSource().token,
    {
      triggerKind: vscode.CompletionTriggerKind.Invoke,
      triggerCharacter: "",
    }
  );

  const resolved = await Promise.resolve(result);
  const items = Array.isArray(resolved)
    ? resolved
    : resolved instanceof vscode.CompletionList
      ? resolved.items
      : [];

  return items.map((item) => item.label.toString());
}

suite("TemplateLiteralCompletionProvider", () => {
  test("returns no completions outside template literals", async () => {
    const labels = await getCompletionLabels([
      "const value = 42;",
      "const tag = <__CURSOR__;",
    ].join("\n"));

    assert.equal(labels.length, 0);
  });

  test("offers HTML tag completions inside dom template literals", async () => {
    const labels = await getCompletionLabels([
      "const view = dom`",
      "  <__CURSOR__",
      "`;",
    ].join("\n"));

    assert.ok(labels.includes("div"));
    assert.ok(labels.includes("span"));
    assert.ok(labels.includes("svg"));
  });

  test("offers common and element-specific attributes", async () => {
    const labels = await getCompletionLabels([
      "const view = dom`",
      '  <a __CURSOR__>',
      "`;",
    ].join("\n"));

    assert.ok(labels.includes("class"));
    assert.ok(labels.includes("aria-"));
    assert.ok(labels.includes("href"));
    assert.ok(labels.includes("target"));
  });

  test("ignores tagged template markers inside block comments", async () => {
    const labels = await getCompletionLabels([
      "/*",
      "dom`",
      "  <__CURSOR__",
      "`",
      "*/",
    ].join("\n"));

    assert.equal(labels.length, 0);
  });
});
