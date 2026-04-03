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

  it('masks the OTP by default', () => {
    render(<OtpDisplay {...defaultProps} />);
    expect(screen.queryByText('Xy9$mK2#pL4')).not.toBeInTheDocument();
  });

  it('reveals the OTP when eye icon is clicked', async () => {
    render(<OtpDisplay {...defaultProps} />);
    await userEvent.click(screen.getByTitle('Reveal'));
    expect(screen.getByText('Xy9$mK2#pL4')).toBeInTheDocument();
  });

  it('copies the OTP to the clipboard even when masked', async () => {
    render(<OtpDisplay {...defaultProps} />);
    await userEvent.click(screen.getByTitle('Copy'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Xy9$mK2#pL4');
  });

  it('Done button is disabled before copy', () => {
    render(<OtpDisplay {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  });

  it('Done button is enabled after copy', async () => {
    render(<OtpDisplay {...defaultProps} />);
    await userEvent.click(screen.getByTitle('Copy'));
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });

  it('calls onDone when the "Done" button is clicked after copy', async () => {
    const onDone = vi.fn();
    render(<OtpDisplay {...defaultProps} onDone={onDone} />);
    await userEvent.click(screen.getByTitle('Copy'));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
