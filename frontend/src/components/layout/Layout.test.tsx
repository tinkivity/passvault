import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button, Card, ErrorMessage, Input } from './Layout';

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('shows "Please wait…" spinner and disables when loading', () => {
    render(<Button loading>Save</Button>);
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
    expect(screen.getByText('Please wait…')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when the disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>No-op</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ErrorMessage', () => {
  it('renders nothing when message is null', () => {
    const { container } = render(<ErrorMessage message={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an alert with the message text when provided', () => {
    render(<ErrorMessage message="Something went wrong" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

describe('Card', () => {
  it('renders its children', () => {
    render(<Card><p>Hello card</p></Card>);
    expect(screen.getByText('Hello card')).toBeInTheDocument();
  });
});

describe('Input', () => {
  it('renders a labelled input', () => {
    render(<Input label="Password" id="pw" />);
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('fires onChange when the user types', async () => {
    const onChange = vi.fn();
    render(<Input label="Name" id="name" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Name'), 'hi');
    expect(onChange).toHaveBeenCalled();
  });

  it('accepts and displays a value', () => {
    render(<Input label="Email" id="email" value="test@example.com" onChange={() => {}} />);
    expect(screen.getByLabelText('Email')).toHaveValue('test@example.com');
  });
});
