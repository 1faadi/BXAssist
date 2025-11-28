/**
 * Text Formatting Utilities
 * 
 * Helper functions for formatting text in Slack messages and other contexts.
 */

/**
 * Convert multiline text into bullet points
 * 
 * - Splits by newline
 * - Trims each line
 * - Removes empty lines
 * - If line already starts with "•" or "-", keeps it as-is (normalizes "-" to "•")
 * - Otherwise prefixes with "• "
 * 
 * @param input - Multiline text input
 * @returns Formatted bullet list string
 * 
 * @example
 * toBullets("Task 1\nTask 2\n• Task 3")
 * // Returns: "• Task 1\n• Task 2\n• Task 3"
 */
export function toBullets(input: string): string {
  if (!input || !input.trim()) {
    return ''
  }

  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0) // Remove empty lines
    .map((line) => {
      // If line already starts with "•" or "-", normalize to "•" and keep as-is
      if (line.startsWith('•')) {
        return line
      }
      if (line.startsWith('-')) {
        return '•' + line.substring(1)
      }
      // Otherwise prefix with "• "
      return `• ${line}`
    })
    .join('\n')
}

