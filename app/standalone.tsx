import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RuntimeFrame } from "@bonko/template-sdk/runtime-react";
import { loadRuntimeAssets } from "@bonko/template-sdk/runtime-assets";
import type { TemplateSubmission } from "@bonko/template-sdk/submission";
import { token } from "virtual:standalone";
import { IconArrowRight, IconPlayerPlay, IconPlayerPause, IconRotateClockwise, IconVolume, IconVolumeOff, IconDeviceMobile } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PhoneFrame } from "@/components/phone-frame";
import "./style.css";

const modes = [
  ["interactive", "Template playback"], ["static", "Authored static view"],
  ["generic", "Generic fallback (no code)"], ["reduced", "Reduced motion"],
  ["asset-error", "Simulate asset failure"], ["player-error", "Simulate player failure"],
] as const;

type Preview = { digest: string; url: string; runtimeOrigin: string; submission: TemplateSubmission; assets: Record<string, { url: string; sha256: string; byteSize: number; contentType: string }> };
function Studio() {
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  function refresh() { setLoading(true); setReload(value => value + 1); }
  useEffect(() => {
    const change = () => { setLoading(true); setReload(value => value + 1); };
    const events = new EventSource(`/__bonko/events?token=${encodeURIComponent(token)}`);
    events.addEventListener("changed", change);
    return () => events.close();
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/__bonko/preview", { headers: { "x-bonko-preview": token }, cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error([data.error, ...(data.diagnostics ?? []).map((item: { file: string; line: number; column: number; message: string }) => `${item.file}:${item.line}:${item.column} ${item.message}`)].join("\n"));
      if (!abort.signal.aborted) { setError(""); setPreview(data); }
    }).catch(failure => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Preview unavailable"); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [reload]);
  return <main className="studio-shell">
    <header className="studio-header">
      <div className="studio-brand"><strong>bonko</strong><Separator orientation="vertical" /><span>Template Studio</span></div>
      <Badge variant="outline">Local workspace</Badge>
    </header>
    <div className="workspace-heading">
      <div><div className="title-row"><h1>{preview?.submission.name ?? "Standalone template"}</h1><Badge variant="secondary">Draft</Badge></div><p>Edit the details. Try the experience. Make it feel right.</p></div>
      <p className="workspace-note">Isolated preview · No production connection</p>
    </div>
    {error ? <Alert variant="destructive" className="mb-6"><AlertTitle>Preview build failed</AlertTitle><AlertDescription><pre className="build-error">{error}</pre><Button variant="outline" disabled={loading} onClick={refresh}>Retry preview</Button></AlertDescription></Alert> : null}
    {!preview && !error ? <div className="loading-preview"><p role="status">Building preview…</p><Skeleton className="h-96 w-full" /></div> : null}
    {preview ? <Workspace preview={preview} revision={reload} blocked={!!error || loading} refresh={refresh} /> : null}
  </main>;
}
function Workspace({ preview, revision, blocked, refresh }: { preview: Preview; revision: number; blocked: boolean; refresh(): void }) {
  const sample = preview.submission.sample;
  const [draft, setDraft] = useState(sample);
  const [crop, setCrop] = useState({ scale: 1, x: 0, y: 0 });
  const [applied, setApplied] = useState({ ...sample, photoTransform: "translate(0px, 0px) scale(1)" });
  const [photo, setPhoto] = useState<File>();
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [width, setWidth] = useState(375);
  const [mode, setMode] = useState("interactive");
  useEffect(() => {
    if (!photo) { setPhotoUrl(""); return; }
    const url = URL.createObjectURL(photo); setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const fallback = <article className="runtime-fallback"><div className="crop-photo"><img src={photoUrl || preview.assets[preview.submission.cover].url} style={{ transform: applied.photoTransform }} alt="Test photo" onError={event => { event.currentTarget.hidden = true; }} /></div><h2>{applied.recipientName}</h2><p>{applied.message}</p>{applied.senderName ? <p>{applied.senderName}</p> : null}</article>;
  const key = JSON.stringify([revision, applied, photoUrl, mode]);
  return <div className="workspace">
    <aside className="editor-panels" aria-label="Preview inputs">
      <form className="editor-form" onSubmit={event => { event.preventDefault(); setApplied({ ...draft, photoTransform: `translate(${crop.x}px, ${crop.y}px) scale(${crop.scale})` }); refresh(); }}>
        <Card>
          <CardHeader><CardTitle>Make it personal</CardTitle><CardDescription>The details your recipient will see.</CardDescription></CardHeader>
          <CardContent><FieldGroup className="gap-5">
            <Field><FieldLabel htmlFor="recipient">Name</FieldLabel><Input id="recipient" required maxLength={30} value={draft.recipientName} onChange={event => setDraft({ ...draft, recipientName: event.target.value })} /></Field>
            <Field><FieldLabel htmlFor="message">Message</FieldLabel><Textarea id="message" required maxLength={160} className="min-h-24" value={draft.message} onChange={event => setDraft({ ...draft, message: event.target.value })} /><FieldDescription className="text-right">{draft.message.length} / 160</FieldDescription></Field>
            <Field><FieldLabel htmlFor="sender">Sender <span className="optional-label">Optional</span></FieldLabel><Input id="sender" maxLength={30} value={draft.senderName} onChange={event => setDraft({ ...draft, senderName: event.target.value })} /></Field>
          </FieldGroup></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Photo & framing</CardTitle><CardDescription>Try a local photo and adjust its crop.</CardDescription></CardHeader>
          <CardContent><FieldGroup className="gap-4">
            <Field data-invalid={!!photoError}><FieldLabel htmlFor="photo">Local photo</FieldLabel><Input id="photo" type="file" accept="image/png,image/jpeg,image/webp" aria-invalid={!!photoError} aria-describedby={photoError ? "photo-error photo-help" : "photo-help"} onChange={event => {
              const file = event.target.files?.[0];
              if (file && (file.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type))) { setPhotoError("Choose a PNG, JPEG or WebP photo no larger than 10 MiB."); return; }
              setPhotoError(""); setPhoto(file); refresh();
            }} />{photoError ? <FieldError id="photo-error">{photoError}</FieldError> : null}<FieldDescription id="photo-help">Stays in this browser. Never added to your package.</FieldDescription></Field>
            <Separator />
            {([['scale', 1, 3, 0.05, 'Scale'], ['x', -100, 100, 1, 'Horizontal crop'], ['y', -100, 100, 1, 'Vertical crop']] as const).map(([field, min, max, step, label]) => <Field className="gap-1" key={field}><div className="crop-label"><FieldLabel id={`crop-${field}`}>{label}</FieldLabel><output>{field === 'scale' ? `${crop[field].toFixed(2)}×` : `${crop[field]} px`}</output></div><Slider aria-labelledby={`crop-${field}`} min={min} max={max} step={step} value={[crop[field]]} onValueChange={([value]) => setCrop(previous => ({ ...previous, [field]: value }))} /></Field>)}
          </FieldGroup></CardContent>
          <CardFooter><Button type="submit" className="w-full" disabled={blocked}>Apply content and crop<IconArrowRight data-icon="inline-end" aria-hidden="true" /></Button></CardFooter>
        </Card>
      </form>
      <Card>
        <CardHeader><CardTitle>Test the experience</CardTitle><CardDescription>Check alternate states and longer messages.</CardDescription></CardHeader>
        <CardContent><FieldGroup className="gap-4">
          <Field><FieldLabel htmlFor="preview-mode">Preview mode</FieldLabel><Select value={mode} onValueChange={value => { setMode(value); refresh(); }}><SelectTrigger id="preview-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{modes.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel>Sample content</FieldLabel><div className="sample-actions"><Button variant="outline" onClick={() => { const long = { recipientName: "Alexandra".repeat(4).slice(0, 30), message: "A little note to remind you that you matter. ".repeat(4).slice(0, 160), senderName: "" }; setDraft(long); setApplied({ ...applied, ...long }); refresh(); }}>Maximum text / empty sender</Button><Button variant="ghost" onClick={() => { setDraft(sample); setApplied({ ...applied, ...sample }); refresh(); }}>Regular example</Button></div></Field>
        </FieldGroup></CardContent>
      </Card>
    </aside>
    <section className="preview-panel" aria-label="Live preview">
      <div className="preview-toolbar"><div className="preview-title"><IconDeviceMobile size={20} stroke={2} aria-hidden="true" /><h2>Live preview</h2></div><ToggleGroup type="single" variant="outline" value={String(width)} aria-label="Preview width" onValueChange={value => { if (value) setWidth(Number(value)); }}>{[375, 390, 430].map(value => <ToggleGroupItem key={value} value={String(value)} aria-label={`${value} pixels`}>{value}</ToggleGroupItem>)}</ToggleGroup></div>
      <div className="preview-stage">
    {blocked || mode === "generic" ? <><PhoneFrame width={width}><div className="runtime-surface">{fallback}</div></PhoneFrame><div className="playback-panel"><Badge variant="secondary">{blocked ? "Rebuilding preview" : "Generic fallback"}</Badge><Button variant="outline" disabled={blocked} onClick={refresh}><IconRotateClockwise aria-hidden="true" />Replay</Button></div></> : <RuntimeFrame authoredStatic key={key} title="Template preview" src={mode === "player-error" ? preview.url.replace(/\/v3\/[a-f0-9]{64}/, "/v3/" + "0".repeat(64)) : preview.url} runtimeOrigin={preview.runtimeOrigin} staticOnly={mode === "static"} reducedMotion={mode === "reduced"} fallback={fallback}
      load={signal => {
        if (mode === "asset-error") return Promise.reject(new Error("Simulated asset failure"));
        return loadRuntimeAssets({ content: applied, photo: { url: photoUrl || preview.assets[preview.submission.cover].url }, config: preview.submission.config, hasSound: preview.submission.capabilities.includes("audio"), allowedOrigins: [location.origin, preview.runtimeOrigin], assets: Object.fromEntries(Object.entries(preview.assets).map(([id, asset]) => [id, { ...asset, mime: asset.contentType }])) }, signal);
      }}>
      {(view, surface) => <div className="preview-player" data-playback={view.state} data-static={view.staticState ?? "none"} aria-busy={view.staticState === "pending"}>
        <PhoneFrame width={width}><div className="runtime-surface">{surface}</div></PhoneFrame>
        <div className="playback-panel">
          <div className="playback-heading"><Badge variant={view.reason === "error" || view.staticState === "error" ? "destructive" : "secondary"} role="status">{view.staticState === "pending" ? "Preparing static view…" : view.staticState === "error" ? "error" : view.reason ?? (view.ready ? view.state : "Loading template…")}</Badge><Button variant="ghost" disabled={blocked} onClick={refresh}><IconRotateClockwise data-icon="inline-start" aria-hidden="true" />Replay</Button></div>
          <div className="runtime-controls">
            <Button disabled={!view.ready || view.state === "ended" || view.state === "running" || view.state === "waiting"} onClick={view.play}><IconPlayerPlay data-icon="inline-start" aria-hidden="true" />{view.state === "paused" ? "Continue" : "Play"}</Button>
            <Button variant="outline" disabled={!['running', 'waiting'].includes(view.state)} onClick={view.pause}><IconPlayerPause data-icon="inline-start" aria-hidden="true" />Pause</Button>
            <Button variant="outline" disabled={!view.ready || view.state === "ended"} onClick={view.skip}>View message</Button>
            <Button variant="outline" disabled={!preview.submission.capabilities.includes("audio") || view.state === "ended"} onClick={() => view.setMuted(!view.muted)}>{view.muted ? <IconVolume data-icon="inline-start" aria-hidden="true" /> : <IconVolumeOff data-icon="inline-start" aria-hidden="true" />}{view.muted ? "Unmute" : "Mute"}</Button>
          </div>
          <p className="playback-hint">{view.state === "waiting" ? "Interact with the template inside the phone to continue." : view.state === "paused" ? "Playback is paused. Continue when you’re ready." : "Play to start. View message to jump to the reveal."}</p>
        </div>
      </div>}
    </RuntimeFrame>}
      </div>
      <p className="preview-footnote">Save source files to rebuild the preview automatically.</p>
    </section>
  </div>;
}

createRoot(document.getElementById("root")!).render(<Studio />);
