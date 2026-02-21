import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useVault } from '../../hooks/useVault.js';
import { useAutoLogout } from '../../hooks/useAutoLogout.js';
import { Layout } from '../layout/Layout.js';
import { VaultViewer } from './VaultViewer.js';
import { VaultEditor } from './VaultEditor.js';

// Session timeouts from shared config — read from environment variable set at build time
const VIEW_TIMEOUT = Number(import.meta.env.VITE_VIEW_TIMEOUT_SECONDS ?? 300);
const EDIT_TIMEOUT = Number(import.meta.env.VITE_EDIT_TIMEOUT_SECONDS ?? 600);

type Mode = 'view' | 'edit';

export function VaultPage() {
  const navigate = useNavigate();
  const { token, logout } = useAuth();
  const { loading, error, lastModified, fetchAndDecrypt, encryptAndSave, download } = useVault(token);

  const [content, setContent] = useState('');
  const [mode, setMode] = useState<Mode>('view');
  const [initialFetched, setInitialFetched] = useState(false);

  const timeoutSeconds = mode === 'edit' ? EDIT_TIMEOUT : VIEW_TIMEOUT;

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const { secondsLeft } = useAutoLogout({
    timeoutSeconds,
    onLogout: handleLogout,
    active: !!token,
  });

  useEffect(() => {
    if (!token || initialFetched) return;
    fetchAndDecrypt()
      .then(decrypted => {
        setContent(decrypted);
        setInitialFetched(true);
      })
      .catch(() => {
        // error is tracked in vault hook
      });
  }, [token, initialFetched, fetchAndDecrypt]);

  const handleSave = async (newContent: string) => {
    await encryptAndSave(newContent);
    setContent(newContent);
    setMode('view');
    // Auto-logout after save per security policy
    handleLogout();
  };

  if (!initialFetched && loading) {
    return (
      <Layout>
        <div className="text-gray-500 text-sm">Decrypting vault…</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-md p-6 flex flex-col min-h-[32rem]">
        {mode === 'view' ? (
          <VaultViewer
            content={content}
            lastModified={lastModified}
            onEdit={() => setMode('edit')}
            onDownload={download}
            onLogout={handleLogout}
            secondsLeft={secondsLeft}
          />
        ) : (
          <VaultEditor
            initialContent={content}
            onSave={handleSave}
            onCancel={() => setMode('view')}
            saving={loading}
            error={error}
            secondsLeft={secondsLeft}
          />
        )}
      </div>
    </Layout>
  );
}
