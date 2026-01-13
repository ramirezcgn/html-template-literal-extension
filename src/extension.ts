import * as vscode from 'vscode';
import { TemplateLiteralFoldingProvider } from './foldingProvider';
import { TemplateLiteralCompletionProvider } from './completionProvider';
import { TemplateLiteralDiagnosticProvider } from './diagnosticProvider';

const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'javascriptreact',
  'typescriptreact',
];

let originalFoldingStrategy: string | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('HTML Template Literal extension is now active!');

  // Get configuration
  const config = vscode.workspace.getConfiguration('htmlTemplateLiteral');
  const tagPatterns = config.get<string[]>('tags', ['html', 'dom']);

  // Store original folding strategy
  const editorConfig = vscode.workspace.getConfiguration('editor');
  originalFoldingStrategy = editorConfig.get<string>('foldingStrategy');

  // Force indentation-based folding for better compatibility
  if (originalFoldingStrategy !== 'indentation') {
    editorConfig
      .update(
        'foldingStrategy',
        'indentation',
        vscode.ConfigurationTarget.Global
      )
      .then(() => {
        vscode.window
          .showInformationMessage(
            'HTML Template Literal: Folding strategy changed to "indentation". Reload to apply changes.',
            'Reload'
          )
          .then((selection) => {
            if (selection === 'Reload') {
              vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          });
      });
  }

  // Register folding range provider
  const foldingProvider = new TemplateLiteralFoldingProvider(tagPatterns);
  SUPPORTED_LANGUAGES.forEach((language) => {
    context.subscriptions.push(
      vscode.languages.registerFoldingRangeProvider(
        { scheme: 'file', language },
        foldingProvider
      )
    );
  });

  // Register completion provider
  const completionProvider = new TemplateLiteralCompletionProvider(tagPatterns);
  SUPPORTED_LANGUAGES.forEach((language) => {
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        { scheme: 'file', language },
        completionProvider,
        '<',
        ' ',
        '='
      )
    );
  });

  // Register diagnostic provider with interpolation support
  const diagnosticProvider = new TemplateLiteralDiagnosticProvider(tagPatterns);
  context.subscriptions.push(diagnosticProvider);

  // Update diagnostics on document change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (SUPPORTED_LANGUAGES.includes(event.document.languageId)) {
        diagnosticProvider.updateDiagnostics(event.document);
      }
    })
  );

  // Update diagnostics on document open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (SUPPORTED_LANGUAGES.includes(document.languageId)) {
        diagnosticProvider.updateDiagnostics(document);
      }
    })
  );

  // Update diagnostics for all open documents
  vscode.workspace.textDocuments.forEach((document) => {
    if (SUPPORTED_LANGUAGES.includes(document.languageId)) {
      diagnosticProvider.updateDiagnostics(document);
    }
  });
}

export function deactivate() {
  // Restore original folding strategy
  if (originalFoldingStrategy !== undefined) {
    vscode.workspace
      .getConfiguration('editor')
      .update(
        'foldingStrategy',
        originalFoldingStrategy,
        vscode.ConfigurationTarget.Global
      );
  }
}
