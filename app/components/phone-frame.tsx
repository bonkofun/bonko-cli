import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { MockFrame } from 'react-mockframe';
import 'react-mockframe/styles/mockframe-iphones.css';
import './phone-frame.css';

/** Matches the main site's iPhone 17 chrome; viewport tests resize the real screen. */
export function PhoneFrame({ children, width = 375 }: { children: ReactNode; width?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const height = Math.round((width * 812) / 375);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0)
        element.style.setProperty('--phone-scale', String(entry.contentRect.width / (width + 24)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div
      ref={container}
      className="phone-frame"
      style={{ '--device-width': width + 24, '--device-height': height + 24 } as CSSProperties}
    >
      <MockFrame
        device="iPhone 17"
        color="black"
        hideNotch
        width={width}
        height={height}
        className="phone-device"
      >
        {children}
      </MockFrame>
    </div>
  );
}
