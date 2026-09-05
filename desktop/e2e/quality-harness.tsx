import '../src/renderer/index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QualityCockpit } from '../src/renderer/components/quality/QualityCockpit';
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 1200, padding: 24, margin: '0 auto' }}><QualityCockpit projectId="fixture" /></main>);
