// Report the document text back to the host after every edit that CHANGES it —
// not on a mere selection change, which also bumps the editor revision.

import { useEffect, useRef } from 'react';

/** The handler is held in a ref so a changing `onChange` identity does not
 * refire the effect. */
export function useHostNotify(text: string, onChange: ((text: string) => void) | undefined): void {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastTextRef = useRef(text);
  useEffect(() => {
    if (text !== lastTextRef.current) {
      lastTextRef.current = text;
      onChangeRef.current?.(text);
    }
  }, [text]);
}
