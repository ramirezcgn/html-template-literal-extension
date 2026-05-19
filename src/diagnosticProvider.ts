import * as vscode from "vscode";
import { isInsideComment } from "./utils";

/**
 * Provides HTML validation diagnostics for template literals
 */
export class TemplateLiteralDiagnosticProvider {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly tagPatterns: string[];

  constructor(
    tagPatterns: string[] = ["html", "dom"],
    collectionName = "htmlTemplateLiteral"
  ) {
    this.tagPatterns = tagPatterns;
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(
      collectionName
    );
  }

  public updateDiagnostics(document: vscode.TextDocument): void {
    if (
      document.languageId !== "javascript" &&
      document.languageId !== "typescript" &&
      document.languageId !== "javascriptreact" &&
      document.languageId !== "typescriptreact"
    ) {
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();

    // Find all template literals with proper nesting handling
    const tagRegex = this.getTaggedTemplateRegex();

    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(text)) !== null) {
      const startPos = match.index + match[0].length - 1; // Position of opening backtick

      // Check if this position is inside a comment
      if (isInsideComment(text, startPos)) {
        continue;
      }

      const templateContent = this.extractTemplateContent(text, startPos + 1);

      if (templateContent !== null) {
        // Validate HTML in template
        this.validateHTML(templateContent, startPos + 1, document, diagnostics);

        // Skip nested tagged templates here; validateHTML handles them recursively.
        tagRegex.lastIndex = startPos + templateContent.length + 1;
      }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Extract template literal content handling nested templates and interpolations
   */
  private extractTemplateContent(
    text: string,
    startPos: number
  ): string | null {
    let depth = 0;
    let i = startPos;
    let inString = false;
    let inNestedTemplate = false;
    let stringChar = '';

    while (i < text.length) {
      const char = text[i];
      const nextChar = text[i + 1];
      const prevChar = i > 0 ? text[i - 1] : "";

      // Handle escape sequences
      if (prevChar === "\\" && (inString || inNestedTemplate)) {
        i++;
        continue;
      }

      // Handle strings (only when not in nested template at depth > 0)
      if (depth > 0 && !inNestedTemplate) {
        if (!inString && (char === '"' || char === "'")) {
          inString = true;
          stringChar = char;
          i++;
          continue;
        } else if (inString && char === stringChar) {
          inString = false;
          i++;
          continue;
        }
      }

      // Handle nested template strings (inside interpolations)
      if (depth > 0 && !inString && char === '`') {
        inNestedTemplate = !inNestedTemplate;
        i++;
        continue;
      }

      // Check for interpolation start (not inside strings or nested templates)
      if (!inString && !inNestedTemplate && char === "$" && nextChar === "{") {
        depth++;
        i += 2;
        continue;
      }

      // Track braces (only when not in strings or nested templates)
      if (!inString && !inNestedTemplate) {
        if (char === "{") {
          depth++;
        } else if (char === "}") {
          if (depth > 0) {
            depth--;
          }
        }
      }

      // Found closing backtick when not inside interpolation or nested template
      if (char === "`" && depth === 0 && !inNestedTemplate) {
        return text.substring(startPos, i);
      }

      i++;
    }

    return null; // Unclosed template
  }

  private replaceInterpolationsWithPlaceholders(html: string): string {
    const chars = html.split("");
    let i = 0;

    while (i < html.length) {
      if (html[i] === "$" && html[i + 1] === "{") {
        const startPos = i;
        const endPos = this.findInterpolationEnd(html, startPos);

        if (endPos !== -1) {
          // Preserve exact length to keep diagnostic offsets aligned with source.
          for (let j = startPos; j <= endPos; j++) {
            chars[j] = " ";
          }
          i = endPos + 1;
          continue;
        }
      }

      i++;
    }

    return chars.join("");
  }

  private findInterpolationEnd(text: string, startPos: number): number {
    let i = startPos + 2;
    let depth = 1;
    let inString = false;
    let inTemplate = false;
    let stringChar = "";

    while (i < text.length) {
      const char = text[i];

      if (char === "\\" && (inString || inTemplate)) {
        i += 2;
        continue;
      }

      if (!inTemplate) {
        if (!inString && (char === '"' || char === "'")) {
          inString = true;
          stringChar = char;
          i++;
          continue;
        }

        if (inString && char === stringChar) {
          inString = false;
          i++;
          continue;
        }
      }

      if (!inString && char === "`") {
        inTemplate = !inTemplate;
        i++;
        continue;
      }

      if (!inString && !inTemplate) {
        if (char === "{") {
          depth++;
        } else if (char === "}") {
          depth--;
          if (depth === 0) {
            return i;
          }
        }
      }

      i++;
    }

    return -1;
  }

  private validateHTML(
    html: string,
    offset: number,
    document: vscode.TextDocument,
    diagnostics: vscode.Diagnostic[]
  ): void {
    const nestedTemplateRegex = this.getTaggedTemplateRegex();

    let nestedMatch: RegExpExecArray | null;
    const nestedTemplates: Array<{
      content: string;
      offset: number;
      literalStart: number;
      literalEnd: number;
    }> = [];

    // Find all nested templates
    while ((nestedMatch = nestedTemplateRegex.exec(html)) !== null) {
      const startPos = nestedMatch.index + nestedMatch[0].length - 1; // Position of opening backtick
      const templateContent = this.extractTemplateContent(html, startPos + 1);

      if (templateContent !== null) {
        const absoluteOffset = offset + startPos + 1;
        const literalStart = nestedMatch.index;
        const literalEnd = startPos + 1 + templateContent.length;

        nestedTemplates.push({
          content: templateContent,
          offset: absoluteOffset,
          literalStart,
          literalEnd,
        });

        // Skip deeper nested tagged templates; recursive validation handles them.
        nestedTemplateRegex.lastIndex = literalEnd + 1;
      }
    }

    // Validate each nested template independently
    for (const nested of nestedTemplates) {
      // Check if this nested template is inside a comment in the original document
      const docText = document.getText();
      if (!isInsideComment(docText, nested.offset)) {
        this.validateHTML(nested.content, nested.offset, document, diagnostics);
      }
    }

    // Validate the parent template against a masked copy so offsets remain stable.
    let cleanedHtml = html;

    if (nestedTemplates.length > 0) {
      const chars = cleanedHtml.split("");
      for (const nested of nestedTemplates) {
        for (let i = nested.literalStart; i <= nested.literalEnd; i++) {
          chars[i] = " ";
        }
      }
      cleanedHtml = chars.join("");
    }

    if (cleanedHtml.includes("${")) {
      cleanedHtml = this.replaceInterpolationsWithPlaceholders(cleanedHtml);
    }

    cleanedHtml = this.replaceScriptStyleContent(cleanedHtml);

    const stack: { tag: string; pos: number }[] = [];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;

    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(cleanedHtml)) !== null) {
      const fullMatch = match[0];
      const tagName = match[1];
      const isClosing = fullMatch.startsWith("</");
      const isSelfClosing =
        fullMatch.endsWith("/>") || this.isSelfClosingTag(tagName);
      const pos = offset + match.index;

      if (isClosing) {
        if (stack.length === 0) {
          const range = new vscode.Range(
            document.positionAt(pos),
            document.positionAt(pos + fullMatch.length)
          );
          diagnostics.push(
            this.createDiagnostic(
              range,
              `Unmatched closing tag </${tagName}>`,
              vscode.DiagnosticSeverity.Error
            )
          );
          continue;
        }

        const last = stack.at(-1);
        if (!last) {
          continue;
        }
        if (last.tag === tagName) {
          stack.pop();
          continue;
        }

        const matchingOpenIndex = stack
          .map((entry) => entry.tag)
          .lastIndexOf(tagName);

        if (matchingOpenIndex !== -1) {
          const implicitlyUnclosed = stack.slice(matchingOpenIndex + 1);

          for (const unclosed of implicitlyUnclosed) {
            const warningRange = new vscode.Range(
              document.positionAt(unclosed.pos),
              document.positionAt(unclosed.pos + unclosed.tag.length + 2)
            );
            diagnostics.push(
              this.createDiagnostic(
                warningRange,
                `Unclosed tag <${unclosed.tag}>`,
                vscode.DiagnosticSeverity.Warning
              )
            );
          }

          const range = new vscode.Range(
            document.positionAt(pos),
            document.positionAt(pos + fullMatch.length)
          );
          diagnostics.push(
            this.createDiagnostic(
              range,
              `Expected closing tag </${last.tag}> but found </${tagName}>`,
              vscode.DiagnosticSeverity.Error
            )
          );

          // Recover parser state to reduce cascade errors.
          stack.splice(matchingOpenIndex);
          continue;
        }

        const range = new vscode.Range(
          document.positionAt(pos),
          document.positionAt(pos + fullMatch.length)
        );
        diagnostics.push(
          this.createDiagnostic(
            range,
            `Unmatched closing tag </${tagName}>`,
            vscode.DiagnosticSeverity.Error
          )
        );
      } else if (!isSelfClosing) {
        stack.push({ tag: tagName, pos });
      }
    }

    for (const unclosed of stack) {
      const range = new vscode.Range(
        document.positionAt(unclosed.pos),
        document.positionAt(unclosed.pos + unclosed.tag.length + 2)
      );
      diagnostics.push(
        this.createDiagnostic(
          range,
          `Unclosed tag <${unclosed.tag}>`,
          vscode.DiagnosticSeverity.Warning
        )
      );
    }
  }

  private replaceScriptStyleContent(html: string): string {
    // Replace content inside <script> and <style> blocks with spaces to
    // avoid false positives from JS/CSS code being parsed as HTML tags.
    return html.replace(
      /(<(?:script|style)(?:\s[^>]*)?>)([\s\S]*?)(<\/(?:script|style)>)/gi,
      (_, openTag: string, content: string, closeTag: string) =>
        openTag + " ".repeat(content.length) + closeTag
    );
  }

  private isSelfClosingTag(tagName: string): boolean {
    const selfClosingTags = [
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr",
    ];
    return selfClosingTags.includes(tagName.toLowerCase());
  }

  public dispose(): void {
    this.diagnosticCollection.dispose();
  }

  private getTaggedTemplateRegex(): RegExp {
    const tagPattern = this.tagPatterns.join("|");
    return new RegExp(
      `((?:${tagPattern})\\s*|\\b[a-zA-Z_$][a-zA-Z0-9_$]*\\s*/\\*\\s*html\\s*\\*/\\s*|/\\*\\s*html\\s*\\*/\\s*)\``,
      "g"
    );
  }

  private createDiagnostic(
    range: vscode.Range,
    message: string,
    severity: vscode.DiagnosticSeverity
  ): vscode.Diagnostic {
    const diagnostic = new vscode.Diagnostic(range, message, severity);
    diagnostic.source = "html-template-literal";
    return diagnostic;
  }
}
