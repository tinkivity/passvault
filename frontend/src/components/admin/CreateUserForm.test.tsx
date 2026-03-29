import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { CreateUserRequest } from '@passvault/shared';
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
    await userEvent.type(screen.getByLabelText(/email address/i), ' ');
    await userEvent.click(screen.getByText('Create user'));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid email/);
  });

  it('shows a validation error for an invalid email', async () => {
    render(<CreateUserForm onCreateUser={vi.fn()} loading={false} />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'notanemail');
    await userEvent.click(screen.getByText('Create user'));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid email/);
  });

  it('calls onCreateUser with a request object containing the entered email', async () => {
    const onCreateUser = makeOnCreate({ username: 'alice@example.com' });
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await userEvent.click(screen.getByText('Create user'));
    const req: CreateUserRequest = onCreateUser.mock.calls[0][0];
    expect(req.username).toBe('alice@example.com');
  });

  it('includes firstName and lastName in the request when filled', async () => {
    const onCreateUser = makeOnCreate();
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText(/first name/i), 'Alice');
    await userEvent.type(screen.getByLabelText(/last name/i), 'Johnson');
    await userEvent.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await userEvent.click(screen.getByText('Create user'));
    const req: CreateUserRequest = onCreateUser.mock.calls[0][0];
    expect(req.firstName).toBe('Alice');
    expect(req.lastName).toBe('Johnson');
  });

  it('sends plan: pro when Pro is selected', async () => {
    const onCreateUser = makeOnCreate();
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.click(screen.getByRole('button', { name: /^pro$/i }));
    await userEvent.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await userEvent.click(screen.getByText('Create user'));
    const req: CreateUserRequest = onCreateUser.mock.calls[0][0];
    expect(req.plan).toBe('pro');
  });

  it('defaults to plan: free', async () => {
    const onCreateUser = makeOnCreate();
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await userEvent.click(screen.getByText('Create user'));
    const req: CreateUserRequest = onCreateUser.mock.calls[0][0];
    expect(req.plan).toBe('free');
  });

  it('sends expiresAt: null when Lifetime checkbox is checked', async () => {
    const onCreateUser = makeOnCreate();
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await userEvent.click(screen.getByText('Create user'));
    const req: CreateUserRequest = onCreateUser.mock.calls[0][0];
    expect(req.expiresAt).toBeNull();
  });

  it('shows OtpDisplay after a successful creation', async () => {
    const onCreateUser = makeOnCreate({ username: 'bob@example.com', oneTimePassword: 'abc123XY' });
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'bob@example.com');
    await userEvent.click(screen.getByText('Create user'));
    expect(await screen.findByText('abc123XY')).toBeInTheDocument();
  });

  it('shows an error if onCreateUser rejects', async () => {
    const onCreateUser = vi.fn().mockRejectedValue(new Error('Username taken'));
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await userEvent.click(screen.getByText('Create user'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Username taken');
  });

  it('"Done" resets back to the form', async () => {
    const onCreateUser = makeOnCreate();
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'bob@example.com');
    await userEvent.click(screen.getByText('Create user'));
    await screen.findByText('abc123XY');
    await userEvent.click(screen.getByText('Done'));
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it('disables the button while loading', () => {
    render(<CreateUserForm onCreateUser={vi.fn()} loading={true} />);
    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();
  });
});
