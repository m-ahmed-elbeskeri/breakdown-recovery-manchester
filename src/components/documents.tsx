// A driver's documents, grouped the way the paperwork is: about you, licence,
// insurance, vehicle, training. The same list serves the driver (upload and
// replace) and the office (view, approve, send back, upload on their behalf).

import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Loader2 } from '../icons';
import {
  Chip,
  ErrorNotice,
  Field,
  inputClass,
  PrimaryButton,
  SecondaryButton,
} from './console';
import {
  DOC_GROUPS,
  DOC_TYPE_BY_KEY,
  STATE_LABEL,
  acceptAttr,
  dateLabel,
  daysUntil,
  formatDate,
  prepareUpload,
  todayIso,
  type Compliance,
  type DocState,
  type DocTypeDef,
  type DocumentInfo,
} from '../driverDocs';
import type { UploadMeta } from '../driver';

export type Uploader = (
  docType: string,
  blob: Blob,
  meta: UploadMeta,
  onProgress: (fraction: number) => void,
) => Promise<unknown>;

interface ListProps {
  compliance: Compliance;
  documents: DocumentInfo[];
  canUpload: boolean;
  upload: Uploader;
  fetchFile: (id: number) => Promise<Blob>;
  onChanged: () => unknown;
  remove?: (id: number) => Promise<unknown>;
  reviewActions?: (doc: DocumentInfo, def: DocTypeDef) => ReactNode;
  showHints?: boolean;
}

export function DocumentList(props: ListProps) {
  const [viewing, setViewing] = useState<DocumentInfo | null>(null);
  return (
    <div className="flex flex-col gap-6">
      {DOC_GROUPS.map((group) => {
        const items = props.compliance.items.filter((i) => i.group === group.key);
        if (items.length === 0) return null;
        return (
          <section key={group.key} className="flex flex-col gap-3">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">
              {group.label}
            </h3>
            {items.map((item) => (
              <DocumentCard
                key={item.key}
                {...props}
                item={item}
                def={DOC_TYPE_BY_KEY[item.key]}
                docs={props.documents.filter((d) => d.docType === item.key)}
                onView={setViewing}
              />
            ))}
          </section>
        );
      })}
      {viewing && (
        <FileViewer doc={viewing} fetchFile={props.fetchFile} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

type CardProps = ListProps & {
  item: DocState;
  def: DocTypeDef;
  docs: DocumentInfo[];
  onView: (doc: DocumentInfo) => void;
};

function DocumentCard({
  item,
  def,
  docs,
  onView,
  canUpload,
  upload,
  onChanged,
  remove,
  reviewActions,
  showHints = true,
}: CardProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const state = STATE_LABEL[item.state];
  const left = daysUntil(item.validUntil);
  const border =
    item.state === 'rejected' || item.state === 'expired'
      ? 'border-[var(--color-danger-soft)]'
      : item.state === 'expiring'
        ? 'border-yellow-400'
        : 'border-neutral-800';

  const del = async (doc: DocumentInfo) => {
    setError(null);
    try {
      await remove?.(doc.id);
      await onChanged();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <article className={`border-2 ${border} bg-neutral-900`}>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-bold text-white leading-tight">{def.label}</h4>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Chip tone={state.tone}>{state.label}</Chip>
              {!item.required && <Chip>Optional</Chip>}
              {item.replacementPending && <Chip tone="info">New copy being checked</Chip>}
            </div>
          </div>
          {item.validUntil && (
            <div className="text-right shrink-0">
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500">
                Valid until
              </div>
              <div
                className={`text-sm font-bold ${
                  left !== null && left < 0
                    ? 'text-[var(--color-danger-soft)]'
                    : left !== null && left <= 30
                      ? 'text-yellow-400'
                      : 'text-white'
                }`}
              >
                {formatDate(item.validUntil)}
              </div>
              {left !== null && left >= 0 && left <= 30 && (
                <div className="text-[11px] text-yellow-400">
                  {left === 0 ? 'ends today' : `${left} day${left === 1 ? '' : 's'} left`}
                </div>
              )}
            </div>
          )}
        </div>

        {showHints && <p className="text-[13px] text-neutral-400 leading-snug">{def.hint}</p>}

        {item.state === 'rejected' && item.rejectionReason && (
          <div className="border-l-4 border-[var(--color-danger-soft)] pl-3 text-sm text-white">
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--color-danger-soft)] block">
              Why it was sent back
            </span>
            {item.rejectionReason}
          </div>
        )}

        {docs.length > 0 && (
          <ul className="flex flex-col divide-y divide-neutral-800 border-t border-neutral-800">
            {docs.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                def={def}
                onView={() => onView(doc)}
                onDelete={remove && doc.status !== 'approved' ? () => del(doc) : undefined}
                actions={reviewActions?.(doc, def)}
              />
            ))}
          </ul>
        )}

        <ErrorNotice error={error} />

        {canUpload &&
          (uploading ? (
            <UploadForm
              def={def}
              upload={upload}
              onCancel={() => setUploading(false)}
              onDone={async () => {
                setUploading(false);
                await onChanged();
              }}
            />
          ) : (
            <div>
              <SecondaryButton onClick={() => setUploading(true)}>
                {docs.length === 0 ? 'Upload' : 'Upload a new copy'}
              </SecondaryButton>
            </div>
          ))}
      </div>
    </article>
  );
}

function DocumentRow({
  doc,
  def,
  onView,
  onDelete,
  actions,
}: {
  doc: DocumentInfo;
  def: DocTypeDef;
  onView: () => void;
  onDelete?: () => void;
  actions?: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const dl = dateLabel(def);
  const facts = [
    dl && doc.docDate ? `${dl}: ${formatDate(doc.docDate)}` : null,
    doc.reference ? `${def.referenceLabel ?? 'Reference'}: ${doc.reference}` : null,
  ].filter(Boolean);
  const reviewed = doc.reviewedBy
    ? ` · ${doc.status === 'approved' ? 'approved' : doc.status === 'rejected' ? 'sent back' : 'checked'} by ${doc.reviewedBy}`
    : '';

  return (
    <li className="py-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-white truncate">{doc.fileName}</div>
          <div className="text-[12px] text-neutral-500">
            Uploaded {formatDate(doc.uploadedAt)}
            {reviewed}
          </div>
          {facts.length > 0 && (
            <div className="text-[12px] text-neutral-400">{facts.join(' · ')}</div>
          )}
        </div>
        <Chip
          tone={
            doc.status === 'approved' ? 'success' : doc.status === 'rejected' ? 'danger' : 'info'
          }
        >
          {doc.status === 'approved' ? 'Approved' : doc.status === 'rejected' ? 'Sent back' : 'Waiting'}
        </Chip>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onView}
          className="text-xs font-bold uppercase tracking-wider text-yellow-400 hover:text-yellow-300 underline"
        >
          View
        </button>
        {onDelete &&
          (confirming ? (
            <>
              <span className="text-xs text-neutral-400">Remove this file?</span>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onDelete();
                }}
                className="text-xs font-bold uppercase tracking-wider text-[var(--color-danger-soft)]"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-xs font-bold uppercase tracking-wider text-neutral-400"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs font-bold uppercase tracking-wider text-neutral-500 hover:text-[var(--color-danger-soft)]"
            >
              Remove
            </button>
          ))}
      </div>
      {actions}
    </li>
  );
}

function UploadForm({
  def,
  upload,
  onDone,
  onCancel,
}: {
  def: DocTypeDef;
  upload: Uploader;
  onDone: () => void;
  onCancel: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [docDate, setDocDate] = useState('');
  const [reference, setReference] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const dl = dateLabel(def);
  const today = todayIso();
  const busy = progress !== null;

  const choose = (list: FileList | null) => {
    setError(null);
    setFile(list && list[0] ? list[0] : null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError(new Error('Choose a photo or a file first.'));
      return;
    }
    if (def.dateKind && def.dateRequired && !docDate) {
      setError(new Error(`Add the ${(dl ?? 'date').toLowerCase()}.`));
      return;
    }
    try {
      setProgress(0);
      const prepared = await prepareUpload(file, def);
      await upload(
        def.key,
        prepared.blob,
        { docDate: docDate || null, reference: reference.trim() || null, fileName: prepared.name },
        setProgress,
      );
      onDone();
    } catch (err) {
      setError(err);
      setProgress(null);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="border-2 border-neutral-700 bg-neutral-950 p-3.5 flex flex-col gap-3"
    >
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => choose(e.target.files)}
      />
      <input
        ref={fileRef}
        type="file"
        accept={acceptAttr(def)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => choose(e.target.files)}
      />
      <div className="flex flex-wrap gap-2">
        <SecondaryButton onClick={() => cameraRef.current?.click()} disabled={busy}>
          Take a photo
        </SecondaryButton>
        <SecondaryButton onClick={() => fileRef.current?.click()} disabled={busy}>
          Choose a file
        </SecondaryButton>
      </div>
      {file && (
        <p className="text-sm text-white break-all">
          {file.name}{' '}
          <span className="text-neutral-500">({Math.max(1, Math.round(file.size / 1024))} KB)</span>
        </p>
      )}
      {dl && (
        <Field
          label={def.dateRequired ? dl : `${dl}, if it has one`}
          htmlFor={`date-${def.key}`}
        >
          <input
            id={`date-${def.key}`}
            type="date"
            value={docDate}
            onChange={(e) => setDocDate(e.target.value)}
            min={def.dateKind === 'expiry' ? today : undefined}
            max={def.dateKind === 'issued' ? today : undefined}
            className={inputClass}
          />
        </Field>
      )}
      {def.referenceLabel && (
        <Field label={`${def.referenceLabel} (optional)`} htmlFor={`ref-${def.key}`}>
          <input
            id={`ref-${def.key}`}
            value={reference}
            maxLength={60}
            onChange={(e) => setReference(e.target.value)}
            className={inputClass}
          />
        </Field>
      )}
      {busy && (
        <div
          className="h-2 bg-neutral-800"
          role="progressbar"
          aria-label="Upload progress"
          aria-valuenow={Math.round((progress ?? 0) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-yellow-400 transition-all"
            style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
          />
        </div>
      )}
      <ErrorNotice error={error} />
      <div className="flex gap-2">
        <PrimaryButton type="submit" busy={busy}>
          {busy ? 'Sending' : 'Send'}
        </PrimaryButton>
        <SecondaryButton onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
      </div>
    </form>
  );
}

/** A private document, fetched with the session and shown in place. */
export function FileViewer({
  doc,
  fetchFile,
  onClose,
}: {
  doc: DocumentInfo;
  fetchFile: (id: number) => Promise<Blob>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchFile(doc.id)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id, fetchFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isPdf = doc.contentType === 'application/pdf';

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={doc.label}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-neutral-950 border-b-2 border-neutral-800">
        <div className="min-w-0">
          <div className="font-display uppercase tracking-tight text-white truncate">{doc.label}</div>
          <div className="text-[12px] text-neutral-500 truncate">{doc.fileName}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold uppercase tracking-wider text-yellow-400 underline"
            >
              Open
            </a>
          )}
          <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        </div>
      </header>
      <div className="flex-1 overflow-auto flex items-center justify-center p-3">
        {error ? (
          <ErrorNotice error={error} />
        ) : !url ? (
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        ) : isPdf ? (
          <iframe title={doc.label} src={url} className="w-full h-full bg-white" />
        ) : (
          <img src={url} alt={doc.label} className="max-w-full max-h-full object-contain" />
        )}
      </div>
    </div>
  );
}
