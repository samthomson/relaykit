import { Divider, type DividerProps } from '@mantine/core';

const Separator = ({ orientation = 'horizontal', className, ...props }: DividerProps) => {
  return <Divider orientation={orientation} className={className} {...props} />;
};

export { Separator };
