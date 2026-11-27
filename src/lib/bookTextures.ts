import { getContrastTextColor } from './domain/status';

export type BookPatternVariant =
  | 'linen-frame'
  | 'ribbed-cloth'
  | 'herringbone-arch'
  | 'atelier-grid'
  | 'double-rule';

const VARIANTS: BookPatternVariant[] = [
  'linen-frame',
  'ribbed-cloth',
  'herringbone-arch',
  'atelier-grid',
  'double-rule',
];

export function getBookPatternVariant(bookId: string): BookPatternVariant {
  let hash = 0;
  for (let i = 0; i < bookId.length; i++) {
    hash = (hash * 31 + bookId.charCodeAt(i)) >>> 0;
  }
  return VARIANTS[hash % VARIANTS.length];
}

export function getBookclothCssOverlay(variant: BookPatternVariant): string {
  switch (variant) {
    case 'ribbed-cloth':
      return [
        'repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 4px)',
        'repeating-linear-gradient(0deg, rgba(0,0,0,0.045) 0px, rgba(0,0,0,0.045) 1px, transparent 1px, transparent 3px)',
      ].join(', ');
    case 'herringbone-arch':
      return [
        'repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 6px)',
        'repeating-linear-gradient(45deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 6px)',
      ].join(', ');
    case 'atelier-grid':
      return [
        'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 8px)',
        'repeating-linear-gradient(90deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 8px)',
      ].join(', ');
    case 'double-rule':
    case 'linen-frame':
    default:
      return [
        'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 3px)',
        'repeating-linear-gradient(90deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 3px)',
      ].join(', ');
  }
}

export function getBookRuleColor(coverColor: string): string {
  const contrast = getContrastTextColor(coverColor);
  return contrast === '#F5F3EE'
    ? 'rgba(236, 224, 198, 0.34)'
    : 'rgba(32, 31, 28, 0.22)';
}
