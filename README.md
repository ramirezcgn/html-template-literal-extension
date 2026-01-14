# HTML Template Literal Extension

VS Code extension for enhanced HTML support in template literals.

## Features

- **Code Folding**: Collapse and expand HTML blocks inside template literals (e.g., dom, html, etc.).
- **HTML IntelliSense**: Get tag and attribute suggestions, autocompletion, and documentation inside template literals.
- **Validation**: See errors and warnings for invalid HTML directly in your JavaScript/TypeScript code.
- **Configurable Tag Detection**: Supports custom tag names for template literals (e.g., `dom`, `html`, `myHtml`).

## Usage

1. Open a JavaScript or TypeScript file.
2. Write HTML inside a tagged template literal using any of these patterns:
	 ```js
	 // Using tag names (html or dom)
	 const markup = dom`
		 <section>
			 <h1>Hello!</h1>
		 </section>
	 `;
	 
	 // Using comment annotation (works anywhere, including nested)
	 const component = /* html */`
		 <div class="component">
			 ${condition ? /* html */`<span>Nested</span>` : ''}
		 </div>
	 `;
	 ```
3. Enjoy folding, IntelliSense, and validation as you type.

## Configuration

You can configure which tag names are recognized as HTML template literals in your VS Code settings:

```json
"htmlTemplateLiteral.tags": ["dom", "html"]
```

## Requirements

- Visual Studio Code 1.60 or higher

## License

[MIT](LICENSE)
