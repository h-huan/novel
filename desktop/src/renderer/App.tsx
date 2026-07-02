import React from 'react';
import { HashRouter } from 'react-router-dom';
import AppRouter from './router';

const App: React.FC = () => {
  return (
    <HashRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AppRouter />
    </HashRouter>
  );
};

export default App;
