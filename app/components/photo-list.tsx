import { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { IconGripVertical, IconTrash } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  photos: File[];
  selected: File | undefined;
  notes: Map<File, string>;
  onReorder(photos: File[]): void;
  onSelect(index: number): void;
  onNote(file: File, note: string): void;
  onRemove(index: number): void;
};
function PhotoRow({
  file,
  index,
  count,
  selected,
  note,
  onSelect,
  onNote,
  onRemove,
  onMove,
}: {
  file: File;
  index: number;
  count: number;
  selected: boolean;
  note: string;
  onSelect(): void;
  onNote(note: string): void;
  onRemove(): void;
  onMove(to: number): void;
}) {
  const controls = useDragControls();
  const reduced = useReducedMotion();
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <Reorder.Item
      value={file}
      dragListener={false}
      dragControls={controls}
      className="photo-editor-row"
      data-selected={selected}
      transition={{ duration: reduced ? 0 : 0.18 }}
      whileDrag={reduced ? undefined : { boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="photo-drag-handle"
        aria-label={`Drag photo ${index + 1} to reorder`}
        aria-describedby="photo-reorder-help"
        onPointerDown={(event) => controls.start(event)}
        onKeyDown={(event) => {
          const target =
            event.key === 'ArrowUp'
              ? index - 1
              : event.key === 'ArrowDown'
                ? index + 1
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? count - 1
                    : null;
          if (target !== null) {
            event.preventDefault();
            if (target >= 0 && target < count) onMove(target);
          }
        }}
      >
        <IconGripVertical aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant={selected ? 'secondary' : 'ghost'}
        className="photo-thumbnail-button"
        aria-pressed={selected}
        aria-label={`${index + 1}. ${file.name}`}
        title={file.name}
        onClick={onSelect}
      >
        {url ? <img src={url} alt="" draggable={false} /> : null}
      </Button>
      <Field className="min-w-0 gap-1">
        <div className="photo-note-heading">
          <FieldLabel htmlFor={`photo-note-${index}`}>
            Photo {index + 1}
            <span className="sr-only"> description</span>
          </FieldLabel>
          <span aria-hidden="true">{note.length}/80</span>
        </div>
        <Textarea
          id={`photo-note-${index}`}
          rows={2}
          maxLength={80}
          placeholder="Add a description…"
          value={note}
          onChange={(event) => onNote(event.target.value)}
        />
      </Field>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="photo-remove"
        aria-label={`Remove photo ${index + 1}`}
        onClick={onRemove}
      >
        <IconTrash aria-hidden="true" />
      </Button>
    </Reorder.Item>
  );
}
export function PhotoList({
  photos,
  selected,
  notes,
  onReorder,
  onSelect,
  onNote,
  onRemove,
}: Props) {
  const ids = useRef(new WeakMap<File, number>());
  const sequence = useRef(0);
  function key(file: File) {
    let id = ids.current.get(file);
    if (id === undefined) {
      id = sequence.current++;
      ids.current.set(file, id);
    }
    return id;
  }
  return (
    <>
      <p id="photo-reorder-help" className="sr-only">
        Drag the handle to reorder. With the handle focused, use Up or Down, Home or End.
      </p>
      <Reorder.Group
        axis="y"
        values={photos}
        onReorder={onReorder}
        layoutScroll
        className="photo-editor-list"
        aria-label="Photos in playback order"
      >
        {photos.map((file, index) => (
          <PhotoRow
            key={key(file)}
            file={file}
            index={index}
            count={photos.length}
            selected={file === selected}
            note={notes.get(file) ?? ''}
            onSelect={() => onSelect(index)}
            onNote={(note) => onNote(file, note)}
            onRemove={() => onRemove(index)}
            onMove={(to) => {
              const next = [...photos];
              next.splice(index, 1);
              next.splice(to, 0, file);
              onReorder(next);
            }}
          />
        ))}
      </Reorder.Group>
    </>
  );
}
