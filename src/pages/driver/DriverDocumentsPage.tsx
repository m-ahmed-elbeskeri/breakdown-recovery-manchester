import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Banner, BlockerList, ErrorNotice, Loading } from '../../components/console';
import { DocumentList } from '../../components/documents';
import {
  deleteMyDocument,
  fetchMyProfile,
  myDocumentFile,
  uploadMyDocument,
} from '../../driver';
import { formatDate, type DriverProfile } from '../../driverDocs';
import { useNoIndex } from '../../seo';
import { DriverShell } from './DriverShell';

export function DriverDocumentsPage() {
  useNoIndex('My documents');
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setProfile(await fetchMyProfile());
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (profile && profile.status !== 'active') return <Navigate to="/driver/application" replace />;

  const c = profile?.compliance;
  const expiring = c?.items.filter((i) => i.state === 'expiring') ?? [];

  return (
    <DriverShell title="My documents">
      <p className="text-sm text-neutral-400">
        When something is renewed, upload the new copy before the old one runs out. The old one
        stays valid until the office approves the new one, so you are never taken off the road in
        between.
      </p>
      <ErrorNotice error={error} />
      {!profile || !c ? (
        !error && <Loading />
      ) : (
        <>
          {c.workBlockers.length > 0 && (
            <Banner tone="danger" title="You can't go on duty until these are sorted">
              <BlockerList items={c.workBlockers} />
            </Banner>
          )}
          {expiring.length > 0 && (
            <Banner tone="warn" title="Renew soon">
              <BlockerList
                items={expiring.map((i) => `${i.label} runs out on ${formatDate(i.validUntil)}.`)}
              />
            </Banner>
          )}
          <DocumentList
            compliance={c}
            documents={profile.documents}
            canUpload
            upload={uploadMyDocument}
            fetchFile={myDocumentFile}
            remove={deleteMyDocument}
            onChanged={load}
          />
        </>
      )}
    </DriverShell>
  );
}
