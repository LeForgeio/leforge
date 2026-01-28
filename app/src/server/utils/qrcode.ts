/**
 * QR Code & Barcode Utilities
 * Built-in LeForge core library for generating QR codes and barcodes
 * Pure TypeScript implementation - no external dependencies
 */

// ============================================================================
// Types
// ============================================================================

export interface QROptions {
  size?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  format?: 'svg' | 'base64' | 'matrix';
}

export interface BarcodeOptions {
  height?: number;
  width?: number | null;
  showText?: boolean;
  fontSize?: number;
  margin?: number;
  type?: 'code128' | 'ean13' | 'upca';
}

// ============================================================================
// QR Code Generation
// ============================================================================

function calculateSize(dataLength: number, version?: number): number {
  if (version) return 17 + version * 4;
  
  if (dataLength <= 17) return 21;  // Version 1
  if (dataLength <= 32) return 25;  // Version 2
  if (dataLength <= 53) return 29;  // Version 3
  if (dataLength <= 78) return 33;  // Version 4
  if (dataLength <= 106) return 37; // Version 5
  if (dataLength <= 134) return 41; // Version 6
  return 45; // Version 7
}

function addFinderPattern(matrix: boolean[][], startRow: number, startCol: number): void {
  const size = matrix.length;
  
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const isOuter = row === 0 || row === 6 || col === 0 || col === 6;
      const isInner = row >= 2 && row <= 4 && col >= 2 && col <= 4;
      matrix[startRow + row][startCol + col] = isOuter || isInner;
    }
  }
  
  // Add separator (white border) around finder pattern
  for (let i = 0; i < 8; i++) {
    const sepRow = startRow + 7;
    const sepCol = startCol + 7;
    if (sepRow < size && startCol + i < size) matrix[sepRow][startCol + i] = false;
    if (startRow + i < size && sepCol < size) matrix[startRow + i][sepCol] = false;
  }
}

function addAlignmentPattern(matrix: boolean[][], centerRow: number, centerCol: number): void {
  for (let row = -2; row <= 2; row++) {
    for (let col = -2; col <= 2; col++) {
      const r = centerRow + row;
      const c = centerCol + col;
      if (r >= 0 && r < matrix.length && c >= 0 && c < matrix.length) {
        const isOuter = Math.abs(row) === 2 || Math.abs(col) === 2;
        const isCenter = row === 0 && col === 0;
        matrix[r][c] = isOuter || isCenter;
      }
    }
  }
}

function isReserved(matrix: boolean[][], row: number, col: number, size: number): boolean {
  if (row < 9 && col < 9) return true;
  if (row < 9 && col >= size - 8) return true;
  if (row >= size - 8 && col < 9) return true;
  if (row === 6 || col === 6) return true;
  if (size >= 25 && row >= size - 11 && row <= size - 7 && col >= size - 11 && col <= size - 7) return true;
  return false;
}

function encodeData(matrix: boolean[][], text: string, _errorCorrection: string): void {
  const size = matrix.length;
  let bitIndex = 0;
  
  const bits: number[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    for (let i = 7; i >= 0; i--) {
      bits.push((code >> i) & 1);
    }
  }
  
  while (bits.length < (size - 17) * (size - 17) * 0.5) {
    bits.push(bitIndex % 2);
    bitIndex++;
  }
  
  let dataIndex = 0;
  let upward = true;
  
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    
    const rows = upward 
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);
    
    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const actualCol = col - c;
        if (!isReserved(matrix, row, actualCol, size)) {
          matrix[row][actualCol] = dataIndex < bits.length ? bits[dataIndex++] === 1 : false;
        }
      }
    }
    upward = !upward;
  }
  
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!isReserved(matrix, row, col, size)) {
        if ((row + col) % 2 === 0) {
          matrix[row][col] = !matrix[row][col];
        }
      }
    }
  }
}

/**
 * Generate QR code as boolean matrix
 */
export function generateQRMatrix(data: string, options: QROptions = {}): boolean[][] {
  const { errorCorrection = 'M' } = options;
  
  const text = String(data);
  const size = calculateSize(text.length);
  
  const matrix: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));
  
  addFinderPattern(matrix, 0, 0);
  addFinderPattern(matrix, size - 7, 0);
  addFinderPattern(matrix, 0, size - 7);
  
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }
  
  if (size >= 25) {
    addAlignmentPattern(matrix, size - 9, size - 9);
  }
  
  encodeData(matrix, text, errorCorrection);
  
  return matrix;
}

/**
 * Generate QR code as SVG string
 */
export function generateQRSvg(data: string, options: QROptions = {}): string {
  const {
    size = 200,
    margin = 4,
    darkColor = '#000000',
    lightColor = '#FFFFFF',
    errorCorrection = 'M'
  } = options;
  
  const matrix = generateQRMatrix(data, { errorCorrection });
  const moduleCount = matrix.length;
  const moduleSize = size / (moduleCount + margin * 2);
  
  let paths = '';
  
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (matrix[row][col]) {
        const x = (col + margin) * moduleSize;
        const y = (row + margin) * moduleSize;
        paths += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="${darkColor}"/>`;
      }
    }
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="100%" height="100%" fill="${lightColor}"/>
  ${paths}
</svg>`;
}

/**
 * Generate QR code as base64 data URI
 */
export function generateQRBase64(data: string, options: QROptions = {}): string {
  const svg = generateQRSvg(data, options);
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Generate QR code in specified format
 */
export function generateQR(data: string, options: QROptions = {}): string | boolean[][] {
  const format = options.format || 'svg';
  
  switch (format) {
    case 'matrix':
      return generateQRMatrix(data, options);
    case 'base64':
      return generateQRBase64(data, options);
    case 'svg':
    default:
      return generateQRSvg(data, options);
  }
}

// ============================================================================
// Barcode Generation
// ============================================================================

const CODE128_CHARS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

const CODE128_PATTERNS = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011'
];

const EAN_L_PATTERNS = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011'
];
const EAN_G_PATTERNS = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111'
];
const EAN_R_PATTERNS = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100'
];
const EAN_PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
];

function generateBarcodeSvg(pattern: string, text: string, options: BarcodeOptions = {}): string {
  const {
    height = 100,
    width = null,
    showText = true,
    fontSize = 14,
    margin = 10
  } = options;
  
  const barWidth = 2;
  const barcodeWidth = pattern.length * barWidth;
  const totalWidth = width || (barcodeWidth + margin * 2);
  const totalHeight = height + (showText ? fontSize + 10 : 0) + margin * 2;
  
  const xOffset = (totalWidth - barcodeWidth) / 2;
  
  let bars = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') {
      bars += `<rect x="${xOffset + i * barWidth}" y="${margin}" width="${barWidth}" height="${height}" fill="#000"/>`;
    }
  }
  
  let textElement = '';
  if (showText) {
    textElement = `<text x="${totalWidth / 2}" y="${margin + height + fontSize + 5}" text-anchor="middle" font-family="monospace" font-size="${fontSize}">${text}</text>`;
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
  <rect width="100%" height="100%" fill="#FFFFFF"/>
  ${bars}
  ${textElement}
</svg>`;
}

/**
 * Generate Code128 barcode
 */
export function generateCode128(data: string, options: BarcodeOptions = {}): string {
  let pattern = CODE128_PATTERNS[104]; // Start B
  let checksum = 104;
  let position = 1;
  
  for (const char of data) {
    const index = CODE128_CHARS.indexOf(char);
    if (index === -1) continue;
    
    pattern += CODE128_PATTERNS[index];
    checksum += index * position;
    position++;
  }
  
  checksum = checksum % 103;
  pattern += CODE128_PATTERNS[checksum];
  pattern += CODE128_PATTERNS[106]; // Stop
  
  return generateBarcodeSvg(pattern, data, options);
}

function calculateEAN13CheckDigit(digits: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(digits[i], 10);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Generate EAN-13 barcode
 */
export function generateEAN13(data: string, options: BarcodeOptions = {}): string {
  let digits = data.replace(/\D/g, '');
  
  if (digits.length === 12) {
    digits += calculateEAN13CheckDigit(digits);
  } else if (digits.length !== 13) {
    throw new Error('EAN-13 requires 12 or 13 digits');
  }
  
  const firstDigit = parseInt(digits[0], 10);
  const parity = EAN_PARITY[firstDigit];
  
  let pattern = '101'; // Start guard
  
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(digits[i + 1], 10);
    pattern += parity[i] === 'L' ? EAN_L_PATTERNS[digit] : EAN_G_PATTERNS[digit];
  }
  
  pattern += '01010'; // Center guard
  
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(digits[i + 7], 10);
    pattern += EAN_R_PATTERNS[digit];
  }
  
  pattern += '101'; // End guard
  
  return generateBarcodeSvg(pattern, digits, options);
}

/**
 * Generate UPC-A barcode
 */
export function generateUPCA(data: string, options: BarcodeOptions = {}): string {
  let digits = data.replace(/\D/g, '');
  
  if (digits.length === 11) {
    digits = '0' + digits + calculateEAN13CheckDigit('0' + digits);
  } else if (digits.length === 12) {
    digits = '0' + digits;
  } else {
    throw new Error('UPC-A requires 11 or 12 digits');
  }
  
  return generateEAN13(digits, options);
}

/**
 * Validate EAN-13 barcode
 */
export function validateEAN13(data: string): boolean {
  const digits = data.replace(/\D/g, '');
  if (digits.length !== 13) return false;
  
  const check = calculateEAN13CheckDigit(digits.slice(0, 12));
  return check === digits[12];
}

/**
 * Validate UPC-A barcode
 */
export function validateUPCA(data: string): boolean {
  const digits = data.replace(/\D/g, '');
  if (digits.length !== 12) return false;
  
  return validateEAN13('0' + digits);
}

/**
 * Calculate check digit for barcode
 */
export function calculateCheckDigit(data: string, _type: 'ean13' | 'upca' = 'ean13'): string {
  const digits = data.replace(/\D/g, '');
  return calculateEAN13CheckDigit(digits.padStart(12, '0'));
}

/**
 * Generate barcode by type
 */
export function generateBarcode(data: string, options: BarcodeOptions = {}): string {
  const type = options.type || 'code128';
  
  switch (type) {
    case 'ean13':
      return generateEAN13(data, options);
    case 'upca':
      return generateUPCA(data, options);
    case 'code128':
    default:
      return generateCode128(data, options);
  }
}
