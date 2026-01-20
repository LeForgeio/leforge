/**
 * String Utilities - Embedded FlowForge Plugin
 * Lightweight string manipulation functions
 */

// =============================================================================
// Case Conversion
// =============================================================================

/**
 * Convert string to URL-friendly slug
 * @param {string|{text: string, separator?: string}} input
 * @returns {string}
 */
function slugify(input) {
  const text = typeof input === 'string' ? input : input.text;
  const separator = (typeof input === 'object' && input.separator) || '-';
  
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, separator)           // Replace spaces with separator
    .replace(/[^\w\-]+/g, '')             // Remove non-word chars
    .replace(/\-\-+/g, separator)         // Replace multiple separators
    .replace(/^-+/, '')                   // Trim separator from start
    .replace(/-+$/, '');                  // Trim separator from end
}

/**
 * Convert string to camelCase
 * @param {string|{text: string}} input
 * @returns {string}
 */
function camelCase(input) {
  const text = typeof input === 'string' ? input : input.text;
  
  return text
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) => 
      index === 0 ? letter.toLowerCase() : letter.toUpperCase()
    )
    .replace(/[\s\-_]+/g, '');
}

/**
 * Convert string to PascalCase
 * @param {string|{text: string}} input
 * @returns {string}
 */
function pascalCase(input) {
  const text = typeof input === 'string' ? input : input.text;
  
  return text
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter) => letter.toUpperCase())
    .replace(/[\s\-_]+/g, '');
}

/**
 * Convert string to snake_case
 * @param {string|{text: string}} input
 * @returns {string}
 */
function snakeCase(input) {
  const text = typeof input === 'string' ? input : input.text;
  
  return text
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/^_/, '')
    .replace(/_+/g, '_');
}

/**
 * Convert string to kebab-case
 * @param {string|{text: string}} input
 * @returns {string}
 */
function kebabCase(input) {
  const text = typeof input === 'string' ? input : input.text;
  
  return text
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/^-/, '')
    .replace(/-+/g, '-');
}

/**
 * Capitalize first letter of string
 * @param {string|{text: string}} input
 * @returns {string}
 */
function capitalize(input) {
  const text = typeof input === 'string' ? input : input.text;
  
  if (!text || text.length === 0) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Convert string to Title Case
 * @param {string|{text: string}} input
 * @returns {string}
 */
function titleCase(input) {
  const text = typeof input === 'string' ? input : input.text;
  
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// =============================================================================
// String Manipulation
// =============================================================================

/**
 * Truncate string to specified length
 * @param {{text: string, length?: number, suffix?: string}} input
 * @param {object} config - Plugin configuration
 * @returns {string}
 */
function truncate(input, config) {
  const text = typeof input === 'string' ? input : input.text;
  const length = (typeof input === 'object' && input.length) || config?.defaultTruncateLength || 100;
  const suffix = (typeof input === 'object' && input.suffix) || config?.truncateSuffix || '...';
  
  if (text.length <= length) return text;
  return text.slice(0, length - suffix.length) + suffix;
}

/**
 * Reverse a string
 * @param {string|{text: string}} input
 * @returns {string}
 */
function reverse(input) {
  const text = typeof input === 'string' ? input : input.text;
  return text.split('').reverse().join('');
}

/**
 * Pad string on the left
 * @param {{text: string, length: number, char?: string}} input
 * @returns {string}
 */
function padLeft(input) {
  const text = typeof input === 'object' ? input.text : input;
  const length = input.length || 0;
  const char = input.char || ' ';
  
  if (text.length >= length) return text;
  return char.repeat(length - text.length) + text;
}

/**
 * Pad string on the right
 * @param {{text: string, length: number, char?: string}} input
 * @returns {string}
 */
function padRight(input) {
  const text = typeof input === 'object' ? input.text : input;
  const length = input.length || 0;
  const char = input.char || ' ';
  
  if (text.length >= length) return text;
  return text + char.repeat(length - text.length);
}

/**
 * Remove all whitespace from string
 * @param {string|{text: string}} input
 * @returns {string}
 */
function removeWhitespace(input) {
  const text = typeof input === 'string' ? input : input.text;
  return text.replace(/\s+/g, '');
}

/**
 * Normalize whitespace (collapse multiple spaces to single)
 * @param {string|{text: string}} input
 * @returns {string}
 */
function normalizeWhitespace(input) {
  const text = typeof input === 'string' ? input : input.text;
  return text.replace(/\s+/g, ' ').trim();
}

// =============================================================================
// HTML Utilities
// =============================================================================

/**
 * Remove HTML tags from string (sanitize)
 * @param {string|{text: string}} input
 * @returns {string}
 */
function sanitizeHtml(input) {
  const text = typeof input === 'string' ? input : input.text;
  return text.replace(/<[^>]*>/g, '');
}

/**
 * Escape HTML special characters
 * @param {string|{text: string}} input
 * @returns {string}
 */
function escapeHtml(input) {
  const text = typeof input === 'string' ? input : input.text;
  
  const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  
  return text.replace(/[&<>"']/g, char => htmlEntities[char]);
}

/**
 * Unescape HTML entities
 * @param {string|{text: string}} input
 * @returns {string}
 */
function unescapeHtml(input) {
  const text = typeof input === 'string' ? input : input.text;
  
  const htmlEntities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
  };
  
  return text.replace(/&(?:amp|lt|gt|quot|#39|#x27|#x2F);/g, entity => htmlEntities[entity] || entity);
}

// =============================================================================
// Analysis
// =============================================================================

/**
 * Count words in string
 * @param {string|{text: string}} input
 * @returns {{count: number, words: string[]}}
 */
function wordCount(input) {
  const text = typeof input === 'string' ? input : input.text;
  
  const words = text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0);
  
  return {
    count: words.length,
    words: words,
  };
}

// =============================================================================
// Export all functions
// =============================================================================

module.exports = {
  slugify,
  camelCase,
  pascalCase,
  snakeCase,
  kebabCase,
  capitalize,
  titleCase,
  truncate,
  reverse,
  padLeft,
  padRight,
  removeWhitespace,
  normalizeWhitespace,
  sanitizeHtml,
  escapeHtml,
  unescapeHtml,
  wordCount,
};
