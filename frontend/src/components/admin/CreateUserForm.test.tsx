import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { CreateUserForm } from './CreateUserForm';

function makeOnCreate(overrides?: Partial<{ username: string; oneTimePassword: string }>) {
  return vi.fn().mockResolvedValue({
    username: overrides?.username ?? 'bob',
    oneTimePassword: overrides?.oneTimePassword ?? 'abc123XY',
  });
}

describe('CreateUserForm', () => {
  it('shows a validation error for a whitespace-only username', async () => {
    // jsdom enforces the `required` attribute (blocks empty submit), but not
    // `minLength` or `pattern`. A space satisfies `required` yet fails the
    // JS pattern check, so handleSubmit runs and shows the error.
    render(<CreateUserForm onCreateUser={vi.fn()} loading={false} />);
    await userEvent.type(screen.getByLabelText('Username'), ' ');
    await userEvent.click(screen.getByText('Create user'));
    expect(screen.getByRole('alert')).toHaveTextContent(/3-30 characters/);
  });

  it('shows a validation error for a username that fails the pattern', async () => {
    render(<CreateUserForm onCreateUser={vi.fn()} loading={false} />);
    await userEvent.type(screen.getByLabelText('Username'), 'a!');
    await userEvent.click(screen.getByText('Create user'));
    expect(screen.getByRole('alert')).toHaveTextContent(/3-30 characters/);
  });

  it('calls onCreateUser with the entered username', async () => {
    const onCreateUser = makeOnCreate({ username: 'alice' });
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.click(screen.getByText('Create user'));
    expect(onCreateUser).toHaveBeenCalledWith('alice');
  });

  it('shows OtpDisplay after a successful creation', async () => {
    const onCreateUser = makeOnCreate({ username: 'bob', oneTimePassword: 'abc123XY' });
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText('Username'), 'bob');
    await userEvent.click(screen.getByText('Create user'));
    expect(await screen.findByText('abc123XY')).toBeInTheDocument();
  });

  it('shows an error if onCreateUser rejects', async () => {
    const onCreateUser = vi.fn().mockRejectedValue(new Error('Username taken'));
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.click(screen.getByText('Create user'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Username taken');
  });

  it('"Done" resets back to the form', async () => {
    const onCreateUser = makeOnCreate();
    render(<CreateUserForm onCreateUser={onCreateUser} loading={false} />);
    await userEvent.type(screen.getByLabelText('Username'), 'bob');
    await userEvent.click(screen.getByText('Create user'));
    await screen.findByText('abc123XY');
    await userEvent.click(screen.getByText('Done'));
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('disables the button while loading', () => {
    render(<CreateUserForm onCreateUser={vi.fn()} loading={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
