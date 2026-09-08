import React from 'react';

export interface FormFieldProps {
  id: string;
  label: string;
  type?: string;
  error?: string;
  success?: string;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  labelRight?: React.ReactNode;
  rightAction?: React.ReactNode;
  trimTrailingOnFocusBlur?: boolean;
}

/**
 * components/forms/FormField.tsx — Shared labeled input component.
 *
 * Used by ALL five auth screens. Structural accessibility is enforced here:
 * - <label htmlFor={id}> programmatically paired with <input id={id}>
 * - Visible :focus-visible outline styling using semantic tokens
 * - role="alert" for live error messages / role="status" for success messages
 * - Automatic trimming of trailing whitespace from input focus/blur
 * - Semantic design tokens: --color-surface-variant, --color-on-surface, --color-error, --color-primary
 */
export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      id,
      label,
      type = 'text',
      error,
      success,
      autoComplete,
      placeholder,
      disabled,
      required,
      inputProps = {},
      labelRight,
      rightAction,
      trimTrailingOnFocusBlur = true,
      ...rest
    },
    ref,
  ) => {
    const isError = Boolean(error);
    const isSuccess = Boolean(success && !isError);
    const errorId = `${id}-error`;
    const successId = `${id}-success`;

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      if (
        trimTrailingOnFocusBlur &&
        typeof e.target.value === 'string' &&
        /\s+$/.test(e.target.value)
      ) {
        const trimmed = e.target.value.replace(/\s+$/, '');
        e.target.value = trimmed;
        inputProps.onChange?.({
          ...e,
          target: e.target,
          currentTarget: e.currentTarget,
        } as unknown as React.ChangeEvent<HTMLInputElement>);
      }
      inputProps.onFocus?.(e);
      if ('onFocus' in rest && typeof (rest as { onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void }).onFocus === 'function') {
        (rest as { onFocus: (e: React.FocusEvent<HTMLInputElement>) => void }).onFocus(e);
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (
        trimTrailingOnFocusBlur &&
        typeof e.target.value === 'string' &&
        /\s+$/.test(e.target.value)
      ) {
        const trimmed = e.target.value.replace(/\s+$/, '');
        e.target.value = trimmed;
        inputProps.onChange?.({
          ...e,
          target: e.target,
          currentTarget: e.currentTarget,
        } as unknown as React.ChangeEvent<HTMLInputElement>);
      }
      inputProps.onBlur?.(e);
      if ('onBlur' in rest && typeof (rest as { onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void }).onBlur === 'function') {
        (rest as { onBlur: (e: React.FocusEvent<HTMLInputElement>) => void }).onBlur(e);
      }
    };

    const inputClasses = [
      'form-input',
      isError ? 'form-input-error' : '',
      isSuccess ? 'form-input-success' : '',
      rightAction ? 'form-input-with-action' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const inputElement = (
      <input
        id={id}
        ref={ref}
        type={type}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={isError ? 'true' : 'false'}
        aria-describedby={
          isError ? errorId : isSuccess ? successId : undefined
        }
        className={inputClasses}
        {...inputProps}
        {...rest}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    );

    return (
      <div className="form-field-group">
        <div className="form-label-row">
          <label htmlFor={id} className="form-label">
            {label}
            {required && <span className="required-indicator" aria-hidden="true">*</span>}
          </label>
          {labelRight}
        </div>

        {rightAction ? (
          <div className="form-input-wrapper">
            {inputElement}
            {rightAction}
          </div>
        ) : (
          inputElement
        )}

        {error && (
          <p id={errorId} role="alert" aria-live="polite" className="form-error-text">
            {error}
          </p>
        )}

        {isSuccess && (
          <p id={successId} role="status" aria-live="polite" className="form-success-text">
            ✓ {success}
          </p>
        )}
      </div>
    );
  },
);

FormField.displayName = 'FormField';
