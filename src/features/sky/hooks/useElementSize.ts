import { useEffect, useState, type RefObject } from 'react';

/** The element's content-box size in CSS pixels, tracked with a ResizeObserver. */
export const useElementSize = (
  ref: RefObject<Element | null>,
): { width: number; height: number } => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
};
