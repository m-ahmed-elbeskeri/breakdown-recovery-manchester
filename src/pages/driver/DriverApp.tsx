// Every page under /driver, behind a driver sign-in. Loaded as one chunk, so
// nobody booking a tow downloads the driver console.

import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../../auth';
import { DriverAccountPage } from '../account/AccountPage';
import { DriverApplicationPage } from './DriverApplicationPage';
import { DriverConsolePage } from './DriverConsolePage';
import { DriverDocumentsPage } from './DriverDocumentsPage';

export function DriverApp() {
  return (
    <RequireAuth role="driver">
      <Routes>
        <Route index element={<DriverConsolePage />} />
        <Route path="application" element={<DriverApplicationPage />} />
        <Route path="documents" element={<DriverDocumentsPage />} />
        <Route path="account" element={<DriverAccountPage />} />
        <Route path="*" element={<Navigate to="/driver" replace />} />
      </Routes>
    </RequireAuth>
  );
}
