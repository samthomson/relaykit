import * as React from 'react';

type ToastProps = {
  variant?: 'default' | 'destructive';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type ToastActionElement = React.ReactNode;

const ToastProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const ToastViewport = () => null;
const Toast = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const ToastTitle = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const ToastDescription = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const ToastClose = () => null;
const ToastAction = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export { type ToastProps, type ToastActionElement, ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose, ToastAction };
