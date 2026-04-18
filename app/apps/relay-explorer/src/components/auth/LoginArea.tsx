// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { useEffect, useState } from 'react';
import { Box, Button, Group } from '@mantine/core';
import LoginDialog from './LoginDialog';
import SignupDialog from './SignupDialog';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { AccountSwitcher } from './AccountSwitcher';

export type AuthRequest = 'login' | 'signup' | null;

export interface LoginAreaProps {
  className?: string;
  w?: number | string;
  request?: AuthRequest;
  onRequestHandled?: () => void;
}

export const LoginArea = ({ className, w, request, onRequestHandled }: LoginAreaProps) => {
  const { currentUser } = useLoggedInAccounts();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [signupDialogOpen, setSignupDialogOpen] = useState(false);

  const handleLogin = () => {
    setLoginDialogOpen(false);
    setSignupDialogOpen(false);
  };

  useEffect(() => {
    if (!request) return;
    if (request === 'login') {
      setLoginDialogOpen(true);
      setSignupDialogOpen(false);
    }
    if (request === 'signup') {
      setSignupDialogOpen(true);
      setLoginDialogOpen(false);
    }
    onRequestHandled?.();
  }, [request, onRequestHandled]);

  return (
    <Box className={className} w={w}>
      {currentUser ? (
        <AccountSwitcher onAddAccountClick={() => setLoginDialogOpen(true)} />
      ) : (
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" onClick={() => setLoginDialogOpen(true)}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Log in</span>
          </Button>
          <Button size="xs" onClick={() => setSignupDialogOpen(true)} variant="outline">
            Sign up
          </Button>
        </Group>
      )}

      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={handleLogin}
      />

      <SignupDialog
        isOpen={signupDialogOpen}
        onClose={() => setSignupDialogOpen(false)}
      />
    </Box>
  );
};
