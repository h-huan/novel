import '../src/renderer/index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QualityCockpit } from '../src/renderer/components/quality/QualityCockpit';
import { MemoryRouter } from 'react-router-dom';
import WorkbenchPage from '../src/renderer/pages/WorkbenchPage';
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 1200, padding: 24, margin: '0 auto' }}>{location.search.includes('workbench') ? <MemoryRouter><WorkbenchPage /></MemoryRouter> : <QualityCockpit projectId="fixture" />}</main>);
