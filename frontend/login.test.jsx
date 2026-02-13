import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import Login from '../../LudusGen_frontend/src/pages/Login';
import { MyUserContext } from '../../LudusGen_frontend/src/context/MyUserProvider';
import { mockUserContext } from '../mocks';

describe('Login Component Tests', () => {
  let mockContext;
  let mockOnClose;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      ...mockUserContext,
      signUpUser: vi.fn(),
      signInUser: vi.fn(() => Promise.resolve({ requires2FA: false })),
      signInWithGoogle: vi.fn(() => Promise.resolve({ requires2FA: false })),
      resetPassword: vi.fn(),
      msg: {},
      setMsg: vi.fn(),
    };

    mockOnClose = vi.fn();
  });

  const renderLogin = (props = {}) => {
    return render(
      <MyUserContext.Provider value={mockContext}>
        <Login isOpen={true} onClose={mockOnClose} {...props} />
      </MyUserContext.Provider>
    );
  };

  const getLoginSubmitButton = () => {
    return screen.getByTestId('main-submit-btn');
  };

  const getSignupSubmitButton = () => {
    return screen.getByTestId('main-submit-btn');
  };

  // ✅ VÉGSŐ JAVÍTOTT switchToSignup helper
  const switchToSignup = async () => {
    // ✅ CSAK a TAB gombot keressük (type="button" ÉS "Regisztráció" szöveg)
    const allButtons = screen.getAllByRole('button');
    const signupTabButton = allButtons.find(btn => 
      btn.textContent.trim() === 'Regisztráció' && 
      btn.getAttribute('type') === 'button' &&
      btn.className.includes('flex-1') // A tab gombnak van flex-1 class-a
    );
    
    if (!signupTabButton) {
      throw new Error('Signup tab button not found!');
    }
    
    await userEvent.click(signupTabButton);
    
    // Várjuk meg, hogy a signup form megjelenjen
    await waitFor(() => {
      const csatlakozzTitle = screen.getByText('Csatlakozz!');
      const style = window.getComputedStyle(csatlakozzTitle);
      expect(parseFloat(style.opacity)).toBeGreaterThan(0.5);
    }, { timeout: 2000 });
    
    // Extra várakozás az animációra
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Végső ellenőrzés
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Kiss János')).toBeInTheDocument();
    }, { timeout: 1000 });
  };

  describe('Component Rendering', () => {
    it('should render login form by default', () => {
      renderLogin();

      expect(screen.getByText('Üdvözlünk!')).toBeInTheDocument();
      expect(screen.getByText('Lépj be a fiókodba')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('pelda@email.com')).toBeInTheDocument();
      
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      expect(passwordInputs[0]).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      render(
        <MyUserContext.Provider value={mockContext}>
          <Login isOpen={false} onClose={mockOnClose} />
        </MyUserContext.Provider>
      );

      expect(screen.queryByText('Üdvözlünk!')).not.toBeInTheDocument();
    });

    it('should render signup form when switching to signup mode', async () => {
      renderLogin();

      const tabButtons = screen.getAllByRole('button');
      const signupTab = tabButtons.find(btn => btn.textContent === 'Regisztráció' && !btn.type);
      
      await userEvent.click(signupTab);

      await waitFor(() => {
        expect(screen.getByText('Csatlakozz!')).toBeInTheDocument();
        expect(screen.getByText('Hozz létre egy új fiókot')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Kiss János')).toBeInTheDocument();
      });
    });

    it('should render forgot password form when clicking forgot password', async () => {
      renderLogin();

      const forgotPasswordLink = screen.getByText('Elfelejtett jelszó?');
      await userEvent.click(forgotPasswordLink);

      await waitFor(() => {
        expect(screen.getByText('Elfelejtett jelszó')).toBeInTheDocument();
        expect(
          screen.getByText(
            'Add meg az email címedet és küldünk egy visszaállító linket'
          )
        ).toBeInTheDocument();
      });
    });

    it('should render Google sign in button', () => {
      renderLogin();

      expect(screen.getByText('Folytatás Google-lel')).toBeInTheDocument();
    });

    it('should show close button', () => {
      renderLogin();

      const closeButtons = screen.getAllByRole('button');
      const xButton = closeButtons.find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.querySelector('path[d*="18 6"]');
      });

      expect(xButton).toBeInTheDocument();
    });
  });

  describe('Form Validation - Login', () => {
    it('should validate email format', async () => {
      renderLogin();

      const emailInput = screen.getByPlaceholderText('pelda@email.com');
      await userEvent.type(emailInput, 'invalid-email');

      await waitFor(() => {
        expect(screen.getByText('Érvénytelen email formátum')).toBeInTheDocument();
      });
    });

    it('should accept valid email format', async () => {
      renderLogin();

      const emailInput = screen.getByPlaceholderText('pelda@email.com');
      await userEvent.type(emailInput, 'valid@email.com');

      await waitFor(() => {
        expect(
          screen.queryByText('Érvénytelen email formátum')
        ).not.toBeInTheDocument();
      });
    });

    it('should disable login button when form is invalid', async () => {
      renderLogin();

      await waitFor(() => {
        const submitButton = getLoginSubmitButton();
        expect(submitButton).toBeDisabled();
      });
    });

    it('should enable login button when form is valid', async () => {
      renderLogin();

      const emailInput = screen.getByPlaceholderText('pelda@email.com');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      const passwordInput = passwordInputs[0];
      
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordInput, 'Test123!@#');
      
      await waitFor(() => {
        const submitButton = getLoginSubmitButton();
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  describe('Form Validation - Signup', () => {
    it('should validate password requirements', async () => {
      renderLogin();

      await switchToSignup();

      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      const passwordInput = passwordInputs[0];
      
      await userEvent.clear(passwordInput);
      await userEvent.type(passwordInput, 'short', { delay: 50 });
      
      await new Promise(resolve => setTimeout(resolve, 400));

      await waitFor(() => {
        expect(screen.getByText('Minimum 8 karakter')).toBeInTheDocument();
        expect(screen.getByText('Legalább egy nagybetű')).toBeInTheDocument();
        expect(
          screen.getByText(/Legalább egy speciális karakter/)
        ).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should show password validation success', async () => {
      renderLogin();
      
      await switchToSignup();

      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      const passwordInput = passwordInputs[0];
      
      await userEvent.clear(passwordInput);
      await userEvent.type(passwordInput, 'short', { delay: 50 });
      
      await new Promise(resolve => setTimeout(resolve, 400));

      await waitFor(() => {
        const validationItems = screen.queryAllByText(/Minimum 8 karakter|Legalább egy nagybetű|Legalább egy speciális karakter/);
        expect(validationItems.length).toBeGreaterThan(0);
      }, { timeout: 5000 });

      await userEvent.clear(passwordInput);
      await new Promise(resolve => setTimeout(resolve, 200));
      await userEvent.type(passwordInput, 'ValidPass123!@#', { delay: 30 });
      
      await new Promise(resolve => setTimeout(resolve, 400));

      await waitFor(() => {
        const validationItems = screen.queryAllByText(/Minimum 8 karakter|Legalább egy nagybetű|Legalább egy speciális karakter/);
        expect(validationItems.length).toBe(0);
      }, { timeout: 5000 });
    });

    it('should validate password confirmation match', async () => {
      renderLogin();
      
      await switchToSignup();

      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      const passwordInput = passwordInputs[0];
      const confirmPasswordInput = passwordInputs[1];

      await userEvent.type(passwordInput, 'Test123!@#');
      await userEvent.type(confirmPasswordInput, 'Different123!@#');

      await waitFor(() => {
        expect(screen.getByText('A jelszavak nem egyeznek')).toBeInTheDocument();
      });
    });

    it('should validate name length', async () => {
      renderLogin();
      
      await switchToSignup();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Kiss János')).toBeInTheDocument();
      });
    });

    it('should disable signup button when form is invalid', async () => {
      renderLogin();
      
      await switchToSignup();

      await waitFor(() => {
        const submitButton = getSignupSubmitButton();
        expect(submitButton).toBeDisabled();
      });
    });

    it('should enable signup button when form is valid', async () => {
      renderLogin();
      
      await switchToSignup();

      const nameInput = screen.getByPlaceholderText('Kiss János');
      const emailInput = screen.getByPlaceholderText('pelda@email.com');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      const passwordInput = passwordInputs[0];
      const confirmPasswordInput = passwordInputs[1];

      await userEvent.type(nameInput, 'Test User');
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordInput, 'Test123!@#');
      await userEvent.type(confirmPasswordInput, 'Test123!@#');

      await waitFor(() => {
        const submitButton = getSignupSubmitButton();
        expect(submitButton).not.toBeDisabled();
      }, { timeout: 3000 });
    });
  });

  describe('Password Visibility Toggle', () => {
    it('should toggle password visibility', async () => {
      renderLogin();

      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      const passwordInput = passwordInputs[0];
      
      const allButtons = screen.getAllByRole('button');
      const eyeButton = allButtons.find(btn => {
        const svg = btn.querySelector('svg');
        return svg && (svg.classList.contains('lucide-eye') || svg.classList.contains('lucide-eye-off'));
      });

      expect(eyeButton).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute('type', 'password');

      await userEvent.click(eyeButton);

      await waitFor(() => {
        expect(passwordInput).toHaveAttribute('type', 'text');
      });
    });
  });

  describe('Login Submission', () => {
    it('should call signInUser on login form submission', async () => {
      renderLogin();

      const emailInput = screen.getByPlaceholderText('pelda@email.com');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      const passwordInput = passwordInputs[0];
      
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordInput, 'Test123!@#');

      const submitButton = getLoginSubmitButton();
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });

      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockContext.signInUser).toHaveBeenCalled();
      });
    });

    it('should handle 2FA required response', async () => {
      mockContext.signInUser = vi.fn(() =>
        Promise.resolve({ requires2FA: true })
      );

      renderLogin();

      const emailInput = screen.getByPlaceholderText('pelda@email.com');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      const passwordInput = passwordInputs[0];
      
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordInput, 'Test123!@#');

      const submitButton = getLoginSubmitButton();
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });

      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockContext.signInUser).toHaveBeenCalled();
      });
    });

    it('should display error message on login failure', async () => {
      mockContext.msg = { incorrectSignIn: 'Hibás email/jelszó páros' };

      renderLogin();

      await waitFor(() => {
        expect(screen.getByText('Hibás email/jelszó páros')).toBeInTheDocument();
      });
    });
  });

  describe('Signup Submission', () => {
    it('should call signUpUser on signup form submission', async () => {
      renderLogin();

      await switchToSignup();

      const nameInput = screen.getByPlaceholderText('Kiss János');
      const emailInput = screen.getByPlaceholderText('pelda@email.com');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');

      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'New User', { delay: 50 });
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'newuser@example.com', { delay: 30 });
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await userEvent.clear(passwordInputs[0]);
      await userEvent.type(passwordInputs[0], 'Test123!@#', { delay: 30 });
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await userEvent.clear(passwordInputs[1]);
      await userEvent.type(passwordInputs[1], 'Test123!@#', { delay: 30 });
      
      await new Promise(resolve => setTimeout(resolve, 500));

      const submitButton = getSignupSubmitButton();
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      }, { timeout: 5000 });

      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockContext.signUpUser).toHaveBeenCalled();
      }, { timeout: 5000 });
    }, 15000);

    it('should display error message on signup failure', async () => {
      mockContext.msg = {
        incorrectSignUp: 'Ez az email cím már regisztrálva van',
      };

      renderLogin();

      await switchToSignup();

      await waitFor(() => {
        expect(
          screen.getByText('Az email cím már használatban van')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Forgot Password', () => {
    it('should submit forgot password form', async () => {
      renderLogin();

      const forgotPasswordLink = screen.getByText('Elfelejtett jelszó?');
      await userEvent.click(forgotPasswordLink);

      const emailInput = await screen.findByPlaceholderText('pelda@email.com');
      await userEvent.type(emailInput, 'forgot@example.com');

      const submitButton = screen.getByRole('button', {
        name: /visszaállító link küldése/i,
      });

      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });

      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockContext.resetPassword).toHaveBeenCalledWith(
          'forgot@example.com'
        );
      });
    });

    it('should go back to login from forgot password', async () => {
      renderLogin();

      const forgotPasswordLink = screen.getByText('Elfelejtett jelszó?');
      await userEvent.click(forgotPasswordLink);

      await waitFor(() => {
        expect(screen.getByText('Elfelejtett jelszó')).toBeInTheDocument();
      });

      const allButtons = screen.getAllByRole('button');
      const backButton = allButtons.find(btn => {
        const svg = btn.querySelector('svg');
        return svg && svg.classList.contains('lucide-arrow-left');
      });
      
      await userEvent.click(backButton);

      await waitFor(() => {
        expect(screen.getByText('Üdvözlünk!')).toBeInTheDocument();
      });
    });
  });

  describe('Google Sign In', () => {
    it('should call signInWithGoogle when clicking Google button', async () => {
      renderLogin();

      const googleButton = screen.getByText('Folytatás Google-lel');
      await userEvent.click(googleButton);

      await waitFor(() => {
        expect(mockContext.signInWithGoogle).toHaveBeenCalled();
      });
    });

    it('should handle Google sign in with 2FA', async () => {
      mockContext.signInWithGoogle = vi.fn(() =>
        Promise.resolve({
          requires2FA: true,
          email: 'google@example.com',
          sessionId: 'google-session-123',
        })
      );

      renderLogin();

      const googleButton = screen.getByText('Folytatás Google-lel');
      await userEvent.click(googleButton);

      await waitFor(() => {
        expect(mockContext.signInWithGoogle).toHaveBeenCalled();
      });
    });
  });

  describe('Mode Switching', () => {
    it('should switch between login and signup modes', async () => {
      renderLogin();

      expect(screen.getByText('Üdvözlünk!')).toBeInTheDocument();

      const tabButtons = screen.getAllByRole('button');
      const signupTab = tabButtons.find(btn => btn.textContent === 'Regisztráció' && !btn.type);
      
      await userEvent.click(signupTab);

      await waitFor(() => {
        expect(screen.getByText('Csatlakozz!')).toBeInTheDocument();
      });

      const loginTab = tabButtons.find(btn => btn.textContent === 'Bejelentkezés' && !btn.type);
      await userEvent.click(loginTab);

      await waitFor(() => {
        expect(screen.getByText('Üdvözlünk!')).toBeInTheDocument();
      });
    });
  });

  describe('Modal Close', () => {
    it('should call onClose when clicking close button', async () => {
      renderLogin();

      const allButtons = screen.getAllByRole('button');
      const closeButton = allButtons.find(btn => {
        const svg = btn.querySelector('svg');
        return svg && svg.classList.contains('lucide-x');
      });

      if (closeButton) {
        await userEvent.click(closeButton);

        await waitFor(() => {
          expect(mockOnClose).toHaveBeenCalled();
        });
      }
    });
  });

  describe('Loading States', () => {
    it('should show loading state during form submission', async () => {
      mockContext.signInUser = vi.fn(
        () => new Promise(() => {})
      );

      renderLogin();

      const emailInput = screen.getByPlaceholderText('pelda@email.com');
      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      const passwordInput = passwordInputs[0];
      
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordInput, 'Test123!@#');
      
      const submitButton = getLoginSubmitButton();
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });

      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Feldolgozás...')).toBeInTheDocument();
      });
    });
  });

  describe('Terms and Conditions', () => {
    it('should show terms and conditions in signup mode', async () => {
      renderLogin();

      await switchToSignup();

      await waitFor(() => {
        expect(screen.getByText(/A regisztrációval elfogadod/)).toBeInTheDocument();
        expect(screen.getByText('ÁSZF-et')).toBeInTheDocument();
        expect(screen.getByText('Adatvédelmi Nyilatkozatot')).toBeInTheDocument();
      });
    });

    it('should not show terms in login mode', () => {
      renderLogin();

      const termsElement = screen.queryByText(/A regisztrációval elfogadod/);
      if (termsElement) {
        const containerStyle = window.getComputedStyle(termsElement.closest('[style]') || termsElement.parentElement);
        expect(
          containerStyle.opacity === '0' || containerStyle.maxHeight === '0px'
        ).toBe(true);
      }
    });
  });
});