import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FuryLoader } from './FuryLoader';

describe('FuryLoader', () => {
  it('renders fullscreen by default with default label', () => {
    const { container } = render(<FuryLoader />);
    expect(container.querySelector('.fury-loader--fullscreen')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'carregando');
    expect(screen.getByText('carregando')).toBeInTheDocument();
  });

  it('uses custom label when provided', () => {
    render(<FuryLoader label="validando sessão" />);
    expect(screen.getByText('validando sessão')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'validando sessão');
  });

  it('renders inline variant without embers and without fullscreen overlay', () => {
    const { container } = render(<FuryLoader fullscreen={false} label="enviando" />);
    expect(container.querySelector('.fury-loader--inline')).toBeInTheDocument();
    expect(container.querySelector('.fury-loader--fullscreen')).not.toBeInTheDocument();
    /* CSS esconde embers no inline; aqui validamos que nem foi montado */
    expect(container.querySelectorAll('.fury-loader__ember')).toHaveLength(0);
  });

  it('hides label when hideLabel is true', () => {
    render(<FuryLoader hideLabel />);
    /* O aria-label do container ainda deve estar lá pra screen readers */
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'carregando');
    expect(screen.queryByText('carregando')).not.toBeInTheDocument();
  });

  it('locks body scroll while fullscreen, restores on unmount', () => {
    const { unmount } = render(<FuryLoader />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('does not lock scroll for inline variant', () => {
    document.body.style.overflow = '';
    render(<FuryLoader fullscreen={false} />);
    expect(document.body.style.overflow).toBe('');
  });
});
