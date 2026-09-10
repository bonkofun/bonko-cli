import { useEffect, useRef, useState } from 'react';
import { token } from 'virtual:standalone';
import type { StudioSettings } from '../../src/engine/studio-config';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

type Snapshot = { revision: string; settings: StudioSettings };
export function TemplateSettings({ slug, photoCount }: { slug: string; photoCount: number }) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [draft, setDraft] = useState<StudioSettings>();
  const [price, setPrice] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const saving = useRef(false);
  const endpoint = `/__bonko/settings?slug=${encodeURIComponent(slug)}`;
  function accept(data: Snapshot) {
    setSnapshot(data);
    setDraft(data.settings);
    setPrice((data.settings.priceCents / 100).toFixed(2));
    setTags(data.settings.tags.join(', '));
  }
  useEffect(() => {
    const abort = new AbortController();
    setBusy(true);
    setError('');
    void fetch(endpoint, { headers: { 'x-bonko-preview': token }, signal: abort.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load settings');
        if (!abort.signal.aborted) accept(data);
      })
      .catch((reason) => {
        if (!abort.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [endpoint, reload]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !snapshot || saving.current) return;
    if (draft.maxPhotos < photoCount) {
      setError('Remove extra local photos before reducing the photo count.');
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) < 0 || Number(price) > 9.9) {
      setError('Enter a price from $0.00 to $9.90 USD, with up to two decimal places.');
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'x-bonko-preview': token, 'content-type': 'application/json' },
        body: JSON.stringify({
          revision: snapshot.revision,
          settings: {
            ...draft,
            tags: tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
            priceCents: Math.round(Number(price) * 100),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save settings');
      accept(data);
      setNotice('Saved to manifest.json');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save settings');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Template configuration</CardTitle>
        <CardDescription>Define the template people will personalize.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onChange={() => setNotice('')} onSubmit={save} className="flex flex-col gap-5">
          {draft ? (
            <fieldset disabled={busy} className="min-w-0">
              <FieldGroup className="gap-5">
                <Field>
                  <FieldLabel htmlFor="template-name">Template name</FieldLabel>
                  <Input
                    id="template-name"
                    required
                    maxLength={80}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="template-description">Description</FieldLabel>
                  <Textarea
                    id="template-description"
                    required
                    maxLength={500}
                    rows={3}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="template-photos">Photo count</FieldLabel>
                  <Input
                    id="template-photos"
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    required
                    value={draft.maxPhotos}
                    onChange={(e) => setDraft({ ...draft, maxPhotos: e.target.valueAsNumber })}
                  />
                  <FieldDescription>
                    Upload limit: 1–10 photos. Existing demo photos are kept; preview uses up to
                    this limit.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="template-tags">Tags</FieldLabel>
                  <Input
                    id="template-tags"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                  <FieldDescription>
                    Separate with commas. Up to 5 tags, 20 characters each.
                  </FieldDescription>
                </Field>
                <Separator />
                <Field>
                  <FieldLabel htmlFor="template-price">Price (USD)</FieldLabel>
                  <Input
                    id="template-price"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={9.9}
                    step={0.01}
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                  <FieldDescription>
                    $0 is free. Any price above $0 is paid. Maximum $9.90.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="template-author">Author name</FieldLabel>
                  <Input
                    id="template-author"
                    required
                    maxLength={80}
                    value={draft.author}
                    onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                  />
                </Field>
              </FieldGroup>
            </fieldset>
          ) : null}
          {error ? <FieldError role="alert">{error}</FieldError> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !draft}>
              {busy ? 'Please wait…' : 'Save configuration'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setNotice('');
                setReload((value) => value + 1);
              }}
            >
              Reload from file
            </Button>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
