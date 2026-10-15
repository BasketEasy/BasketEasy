import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('shows the result range and page count', () => {
    render(<Pagination page={2} pageSize={25} total={120} onPageChange={vi.fn()} />);

    expect(screen.getByText('26–50 sur 120')).toBeInTheDocument();
    expect(screen.getByText('Page 2 / 5')).toBeInTheDocument();
  });

  it('shows "Aucun résultat" when total is 0', () => {
    render(<Pagination page={1} pageSize={25} total={0} onPageChange={vi.fn()} />);

    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  });

  it('disables Précédent on the first page and calls onPageChange with page - 1 otherwise', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pagination page={1} pageSize={25} total={100} onPageChange={onPageChange} />,
    );

    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled();

    rerender(<Pagination page={2} pageSize={25} total={100} onPageChange={onPageChange} />);
    await user.click(screen.getByRole('button', { name: 'Précédent' }));

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('disables Suivant on the last page and calls onPageChange with page + 1 otherwise', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pagination page={4} pageSize={25} total={100} onPageChange={onPageChange} />,
    );

    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();

    rerender(<Pagination page={1} pageSize={25} total={100} onPageChange={onPageChange} />);
    await user.click(screen.getByRole('button', { name: 'Suivant' }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('renders a page-size select when onPageSizeChange and pageSizeOptions are provided', async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();
    render(
      <Pagination
        page={1}
        pageSize={25}
        total={100}
        onPageChange={vi.fn()}
        pageSizeOptions={[10, 25, 50]}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Éléments par page' }));
    await user.click(await screen.findByRole('option', { name: '50' }));

    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('does not render a page-size select when onPageSizeChange is omitted', () => {
    render(<Pagination page={1} pageSize={25} total={100} onPageChange={vi.fn()} />);

    expect(screen.queryByRole('combobox', { name: 'Éléments par page' })).not.toBeInTheDocument();
  });
});
