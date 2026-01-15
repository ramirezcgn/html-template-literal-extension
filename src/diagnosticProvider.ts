import * as vscode from "vscode";
import { isInsideComment } from "./utils";

/**
 * Provides HTML validation diagnostics for template literals
 */
export class TemplateLiteralDiagnosticProvider {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly tagPatterns: string[];

  constructor(tagPatterns: string[] = ["html", "dom"]) {
    this.tagPatterns = tagPatterns;
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(
      "htmlTemplateLiteral"
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
    const tagPattern = this.tagPatterns.join("|");
    const tagRegex = new RegExp(
      `((?:${tagPattern})\\s*|\\b[a-zA-Z_$][a-zA-Z0-9_$]*\\s*/\\*\\s*html\\s*\\*/\\s*|/\\*\\s*html\\s*\\*/\\s*)\``,
      "g"
    );

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
    let result = html;
    let i = 0;

    while (i < result.length) {
      // Find next interpolation start
      if (result[i] === "$" && result[i + 1] === "{") {
        const startPos = i;
        i += 2; // Skip ${

        // Count braces to find matching closing brace, handling strings and templates
        let depth = 1;
        let interpolationContent = "";
        let inString = false;
        let inTemplate = false;
        let stringChar = '';

        while (i < result.length && depth > 0) {
          const char = result[i];
          
          // Handle escape sequences
          if (char === '\\' && (inString || inTemplate)) {
            interpolationContent += char;
            i++;
            if (i < result.length) {
              interpolationContent += result[i];
              i++;
            }
            continue;
          }
          
          // Handle strings
          if (!inTemplate) {
            if (!inString && (char === '"' || char === "'")) {
              inString = true;
              stringChar = char;
            } else if (inString && char === stringChar) {
              inString = false;
            }
          }
          
          // Handle template strings
          if (!inString && char === '`') {
            inTemplate = !inTemplate;
          }
          
          // Only count braces outside of strings and templates
          if (!inString && !inTemplate) {
            if (char === '{') {
              depth++;
            } else if (char === '}') {
              depth--;
              if (depth === 0) {
                break;
              }
            }
          }
          
          interpolationContent += char;
          i++;
        }

        if (depth === 0) {
          const replacement = "placeholder";
          result =
            result.substring(0, startPos) +
            replacement +
            result.substring(i + 1);
          i = startPos + replacement.length;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }

    return result;
  }

  /**
   * Extract the outer HTML structure from a template (opening and closing tags)
   */
  private extractOuterTags(html: string): string {
    // Remove leading/trailing whitespace and interpolations to find real HTML
    let cleanedForAnalysis = html.trim();

    // Remove leading interpolations to find first actual HTML tag
    while (cleanedForAnalysis.startsWith("${")) {
      const endBrace = this.findMatchingBrace(cleanedForAnalysis, 1);
      if (endBrace === -1) {
        break;
      }

      // Before skipping, check if there's a template literal inside this interpolation
      // This handles cases like: ${condition ? dom`<ul>...</ul>` : ''}
      const interpolationContent = cleanedForAnalysis.substring(2, endBrace);
      const nestedTemplateRegex = /(\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*\/\*\s*html\s*\*\/\s*|html|dom)\s*`/;
      const nestedTemplateMatch =
        nestedTemplateRegex.exec(interpolationContent);

      if (nestedTemplateMatch) {
        // Found a template inside the interpolation (e.g., ternary with template)
        const templateStart = interpolationContent.indexOf(
          "`",
          nestedTemplateMatch.index
        );
        if (templateStart !== -1) {
          const templateContent = this.extractTemplateContent(
            interpolationContent,
            templateStart + 1
          );
          if (templateContent) {
            // Recursively extract outer tags from this nested template
            return this.extractOuterTags(templateContent);
          }
        }
      }

      cleanedForAnalysis = cleanedForAnalysis.substring(endBrace + 1).trim();
    }

    // Find first opening tag
    const openTagRegex = /^<([a-zA-Z][a-zA-Z0-9]*)[^>]*>/;
    const openMatch = openTagRegex.exec(cleanedForAnalysis);
    if (!openMatch) {
      return "<span></span>"; // Fallback
    }

    const tagName = openMatch[1];
    const openingTag = openMatch[0];

    // Check if it's self-closing
    if (openingTag.endsWith("/>")) {
      return openingTag;
    }

    // Check if the template has multiple top-level elements
    // by looking for more opening tags or interpolations after the first element closes
    const firstElementEnd = cleanedForAnalysis.indexOf(`</${tagName}>`);
    if (firstElementEnd !== -1) {
      const afterFirstElement = cleanedForAnalysis
        .substring(firstElementEnd + `</${tagName}>`.length)
        .trim();

      // If there's more content after (like ${...} or another tag)
      const whitespaceRegex = /^\s*$/;
      if (
        afterFirstElement.length > 0 &&
        whitespaceRegex.exec(afterFirstElement) === null
      ) {
        // Multiple top-level elements - use the first element's tag type
        // This ensures we maintain valid HTML nesting (e.g., <li> stays <li> for <ul>)
        return `<${tagName}></${tagName}>`;
      }
    }

    // Single element - return its structure
    return `<${tagName}></${tagName}>`;
  }

  /**
   * Find the matching closing brace for an opening brace at position
   */
  private findMatchingBrace(text: string, startPos: number): number {
    let depth = 1;
    let i = startPos + 1;

    while (i < text.length && depth > 0) {
      if (text[i] === "{") {
        depth++;
      } else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
      i++;
    }

    return -1; // No matching brace found
  }

  private validateHTML(
    html: string,
    offset: number,
    document: vscode.TextDocument,
    diagnostics: vscode.Diagnostic[]
  ): void {
    const tagPattern = this.tagPatterns.join("|");
    const nestedTemplateRegex = new RegExp(
      `((?:${tagPattern})\\s*|\\b[a-zA-Z_$][a-zA-Z0-9_$]*\\s*/\\*\\s*html\\s*\\*/\\s*|/\\*\\s*html\\s*\\*/\\s*)\``,
      "g"
    );

    let nestedMatch: RegExpExecArray | null;
    const nestedTemplates: Array<{
      content: string;
      offset: number;
      outerStructure: string;
      // For tracking interpolations containing templates
      inInterpolation?: { start: number; end: number };
    }> = [];

    // Find all nested templates
    while ((nestedMatch = nestedTemplateRegex.exec(html)) !== null) {
      const startPos = nestedMatch.index + nestedMatch[0].length - 1; // Position of opening backtick
      const templateContent = this.extractTemplateContent(html, startPos + 1);

      if (templateContent !== null) {
        const absoluteOffset = offset + startPos + 1;
        const outerStructure = this.extractOuterTags(templateContent);

        // Check if this template is inside an interpolation
        const beforeTemplate = html.substring(0, nestedMatch.index);
        const lastInterpolationStart = beforeTemplate.lastIndexOf("${");

        let inInterpolation: { start: number; end: number } | undefined;
        if (lastInterpolationStart !== -1) {
          // Find the closing brace after this template
          const templateEndPos = startPos + 1 + templateContent.length + 1;
          const afterTemplate = html.substring(templateEndPos);

          // Count braces to find the matching closing brace
          let depth = 1; // We're already inside one ${
          let i = 0;
          for (; i < afterTemplate.length && depth > 0; i++) {
            if (afterTemplate[i] === "{") {
              depth++;
            } else if (afterTemplate[i] === "}") {
              depth--;
            }
          }

          if (depth === 0) {
            inInterpolation = {
              start: lastInterpolationStart,
              end: templateEndPos + i,
            };
          }
        }

        nestedTemplates.push({
          content: templateContent,
          offset: absoluteOffset,
          outerStructure,
          inInterpolation,
        });
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

    // Prepare cleaned HTML for parent validation
    let cleanedHtml = html;

    // Replace all nested templates with their outer structures
    if (nestedTemplates.length > 0) {
      // Build a map of template content to outer structure
      const templateReplacements = new Map<string, string>();
      for (const template of nestedTemplates) {
        templateReplacements.set(template.content, template.outerStructure);
      }

      // Replace nested templates iteratively until no more found
      let replacementsMade = true;
      let iterations = 0;
      const maxIterations = 20;

      while (replacementsMade && iterations < maxIterations) {
        replacementsMade = false;
        iterations++;

        const tagPattern = this.tagPatterns.join("|");
        const nestedRegex = new RegExp(
          `((?:${tagPattern})\\s*|\\b[a-zA-Z_$][a-zA-Z0-9_$]*\\s*/\\*\\s*html\\s*\\*/\\s*|/\\*\\s*html\\s*\\*/\\s*)([\\s\\S]*?)\``,
          "g"
        );

        cleanedHtml = cleanedHtml.replace(
          nestedRegex,
          (match, tag, content) => {
            // Check if this template content is in our replacement map
            for (const [
              templateContent,
              outerStructure,
            ] of templateReplacements.entries()) {
              if (content === templateContent) {
                replacementsMade = true;
                return outerStructure;
              }
            }
            return match; // Keep original if not in map
          }
        );
      }
    }

    // Replace remaining interpolations with placeholders
    if (cleanedHtml.includes("${")) {
      cleanedHtml = this.replaceInterpolationsWithPlaceholders(cleanedHtml);
    }

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
        // Closing tag
        if (stack.length === 0) {
          // Unmatched closing tag
          const range = new vscode.Range(
            document.positionAt(pos),
            document.positionAt(pos + fullMatch.length)
          );
          diagnostics.push(
            new vscode.Diagnostic(
              range,
              `Unmatched closing tag </${tagName}>`,
              vscode.DiagnosticSeverity.Error
            )
          );
        } else {
          const last = stack.pop();
          if (last && last.tag !== tagName) {
            // Mismatched closing tag
            const range = new vscode.Range(
              document.positionAt(pos),
              document.positionAt(pos + fullMatch.length)
            );
            diagnostics.push(
              new vscode.Diagnostic(
                range,
                `Expected closing tag </${last.tag}> but found </${tagName}>`,
                vscode.DiagnosticSeverity.Error
              )
            );
          }
        }
      } else if (!isSelfClosing) {
        // Opening tag (non-self-closing)
        stack.push({ tag: tagName, pos });
      }
    }

    // Check for unclosed tags
    for (const unclosed of stack) {
      const range = new vscode.Range(
        document.positionAt(unclosed.pos),
        document.positionAt(unclosed.pos + unclosed.tag.length + 2)
      );
      diagnostics.push(
        new vscode.Diagnostic(
          range,
          `Unclosed tag <${unclosed.tag}>`,
          vscode.DiagnosticSeverity.Warning
        )
      );
    }
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
}
