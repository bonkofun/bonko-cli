import { PhotoList } from '@/components/photo-list';
import { TemplateSettings } from '@/components/template-settings';
import { withoutPreviewMetadata } from '../src/engine/preview-photos.js';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StableRuntimePreview } from '@/components/stable-runtime-preview';
import { loadRuntimeAssets } from '@bonko/template-sdk/runtime-assets';
import type { TemplateSubmission } from '@bonko/template-sdk/submission';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { token } from 'virtual:standalone';
import {
  IconMaximize,
  IconMinimize,
  IconSun,
  IconMoon,
  IconRotateClockwise,
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

type CardItem = {
  slug: string;
  name: string;
  templateType: 'static' | 'interactive';
  version: string;
  author: string;
  tags: string[];
  hasError?: boolean;
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
  const [cards, setCards] = useState<CardItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  function refresh() {
    setLoading(true);
    setReload((value) => value + 1);
  }
  useEffect(() => {
    void fetch('/__bonko/cards', {
      headers: { 'x-bonko-preview': token },
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.cards && Array.isArray(data.cards)) {
          setCards(data.cards);
          if (data.cards.length > 0 && !selectedSlug) {
            setSelectedSlug(data.cards[0].slug);
          }
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const change = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data || '{}') as { slug?: string };
        if (!payload.slug || payload.slug === selectedSlug) {
          setLoading(true);
          setReload((value) => value + 1);
        }
      } catch {
        setLoading(true);
        setReload((value) => value + 1);
      }
    };
    const events = new EventSource(`/__bonko/events?token=${encodeURIComponent(token)}`);
    events.addEventListener('changed', change);
    return () => events.close();
  }, [selectedSlug]);
  useEffect(() => {
    const abort = new AbortController();
    const query = selectedSlug ? `?slug=${encodeURIComponent(selectedSlug)}` : '';
    void fetch(`/__bonko/preview${query}`, {
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
  }, [selectedSlug, reload]);
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
      {cards.length > 1 ? (
        <div className="workshop-bar flex items-center gap-2 mb-4 p-2 rounded-lg border bg-muted/30 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Workshop Cards ({cards.length}):
          </span>
          <div className="flex gap-2 flex-wrap">
            {cards.map((c) => {
              const isActive = (preview?.submission.slug ?? selectedSlug) === c.slug;
              return (
                <Button
                  key={c.slug}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    if (c.slug !== selectedSlug) {
                      setLoading(true);
                      setSelectedSlug(c.slug);
                    }
                  }}
                  className="gap-2"
                >
                  <span>{c.name}</span>
                  <Badge
                    variant={c.templateType === 'interactive' ? 'secondary' : 'outline'}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {c.templateType}
                  </Badge>
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}
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
          key={preview.submission.slug}
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
  const [replayCount, setReplayCount] = useState(0);
  function replay() {
    setApplied({
      ...draft,
      photoTransform: `translate(${crop.x}px, ${crop.y}px) scale(${crop.scale})`,
    });
    setAppliedNotes(notes);
    setEditing(false);
    setReplayCount((value) => value + 1);
  }
  const photoInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [selected, setSelected] = useState(0);
  const photo = photos[selected];
  const [notes, setNotes] = useState<Map<File, string>>(() => new Map());
  const [appliedNotes, setAppliedNotes] = useState(notes);
  useEffect(() => {
    const timeout = setTimeout(() => setAppliedNotes(notes), 100);
    return () => clearTimeout(timeout);
  }, [notes]);
  const [crops, setCrops] = useState<Map<File, typeof crop>>(() => new Map());
  function selectPhoto(index: number) {
    setSelected(index);
    setCrop(crops.get(photos[index]) ?? { scale: 1, x: 0, y: 0 });
    setEditing(true);
  }
  const maxPhotos = Math.max(1, Math.min(10, Number(preview.submission.config.maxPhotos) || 1));
  const [photoUrl, setPhotoUrl] = useState('');
  const demoPhotoIds = Array.from(
    { length: maxPhotos },
    (_, index) => preview.submission.config[`previewPhoto${index + 1}`],
  ).filter(
    (id): id is string =>
      typeof id === 'string' && preview.assets[id]?.contentType.startsWith('image/'),
  );
  const defaultPhotoUrl = preview.assets[demoPhotoIds[0] ?? preview.submission.cover].url;
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
    <article
      className="runtime-fallback"
      style={{
        background: preview.submission.posterStyle?.background ?? '#fff9ed',
        color: preview.submission.posterStyle?.foreground ?? '#292620',
      }}
    >
      <div className="crop-photo">
        <img
          src={photoUrl || defaultPhotoUrl}
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
  const key = JSON.stringify([
    revision,
    replayCount,
    applied,
    photoUrl,
    photos.map((file) => [file.name, file.lastModified, file.size, appliedNotes.get(file) ?? '']),
    mode,
    editing,
  ]);
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
            <TabsTrigger value="config" aria-label="Template configuration">
              Config
            </TabsTrigger>
            <TabsTrigger value="test" aria-label="Test the experience">
              Test
            </TabsTrigger>
          </TabsList>
          <TabsContent value="config" forceMount className="data-[state=inactive]:hidden">
            <TemplateSettings slug={preview.submission.slug} photoCount={photos.length} />
          </TabsContent>
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
                <CardDescription>
                  Drag the handle to reorder. Select a photo to adjust its framing.
                </CardDescription>
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
                      multiple={maxPhotos > 1}
                      accept="image/png,image/jpeg,image/webp"
                      aria-invalid={!!photoError}
                      aria-describedby={photoError ? 'photo-error photo-help' : 'photo-help'}
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        event.target.value = '';
                        if (
                          files.some(
                            (file) =>
                              file.size > 10 * 1024 * 1024 ||
                              !['image/png', 'image/jpeg', 'image/webp'].includes(file.type),
                          )
                        ) {
                          setPhotoError(
                            'Choose PNG, JPEG or WebP photos no larger than 10 MiB each.',
                          );
                          return;
                        }
                        if (photos.length + files.length > maxPhotos) {
                          setPhotoError(`This template supports up to ${maxPhotos} photos.`);
                          return;
                        }
                        setPhotoError('');
                        setEditing(true);
                        setPhotos((previous) => [...previous, ...files]);
                      }}
                    />
                    <div className="photo-picker">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => photoInput.current?.click()}
                        aria-describedby="photo-selection photo-help"
                      >
                        Add photos
                      </Button>
                      <span id="photo-selection" className="photo-selection" title={photo?.name}>
                        {photos.length} / {maxPhotos} photos
                      </span>
                    </div>
                    {photoError ? <FieldError id="photo-error">{photoError}</FieldError> : null}
                    <FieldDescription id="photo-help">
                      Stays in this browser. Never added to your package.
                    </FieldDescription>
                  </Field>
                  <PhotoList
                    photos={photos}
                    selected={photo}
                    notes={notes}
                    onReorder={(reordered) => {
                      setPhotos(reordered);
                      setSelected(reordered.indexOf(photo));
                      setEditing(true);
                    }}
                    onSelect={selectPhoto}
                    onNote={(file, note) => {
                      setNotes((previous) => new Map(previous).set(file, note));
                      setEditing(true);
                    }}
                    onRemove={(index) => {
                      const file = photos[index];
                      const remaining = photos.filter((_, i) => i !== index);
                      const nextSelected =
                        file === photo
                          ? Math.min(index, remaining.length - 1)
                          : remaining.indexOf(photo);
                      setPhotos(remaining);
                      setSelected(Math.max(0, nextSelected));
                      setNotes((previous) => {
                        const next = new Map(previous);
                        next.delete(file);
                        return next;
                      });
                      setCrops((previous) => {
                        const next = new Map(previous);
                        next.delete(file);
                        return next;
                      });
                      setCrop(crops.get(remaining[nextSelected]) ?? { scale: 1, x: 0, y: 0 });
                      setPhotoError('');
                      setEditing(true);
                    }}
                  />
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
                          const next = { ...crop, [field]: value };
                          setCrop(next);
                          if (photo) setCrops((previous) => new Map(previous).set(photo, next));
                        }}
                      />
                    </Field>
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
            <Button variant="ghost" disabled={blocked} onClick={replay}>
              <IconRotateClockwise aria-hidden="true" />
              Replay
            </Button>
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
            </>
          ) : (
            <StableRuntimePreview
              authoredStatic
              autoStart
              muted={false}
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
              load={async (signal) => {
                if (mode === 'asset-error')
                  return Promise.reject(new Error('Simulated asset failure'));
                const data = await loadRuntimeAssets(
                  {
                    content: applied,
                    photo: { url: photoUrl || defaultPhotoUrl },
                    config: withoutPreviewMetadata(preview.submission.config),
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
                if (photos.length) {
                  data.config.bonkoPhotoCount = editing ? 1 : photos.length;
                  const captions = editing
                    ? [appliedNotes.get(photo) ?? '']
                    : photos.map((file) => appliedNotes.get(file) ?? '');
                  for (let offset = 0; offset < captions.length; offset += 5) {
                    data.config[`bonkoPhotoNotes${offset / 5 + 1}`] = captions
                      .slice(offset, offset + 5)
                      .map((caption) => caption.slice(0, 80).padEnd(80))
                      .join('');
                  }
                }
                if (!editing && photos.length) {
                  data.content.photo = {
                    bytes: await photos[0].arrayBuffer(),
                    mime: photos[0].type as 'image/png' | 'image/jpeg' | 'image/webp',
                  };
                  const firstCrop = crops.get(photos[0]) ?? { scale: 1, x: 0, y: 0 };
                  data.content.photoTransform = `translate(${firstCrop.x}px, ${firstCrop.y}px) scale(${firstCrop.scale})`;
                  data.config = { ...data.config, bonkoPhotoCount: photos.length };
                  await Promise.all(
                    photos.slice(1).map(async (file, index) => {
                      const framing = crops.get(file) ?? { scale: 1, x: 0, y: 0 };
                      data.config[`bonkoPhotoTransform${index + 2}`] =
                        `translate(${framing.x}px, ${framing.y}px) scale(${framing.scale})`;
                      data.images[`bonko-photo-${index + 2}`] = {
                        bytes: await file.arrayBuffer(),
                        mime: file.type,
                      };
                    }),
                  );
                }
                if (!photos.length && !photoUrl && demoPhotoIds.length) {
                  data.config = { ...data.config, bonkoPhotoCount: demoPhotoIds.length };
                  const captions = demoPhotoIds.map((_, index) =>
                    String(preview.submission.config[`previewCaption${index + 1}`] ?? ''),
                  );
                  for (let offset = 0; offset < captions.length; offset += 5) {
                    data.config[`bonkoPhotoNotes${offset / 5 + 1}`] = captions
                      .slice(offset, offset + 5)
                      .map((caption) => caption.slice(0, 80).padEnd(80))
                      .join('');
                  }
                  demoPhotoIds.slice(1).forEach((id, index) => {
                    data.images[`bonko-photo-${index + 2}`] = data.images[id];
                    data.config[`bonkoPhotoTransform${index + 2}`] = 'translate(0px, 0px) scale(1)';
                  });
                }
                return data;
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
                  <span className="sr-only" role="status">
                    {view.staticState === 'error'
                      ? 'error'
                      : (view.reason ?? (view.ready ? view.state : 'Loading template…'))}
                  </span>
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
