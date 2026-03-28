import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { CreateUserForm } from './CreateUserForm';

function makeOnCreate(overrides?: Partial<{ username: string; oneTimePassword: string }>) {
  return vi.fn().mockResolvedValue({
    username: overrides?.username ?? 'bob@example.com',
    oneTimePassword: overrides?.oneTimePassword ?? 'abc123XY',
  });
}

describe('CreateUserForm', () => {
  it('shows a validation error for a whitespace-only email', async () => {
    render(<CreateUserForm onCreateUser={vi.fn()} loading={false} />);
    await userEvent.type(screen.getByLabelText('Email address'), ' ');
    await userEvent.click(screen.getByText('Create user'));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid email/);
  });

  it('shows a validation error for an invalid email', async () => {
    render(<CreateUserForm onCreateUser={vi.fn()} loading={false} />);
    await userEvent.type(screen.getByLabelText('Email address'), 'notanemail');
    await userEvent.click(screen.getByText('Create user'));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid email/);
  });

  it('calls onCreateUser with the entered email', async () => {
    const onCreateUser = makeOnCreate({ username: 'alice@example.com' });
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText('Email address'), 'alice@example.com');
    await userEvent.click(screen.getByText('Create user'));
    expect(onCreateUser).toHaveBeenCalledWith('alice@example.com');
  });

  it('shows OtpDisplay after a successful creation', async () => {
    const onCreateUser = makeOnCreate({ username: 'bob@example.com', oneTimePassword: 'abc123XY' });
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText('Email address'), 'bob@example.com');
    await userEvent.click(screen.getByText('Create user'));
    expect(await screen.findByText('abc123XY')).toBeInTheDocument();
  });

  it('shows an error if onCreateUser rejects', async () => {
    const onCreateUser = vi.fn().mockRejectedValue(new Error('Username taken'));
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText('Email address'), 'alice@example.com');
    await userEvent.click(screen.getByText('Create user'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Username taken');
  });

  it('"Done" resets back to the form', async () => {
    const onCreateUser = makeOnCreate();
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText('Email address'), 'bob@example.com');
    await userEvent.click(screen.getByText('Create user'));
    await screen.findByText('abc123XY');
    await userEvent.click(screen.getByText('Done'));
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('disables the button while loading', () => {
    render(<CreateUserForm onCreateUser={vi.fn()} loading={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
