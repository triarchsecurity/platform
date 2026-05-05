import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
// INTENTIONAL RED: ./PreviewLink does not exist until Plan 05-03
import PreviewLink from './PreviewLink';

describe('PreviewLink (RC-02)', () => {
  it('renders an anchor with target=_blank, rel=noopener noreferrer, and the given href', () => {
    render(<PreviewLink url="https://feat-font--backend.us-central1.hosted.app" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://feat-font--backend.us-central1.hosted.app');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders a disabled button with aria-label "No preview deployed" when url is null', () => {
    render(<PreviewLink url={null} />);
    const btn = screen.getByRole('button', { name: /no preview deployed/i });
    expect(btn).toBeDisabled();
  });
});
