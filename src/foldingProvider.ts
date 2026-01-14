import * as vscode from 'vscode';

/**
 * Provides folding ranges for HTML template literals
 */
export class TemplateLiteralFoldingProvider
  implements vscode.FoldingRangeProvider
{
  private readonly tagPatterns: string[];

  constructor(tagPatterns: string[] = ['html', 'dom']) {
    this.tagPatterns = tagPatterns;
  }

  provideFoldingRanges(
    document: vscode.TextDocument,
    context: vscode.FoldingContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FoldingRange[]> {
    const foldingRanges: vscode.FoldingRange[] = [];
    const text = document.getText();
    const processedPositions = new Set<number>();

    // Build regex pattern to match tagged template literals
    // Matches: dom`, html`, or anything/*html*/` (including /*html*/`, dom/*html*/`, foo/*html*/`)
    const tagPattern = this.tagPatterns.join('|');
    const regex = new RegExp(
      `((?:${tagPattern})\\s*|\\b[a-zA-Z_$][a-zA-Z0-9_$]*\\s*/\\*\\s*html\\s*\\*/\\s*)\``,
      'g'
    );

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (token.isCancellationRequested) {
        return [];
      }

      const startPos = match.index + match[0].length;

      // Skip if we already processed this position (nested templates)
      if (processedPositions.has(startPos)) {
        continue;
      }
      processedPositions.add(startPos);

      // Start folding from the line where the tag is (not after the backtick)
      const tagStartPos = match.index;
      const startLine = document.positionAt(tagStartPos).line;

      // Find the closing backtick, accounting for escaped backticks
      const endPos = this.findClosingBacktick(text, startPos);
      if (endPos === -1) {
        continue;
      }

      // End folding at the line with the closing backtick
      const endLine = document.positionAt(endPos).line;

      // Only create folding range if it spans at least 3 lines
      if (endLine - startLine >= 2) {
        const range = new vscode.FoldingRange(startLine, endLine);
        foldingRanges.push(range);
      }
    }

    // Filter out overlapping ranges - keep only the outermost ones
    const filteredRanges = foldingRanges.filter((range, index) => {
      // Check if this range is contained within any other range
      return !foldingRanges.some((otherRange, otherIndex) => {
        if (index === otherIndex) {
          return false;
        }
        // otherRange contains range if it starts before or at the same line and ends after or at the same line
        return (
          otherRange.start <= range.start &&
          otherRange.end >= range.end &&
          (otherRange.start < range.start || otherRange.end > range.end)
        );
      });
    });

    return filteredRanges;
  }

  /**
   * Finds the closing backtick of a template literal, handling nested template literals
   */
  private findClosingBacktick(text: string, startPos: number): number {
    let depth = 1;
    let i = startPos;
    let inString = false;
    let stringChar = '';

    while (i < text.length && depth > 0) {
      const char = text[i];
      const prevChar = i > 0 ? text[i - 1] : '';

      // Skip escaped characters
      if (prevChar === '\\') {
        i++;
        continue;
      }

      // Track string literals inside template
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar) {
        inString = false;
        stringChar = '';
      }

      // Only count backticks outside of strings
      if (!inString) {
        if (char === '`') {
          depth--;
          if (depth === 0) {
            return i;
          }
        } else if (char === '$' && i + 1 < text.length && text[i + 1] === '{') {
          // Entering interpolation
          depth++;
          i++; // Skip the '{'
        } else if (char === '}' && depth > 1) {
          // Exiting interpolation
          depth--;
        }
      }

      i++;
    }

    return -1;
  }
}
