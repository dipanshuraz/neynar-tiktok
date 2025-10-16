// src/app/utils/dom.ts
// DOM manipulation and detection utilities

import { UI } from '../config/constants';

/**
 * Check if code is running on client side
 */
export function isClient(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Check if code is running on server side
 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}

/**
 * Detect if device is mobile
 */
export function isMobile(): boolean {
  if (!isClient()) return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Detect if device is desktop
 */
export function isDesktop(): boolean {
  if (!isClient()) return true;
  return window.innerWidth >= UI.MOBILE_MAX_WIDTH;
}

/**
 * Get viewport dimensions
 */
export function getViewportDimensions(): { width: number; height: number } {
  if (!isClient()) {
    return { width: 1920, height: 1080 }; // Default for SSR
  }
  
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

/**
 * Scroll to element smoothly
 */
export function scrollToElement(
  element: HTMLElement,
  behavior: ScrollBehavior = 'smooth'
): void {
  element.scrollIntoView({ behavior, block: 'start' });
}

/**
 * Check if element is in viewport
 */
export function isElementInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth
  );
}

/**
 * Get scroll position
 */
export function getScrollPosition(): { x: number; y: number } {
  if (!isClient()) {
    return { x: 0, y: 0 };
  }
  
  return {
    x: window.pageXOffset || document.documentElement.scrollLeft,
    y: window.pageYOffset || document.documentElement.scrollTop,
  };
}

/**
 * Prevent scroll (for modals, etc.)
 */
export function preventScroll(): void {
  if (!isClient()) return;
  document.body.style.overflow = 'hidden';
}

/**
 * Allow scroll
 */
export function allowScroll(): void {
  if (!isClient()) return;
  document.body.style.overflow = '';
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!isClient()) return false;
  
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Get element offset from top of page
 */
export function getElementOffsetTop(element: HTMLElement): number {
  let offsetTop = 0;
  let currentElement: HTMLElement | null = element;
  
  while (currentElement) {
    offsetTop += currentElement.offsetTop;
    currentElement = currentElement.offsetParent as HTMLElement | null;
  }
  
  return offsetTop;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function(this: any, ...args: Parameters<T>) {
    const context = this;
    
    if (timeout) clearTimeout(timeout);
    
    timeout = setTimeout(() => {
      func.apply(context, args);
    }, wait);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let previous = 0;
  
  return function(this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const remaining = wait - (now - previous);
    const context = this;
    
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(context, args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now();
        timeout = null;
        func.apply(context, args);
      }, remaining);
    }
  };
}

