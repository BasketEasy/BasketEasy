import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  type HTMLAttributes,
  type LiHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
import { Text } from './Text';

const listVariants = cva('m-0 flex list-none flex-col divide-y divide-border p-0', {
  variants: {
    /**
     * Where the list sits. `card` is directly inside a `Card variant="flush"`,
     * so rows carry their own horizontal padding; `panel` is inside a padded
     * card, so rows are flush with its content edge and the first and last
     * lose their outer padding.
     */
    variant: {
      card: '',
      panel: '[&>li:first-child>*]:pt-0 [&>li:last-child>*]:pb-0',
    },
  },
  defaultVariants: { variant: 'card' },
});

type ListVariant = NonNullable<VariantProps<typeof listVariants>['variant']>;

const ListContext = createContext<ListVariant>('card');

export interface ListProps
  extends HTMLAttributes<HTMLUListElement>, VariantProps<typeof listVariants> {}

/**
 * The one divided list: records one per row, a rule between them. Replaces
 * the hand-built `<ul className="divide-y …">` and its `<li>` recipes.
 */
export const List = forwardRef<HTMLUListElement, ListProps>(
  ({ variant = 'card', className, ...props }, ref) => (
    <ListContext.Provider value={variant ?? 'card'}>
      <ul ref={ref} className={cn(listVariants({ variant }), className)} {...props} />
    </ListContext.Provider>
  ),
);
List.displayName = 'List';

const listRowVariants = cva('flex gap-3', {
  variants: {
    variant: {
      card: 'px-3.5 py-3',
      panel: 'py-3',
    },
    align: { center: 'items-center', start: 'items-start' },
    wrap: { true: 'flex-wrap gap-y-2', false: '' },
    interactive: {
      true: 'w-full text-left no-underline transition-colors hover:bg-surface-2',
      false: '',
    },
  },
  defaultVariants: { align: 'center', wrap: false, interactive: false },
});

export interface ListItemProps
  extends Omit<LiHTMLAttributes<HTMLLIElement>, 'title' | 'children'>, ListRowShape {
  /** Vertical alignment of leading / body / trailing. `start` for a multi-line body with a status dot. */
  align?: 'center' | 'start';
  /** Let the body and trailing wrap onto a second line on a narrow screen (a row with an action button). */
  wrap?: boolean;
  /**
   * Make the row a link or a button: pass exactly one element (a react-router
   * `Link`, an `<a>`, a `<button>`) whose children are the row's title. The
   * row styling, hover and focus ring land on that element, so navigation
   * stays a real anchor and `@basketeasy/ui` never imports a router.
   */
  asChild?: boolean;
  children: ReactNode;
}

/** The content every row shares, whether it is a link or not. */
interface ListRowShape {
  /** A small line above the title (a « pour qui » badge). */
  eyebrow?: ReactNode;
  /** The row's lead visual: an `Avatar`, an `IconBadge`. */
  leading?: ReactNode;
  /** Secondary line(s) under the title; each entry is its own line. */
  meta?: ReactNode;
  /** The row's tail: a `Badge`, an action `Button`, a status dot. */
  trailing?: ReactNode;
  /** A right chevron, signalling the whole row is a link. */
  chevron?: boolean;
  /** `secondary` mutes the title (an already-read item). */
  titleTone?: 'primary' | 'secondary';
}

/**
 * One row of a `List`: `leading` · (`eyebrow`, title, `meta`) · `trailing` ·
 * `chevron`. The title is `children` — or, with `asChild`, the children of
 * the single link/button element passed in.
 *
 * Closed on purpose: the padding, gap, divider, hover and focus ring are the
 * row's own. A caller that needs another look adds a variant here.
 */
export const ListItem = forwardRef<HTMLLIElement, ListItemProps>(
  (
    {
      eyebrow,
      leading,
      meta,
      trailing,
      chevron = false,
      titleTone = 'primary',
      align,
      wrap = false,
      asChild = false,
      children,
      ...props
    },
    ref,
  ) => {
    const listVariant = useContext(ListContext);
    const rowClass = (interactive: boolean) =>
      listRowVariants({ variant: listVariant, align, wrap, interactive });

    const renderContent = (title: ReactNode) => (
      <>
        {leading}
        <div className={cn('flex min-w-0 flex-1 flex-col gap-0.5', wrap && 'min-w-40')}>
          {eyebrow}
          <Text as="span" variant="label" size="sm" tone={titleTone}>
            {title}
          </Text>
          {Children.toArray(meta).map((line, index) => (
            <Text key={index} as="span" variant="meta" size="xs" className="block">
              {line}
            </Text>
          ))}
        </div>
        {trailing && (
          <div className="flex flex-wrap items-center justify-end gap-1">{trailing}</div>
        )}
        {chevron && (
          <ChevronRightIcon size="lg" tone="secondary" className="shrink-0" aria-hidden="true" />
        )}
      </>
    );

    if (asChild) {
      const child = Children.only(children);
      if (!isValidElement(child)) {
        throw new Error('ListItem: `asChild` needs exactly one element child.');
      }
      const element = child as ReactElement<{ children?: ReactNode }>;
      return (
        <li ref={ref} {...props}>
          <Slot className={cn(rowClass(true), focusRing)}>
            {cloneElement(element, undefined, renderContent(element.props.children))}
          </Slot>
        </li>
      );
    }

    return (
      <li ref={ref} {...props}>
        <div className={rowClass(false)}>{renderContent(children)}</div>
      </li>
    );
  },
);
ListItem.displayName = 'ListItem';
