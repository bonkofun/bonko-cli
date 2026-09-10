import { useEffect, useRef, useState } from 'react';
import { token } from 'virtual:standalone';
import type { PackageJob, packageSummary } from '../../src/engine/studio-package';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

type Snapshot = { summary: Awaited<ReturnType<typeof packageSummary>>; job: PackageJob | null };
export function TemplatePackage({ slug }: { slug: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const sending = useRef(false);
  const endpoint = '/__bonko/package?slug=' + encodeURIComponent(slug);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(endpoint, {
          headers: { 'x-bonko-preview': token },
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load package details');
        if (controller.signal.aborted) return;
        setSnapshot(data);
        setVersion((current) => current || Number(data.summary.currentVersion) + 1 + '.0');
        if (data.job?.state === 'running') timer = setTimeout(() => void poll(), 1000);
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Unable to load package details');
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [endpoint, reload]);
  async function pack(event: React.FormEvent) {
    event.preventDefault();
    if (!snapshot || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'x-bonko-preview': token, 'content-type': 'application/json' },
        body: JSON.stringify({ version, revision: snapshot.summary.revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to start package checks');
      setSnapshot({ ...snapshot, job: data });
      setReload((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start package checks');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function download() {
    if (!snapshot?.job) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        '/__bonko/package-download?slug=' + encodeURIComponent(slug) + '&id=' + snapshot.job.id,
        { headers: { 'x-bonko-preview': token } },
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Unable to download package');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = snapshot.job.filename!;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to download package');
    } finally {
      setBusy(false);
    }
  }
  const summary = snapshot?.summary;
  const job = snapshot?.job;
  const running = busy || job?.state === 'running';
  const valid =
    summary &&
    /^[1-9]\d*\.0$/.test(version) &&
    Number.isSafeInteger(Number(version)) &&
    Number(version) > Number(summary.currentVersion);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review &amp; pack</CardTitle>
        <CardDescription>Check the template, then create a versioned package.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {summary ? (
          <>
            <div>
              <h3 className="font-semibold">{summary.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{summary.description}</p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
              {Object.entries({
                Slug: summary.slug,
                'Current version': summary.version,
                Tags: summary.tags.join(', ') || 'None',
                Price:
                  summary.priceCents === 0
                    ? 'Free · $0.00 USD'
                    : '$' + (summary.priceCents / 100).toFixed(2) + ' USD',
                'Photo limit': summary.maxPhotos,
                Author: summary.author,
              }).map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted-foreground">
              Uses saved configuration. Save changes in Config first. Local preview photos are not
              included.
            </p>
            <Separator />
            <form onSubmit={pack}>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="package-version">New version</FieldLabel>
                  <Input
                    id="package-version"
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                    required
                    pattern="[1-9][0-9]*\.0"
                    disabled={running}
                  />
                  <FieldDescription>
                    Use N.0, greater than {summary.currentVersion}. Successful packing updates
                    manifest.json and saves the ZIP in dist.
                  </FieldDescription>
                </Field>
                <Button type="submit" disabled={running || !valid}>
                  {running ? 'Checking & packing…' : 'Check & pack'}
                </Button>
              </FieldGroup>
            </form>
          </>
        ) : (
          <p role="status">Loading package details…</p>
        )}
        <p role="status" className="text-sm text-muted-foreground">
          {job?.phase}
        </p>
        {job?.state === 'failed' ? <FieldError role="alert">{job.error}</FieldError> : null}
        {error ? <FieldError role="alert">{error}</FieldError> : null}
        {job?.state === 'complete' ? (
          <div className="flex flex-col gap-3">
            <p className="break-all text-sm font-medium">{job.filename}</p>
            <Button onClick={() => void download()} disabled={busy}>
              Download package
            </Button>
            <details className="text-sm">
              <summary className="cursor-pointer py-2">Verification details</summary>
              <ul className="list-disc pl-5">
                {job.checks?.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
              {job.manual?.length ? (
                <>
                  <p className="mt-3 font-medium">Review before publishing</p>
                  <ul className="list-disc pl-5">
                    {job.manual.map((check) => (
                      <li key={check}>{check}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </details>
          </div>
        ) : null}
        <Button
          variant="ghost"
          disabled={running}
          onClick={() => {
            setError('');
            setVersion('');
            setReload((value) => value + 1);
          }}
        >
          Refresh details
        </Button>
      </CardContent>
    </Card>
  );
}
