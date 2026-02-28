import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { OtpDisplay } from './OtpDisplay';

const defaultProps = {
  username: 'alice',
  oneTimePassword: 'Xy9$mK2#pL4',
  onDone: vi.fn(),
};

describe('OtpDisplay', () => {
  it('shows the username', () => {
    render(<OtpDisplay {...defaultProps} />);
    expect(screen.getByText(/alice/)).toBeInTheDocument();
  });

  it('shows the one-time password', () => {
    render(<OtpDisplay {...defaultProps} />);
    expect(screen.getByText('Xy9$mK2#pL4')).toBeInTheDocument();
  });

  it('copies the OTP to the clipboard when "Copy" is clicked', async () => {
    render(<OtpDisplay {...defaultProps} />);
    await userEvent.click(screen.getByText('Copy'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Xy9$mK2#pL4');
  });

  it('shows "Copied!" feedback after copying', async () => {
    render(<OtpDisplay {...defaultProps} />);
    await userEvent.click(screen.getByText('Copy'));
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  it('calls onDone when the "Done" button is clicked', async () => {
    const onDone = vi.fn();
    render(<OtpDisplay {...defaultProps} onDone={onDone} />);
    await userEvent.click(screen.getByText('Done'));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
