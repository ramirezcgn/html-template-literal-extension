import * as vscode from 'vscode';

/**
 * Provides HTML completion items inside template literals
 */
export class TemplateLiteralCompletionProvider
  implements vscode.CompletionItemProvider
{
  private readonly tagPatterns: string[];
  private readonly htmlTags: string[] = [
    "div",
    "span",
    "p",
    "a",
    "button",
    "input",
    "form",
    "label",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "nav",
    "header",
    "footer",
    "section",
    "article",
    "aside",
    "main",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "img",
    "video",
    "audio",
    "canvas",
    "svg",
  ];

  private readonly htmlAttributes: { [key: string]: string[] } = {
    "*": ["class", "id", "style", "title", "data-", "aria-"],
    a: ["href", "target", "rel"],
    button: ["type", "disabled", "onclick"],
    input: ["type", "value", "placeholder", "name", "required", "disabled"],
    form: ["action", "method", "enctype"],
    img: ["src", "alt", "width", "height"],
    label: ["for"],
  };

  constructor(tagPatterns: string[] = ["html", "dom"]) {
    this.tagPatterns = tagPatterns;
  }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    // Check if we're inside a template literal
    if (!this.isInsideTemplateLiteral(document, position)) {
      return [];
    }

    const lineText = document.lineAt(position.line).text;
    const linePrefix = lineText.substring(0, position.character);

    // Check if we're typing a tag
    const tagRegex = /<[a-zA-Z]*$/;
    if (tagRegex.exec(linePrefix)) {
      return this.getTagCompletions();
    }

    // Check if we're typing an attribute
    if (this.isTypingAttribute(linePrefix)) {
      return this.getAttributeCompletions(linePrefix);
    }

    return [];
  }

  private isInsideTemplateLiteral(
    document: vscode.TextDocument,
    position: vscode.Position
  ): boolean {
    const text = document.getText(
      new vscode.Range(new vscode.Position(0, 0), position)
    );
    const tagPattern = this.tagPatterns.join("|");
    const regex = new RegExp(
      `((?:${tagPattern})\s*|\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*/\*\s*html\s*\*/\s*)\``,
      "g"
    );

    let lastMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      lastMatch = match;
    }

    if (!lastMatch) {
      return false;
    }

    // Check if there's a closing backtick after the last match
    const afterMatch = text.substring(lastMatch.index + lastMatch[0].length);
    const closingBacktick = afterMatch.indexOf("`");

    // We're inside if there's no closing backtick or if it comes after our position
    return closingBacktick === -1 || closingBacktick >= afterMatch.length - 1;
  }

  private isTypingAttribute(linePrefix: string): boolean {
    // Check if we're inside a tag and after the tag name
    const tagRegex = /<([a-zA-Z]+)\s+[^>]*$/;
    const tagMatch = tagRegex.exec(linePrefix);
    return tagMatch !== null;
  }

  private getTagCompletions(): vscode.CompletionItem[] {
    return this.htmlTags.map((tag) => {
      const item = new vscode.CompletionItem(
        tag,
        vscode.CompletionItemKind.Property
      );
      item.insertText = new vscode.SnippetString(`${tag}$1>$2</${tag}>`);
      item.documentation = `HTML <${tag}> element`;
      return item;
    });
  }

  private getAttributeCompletions(linePrefix: string): vscode.CompletionItem[] {
    const tagRegex = /<([a-zA-Z]+)/;
    const tagMatch = tagRegex.exec(linePrefix);
    const tagName = tagMatch ? tagMatch[1] : "*";

    const commonAttrs = this.htmlAttributes["*"] || [];
    const specificAttrs = this.htmlAttributes[tagName] || [];
    const allAttrs = [...new Set([...commonAttrs, ...specificAttrs])];

    return allAttrs.map((attr) => {
      const item = new vscode.CompletionItem(
        attr,
        vscode.CompletionItemKind.Property
      );
      if (attr.endsWith("-")) {
        item.insertText = new vscode.SnippetString(`${attr}$1="$2"`);
      } else {
        item.insertText = new vscode.SnippetString(`${attr}="$1"`);
      }
      item.documentation = `HTML ${attr} attribute`;
      return item;
    });
  }
}
