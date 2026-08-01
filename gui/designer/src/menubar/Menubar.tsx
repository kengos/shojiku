// The Google-Docs-style menubar: a row of top-level menus (File / Edit /
// Insert) built by `buildMenubar`. Each menu is a Headless UI Menu (the library
// owns keyboard nav, the ARIA menu pattern, outside-click, Escape, the anchored
// portal); the LOOK is plain Tailwind utilities over the `--sj-*` tokens. Each
// item dispatches its OWN `run` closure — the model never looks an id up in a
// table, so a host-extension entry carries no injection surface. Labels render
// as React text (auto-escaped); a host label is never injected as markup.

import { Menu as HeadlessMenu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import type { MenuColumn } from './model';

export interface MenubarProps {
  readonly columns: readonly MenuColumn[];
}

export function Menubar({ columns }: MenubarProps) {
  return (
    <div
      role="menubar"
      aria-label="menubar"
      className="flex items-center gap-0.5 border-b border-border bg-chrome px-2"
    >
      {columns.map((column) => (
        <HeadlessMenu key={column.id}>
          <MenuButton
            data-tour={`menu-${column.id}`}
            className="cursor-pointer rounded-md border border-transparent bg-transparent px-2 py-1 text-text hover:bg-surface data-open:bg-surface"
          >
            {column.label}
          </MenuButton>
          <MenuItems
            anchor={{ to: 'bottom start', gap: 2 }}
            className="z-50 min-w-44 rounded-md border border-border bg-surface py-1 text-text shadow-lg focus:outline-none"
          >
            {column.groups.map((group, index) => (
              <div
                key={group[0].label}
                className={index > 0 ? 'mt-1 border-t border-border pt-1' : undefined}
              >
                {group.map((item) => (
                  <MenuItem key={item.label} disabled={item.disabled}>
                    <button
                      type="button"
                      className="block w-full cursor-pointer border-0 bg-transparent px-3 py-1.5 text-left text-text data-disabled:cursor-default data-disabled:opacity-45 data-focus:bg-chrome"
                      onClick={item.run}
                    >
                      {item.label}
                    </button>
                  </MenuItem>
                ))}
              </div>
            ))}
          </MenuItems>
        </HeadlessMenu>
      ))}
    </div>
  );
}
