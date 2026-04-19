import { Skeleton as MantineSkeleton } from '@mantine/core';

const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return <MantineSkeleton className={className} {...props} />;
};

export { Skeleton };
