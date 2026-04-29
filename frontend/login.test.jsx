import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Login from '../../LudusGen_frontend/src/pages/Login';
import { MyUserContext } from '../../LudusGen_frontend/src/context/MyUserProvider';
import axios from 'axios';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('../../LudusGen_frontend/src/components/TwoFactorLogin', () => ({
  default: ({ isOpen, email }) => (
    isOpen ? <div role="dialog" aria-label="Two factor login">2FA required for {email}</div> : null
  ),
}));

describe('Login modal', () => {
  let contextValue;
  let onClose;

  beforeEach(() => {
    contextValue = {
      user: null,
      msg: {},
      setMsg: vi.fn(),
      signUpUser: vi.fn().mockResolvedValue(undefined),
      signInUser: vi.fn().mockResolvedValue({ requires2FA: false }),
      signInWithGoogle: vi.fn().mockResolvedValue({ requires2FA: false }),
      resetPassword: vi.fn(),
      setIsAuthOpen: vi.fn(),
      setShowNavbar: vi.fn(),
    };
    onClose = vi.fn();
    axios.post.mockResolvedValue({ data: { success: true } });
  });

  const renderLogin = (props = {}) => {
    return render(
      <MyUserContext.Provider value={contextValue}>
        <Login isOpen onClose={onClose} {...props} />
      </MyUserContext.Provider>
    );
  };

  const emailInput = () => screen.getByPlaceholderText('hello@example.com');
  const passwordInput = (container, index = 0) =>
    container.querySelectorAll('input[type="password"]')[index];
  const submitButton = (container) => container.querySelector('button[type="submit"]');

  it('renders the current login form', () => {
    const { container } = renderLogin();

    expect(screen.getByText('ENTER THE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
    expect(screen.getByText('Email Address')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(emailInput()).toBeInTheDocument();
    expect(passwordInput(container)).toBeInTheDocument();
    expect(screen.getByText('Remember me')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Google/ })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <MyUserContext.Provider value={contextValue}>
        <Login isOpen={false} onClose={onClose} />
      </MyUserContext.Provider>
    );

    expect(screen.queryByText('ENTER THE')).not.toBeInTheDocument();
  });

  it('switches to the registration form', async () => {
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(screen.getByPlaceholderText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByText(/By registering, you agree/i)).toBeInTheDocument();
  });

  it('shows the forgot password form', async () => {
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(screen.getByText('Forgot Password')).toBeInTheDocument();
    expect(screen.getByText('Enter your email to receive a reset link.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeDisabled();
  });

  it('validates email format in login mode', async () => {
    renderLogin();

    await userEvent.type(emailInput(), 'invalid-email');

    expect(screen.getByText('Invalid email address')).toBeInTheDocument();
  });

  it('enables and submits the login form with valid credentials', async () => {
    const { container } = renderLogin();

    await userEvent.type(emailInput(), 'user@example.com');
    await userEvent.type(passwordInput(container), 'StrongPass123!');

    expect(submitButton(container)).not.toBeDisabled();
    await userEvent.click(submitButton(container));

    await waitFor(() => {
      expect(contextValue.signInUser).toHaveBeenCalledWith(
        'user@example.com',
        'StrongPass123!',
        expect.any(Function)
      );
    });
  });

  it('opens the 2FA dialog when the backend requires it', async () => {
    contextValue.signInUser.mockResolvedValueOnce({ requires2FA: true });
    const { container } = renderLogin();

    await userEvent.type(emailInput(), 'user@example.com');
    await userEvent.type(passwordInput(container), 'StrongPass123!');
    await userEvent.click(submitButton(container));

    expect(await screen.findByRole('dialog', { name: 'Two factor login' })).toHaveTextContent(
      'user@example.com'
    );
  });

  it('validates password strength in registration mode', async () => {
    const { container } = renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    await userEvent.type(passwordInput(container), 'weak');

    expect(screen.getByText(/Minimum 8 characters/)).toBeInTheDocument();
    expect(screen.getByText(/At least one uppercase letter/)).toBeInTheDocument();
    expect(screen.getByText(/At least one special character/)).toBeInTheDocument();
  });

  it('submits the registration form', async () => {
    const { container } = renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    await userEvent.type(screen.getByPlaceholderText('John Doe'), 'Exam User');
    await userEvent.type(emailInput(), 'exam@example.com');
    await userEvent.type(passwordInput(container, 0), 'StrongPass123!');
    await userEvent.type(passwordInput(container, 1), 'StrongPass123!');
    await userEvent.click(submitButton(container));

    await waitFor(() => {
      expect(contextValue.signUpUser).toHaveBeenCalledWith(
        'exam@example.com',
        'StrongPass123!',
        'Exam User',
        expect.any(Function)
      );
    });
  });

  it('calls Google sign-in from the OAuth button', async () => {
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: /Google/ }));

    expect(contextValue.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('submits forgot password request through the backend endpoint', async () => {
    const { container } = renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await userEvent.type(emailInput(), 'reset@example.com');
    await userEvent.click(submitButton(container));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/forgot-password'),
        { email: 'reset@example.com' }
      );
    });
  });

  it('calls onClose from the close button', async () => {
    const { container } = renderLogin();
    const closeButton = container.querySelector('button.absolute');

    await userEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
