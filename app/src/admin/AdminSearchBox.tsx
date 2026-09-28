import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '@basketeasy/ui/card';
import { Input } from '@basketeasy/ui/input';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { cn } from '@basketeasy/ui/cn';
import {
  ADMIN_SEARCH_MIN_LENGTH,
  type AdminSearchHit,
} from '@basketeasy/types/platform-admin-search';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAdminSearch } from './useAdminQueries';
import { adminPathOf, adminPaths } from './shared/adminPaths';
import { SEARCH_GROUPS } from './shared/adminFormat';

function searchPagePath(text: string): string {
  return `${adminPaths.search}?q=${encodeURIComponent(text.trim())}`;
}

/**
 * The back-office's one search box: a combobox over the grouped hits.
 *
 * Arrow keys move through every hit across the groups, Enter opens the
 * highlighted one — or, with nothing highlighted, the only hit of a pasted
 * id, else the full results page. Escape closes. Focus stays in the input
 * the whole time (the list is referenced through aria-activedescendant),
 * which is why a mouse press on the list is prevented from blurring it.
 */
export function AdminSearchBox() {
  const navigate = useNavigate();
  const listId = useId();
  const [text, setText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebouncedValue(text);
  const search = useAdminSearch(debounced);

  const isLongEnough = text.trim().length >= ADMIN_SEARCH_MIN_LENGTH;
  const result =
    isLongEnough && debounced.trim().length >= ADMIN_SEARCH_MIN_LENGTH ? search.data : undefined;
  const hits: AdminSearchHit[] = result
    ? result.exactId
      ? [result.exactId]
      : SEARCH_GROUPS.flatMap((group) => result.groups[group.kind])
    : [];

  useEffect(() => {
    setActive(-1);
  }, [result]);

  const go = (path: string) => {
    setIsOpen(false);
    setText('');
    void navigate(path);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setIsOpen(true);
        setActive((index) => Math.min(index + 1, hits.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((index) => Math.max(index - 1, -1));
        break;
      case 'Enter': {
        const target = active >= 0 ? hits[active] : result?.exactId;
        if (target) go(adminPathOf(target));
        else if (isLongEnough) go(searchPagePath(text));
        break;
      }
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const optionId = (index: number) => `${listId}-option-${index}`;
  const showList = isOpen && isLongEnough;
  let index = -1;
  const option = (hit: AdminSearchHit) => {
    index += 1;
    const current = index;
    return (
      <li key={`${hit.kind}-${hit.id}`} role="presentation">
        <Link
          id={optionId(current)}
          role="option"
          aria-selected={current === active}
          to={adminPathOf(hit)}
          onClick={() => {
            setIsOpen(false);
            setText('');
          }}
          className={cn(
            'flex items-center justify-between gap-3 px-4 py-2.5',
            current === active ? 'bg-blue-green-tint' : 'hover:bg-surface-2',
          )}
        >
          <Text as="span" variant="label" size="sm" tone="structure">
            {hit.label}
          </Text>
          {hit.sublabel && (
            <Text as="span" variant="meta" size="sm" className="truncate">
              {hit.sublabel}
            </Text>
          )}
        </Link>
      </li>
    );
  };

  return (
    <div className="relative w-full max-w-xl">
      <Input
        type="search"
        role="combobox"
        aria-label="Rechercher dans le back-office"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        placeholder="Club, équipe, nom, e-mail ou identifiant"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <Card
          variant="raised"
          className="absolute inset-x-0 top-full z-20 mt-2 flex flex-col py-1 shadow-lg"
          // Keep focus in the input so the active option and Enter keep working.
          onMouseDown={(event) => event.preventDefault()}
        >
          {search.isError ? (
            <Text variant="meta" size="sm" className="px-4 py-3">
              Recherche indisponible pour le moment.
            </Text>
          ) : !result ? (
            <Text variant="meta" size="sm" className="px-4 py-3">
              Recherche…
            </Text>
          ) : result.unknownId ? (
            <Text variant="meta" size="sm" className="px-4 py-3">
              Aucun club, équipe, compte, joueur ou événement avec cet identifiant.
            </Text>
          ) : hits.length === 0 ? (
            <Text variant="meta" size="sm" className="px-4 py-3">
              Aucun résultat pour « {result.query} ».
            </Text>
          ) : (
            <ul id={listId} role="listbox" aria-label="Résultats" className="m-0 list-none p-0">
              {result.exactId ? (
                <li role="presentation">
                  <Text
                    as="span"
                    variant="eyebrow"
                    size="xs"
                    tone="secondary"
                    className="block px-4 pb-1 pt-2"
                  >
                    Identifiant reconnu
                  </Text>
                  <ul role="group" className="m-0 list-none p-0">
                    {option(result.exactId)}
                  </ul>
                </li>
              ) : (
                SEARCH_GROUPS.filter((group) => result.groups[group.kind].length > 0).map(
                  (group) => (
                    <li key={group.kind} role="presentation">
                      <Text
                        as="span"
                        variant="eyebrow"
                        size="xs"
                        tone="structure"
                        className="block px-4 pb-1 pt-2"
                        id={`${listId}-${group.kind}`}
                      >
                        {group.label}
                      </Text>
                      <ul
                        role="group"
                        aria-labelledby={`${listId}-${group.kind}`}
                        className="m-0 list-none p-0"
                      >
                        {result.groups[group.kind].map(option)}
                      </ul>
                    </li>
                  ),
                )
              )}
            </ul>
          )}
          {result && !result.exactId && !result.unknownId && (
            <div className="border-t border-border px-4 pb-1.5 pt-2.5">
              <TextLink asChild>
                <Link to={searchPagePath(text)} onClick={() => setIsOpen(false)}>
                  Voir tous les résultats
                </Link>
              </TextLink>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
