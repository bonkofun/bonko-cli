import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StableRuntimePreview } from '@/components/stable-runtime-preview';
import { loadRuntimeAssets } from '@bonko/template-sdk/runtime-assets';
import type { TemplateSubmission } from '@bonko/template-sdk/submission';
import type { RuntimeFrameControls } from '@bonko/template-sdk/runtime-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { token } from 'virtual:standalone';
import {
  IconMaximize,
  IconMinimize,
  IconSun,
  IconMoon,
  IconPlayerPlay,
  IconPlayerPause,
  IconRotateClockwise,
  IconVolume,
  IconVolumeOff,
  IconDeviceMobile,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PhoneFrame } from '@/components/phone-frame';
import './style.css';

const modes = [
  ['interactive', 'Template playback'],
  ['static', 'Authored static view'],
  ['generic', 'Generic fallback (no code)'],
  ['reduced', 'Reduced motion'],
  ['asset-error', 'Simulate asset failure'],
  ['player-error', 'Simulate player failure'],
] as const;

type Preview = {
  digest: string;
  url: string;
  runtimeOrigin: string;
  submission: TemplateSubmission;
  assets: Record<string, { url: string; sha256: string; byteSize: number; contentType: string }>;
};
function Studio() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('bonko-studio-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('bonko-studio-theme', theme);
    } catch {
      /* Optional preference storage. */
    }
  }, [theme]);
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  function refresh() {
    setLoading(true);
    setReload((value) => value + 1);
  }
  useEffect(() => {
    const change = () => {
      setLoading(true);
      setReload((value) => value + 1);
    };
    const events = new EventSource(`/__bonko/events?token=${encodeURIComponent(token)}`);
    events.addEventListener('changed', change);
    return () => events.close();
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/__bonko/preview', {
      headers: { 'x-bonko-preview': token },
      cache: 'no-store',
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            [
              data.error,
              ...(data.diagnostics ?? []).map(
                (item: { file: string; line: number; column: number; message: string }) =>
                  `${item.file}:${item.line}:${item.column} ${item.message}`,
              ),
            ].join('\n'),
          );
        if (!abort.signal.aborted) {
          setError('');
          setPreview(data);
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted)
          setError(failure instanceof Error ? failure.message : 'Preview unavailable');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [reload]);
  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div className="studio-brand">
          <strong>bonko</strong>
          <Separator orientation="vertical" />
          <span>Template Studio</span>
        </div>
        <div className="header-actions">
          <Button
            variant="link"
            size="icon"
            className="size-11"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? (
              <IconSun size={20} stroke={2} aria-hidden="true" />
            ) : (
              <IconMoon size={20} stroke={2} aria-hidden="true" />
            )}
          </Button>
          <Badge variant="outline">Local workspace</Badge>
        </div>
      </header>
      <div className="workspace-heading">
        <div>
          <div className="title-row">
            <h1>{preview?.submission.name ?? 'Standalone template'}</h1>
            <Badge variant="secondary">Draft</Badge>
          </div>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Preview build failed</AlertTitle>
          <AlertDescription>
            <pre className="build-error">{error}</pre>
            <Button variant="outline" disabled={loading} onClick={refresh}>
              Retry preview
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {!preview && !error ? (
        <div className="loading-preview">
          <p role="status">Building preview…</p>
          <Skeleton className="h-96 w-full" />
        </div>
      ) : null}
      {preview ? (
        <Workspace
          preview={preview}
          revision={reload}
          blocked={!!error || loading}
          refresh={refresh}
        />
      ) : null}
    </main>
  );
}
function Workspace({
  preview,
  revision,
  blocked,
  refresh,
}: {
  preview: Preview;
  revision: number;
  blocked: boolean;
  refresh(): void;
}) {
  const sample = preview.submission.sample;
  const [draft, setDraft] = useState(sample);
  const [crop, setCrop] = useState({ scale: 1, x: 0, y: 0 });
  const [editing, setEditing] = useState(false);
  const [applied, setApplied] = useState({
    ...sample,
    photoTransform: 'translate(0px, 0px) scale(1)',
  });
  // Coalesce typing and slider events without rebuilding the source preview.
  useEffect(() => {
    const timeout = setTimeout(
      () =>
        setApplied({
          ...draft,
          photoTransform: `translate(${crop.x}px, ${crop.y}px) scale(${crop.scale})`,
        }),
      100,
    );
    return () => clearTimeout(timeout);
  }, [draft, crop]);
  function editDraft(value: typeof draft) {
    setEditing(true);
    setDraft(value);
  }
  function replay() {
    setApplied({
      ...draft,
      photoTransform: `translate(${crop.x}px, ${crop.y}px) scale(${crop.scale})`,
    });
    setEditing(false);
    refresh();
  }
  const photoInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File>();
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [zoom, setZoom] = useState(100);
  const previewPanel = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === previewPanel.current);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.fullscreenElement === previewPanel.current) {
        void document
          .exitFullscreen()
          .catch(() =>
            setFullscreenError('Unable to exit fullscreen. Use the browser fullscreen control.'),
          );
      }
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  async function toggleFullscreen() {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === previewPanel.current) await document.exitFullscreen();
      else await previewPanel.current?.requestFullscreen();
    } catch {
      setFullscreenError('Fullscreen is unavailable in this browser.');
    }
  }
  const [audioMuted, setAudioMuted] = useState(true);
  const controls = useRef<RuntimeFrameControls | null>(null);
  const observeControls = useCallback((view: RuntimeFrameControls) => {
    controls.current = view;
    setAudioMuted(view.muted);
  }, []);
  const [mode, setMode] = useState('interactive');
  useEffect(() => {
    if (!photo) {
      setPhotoUrl('');
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const fallback = (
    <article className="runtime-fallback">
      <div className="crop-photo">
        <img
          src={photoUrl || preview.assets[preview.submission.cover].url}
          style={{ transform: applied.photoTransform }}
          alt="Test photo"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      </div>
      <h2>{applied.recipientName}</h2>
      <p>{applied.message}</p>
      {applied.senderName ? <p>{applied.senderName}</p> : null}
    </article>
  );
  const key = JSON.stringify([revision, applied, photoUrl, mode, editing]);
  return (
    <div className="workspace">
      <aside className="editor-panels" aria-label="Preview inputs">
        <Tabs defaultValue="personal" className="editor-tabs">
          <TabsList className="w-full">
            <TabsTrigger value="personal" aria-label="Make it personal">
              Personal
            </TabsTrigger>
            <TabsTrigger value="photo" aria-label="Photo & framing">
              Photo
            </TabsTrigger>
            <TabsTrigger value="audio">Audio</TabsTrigger>
            <TabsTrigger value="test" aria-label="Test the experience">
              Test
            </TabsTrigger>
          </TabsList>
          <TabsContent value="personal">
            <Card>
              <CardHeader>
                <CardTitle>Make it personal</CardTitle>
                <CardDescription>
                  Changes appear automatically in the complete card.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-5">
                  <Field>
                    <FieldLabel htmlFor="recipient">Name</FieldLabel>
                    <Input
                      id="recipient"
                      required
                      maxLength={30}
                      value={draft.recipientName}
                      onChange={(event) =>
                        editDraft({ ...draft, recipientName: event.target.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="message">Message</FieldLabel>
                    <Textarea
                      id="message"
                      required
                      maxLength={160}
                      className="min-h-24"
                      value={draft.message}
                      onChange={(event) => editDraft({ ...draft, message: event.target.value })}
                    />
                    <FieldDescription className="text-right">
                      {draft.message.length} / 160
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sender">
                      Sender <span className="optional-label">Optional</span>
                    </FieldLabel>
                    <Input
                      id="sender"
                      maxLength={30}
                      value={draft.senderName}
                      onChange={(event) => editDraft({ ...draft, senderName: event.target.value })}
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="photo">
            <Card>
              <CardHeader>
                <CardTitle>Photo & framing</CardTitle>
                <CardDescription>Try a local photo and adjust its crop.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-4">
                  <Field data-invalid={!!photoError}>
                    <FieldLabel htmlFor="photo">Local photo</FieldLabel>
                    <Input
                      id="photo"
                      ref={photoInput}
                      className="hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-invalid={!!photoError}
                      aria-describedby={photoError ? 'photo-error photo-help' : 'photo-help'}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (
                          file &&
                          (file.size > 10 * 1024 * 1024 ||
                            !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
                        ) {
                          setPhotoError('Choose a PNG, JPEG or WebP photo no larger than 10 MiB.');
                          return;
                        }
                        setPhotoError('');
                        setEditing(true);
                        setPhoto(file);
                      }}
                    />
                    <div className="photo-picker">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => photoInput.current?.click()}
                        aria-describedby="photo-selection photo-help"
                      >
                        Choose photo
                      </Button>
                      <span id="photo-selection" className="photo-selection" title={photo?.name}>
                        {photo?.name ?? 'No file selected'}
                      </span>
                    </div>
                    {photoError ? <FieldError id="photo-error">{photoError}</FieldError> : null}
                    <FieldDescription id="photo-help">
                      Stays in this browser. Never added to your package.
                    </FieldDescription>
                  </Field>
                  <Separator />
                  {(
                    [
                      ['scale', 1, 3, 0.05, 'Scale'],
                      ['x', -100, 100, 1, 'Horizontal crop'],
                      ['y', -100, 100, 1, 'Vertical crop'],
                    ] as const
                  ).map(([field, min, max, step, label]) => (
                    <Field className="gap-1" key={field}>
                      <div className="crop-label">
                        <FieldLabel id={`crop-${field}`}>{label}</FieldLabel>
                        <output>
                          {field === 'scale' ? `${crop[field].toFixed(2)}×` : `${crop[field]} px`}
                        </output>
                      </div>
                      <Slider
                        aria-labelledby={`crop-${field}`}
                        min={min}
                        max={max}
                        step={step}
                        value={[crop[field]]}
                        onValueChange={([value]) => {
                          setEditing(true);
                          setCrop((previous) => ({ ...previous, [field]: value }));
                        }}
                      />
                    </Field>
                  ))}
                </FieldGroup>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="audio">
            <Card>
              <CardHeader>
                <CardTitle>Audio</CardTitle>
                <CardDescription>Listen to the sound included in this template.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <p>
                    {preview.submission.capabilities.includes('audio')
                      ? 'Replay and start the experience to test sound. Playback pauses when the window is in the background.'
                      : 'This template has no audio. The full experience works silently.'}
                  </p>
                  <Button
                    variant="outline"
                    disabled={!preview.submission.capabilities.includes('audio')}
                    onClick={() => controls.current?.setMuted(!audioMuted)}
                  >
                    {audioMuted ? 'Enable sound' : 'Mute sound'}
                  </Button>
                  {Object.entries(preview.submission.assets)
                    .filter(([, asset]) => asset.kind === 'audio')
                    .map(([id]) => (
                      <p key={id}>{id}</p>
                    ))}
                </FieldGroup>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="test">
            <Card>
              <CardHeader>
                <CardTitle>Test the experience</CardTitle>
                <CardDescription>Check alternate states and longer messages.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="preview-mode">Preview mode</FieldLabel>
                    <Select
                      value={mode}
                      onValueChange={(value) => {
                        setEditing(false);
                        setMode(value);
                        refresh();
                      }}
                    >
                      <SelectTrigger id="preview-mode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {modes.map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Sample content</FieldLabel>
                    <div className="sample-actions">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const long = {
                            recipientName: 'Alexandra'.repeat(4).slice(0, 30),
                            message: 'A little note to remind you that you matter. '
                              .repeat(4)
                              .slice(0, 160),
                            senderName: '',
                          };
                          editDraft(long);
                        }}
                      >
                        Maximum text / empty sender
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          editDraft(sample);
                        }}
                      >
                        Regular example
                      </Button>
                    </div>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </aside>
      <section ref={previewPanel} className="preview-panel" aria-label="Live preview">
        <div className="preview-toolbar">
          <div className="preview-title">
            <IconDeviceMobile size={20} stroke={2} aria-hidden="true" />
            <h2>Live preview</h2>
          </div>
          <div className="preview-toolbar-actions">
            <div className="preview-zoom">
              <label id="preview-size">Size</label>
              <Slider
                aria-labelledby="preview-size"
                min={50}
                max={100}
                step={1}
                value={[zoom]}
                onValueChange={([value]) => setZoom(value)}
              />
              <output>{zoom}%</output>
            </div>
            <Button
              variant="link"
              size="icon"
              className="size-11"
              aria-label={fullscreen ? 'Exit fullscreen preview' : 'Enter fullscreen preview'}
              title={fullscreen ? 'Exit fullscreen preview (Esc)' : 'Enter fullscreen preview'}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? (
                <IconMinimize size={20} stroke={2} aria-hidden="true" />
              ) : (
                <IconMaximize size={20} stroke={2} aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
        <div className="preview-stage">
          {blocked || mode === 'generic' ? (
            <>
              <PhoneFrame zoom={zoom}>
                <div className="runtime-surface">{fallback}</div>
              </PhoneFrame>
              <div className="playback-panel">
                <Badge variant="secondary">
                  {blocked ? 'Rebuilding preview' : 'Generic fallback'}
                </Badge>
                <Button variant="outline" disabled={blocked} onClick={replay}>
                  <IconRotateClockwise aria-hidden="true" />
                  Replay
                </Button>
              </div>
            </>
          ) : (
            <StableRuntimePreview
              authoredStatic
              onControls={observeControls}
              previewKey={key}
              title="Template preview"
              src={
                mode === 'player-error'
                  ? preview.url.replace(/\/v3\/[a-f0-9]{64}/, '/v3/' + '0'.repeat(64))
                  : preview.url
              }
              runtimeOrigin={preview.runtimeOrigin}
              staticOnly={mode === 'static' || (mode === 'interactive' && editing)}
              reducedMotion={mode === 'reduced'}
              fallback={fallback}
              load={(signal) => {
                if (mode === 'asset-error')
                  return Promise.reject(new Error('Simulated asset failure'));
                return loadRuntimeAssets(
                  {
                    content: applied,
                    photo: { url: photoUrl || preview.assets[preview.submission.cover].url },
                    config: preview.submission.config,
                    hasSound: preview.submission.capabilities.includes('audio'),
                    allowedOrigins: [location.origin, preview.runtimeOrigin],
                    assets: Object.fromEntries(
                      Object.entries(preview.assets).map(([id, asset]) => [
                        id,
                        { ...asset, mime: asset.contentType },
                      ]),
                    ),
                  },
                  signal,
                );
              }}
            >
              {(view, surface) => (
                <div
                  className="preview-player"
                  data-playback={view.state}
                  data-static={view.staticState ?? 'none'}
                  aria-busy={view.staticState === 'pending'}
                >
                  <PhoneFrame zoom={zoom}>
                    <div className="runtime-surface">{surface}</div>
                  </PhoneFrame>
                  <div className="playback-panel">
                    <div className="playback-heading">
                      <Badge
                        variant={
                          view.reason === 'error' || view.staticState === 'error'
                            ? 'destructive'
                            : 'secondary'
                        }
                        role="status"
                      >
                        {view.staticState === 'pending'
                          ? 'Preparing static view…'
                          : view.staticState === 'error'
                            ? 'error'
                            : (view.reason ?? (view.ready ? view.state : 'Loading template…'))}
                      </Badge>
                      <Button variant="ghost" disabled={blocked} onClick={replay}>
                        <IconRotateClockwise data-icon="inline-start" aria-hidden="true" />
                        Replay
                      </Button>
                    </div>
                    <div className="runtime-controls">
                      <Button
                        disabled={
                          !view.ready ||
                          view.state === 'ended' ||
                          view.state === 'running' ||
                          view.state === 'waiting'
                        }
                        onClick={view.play}
                      >
                        <IconPlayerPlay data-icon="inline-start" aria-hidden="true" />
                        {view.state === 'paused' ? 'Continue' : 'Play'}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!['running', 'waiting'].includes(view.state)}
                        onClick={view.pause}
                      >
                        <IconPlayerPause data-icon="inline-start" aria-hidden="true" />
                        Pause
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!view.ready || view.state === 'ended'}
                        onClick={view.skip}
                      >
                        View message
                      </Button>
                      <Button
                        variant="outline"
                        disabled={
                          !preview.submission.capabilities.includes('audio') ||
                          view.state === 'ended'
                        }
                        onClick={() => view.setMuted(!view.muted)}
                      >
                        {view.muted ? (
                          <IconVolume data-icon="inline-start" aria-hidden="true" />
                        ) : (
                          <IconVolumeOff data-icon="inline-start" aria-hidden="true" />
                        )}
                        {view.muted ? 'Unmute' : 'Mute'}
                      </Button>
                    </div>
                    <p className="playback-hint">
                      {editing && mode === 'interactive'
                        ? 'Live editing · Changes appear automatically. Replay to test the animation.'
                        : view.state === 'waiting'
                          ? 'Interact with the template inside the phone to continue.'
                          : view.state === 'paused'
                            ? 'Playback is paused. Continue when you’re ready.'
                            : 'Play to start. View message to jump to the reveal.'}
                    </p>
                  </div>
                </div>
              )}
            </StableRuntimePreview>
          )}
        </div>
        <p className="preview-footnote">Code changes automatically update the preview.</p>
        {fullscreenError ? (
          <p role="alert" className="preview-footnote">
            {fullscreenError}
          </p>
        ) : null}
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Studio />);
