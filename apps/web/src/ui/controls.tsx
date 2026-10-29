import { Button as AriaButton, TextField as AriaTextField, Input, Label } from 'react-aria-components';
import type { ButtonProps as AriaButtonProps, TextFieldProps as AriaTextFieldProps } from 'react-aria-components';

export interface ButtonProps extends Omit<AriaButtonProps, 'className'> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'icon' | 'round';
  size?: 'send' | 'choose';
}
export function Button({ variant = 'primary', size = 'send', ...props }: ButtonProps) {
  return <AriaButton {...props} className={`wp-button wp-button-${variant} wp-button-${size}`} />;
}
export interface TextFieldProps extends Omit<AriaTextFieldProps, 'children' | 'className'> {
  label: string;
  placeholder?: string;
  hideLabel?: boolean;
  variant?: 'plain' | 'search';
}
export function TextField({ label, placeholder, hideLabel = false, variant = 'plain', ...props }: TextFieldProps) {
  const input = <Input className="wp-input" {...(placeholder === undefined ? {} : { placeholder })} />;
  return <AriaTextField {...props} className={`wp-text-field${variant === 'search' ? ' wp-search-field' : ''}`}><Label className={hideLabel ? 'wp-sr-only' : 'wp-field-label'}>{label}</Label>{variant === 'search' ? <div className="wp-search-control"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>{input}</div> : input}</AriaTextField>;
}
