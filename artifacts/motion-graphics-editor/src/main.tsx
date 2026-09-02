import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { loadDocument } from './persistence/local-store';
import { useEditorStore, initAutosave } from './store/editor-store';

import './index.css';

async function bootstrap() {
  try {
    const savedDoc = await loadDocument();
    if (savedDoc) {
      useEditorStore.getState().hydrateDocument(savedDoc);
    }
  } catch (err) {
    console.warn('Could not load saved document:', err);
  }

  // Initialize autosave subscription
  initAutosave();

  createRoot(document.getElementById('root')!, {
    // Keeps caught errors off reportError(), which would raise the dev overlay.
    onCaughtError: (error, errorInfo) => {
      console.error(error, errorInfo.componentStack);
    },
  }).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}

bootstrap();

