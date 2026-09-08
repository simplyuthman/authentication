'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  SignupSchema,
  type SignupInput,
  SigninSchema,
  type SigninInput,
  ForgotPasswordSchema,
  type ForgotPasswordInput,
  ResetPasswordSchema,
  type ResetPasswordInput,
  VerifyEmailSchema,
  type VerifyEmailInput,
  EMAIL_REGEX,
} from '@/lib/validation/auth.schemas';
import { FormField } from '@/components/forms/FormField';

export type AuthView =
  | 'signin'
  | 'signup'
  | 'forgot-password'
  | 'reset-password'
  | 'verify-email';

interface AuthPageContainerProps {
  initialView?: AuthView;
}

function AuthContent({ initialView = 'signin' }: AuthPageContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlEmail = searchParams.get('email') || '';
  const urlToken = searchParams.get('token') || '';

  const [activeView, setActiveView] = useState<AuthView>(() => {
    if (urlToken) return 'reset-password';
    if (urlEmail && initialView === 'verify-email') return 'verify-email';
    return initialView;
  });

  const [email, setEmail] = useState<string>(urlEmail);
  const [token, setToken] = useState<string>(urlToken);

  // Sync from URL changes if any
  useEffect(() => {
    if (urlToken) {
      setToken(urlToken);
      setActiveView('reset-password');
    }
    if (urlEmail) {
      setEmail(urlEmail);
    }
  }, [urlToken, urlEmail]);

  // Dynamically update document title based on the active form / action
  useEffect(() => {
    const titles: Record<AuthView, string> = {
      'signin': 'Sign In | Authentication',
      'signup': 'Create Account | Authentication',
      'forgot-password': 'Forgot Password | Authentication',
      'reset-password': 'Reset Password | Authentication',
      'verify-email': 'Verify Email | Authentication',
    };
    document.title = titles[activeView] || 'Authentication';
  }, [activeView]);

  const handleNavigate = (view: AuthView) => {
    setActiveView(view);
  };

  return (
    <main className="auth-page-container">
      <div className="auth-card">
        {/* Conditionally rendered form based on user selection */}
        {activeView === 'signin' && (
          <SignInView
            email={email}
            onNavigate={handleNavigate}
            onUnverified={(unverifiedEmail) => {
              setEmail(unverifiedEmail);
              handleNavigate('verify-email');
            }}
          />
        )}

        {activeView === 'signup' && (
          <SignUpView
            onNavigate={handleNavigate}
            onRegistered={(newEmail) => {
              setEmail(newEmail);
              handleNavigate('verify-email');
            }}
          />
        )}

        {activeView === 'forgot-password' && (
          <ForgotPasswordView
            email={email}
            onNavigate={handleNavigate}
            onInstructionsSent={(sentEmail) => {
              setEmail(sentEmail);
            }}
          />
        )}

        {activeView === 'reset-password' && (
          <ResetPasswordView
            token={token}
            onNavigate={handleNavigate}
          />
        )}

        {activeView === 'verify-email' && (
          <VerifyEmailView
            email={email}
            setEmail={setEmail}
            onNavigate={handleNavigate}
          />
        )}
      </div>
    </main>
  );
}

// -----------------------------------------------------------------------------
// 1. Sign In View
// -----------------------------------------------------------------------------
function SignInView({
  email,
  onNavigate,
  onUnverified,
}: {
  email: string;
  onNavigate: (view: AuthView) => void;
  onUnverified: (email: string) => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SigninInput>({
    resolver: zodResolver(SigninSchema),
    defaultValues: {
      email: email || '',
      password: '',
    },
  });

  const onSubmit = async (data: SigninInput) => {
    try {
      setIsSubmitting(true);
      setServerError(null);

      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.unverified) {
          onUnverified(data.email);
          return;
        }
        setServerError(json.error || 'Invalid credentials.');
        return;
      }

      router.push('/dashboard');
    } catch {
      setServerError('A network error occurred. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className="auth-header">
        <h1 className="auth-title">Sign in to your account</h1>
        <p className="auth-subtitle">
          Enter your credentials to continue to your dashboard.
        </p>
      </header>

      {serverError && (
        <div className="alert-banner alert-banner-error" role="alert">
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="auth-form" noValidate>
        <FormField
          id="signin-email"
          label="Email address"
          type="email"
          autoComplete="email"
          required
          error={errors.email?.message}
          inputProps={register('email')}
        />

        <FormField
          id="signin-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          error={errors.password?.message}
          inputProps={register('password')}
          labelRight={
            <button
              type="button"
              onClick={() => onNavigate('forgot-password')}
              className="btn-link form-label-link"
            >
              Forgot password?
            </button>
          }
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary"
          id="signin-submit-button"
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <footer className="auth-footer">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          onClick={() => onNavigate('signup')}
          className="btn-link"
        >
          Create account
        </button>
      </footer>
    </>
  );
}

// -----------------------------------------------------------------------------
// 2. Sign Up View
// -----------------------------------------------------------------------------
function SignUpView({
  onNavigate,
  onRegistered,
}: {
  onNavigate: (view: AuthView) => void;
  onRegistered: (email: string) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(SignupSchema),
    mode: 'onChange',
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
    },
  });

  const watchedFullName = watch('fullName') || '';
  const watchedEmail = watch('email') || '';
  const watchedPassword = watch('password') || '';

  // 1. Full name validation: at least 2 words
  const words = watchedFullName.trim().split(/\s+/).filter(Boolean);
  const isFullNameValid = words.length >= 2;
  const fullNameError =
    errors.fullName?.message ||
    (watchedFullName.length > 0 && !isFullNameValid
      ? 'Full name must contain at least two words'
      : undefined);

  // 2. Email validation: standard email structure in real time
  const isEmailValid = EMAIL_REGEX.test(watchedEmail.trim());
  const emailError =
    errors.email?.message ||
    (watchedEmail.length > 0 && !isEmailValid
      ? 'Please enter a valid email address (e.g. name@example.com)'
      : undefined);
  const emailSuccess =
    isEmailValid && !errors.email ? 'Valid email format' : undefined;

  // 3. Dynamic password complexity: 8+ chars, uppercase, lowercase, number, symbol
  const hasMinLength = watchedPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(watchedPassword);
  const hasLowercase = /[a-z]/.test(watchedPassword);
  const hasNumber = /[0-9]/.test(watchedPassword);
  const hasSymbol = /[^a-zA-Z0-9]/.test(watchedPassword);
  const isPasswordValid =
    hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSymbol;

  // 4. Overall form validity across all fields
  const isFormValid =
    isFullNameValid &&
    isEmailValid &&
    isPasswordValid &&
    !fullNameError &&
    !emailError;

  const onSubmit = async (data: SignupInput) => {
    try {
      setIsSubmitting(true);
      setServerError(null);

      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok) {
        setServerError(json.error || 'Failed to create account. Please try again.');
        return;
      }

      onRegistered(data.email);
    } catch {
      setServerError('A network error occurred. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className="auth-header">
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">
          Enter your details and password to register.
        </p>
      </header>

      {serverError && (
        <div className="alert-banner alert-banner-error" role="alert">
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="auth-form" noValidate>
        <FormField
          id="fullName"
          label="Full name"
          type="text"
          autoComplete="name"
          required
          error={fullNameError}
          inputProps={register('fullName')}
        />

        <FormField
          id="email"
          label="Email address"
          type="email"
          autoComplete="email"
          required
          error={emailError}
          success={emailSuccess}
          inputProps={register('email')}
        />

        <div className="form-field-group">
          <FormField
            id="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            error={errors.password?.message}
            inputProps={register('password')}
            rightAction={
              watchedPassword.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="form-input-action-btn"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              ) : undefined
            }
          />

          {/* Dynamic Password Complexity Checklist (Unmet requirements shown in real time, length requirement shown last and hidden when met) */}
          {watchedPassword.length > 0 && !isPasswordValid && (
            <div
              className="password-complexity-list"
              aria-label="Password complexity requirements"
            >
              {!hasUppercase && (
                <div className="complexity-item complexity-item-unmet">
                  <span aria-hidden="true">○</span>
                  <span>At least one uppercase letter (A-Z)</span>
                </div>
              )}
              {!hasLowercase && (
                <div className="complexity-item complexity-item-unmet">
                  <span aria-hidden="true">○</span>
                  <span>At least one lowercase letter (a-z)</span>
                </div>
              )}
              {!hasNumber && (
                <div className="complexity-item complexity-item-unmet">
                  <span aria-hidden="true">○</span>
                  <span>At least one number (0-9)</span>
                </div>
              )}
              {!hasSymbol && (
                <div className="complexity-item complexity-item-unmet">
                  <span aria-hidden="true">○</span>
                  <span>At least one symbol / special character</span>
                </div>
              )}
              {!hasMinLength && (
                <div className="complexity-item complexity-item-unmet">
                  <span aria-hidden="true">○</span>
                  <span>At least 8 characters</span>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!isFormValid || isSubmitting}
          className="btn-primary"
          id="signup-submit-button"
        >
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <footer className="auth-footer">
        Already have an account?{' '}
        <button
          type="button"
          onClick={() => onNavigate('signin')}
          className="btn-link"
        >
          Sign in
        </button>
      </footer>
    </>
  );
}

// -----------------------------------------------------------------------------
// 3. Forgot Password View
// -----------------------------------------------------------------------------
function ForgotPasswordView({
  email,
  onNavigate,
  onInstructionsSent,
}: {
  email: string;
  onNavigate: (view: AuthView) => void;
  onInstructionsSent: (email: string) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: {
      email: email || '',
    },
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    try {
      setIsSubmitting(true);
      setServerError(null);
      setSuccessMessage(null);

      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok) {
        setServerError(json.error || 'Failed to send password reset link.');
        return;
      }

      setSuccessMessage(
        json.message ||
          'If an account exists with this email address, password reset instructions have been sent.',
      );
      onInstructionsSent(data.email);
    } catch {
      setServerError('A network error occurred. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className="auth-header">
        <h1 className="auth-title">Forgot your password?</h1>
        <p className="auth-subtitle">
          Enter your email address and we will send you instructions to reset your password.
        </p>
      </header>

      {serverError && (
        <div className="alert-banner alert-banner-error" role="alert">
          <span>{serverError}</span>
        </div>
      )}

      {successMessage && (
        <div className="alert-banner alert-banner-success" role="status">
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="auth-form" noValidate>
        <FormField
          id="forgot-email"
          label="Email address"
          type="email"
          autoComplete="email"
          required
          error={errors.email?.message}
          inputProps={register('email')}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary"
          id="forgot-submit-button"
        >
          {isSubmitting ? 'Sending instructions...' : 'Send reset link'}
        </button>
      </form>

      <footer className="auth-footer" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div>
          Have a reset token?{' '}
          <button
            type="button"
            onClick={() => onNavigate('reset-password')}
            className="btn-link"
          >
            Reset password
          </button>
        </div>
        <div>
          Remember your password?{' '}
          <button
            type="button"
            onClick={() => onNavigate('signin')}
            className="btn-link"
          >
            Back to sign in
          </button>
        </div>
      </footer>
    </>
  );
}

// -----------------------------------------------------------------------------
// 4. Reset Password View
// -----------------------------------------------------------------------------
function ResetPasswordView({
  token: initialToken,
  onNavigate,
}: {
  token: string;
  onNavigate: (view: AuthView) => void;
}) {
  const [token, setToken] = useState(initialToken);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: {
      token: initialToken,
      password: '',
    },
  });

  useEffect(() => {
    if (initialToken) {
      setToken(initialToken);
      setValue('token', initialToken);
    }
  }, [initialToken, setValue]);

  const onSubmit = async (data: ResetPasswordInput) => {
    try {
      setIsSubmitting(true);
      setServerError(null);
      setSuccessMessage(null);

      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token || data.token,
          password: data.password,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setServerError(json.error || 'Failed to reset password.');
        return;
      }

      setSuccessMessage(
        json.message || 'Your password has been reset successfully.',
      );

      setTimeout(() => {
        onNavigate('signin');
      }, 1500);
    } catch {
      setServerError('A network error occurred. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className="auth-header">
        <h1 className="auth-title">Reset your password</h1>
        <p className="auth-subtitle">
          Enter a new password for your account below.
        </p>
      </header>

      {serverError && (
        <div className="alert-banner alert-banner-error" role="alert">
          <span>{serverError}</span>
        </div>
      )}

      {successMessage && (
        <div className="alert-banner alert-banner-success" role="status">
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="auth-form" noValidate>
        {!token ? (
          <FormField
            id="reset-token-input"
            label="Reset Token"
            type="text"
            required
            error={errors.token?.message}
            inputProps={{
              ...register('token'),
              onChange: (e) => {
                setToken(e.target.value);
                setValue('token', e.target.value);
              },
            }}
          />
        ) : (
          <input type="hidden" value={token} {...register('token')} />
        )}

        <FormField
          id="new-password"
          label="New Password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.password?.message}
          inputProps={register('password')}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary"
          id="reset-submit-button"
        >
          {isSubmitting ? 'Resetting password...' : 'Set new password'}
        </button>
      </form>

      <footer className="auth-footer" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div>
          Need a new reset token?{' '}
          <button
            type="button"
            onClick={() => onNavigate('forgot-password')}
            className="btn-link"
          >
            Request reset link
          </button>
        </div>
        <div>
          <button
            type="button"
            onClick={() => onNavigate('signin')}
            className="btn-link"
          >
            Back to sign in
          </button>
        </div>
      </footer>
    </>
  );
}

// -----------------------------------------------------------------------------
// 5. Verify Email View
// -----------------------------------------------------------------------------
function VerifyEmailView({
  email,
  setEmail,
  onNavigate,
}: {
  email: string;
  setEmail: (email: string) => void;
  onNavigate: (view: AuthView) => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyEmailInput>({
    resolver: zodResolver(VerifyEmailSchema),
    defaultValues: {
      email: email || '',
      code: '',
    },
  });

  const onVerify = async (data: VerifyEmailInput) => {
    try {
      setIsSubmitting(true);
      setServerError(null);
      setSuccessMessage(null);

      const targetEmail = email || data.email;

      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: data.code,
          email: targetEmail || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setServerError(json.error || 'Verification failed. Please check your code.');
        return;
      }

      router.push('/dashboard');
    } catch {
      setServerError('A network error occurred. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResend = async () => {
    const targetEmail = email;
    if (!targetEmail) {
      setServerError('Please enter your email address to resend a code.');
      return;
    }

    try {
      setIsResending(true);
      setServerError(null);
      setSuccessMessage(null);

      const res = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.remainingSeconds) {
          setCooldown(json.remainingSeconds);
        }
        setServerError(json.error || 'Failed to resend code.');
        return;
      }

      setSuccessMessage('A new 6-digit code has been sent.');
      setCooldown(60);
    } catch {
      setServerError('A network error occurred while resending the code.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <>
      <header className="auth-header">
        <h1 className="auth-title">Verify your email</h1>
        <p className="auth-subtitle">
          {email
            ? `We sent a 6-digit verification code to ${email}.`
            : 'Enter your 6-digit verification code below.'}
        </p>
      </header>

      {serverError && (
        <div className="alert-banner alert-banner-error" role="alert">
          <span>{serverError}</span>
        </div>
      )}

      {successMessage && (
        <div className="alert-banner alert-banner-success" role="status">
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onVerify)} className="auth-form" noValidate>
        {!email && (
          <FormField
            id="verify-email-address"
            label="Email address"
            type="email"
            autoComplete="email"
            required
            inputProps={{
              value: email,
              onChange: (e) => setEmail(e.target.value),
            }}
          />
        )}

        <FormField
          id="verification-code"
          label="6-Digit Verification Code"
          type="text"
          autoComplete="one-time-code"
          required
          error={errors.code?.message}
          inputProps={register('code')}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary"
          id="verify-submit-button"
        >
          {isSubmitting ? 'Verifying...' : 'Verify & Continue'}
        </button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
        <p className="auth-subtitle" style={{ fontSize: '0.75rem' }}>
          Didn&apos;t receive the code?
        </p>
        <button
          type="button"
          onClick={onResend}
          disabled={isResending || cooldown > 0}
          className="btn-secondary"
          id="resend-code-button"
        >
          {cooldown > 0
            ? `Resend code in ${cooldown}s`
            : isResending
            ? 'Sending...'
            : 'Resend verification code'}
        </button>
      </div>

      <footer className="auth-footer">
        Back to{' '}
        <button
          type="button"
          onClick={() => onNavigate('signin')}
          className="btn-link"
        >
          Sign in
        </button>
      </footer>
    </>
  );
}

export function AuthPageContainer({ initialView = 'signin' }: AuthPageContainerProps) {
  return (
    <Suspense
      fallback={
        <main className="auth-page-container">
          <div className="auth-card">
            <p>Loading authentication...</p>
          </div>
        </main>
      }
    >
      <AuthContent initialView={initialView} />
    </Suspense>
  );
}

export default AuthPageContainer;
