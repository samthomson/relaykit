import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Group, Text, Tooltip, ActionIcon } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { INLINE_TITLE_ROW_H } from './InlineTextEditRow';

const truncatedTitleStyle: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  maxWidth: '100%',
  lineHeight: INLINE_TITLE_ROW_H,
};

export type ServiceHostTitleViewProps = {
  title: string;
  density: 'compact' | 'comfortable';
  domain: any | null | undefined;
  composeId: string;
  onEditDomain: (composeId: string, domain: any) => void;
  rowStyle?: CSSProperties;
  trailing?: ReactNode;
};

export const ServiceHostTitleView = ({
  title,
  density,
  domain,
  composeId,
  onEditDomain,
  rowStyle,
  trailing,
}: ServiceHostTitleViewProps) => {
  const comfortable = density === 'comfortable';
  const iconPx = comfortable ? 16 : 14;
  const actionSize = comfortable ? 'sm' : 'xs';
  const titleRef = useRef<HTMLParagraphElement | null>(null);
  const [titleHovered, setTitleHovered] = useState(false);
  const [titleOverflowPx, setTitleOverflowPx] = useState(0);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const recalcOverflow = () => {
      const overflow = Math.max(0, el.scrollWidth - el.clientWidth);
      setTitleOverflowPx(overflow);
    };
    recalcOverflow();

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recalcOverflow) : null;
    resizeObserver?.observe(el);
    window.addEventListener('resize', recalcOverflow);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', recalcOverflow);
    };
  }, [title, density]);

  const marqueeActive = titleHovered && titleOverflowPx > 0;
  const titleInlineStyle: CSSProperties = {
    ...truncatedTitleStyle,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  };
  const marqueeInnerStyle: CSSProperties | undefined = marqueeActive
    ? {
        ['--service-title-overflow' as string]: `${titleOverflowPx}px`,
        ['--service-title-duration' as string]: `${Math.max(3, Math.min(14, titleOverflowPx / 22))}s`,
      }
    : undefined;

  return (
    <Group
      gap={comfortable ? 'xs' : 4}
      wrap="nowrap"
      align="center"
      style={{ minWidth: 0, minHeight: INLINE_TITLE_ROW_H, ...rowStyle }}
    >
      <Tooltip label={title}>
        <Text
          ref={titleRef}
          fw={comfortable ? 700 : 600}
          fz={comfortable ? 'lg' : 'md'}
          style={titleInlineStyle}
          truncate={marqueeActive ? undefined : 'end'}
          onMouseEnter={() => setTitleHovered(true)}
          onMouseLeave={() => setTitleHovered(false)}
        >
          <span className={marqueeActive ? 'service-host-title-marquee-inner' : undefined} style={marqueeInnerStyle}>
            {title}
          </span>
        </Text>
      </Tooltip>
      {domain && (
        <Tooltip label="Edit domain">
          <ActionIcon variant="subtle" size={actionSize} style={{ flexShrink: 0 }} onClick={() => onEditDomain(composeId, domain)} aria-label="Edit domain">
            <IconPencil size={iconPx} />
          </ActionIcon>
        </Tooltip>
      )}
      {trailing}
      <style>{`
        .service-host-title-marquee-inner {
          display: inline-block;
          animation: service-host-title-marquee var(--service-title-duration, 8s) ease-in-out infinite alternate;
        }
        @keyframes service-host-title-marquee {
          0%, 10% {
            transform: translateX(0);
          }
          90%, 100% {
            transform: translateX(calc(-1 * var(--service-title-overflow, 0px)));
          }
        }
      `}</style>
    </Group>
  );
};
