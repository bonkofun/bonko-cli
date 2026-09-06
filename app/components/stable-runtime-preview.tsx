import { useCallback, useEffect, useState } from 'react';
import {
  RuntimeFrame,
  type RuntimeFrameControls,
  type RuntimeFrameProps,
} from '@bonko/template-sdk/runtime-react';

type Request = { id: string; frame: RuntimeFrameProps };

function Readiness({ view, ready }: { view: RuntimeFrameControls; ready(): void }) {
  useEffect(() => {
    if (
      view.staticState === 'ready' ||
      view.staticState === 'error' ||
      view.reason === 'error' ||
      (view.ready && !view.staticState)
    )
      ready();
  }, [view.staticState, view.reason, view.ready, ready]);
  return null;
}

function ControlsObserver({
  view,
  notify,
}: {
  view: RuntimeFrameControls;
  notify(view: RuntimeFrameControls): void;
}) {
  useEffect(() => {
    notify(view);
  }, [view, notify]);
  return null;
}

/** Keep the committed picture visible until its replacement has finished loading. */
export function StableRuntimePreview({
  previewKey,
  onControls,
  ...frame
}: RuntimeFrameProps & { previewKey: string; onControls?(view: RuntimeFrameControls): void }) {
  const [requests, setRequests] = useState<{ current: Request; pending?: Request }>({
    current: { id: previewKey, frame },
  });
  const target = requests.pending ?? requests.current;
  if (target.id !== previewKey) {
    setRequests({ current: requests.current, pending: { id: previewKey, frame } });
  }
  const commit = useCallback(() => {
    setRequests((previous) =>
      previous.pending?.id === previewKey ? { current: previous.pending } : previous,
    );
  }, [previewKey]);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {[requests.current, ...(requests.pending ? [requests.pending] : [])].map((request) => {
        const pending = request.id !== requests.current.id;
        const props = request.id === previewKey ? frame : request.frame;
        return (
          <div
            key={request.id}
            data-preview-layer={pending ? 'pending' : 'current'}
            aria-hidden={pending || undefined}
            inert={pending || undefined}
            style={
              pending
                ? { position: 'absolute', inset: 0, visibility: 'hidden' }
                : { height: '100%' }
            }
          >
            <RuntimeFrame {...props}>
              {(view, surface) => (
                <>
                  {!pending && onControls ? (
                    <ControlsObserver view={view} notify={onControls} />
                  ) : null}
                  {pending ? <Readiness view={view} ready={commit} /> : null}
                  {props.children(view, surface)}
                </>
              )}
            </RuntimeFrame>
          </div>
        );
      })}
    </div>
  );
}
