import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CountdownTimer } from './CountdownTimer';

describe('CountdownTimer', () => {
  it('formats 300 seconds as 5:00', () => {
    render(<CountdownTimer secondsLeft={300} />);
    expect(screen.getByText(/5:00/)).toBeInTheDocument();
  });

  it('pads single-digit seconds with a leading zero', () => {
    render(<CountdownTimer secondsLeft={65} />);
    expect(screen.getByText(/1:05/)).toBeInTheDocument();
  });

  it('shows 0:00 when time is up', () => {
    render(<CountdownTimer secondsLeft={0} />);
    expect(screen.getByText(/0:00/)).toBeInTheDocument();
  });

  it('uses the default label "Auto-logout in"', () => {
    render(<CountdownTimer secondsLeft={60} />);
    expect(screen.getByText(/Auto-logout in/)).toBeInTheDocument();
  });

  it('uses a custom label when provided', () => {
    render(<CountdownTimer secondsLeft={60} label="Session expires in" />);
    expect(screen.getByText(/Session expires in/)).toBeInTheDocument();
  });

  it('is not urgent (not red) when secondsLeft > 30', () => {
    const { container } = render(<CountdownTimer secondsLeft={31} />);
    expect(container.firstChild).not.toHaveClass('text-red-600');
  });

  it('applies urgent red styling when secondsLeft is exactly 30', () => {
    const { container } = render(<CountdownTimer secondsLeft={30} />);
    expect(container.firstChild).toHaveClass('text-red-600');
  });

  it('applies urgent red styling when secondsLeft < 30', () => {
    const { container } = render(<CountdownTimer secondsLeft={5} />);
    expect(container.firstChild).toHaveClass('text-red-600');
  });
});
