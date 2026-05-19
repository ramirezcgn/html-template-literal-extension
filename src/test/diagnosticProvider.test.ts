import assert from "node:assert/strict";
import * as vscode from "vscode";
import { TemplateLiteralDiagnosticProvider } from "../diagnosticProvider";

let collectionCounter = 0;

async function getDiagnostics(
  content: string
): Promise<vscode.Diagnostic[]> {
  const document = await vscode.workspace.openTextDocument({
    language: "javascript",
    content,
  });

  const provider = new TemplateLiteralDiagnosticProvider(
    ["html", "dom"],
    `htmlTemplateLiteral.test.${collectionCounter++}`
  );

  try {
    provider.updateDiagnostics(document);
    const diagnosticCollection = (
      provider as unknown as {
        diagnosticCollection: vscode.DiagnosticCollection;
      }
    ).diagnosticCollection;

    return Array.from(diagnosticCollection.get(document.uri) ?? []);
  } finally {
    provider.dispose();
  }
}

function messagesBySeverity(
  diagnostics: vscode.Diagnostic[]
): Record<string, number> {
  return diagnostics.reduce<Record<string, number>>((accumulator, diagnostic) => {
    const key = `${diagnostic.severity}:${diagnostic.message}`;
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}

suite("TemplateLiteralDiagnosticProvider", () => {
  test("keeps diagnostics anchored near malformed HTML instead of interpolations", async () => {
    const diagnostics = await getDiagnostics([
      "export function createCardHTML(review) {",
      "  const displayDate = review.submittedAt || 'Recently';",
      "",
      "  return /* html */ `",
      '    <div class="cmp-card cmp-card--review">',
      '      <div class="cmp-card__author">',
      '        <span class="cmp-card__avatar" aria-hidden="true"><span>',
      '        <button class="cmp-card__name">${review.author}</button>',
      '          ${',
      '            review.approved',
      '              ? /* html */ `',
      '              <span class="cmp-card__verified">',
      '                <svg width="19" height="19" viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg">',
      '                  <path d="M9.5 1.78125..." fill="#01AB31"/>',
      '                </svg>',
      '                <span class="cmp-card__avatar" aria-hidden="true"><span>',
      '              </span>`',
      '              : ""',
      '          }',
      '      </div>',
      '',
      '      <p class="cmp-card__text">"${review.comment}"</p>',
      '',
      '      <span class="cmp-card__date">Posted on ${displayDate}</span>',
      '    </div>`;',
      "}",
    ].join("\n"));

    const summary = messagesBySeverity(diagnostics);

    assert.equal(
      summary[`${vscode.DiagnosticSeverity.Error}:Expected closing tag </span> but found </div>`],
      1
    );
    assert.equal(
      summary[`${vscode.DiagnosticSeverity.Warning}:Unclosed tag <span>`],
      4
    );

    const error = diagnostics.find(
      (diagnostic) =>
        diagnostic.severity === vscode.DiagnosticSeverity.Error &&
        diagnostic.message === "Expected closing tag </span> but found </div>"
    );

    assert.ok(error);
    assert.equal(error.range.start.line + 1, 20);
    assert.equal(error.range.start.character + 1, 7);
  });

  test("does not duplicate diagnostics for nested tagged templates", async () => {
    const diagnostics = await getDiagnostics([
      "const view = dom`",
      '  <ul>',
      '    ${items.map((item) => dom`',
      '      ${item.separator ? dom`',
      '        <li>',
      '          <div class="cmp-card__avatar">',
      '        </li>` : ""}',
      '    `)}',
      '  </ul>`;',
    ].join("\n"));

    const summary = messagesBySeverity(diagnostics);

    assert.equal(
      summary[`${vscode.DiagnosticSeverity.Error}:Expected closing tag </div> but found </li>`],
      1
    );
    assert.equal(
      summary[`${vscode.DiagnosticSeverity.Warning}:Unclosed tag <div>`],
      1
    );
    assert.equal(diagnostics.length, 2);
  });

  test("emits warnings for tags discarded during mismatch recovery", async () => {
    const diagnostics = await getDiagnostics([
      "const view = dom`",
      '  <ul>',
      '    <li>',
      '      <div class="cmp-card__avatar">',
      '    </li>',
      '  </ul>`;',
    ].join("\n"));

    const summary = messagesBySeverity(diagnostics);

    assert.equal(
      summary[`${vscode.DiagnosticSeverity.Error}:Expected closing tag </div> but found </li>`],
      1
    );
    assert.equal(
      summary[`${vscode.DiagnosticSeverity.Warning}:Unclosed tag <div>`],
      1
    );
  });

  test("regression fixture: nested list templates without duplicate diagnostics", async () => {
    const diagnostics = await getDiagnostics([
      "const menu = dom`",
      '  <nav class="menu-shell">',
      '    <ul class="menu-shell__list">',
      '      ${sections.map((section, index) => dom`',
      '        ${section.break ? dom`',
      '          <li class="menu-shell__separator-item">',
      '            <hr class="menu-shell__separator"/>',
      '            <span class="menu-shell__marker" aria-hidden="true"><span>',
      '            <div class="menu-shell__caption">${section.break}</div>',
      '          </li>` : ""}',
      '        <li class="menu-shell__item">',
      '          <button id="item-${index}">${section.title}</button>',
      '        </li>`)}',
      '      ${ctaItems?.map((entry) => dom`',
      '        <li class="menu-shell__item">',
      '          <a href="${entry.href}">${entry.label}<a>',
      '        </li>`)}',
      '    </ul>',
      '  </nav>`;',
    ].join("\n"));

    const summary = messagesBySeverity(diagnostics);

    const spanMismatchCount =
      summary[
        `${vscode.DiagnosticSeverity.Error}:Expected closing tag </span> but found </li>`
      ] ?? 0;
    const spanUnclosedCount =
      summary[
        `${vscode.DiagnosticSeverity.Warning}:Unclosed tag <span>`
      ] ?? 0;
    const anchorMismatchCount =
      summary[
        `${vscode.DiagnosticSeverity.Error}:Expected closing tag </a> but found </li>`
      ] ?? 0;
    const anchorUnclosedCount =
      summary[
        `${vscode.DiagnosticSeverity.Warning}:Unclosed tag <a>`
      ] ?? 0;

    assert.ok(spanMismatchCount >= 1 && spanMismatchCount <= 2);
    assert.ok(spanUnclosedCount >= 1 && spanUnclosedCount <= 2);
    assert.ok(anchorMismatchCount >= 1 && anchorMismatchCount <= 2);
    assert.ok(anchorUnclosedCount >= 1 && anchorUnclosedCount <= 2);

    assert.ok(diagnostics.length >= 4 && diagnostics.length <= 8);
  });

  test("no false positives from JS code containing < and > inside <script> block", async () => {
    // Regression: .replace(/</g,'&lt;').replace(/>/g,'&gt;') was parsed as
    // HTML tags </g,'&lt;').replace(/> and flagged as an unmatched closing tag.
    const diagnostics = await getDiagnostics(
      [
        "const generateHtml = () => /* html */`",
        "  <div>",
        "    <script>",
        "      function escHtml(s) {",
        "        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');",
        "      }",
        "    </script>",
        "  </div>",
        "`;",
      ].join("\n")
    );

    assert.equal(diagnostics.length, 0);
  });

  test("no false positives from CSS selectors containing > inside <style> block", async () => {
    const diagnostics = await getDiagnostics(
      [
        "const view = html`",
        "  <style>",
        "    .parent > .child { color: red; }",
        "    .foo > .bar > .baz { font-size: 12px; }",
        "  </style>",
        "  <div class='parent'><span class='child'>Hello</span></div>",
        "`;",
      ].join("\n")
    );

    assert.equal(diagnostics.length, 0);
  });

  test("no false positives from <script> block with attributes", async () => {
    const diagnostics = await getDiagnostics(
      [
        "const view = html`",
        '  <script type="module">',
        "    const inRange = x > 0 && x < 10;",
        "  </script>",
        "  <div>content</div>",
        "`;",
      ].join("\n")
    );

    assert.equal(diagnostics.length, 0);
  });

  test("still reports real HTML errors after a <script> block", async () => {
    const diagnostics = await getDiagnostics(
      [
        "const view = html`",
        "  <script>",
        "    const x = 1 < 2 ? 'a' : 'b';",
        "  </script>",
        "  <div>",
        "    <span>",
        "  </div>",
        "`;",
      ].join("\n")
    );

    const summary = messagesBySeverity(diagnostics);

    assert.equal(
      summary[
        `${vscode.DiagnosticSeverity.Error}:Expected closing tag </span> but found </div>`
      ],
      1
    );
  });
});
