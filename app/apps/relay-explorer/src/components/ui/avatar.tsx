import { Avatar as MantineAvatar } from '@mantine/core';
import * as React from 'react';
import { cn } from '@/lib/utils';

type AvatarImageProps = React.ImgHTMLAttributes<HTMLImageElement>;
type AvatarFallbackProps = React.HTMLAttributes<HTMLDivElement>;

const AvatarImage = (_props: AvatarImageProps) => null;
AvatarImage.displayName = 'AvatarImage';

const AvatarFallback = (_props: AvatarFallbackProps) => null;
AvatarFallback.displayName = 'AvatarFallback';

const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => {
  const childArray = React.Children.toArray(children) as React.ReactElement[];
  const imageChild = childArray.find((child) => child.type === AvatarImage);
  const fallbackChild = childArray.find((child) => child.type === AvatarFallback);

  const imageProps = (imageChild?.props ?? {}) as AvatarImageProps;
  const fallbackProps = (fallbackChild?.props ?? {}) as AvatarFallbackProps;

  return (
    <MantineAvatar ref={ref} src={imageProps.src} alt={imageProps.alt} className={cn(className, fallbackProps.className)} {...props}>
      {fallbackProps.children}
    </MantineAvatar>
  );
});
Avatar.displayName = 'Avatar';

export { Avatar, AvatarImage, AvatarFallback };
