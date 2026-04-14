import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink as RouterNavLink } from 'react-router-dom';
import { RubixLoader, RubixLoaderColor } from '@samthomson/rubix-loader';
import { trpc } from './trpc';
import { useAuth } from './contexts/AuthContext';
import { useDokploy } from './contexts/DokployContext';
import { InsightsPage } from './components/InsightsPage';
import { AccountModal } from './components/AccountModal';
import { NavServerSummary } from './components/NavServerSummary';
import { DebugPage } from './pages/DebugPage';
import { LoginScreen } from './pages/LoginScreen';
import { ServiceList } from './pages/ServicesPage';
import {
  Menu,
  Button,
  Text,
  Group,
  Title,
  AppShell,
  Burger,
  NavLink,
  ScrollArea,
  Box,
  rem,
  useMantineColorScheme,
  Switch,
  Stack,
  Paper,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown } from '@tabler/icons-react';

const rubixLoaderColors = [
  RubixLoaderColor.RelayKit,
  RubixLoaderColor.Strfry,
  RubixLoaderColor.NostrRs,
  RubixLoaderColor.Blossom,
  RubixLoaderColor.Npanel,
];

const DokployConnectionAlert = ({ message }: { message: string }) => (
  <Paper color="red" p="md">
    <Text fw={700}>Dokploy connection problem</Text>
    <Text size="sm" mt="xs">{message}</Text>
    <Text size="sm" mt="xs" c="dimmed">
      To fix: run the setup script with your npub, or add a valid Dokploy API key to the bootstrap key file (see README).
    </Text>
  </Paper>
);

const DokployInitialCheck = () => {
  const { setDokployConnectionError, setDokployReady } = useDokploy();
  const { logout } = useAuth();
  useEffect(() => {
    trpc.listServices
      .query()
      .then(() => setDokployReady(true))
      .catch((error: any) => {
        const code = error?.data?.code;
        const msg = error?.message || '';
        if (code === 'UNAUTHORIZED' && msg.includes('Authentication required')) {
          logout();
          return;
        }
        setDokployConnectionError(msg || 'Could not load services. Run the setup script (see README).');
      });
  }, [setDokployConnectionError, setDokployReady, logout]);
  return null;
};

const ServicesHomeRoute = () => {
  const { dokployConnectionError, dokployReady } = useDokploy();

  if (dokployConnectionError) {
    return (
      <Stack gap="xl" p="xl">
        <DokployConnectionAlert message={dokployConnectionError} />
      </Stack>
    );
  }

  return (
    <Stack gap="xl" p="xl">
      <DokployInitialCheck />
      {!dokployReady ? (
        <Stack align="center" justify="center" gap="sm" style={{ minHeight: rem(480) }}>
          <RubixLoader size={144} colors={[RubixLoaderColor.RelayKit]} speed={1.35} />
          <Text size="sm" c="dimmed">loading services…</Text>
        </Stack>
      ) : (
        <ServiceList />
      )}
    </Stack>
  );
};

const AppContent = () => {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [mobileMenuOpened, { toggle: toggleMobileMenu, close: closeMobileMenu }] = useDisclosure(false);
  const [accountModalOpen, { open: openAccountModal, close: closeAccountModal }] = useDisclosure(false);

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <>
      <AppShell
        header={{ height: 60 }}
        navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !mobileMenuOpened } }}
        padding="md"
      >
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Group gap="sm" align="center">
              <Burger opened={mobileMenuOpened} onClick={toggleMobileMenu} hiddenFrom="sm" size="sm" />
              <Box style={{ lineHeight: 0, flexShrink: 0, height: 34, display: 'inline-flex', alignItems: 'center' }}>
                <RubixLoader
                  size={48}
                  speed={0.9}
                  colors={rubixLoaderColors}
                />
              </Box>
              <Title
                order={3}
                c="relaykit"
                className="brand-title"
                style={{
                  fontSize: rem(30),
                  lineHeight: '34px',
                  margin: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  transform: 'translateY(2px)',
                }}
              >
                RelayKit
              </Title>
            </Group>
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <Button variant="default" size="sm" rightSection={<IconChevronDown size={14} />}>
                  init
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={openAccountModal}>
                  identity
                </Menu.Item>
                <Menu.Item
                  closeMenuOnClick={false}
                  onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
                >
                  <Group justify="space-between" wrap="nowrap" w="100%">
                    <Text size="sm">dark mode</Text>
                    <Switch
                      size="sm"
                      checked={colorScheme === 'dark'}
                      readOnly
                      tabIndex={-1}
                    />
                  </Group>
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" onClick={logout}>
                  logout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <AppShell.Section grow component={ScrollArea}>
            <NavLink
              component={RouterNavLink}
              to="/"
              label="services"
              onClick={closeMobileMenu}
            />
            <NavLink
              component={RouterNavLink}
              to="/debug"
              label="debug"
              onClick={closeMobileMenu}
            />
            <NavLink
              component={RouterNavLink}
              to="/insights"
              label="insights"
              onClick={closeMobileMenu}
            />
          </AppShell.Section>
          <AppShell.Section>
            <NavServerSummary />
          </AppShell.Section>
        </AppShell.Navbar>

        <AppShell.Main>
          <Routes>
            <Route path="/" element={<ServicesHomeRoute />} />
            <Route path="/debug" element={<DebugPage />} />
            <Route path="/insights" element={<InsightsPage />} />
          </Routes>
        </AppShell.Main>
      </AppShell>

      <AccountModal opened={accountModalOpen} onClose={closeAccountModal} />
    </>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

export default App;
