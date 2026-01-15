/**
 * Check if a position is inside a block comment
 */
export function isInsideComment(text: string, position: number): boolean {
  const beforeText = text.substring(0, position);
  let inComment = false;
  let inString = false;
  let inTemplateString = false;
  let templateDepth = 0;
  let stringChar = '';
  let i = 0;

  while (i < beforeText.length) {
    const char = beforeText[i];
    const nextChar = beforeText[i + 1];

    if (char === '\\' && (inString || inTemplateString)) {
      i += 2;
      continue;
    }

    if (!inComment && !inTemplateString) {
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

    if (!inComment && !inString) {
      if (char === '`') {
        inTemplateString = !inTemplateString;
        if (!inTemplateString) {
          templateDepth = 0;
        }
        i++;
        continue;
      }

      if (inTemplateString) {
        if (char === '$' && nextChar === '{') {
          templateDepth++;
          i += 2;
          continue;
        } else if (char === '}' && templateDepth > 0) {
          templateDepth--;
          i++;
          continue;
        }
      }
    }

    if (!inString) {
      if (char === '/' && nextChar === '*') {
        inComment = true;
        i += 2;
        continue;
      } else if (char === '*' && nextChar === '/') {
        inComment = false;
        i += 2;
        continue;
      }
    }

    i++;
  }

  return inComment;
}
