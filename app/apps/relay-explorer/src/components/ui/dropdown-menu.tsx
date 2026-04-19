import { Divider, Menu } from '@mantine/core';
import * as React from 'react';

type DropdownCtx = {
  opened: boolean;
  setOpened: (value: boolean) => void;
};

const DropdownContext = React.createContext<DropdownCtx>({ opened: false, setOpened: () => {} });

const DropdownMenu = ({ children }: { children: React.ReactNode; modal?: boolean }) => {
  const [opened, setOpened] = React.useState(false);
  return (
    <DropdownContext.Provider value={{ opened, setOpened }}>
      <Menu opened={opened} onChange={setOpened} shadow="md" width={220}>
        {children}
      </Menu>
    </DropdownContext.Provider>
  );
};

const DropdownMenuTrigger = ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) => {
  if (asChild && React.isValidElement(children)) {
    return <Menu.Target>{children}</Menu.Target>;
  }

  return (
    <Menu.Target>
      <button type="button">{children}</button>
    </Menu.Target>
  );
};

const DropdownMenuContent = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return <Menu.Dropdown className={className}>{children}</Menu.Dropdown>;
};

const DropdownMenuItem = ({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) => {
  return (
    <Menu.Item className={className} onClick={onClick}>
      {children}
    </Menu.Item>
  );
};

const DropdownMenuSeparator = ({ className }: { className?: string }) => <Divider className={className} my="xs" />;

const DropdownMenuLabel = ({ children, className }: { children: React.ReactNode; className?: string; inset?: boolean }) => {
  return <div className={className}>{children}</div>;
};

const DropdownMenuGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuSub = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuSubContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuSubTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuRadioGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuCheckboxItem = DropdownMenuItem;
const DropdownMenuRadioItem = DropdownMenuItem;
const DropdownMenuShortcut = ({ children, className }: React.HTMLAttributes<HTMLSpanElement>) => <span className={className}>{children}</span>;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
