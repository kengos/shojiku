// The format catalog a FIELD's display controls read: the document's own, or —
// for a field with its own currency code — the catalog of the document as if its
// currency were that code (`DataFormatCatalog.atCurrency`), so every sample
// beside the field is the engine's rendering in the currency it will print in.
//
// While that answer is on its way (or when it cannot be had) the field shows no
// samples rather than the document currency's: a sample in the wrong currency
// beside a field reads as what will print.

import { useEffect, useState } from 'react';
import type { FormatCatalog } from '../engine/types';
import type { DataFormatCatalog } from './editorProps';

export function useFieldCatalog(
  formats: DataFormatCatalog | undefined,
  currency: string,
): FormatCatalog | null {
  const [own, setOwn] = useState<{ code: string; catalog: FormatCatalog | null } | null>(null);
  const atCurrency = formats?.atCurrency;
  useEffect(() => {
    if (atCurrency === undefined || currency === '') {
      return;
    }
    let live = true;
    void atCurrency(currency).then((catalog) => {
      if (live) {
        setOwn({ code: currency, catalog });
      }
    });
    return () => {
      live = false;
    };
  }, [atCurrency, currency]);
  if (formats === undefined) {
    return null;
  }
  if (currency === '') {
    return formats.catalog;
  }
  return own?.code === currency ? own.catalog : null;
}
