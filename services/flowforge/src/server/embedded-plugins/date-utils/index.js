/**
 * Date Utilities - Embedded FlowForge Plugin
 * Lightweight date and time manipulation functions
 */

// =============================================================================
// Date Parsing & Creation
// =============================================================================

/**
 * Get current date/time
 * @param {{format?: string, timezone?: string}} input
 * @param {object} config
 * @returns {{iso: string, unix: number, formatted: string}}
 */
function now(input, config) {
  const date = new Date();
  const formatStr = input?.format || config?.defaultFormat || 'YYYY-MM-DD HH:mm:ss';
  
  return {
    iso: date.toISOString(),
    unix: Math.floor(date.getTime() / 1000),
    formatted: formatDate(date, formatStr),
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    weekday: date.getDay(),
  };
}

/**
 * Parse a date string
 * @param {{date: string, format?: string}} input
 * @returns {{valid: boolean, iso?: string, unix?: number, error?: string}}
 */
function parse(input) {
  const dateStr = typeof input === 'string' ? input : input.date;
  
  try {
    const date = new Date(dateStr);
    
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Invalid date string' };
    }
    
    return {
      valid: true,
      iso: date.toISOString(),
      unix: Math.floor(date.getTime() / 1000),
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Check if a date is valid
 * @param {string|{date: string}} input
 * @returns {{valid: boolean}}
 */
function isValid(input) {
  const dateStr = typeof input === 'string' ? input : input.date;
  const date = new Date(dateStr);
  return { valid: !isNaN(date.getTime()) };
}

/**
 * Convert date to ISO string
 * @param {string|{date: string}} input
 * @returns {string}
 */
function toISO(input) {
  const dateStr = typeof input === 'string' ? input : input.date;
  return new Date(dateStr).toISOString();
}

/**
 * Convert date to Unix timestamp
 * @param {string|{date: string}} input
 * @returns {number}
 */
function toUnix(input) {
  const dateStr = typeof input === 'string' ? input : input.date;
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

/**
 * Convert Unix timestamp to date
 * @param {number|{timestamp: number, format?: string}} input
 * @param {object} config
 * @returns {{iso: string, formatted: string}}
 */
function fromUnix(input, config) {
  const timestamp = typeof input === 'number' ? input : input.timestamp;
  const formatStr = (typeof input === 'object' && input.format) || config?.defaultFormat || 'YYYY-MM-DD HH:mm:ss';
  
  const date = new Date(timestamp * 1000);
  
  return {
    iso: date.toISOString(),
    formatted: formatDate(date, formatStr),
  };
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format a date according to pattern
 * @param {{date: string, format: string}} input
 * @param {object} config
 * @returns {string}
 */
function format(input, config) {
  const dateStr = typeof input === 'string' ? input : input.date;
  const formatStr = (typeof input === 'object' && input.format) || config?.defaultFormat || 'YYYY-MM-DD HH:mm:ss';
  
  const date = new Date(dateStr);
  return formatDate(date, formatStr);
}

/**
 * Internal format helper
 */
function formatDate(date, pattern) {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  
  const tokens = {
    'YYYY': date.getFullYear(),
    'YY': String(date.getFullYear()).slice(-2),
    'MM': pad(date.getMonth() + 1),
    'M': date.getMonth() + 1,
    'DD': pad(date.getDate()),
    'D': date.getDate(),
    'HH': pad(date.getHours()),
    'H': date.getHours(),
    'hh': pad(date.getHours() % 12 || 12),
    'h': date.getHours() % 12 || 12,
    'mm': pad(date.getMinutes()),
    'm': date.getMinutes(),
    'ss': pad(date.getSeconds()),
    's': date.getSeconds(),
    'SSS': pad(date.getMilliseconds(), 3),
    'A': date.getHours() >= 12 ? 'PM' : 'AM',
    'a': date.getHours() >= 12 ? 'pm' : 'am',
  };
  
  let result = pattern;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(token, 'g'), String(value));
  }
  
  return result;
}

// =============================================================================
// Relative Time
// =============================================================================

/**
 * Get human-readable relative time (e.g., "2 hours ago")
 * @param {{date: string, relativeTo?: string}} input
 * @returns {{text: string, direction: string, value: number, unit: string}}
 */
function relativeTime(input) {
  const dateStr = typeof input === 'string' ? input : input.date;
  const relativeToStr = input.relativeTo;
  
  const date = new Date(dateStr);
  const relativeTo = relativeToStr ? new Date(relativeToStr) : new Date();
  
  const diffMs = relativeTo.getTime() - date.getTime();
  const absDiff = Math.abs(diffMs);
  const isPast = diffMs > 0;
  
  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  let value, unit, text;
  
  if (seconds < 60) {
    value = seconds;
    unit = 'second';
    text = seconds <= 1 ? 'just now' : `${seconds} seconds`;
  } else if (minutes < 60) {
    value = minutes;
    unit = 'minute';
    text = minutes === 1 ? '1 minute' : `${minutes} minutes`;
  } else if (hours < 24) {
    value = hours;
    unit = 'hour';
    text = hours === 1 ? '1 hour' : `${hours} hours`;
  } else if (days < 7) {
    value = days;
    unit = 'day';
    text = days === 1 ? '1 day' : `${days} days`;
  } else if (weeks < 4) {
    value = weeks;
    unit = 'week';
    text = weeks === 1 ? '1 week' : `${weeks} weeks`;
  } else if (months < 12) {
    value = months;
    unit = 'month';
    text = months === 1 ? '1 month' : `${months} months`;
  } else {
    value = years;
    unit = 'year';
    text = years === 1 ? '1 year' : `${years} years`;
  }
  
  const direction = isPast ? 'past' : 'future';
  const fullText = text === 'just now' ? text : (isPast ? `${text} ago` : `in ${text}`);
  
  return {
    text: fullText,
    direction,
    value,
    unit,
  };
}

// =============================================================================
// Date Math
// =============================================================================

/**
 * Add days to a date
 * @param {{date: string, days: number}} input
 * @returns {{iso: string, formatted: string}}
 */
function addDays(input) {
  const date = new Date(input.date);
  date.setDate(date.getDate() + input.days);
  return { iso: date.toISOString(), formatted: formatDate(date, 'YYYY-MM-DD') };
}

/**
 * Add hours to a date
 * @param {{date: string, hours: number}} input
 * @returns {{iso: string}}
 */
function addHours(input) {
  const date = new Date(input.date);
  date.setHours(date.getHours() + input.hours);
  return { iso: date.toISOString() };
}

/**
 * Add minutes to a date
 * @param {{date: string, minutes: number}} input
 * @returns {{iso: string}}
 */
function addMinutes(input) {
  const date = new Date(input.date);
  date.setMinutes(date.getMinutes() + input.minutes);
  return { iso: date.toISOString() };
}

/**
 * Add months to a date
 * @param {{date: string, months: number}} input
 * @returns {{iso: string, formatted: string}}
 */
function addMonths(input) {
  const date = new Date(input.date);
  date.setMonth(date.getMonth() + input.months);
  return { iso: date.toISOString(), formatted: formatDate(date, 'YYYY-MM-DD') };
}

/**
 * Add years to a date
 * @param {{date: string, years: number}} input
 * @returns {{iso: string, formatted: string}}
 */
function addYears(input) {
  const date = new Date(input.date);
  date.setFullYear(date.getFullYear() + input.years);
  return { iso: date.toISOString(), formatted: formatDate(date, 'YYYY-MM-DD') };
}

/**
 * Calculate difference between two dates
 * @param {{from: string, to: string, unit?: string}} input
 * @returns {{value: number, unit: string, breakdown: object}}
 */
function diff(input) {
  const from = new Date(input.from);
  const to = new Date(input.to);
  const unit = input.unit || 'days';
  
  const diffMs = to.getTime() - from.getTime();
  
  const breakdown = {
    milliseconds: diffMs,
    seconds: Math.floor(diffMs / 1000),
    minutes: Math.floor(diffMs / (1000 * 60)),
    hours: Math.floor(diffMs / (1000 * 60 * 60)),
    days: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
    weeks: Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7)),
  };
  
  return {
    value: breakdown[unit] || breakdown.days,
    unit,
    breakdown,
  };
}

// =============================================================================
// Start/End of Period
// =============================================================================

/**
 * Get start of a time period
 * @param {{date: string, unit: string}} input - unit: day, week, month, year
 * @returns {{iso: string, formatted: string}}
 */
function startOf(input) {
  const date = new Date(input.date);
  const unit = input.unit || 'day';
  
  switch (unit) {
    case 'day':
      date.setHours(0, 0, 0, 0);
      break;
    case 'week':
      date.setDate(date.getDate() - date.getDay());
      date.setHours(0, 0, 0, 0);
      break;
    case 'month':
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      break;
    case 'year':
      date.setMonth(0, 1);
      date.setHours(0, 0, 0, 0);
      break;
  }
  
  return { iso: date.toISOString(), formatted: formatDate(date, 'YYYY-MM-DD HH:mm:ss') };
}

/**
 * Get end of a time period
 * @param {{date: string, unit: string}} input - unit: day, week, month, year
 * @returns {{iso: string, formatted: string}}
 */
function endOf(input) {
  const date = new Date(input.date);
  const unit = input.unit || 'day';
  
  switch (unit) {
    case 'day':
      date.setHours(23, 59, 59, 999);
      break;
    case 'week':
      date.setDate(date.getDate() + (6 - date.getDay()));
      date.setHours(23, 59, 59, 999);
      break;
    case 'month':
      date.setMonth(date.getMonth() + 1, 0);
      date.setHours(23, 59, 59, 999);
      break;
    case 'year':
      date.setMonth(11, 31);
      date.setHours(23, 59, 59, 999);
      break;
  }
  
  return { iso: date.toISOString(), formatted: formatDate(date, 'YYYY-MM-DD HH:mm:ss') };
}

// =============================================================================
// Comparisons
// =============================================================================

/**
 * Check if date is before another date
 * @param {{date: string, compareTo: string}} input
 * @returns {{result: boolean}}
 */
function isBefore(input) {
  const date = new Date(input.date);
  const compareTo = new Date(input.compareTo);
  return { result: date.getTime() < compareTo.getTime() };
}

/**
 * Check if date is after another date
 * @param {{date: string, compareTo: string}} input
 * @returns {{result: boolean}}
 */
function isAfter(input) {
  const date = new Date(input.date);
  const compareTo = new Date(input.compareTo);
  return { result: date.getTime() > compareTo.getTime() };
}

/**
 * Check if date is between two dates
 * @param {{date: string, start: string, end: string}} input
 * @returns {{result: boolean}}
 */
function isBetween(input) {
  const date = new Date(input.date).getTime();
  const start = new Date(input.start).getTime();
  const end = new Date(input.end).getTime();
  return { result: date >= start && date <= end };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Get weekday name
 * @param {string|{date: string, format?: string}} input
 * @returns {{weekday: string, dayNumber: number}}
 */
function getWeekday(input) {
  const dateStr = typeof input === 'string' ? input : input.date;
  const format = (typeof input === 'object' && input.format) || 'long';
  
  const date = new Date(dateStr);
  const dayNumber = date.getDay();
  
  const weekdays = {
    short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    long: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  };
  
  return {
    weekday: weekdays[format]?.[dayNumber] || weekdays.long[dayNumber],
    dayNumber,
  };
}

/**
 * Get number of days in a month
 * @param {{year: number, month: number}} input
 * @returns {{days: number}}
 */
function getDaysInMonth(input) {
  const year = input.year;
  const month = input.month; // 1-indexed
  
  // Day 0 of next month = last day of this month
  const days = new Date(year, month, 0).getDate();
  
  return { days };
}

// =============================================================================
// Export all functions
// =============================================================================

module.exports = {
  now,
  parse,
  isValid,
  toISO,
  toUnix,
  fromUnix,
  format,
  relativeTime,
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addYears,
  diff,
  startOf,
  endOf,
  isBefore,
  isAfter,
  isBetween,
  getWeekday,
  getDaysInMonth,
};
