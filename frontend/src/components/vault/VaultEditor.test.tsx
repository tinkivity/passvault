import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { VaultEditor } from './VaultEditor';
import { LIMITS } from '@passvault/shared';

const defaultProps = {
  initialContent: 'hello world',
  onSave: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
  saving: false,
  error: null,
  secondsLeft: 300,
};

describe('VaultEditor', () => {
  it('renders the textarea with the initial content', () => {
    render(<VaultEditor {...defaultProps} />);
    expect(screen.getByRole('textbox')).toHaveValue('hello world');
  });

  it('shows the byte-size indicator', () => {
    render(<VaultEditor {...defaultProps} />);
    expect(screen.getByText(/KB \/ 1024 KB/)).toBeInTheDocument();
  });

  it('disables Save when content exceeds MAX_FILE_SIZE_BYTES', () => {
    const bigContent = 'x'.repeat(LIMITS.MAX_FILE_SIZE_BYTES + 1);
    render(<VaultEditor {...defaultProps} initialContent={bigContent} />);
    expect(screen.getByText('Save & logout')).toBeDisabled();
  });

  it('enables Save when content is within the limit', () => {
    render(<VaultEditor {...defaultProps} />);
    expect(screen.getByText('Save & logout')).not.toBeDisabled();
  });

  it('calls onSave with the current textarea content', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<VaultEditor {...defaultProps} onSave={onSave} />);
    await userEvent.click(screen.getByText('Save & logout'));
    expect(onSave).toHaveBeenCalledWith('hello world');
  });

  it('calls onCancel directly when content is unchanged', async () => {
    const onCancel = vi.fn();
    render(<VaultEditor {...defaultProps} onCancel={onCancel} />);
    await userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it('shows a confirm dialog when cancelling with unsaved changes', async () => {
    render(<VaultEditor {...defaultProps} />);
    await userEvent.type(screen.getByRole('textbox'), ' changed');
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it('calls onCancel after confirming discard', async () => {
    const onCancel = vi.fn();
    render(<VaultEditor {...defaultProps} onCancel={onCancel} />);
    await userEvent.type(screen.getByRole('textbox'), ' changed');
    await userEvent.click(screen.getByText('Cancel'));
    await userEvent.click(screen.getByText('Discard'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('closes the confirm dialog without cancelling when "Keep editing" is clicked', async () => {
    render(<VaultEditor {...defaultProps} />);
    await userEvent.type(screen.getByRole('textbox'), ' changed');
    await userEvent.click(screen.getByText('Cancel'));
    await userEvent.click(screen.getByText('Keep editing'));
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows the auto-logout countdown', () => {
    render(<VaultEditor {...defaultProps} secondsLeft={90} />);
    expect(screen.getByText(/1:30/)).toBeInTheDocument();
  });

  it('renders an error message when error prop is set', () => {
    render(<VaultEditor {...defaultProps} error="Save failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
  });
});
