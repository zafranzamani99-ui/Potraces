/**
 * Performance Utilities
 * Helpers for optimizing app performance
 */

import { InteractionManager } from 'react-native';

/**
 * Debounce function calls
 * @param func Function to debounce
 * @param wait Wait time in milliseconds
 * @returns Debounced function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
};

/**
 * Throttle function calls
 * @param func Function to throttle
 * @param limit Time limit in milliseconds
 * @returns Throttled function
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
};

/**
 * Run task after interactions complete
 * Useful for expensive operations that shouldn't block UI
 * @param task Task to run
 * @returns Promise that resolves when task completes
 */
export const runAfterInteractions = (task: () => void): Promise<void> => {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      task();
      resolve();
    });
  });
};

/**
 * Memoize expensive calculations
 * @param fn Function to memoize
 * @returns Memoized function
 */
export const memoize = <T extends (...args: any[]) => any>(
  fn: T
): T => {
  const cache = new Map<string, ReturnType<T>>();

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
};

/**
 * Chunk large arrays for processing
 * Prevents blocking UI thread
 * @param array Array to process
 * @param chunkSize Size of each chunk
 * @param callback Function to call for each chunk
 * @param delay Delay between chunks in ms
 */
export const processInChunks = async <T>(
  array: T[],
  chunkSize: number,
  callback: (chunk: T[]) => void,
  delay: number = 0
): Promise<void> => {
  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.slice(i, i + chunkSize);
    callback(chunk);
    if (delay > 0 && i + chunkSize < array.length) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

/**
 * Create a cached selector for expensive computations
 * Useful for derived state in stores
 * @param selector Function that computes derived state
 * @returns Cached selector function
 */
export const createCachedSelector = <TInput, TOutput>(
  selector: (input: TInput) => TOutput
): ((input: TInput) => TOutput) => {
  let lastInput: TInput | undefined;
  let lastOutput: TOutput | undefined;

  return (input: TInput): TOutput => {
    if (input === lastInput) {
      return lastOutput!;
    }
    lastInput = input;
    lastOutput = selector(input);
    return lastOutput;
  };
};
