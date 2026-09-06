import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { MockFrame } from 'react-mockframe';
import 'react-mockframe/styles/mockframe-iphones.css';
import './phone-frame.css';

/** Fit the device to the workbench without changing the template's layout viewport. */
export function PhoneFrame({ children, zoom = 100 }: { children: ReactNode; zoom?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const width = 390;
  const height = Math.round((width * 812) / 375);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const scale =
        (Math.max(
          0,
          Math.min(
            entry.contentRect.width / (width + 24),
            entry.contentRect.height / (height + 24),
            1,
          ),
        ) *
          zoom) /
        100;
      element.style.setProperty('--phone-scale', String(scale));
      element.style.setProperty('--phone-render-width', `${(width + 24) * scale}px`);
      element.style.setProperty('--phone-render-height', `${(height + 24) * scale}px`);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [height, zoom]);
  return (
    <div
      ref={container}
      className="phone-space"
      style={{ '--device-width': width + 24, '--device-height': height + 24 } as CSSProperties}
    >
      <div className="phone-frame">
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
    </div>
  );
}
