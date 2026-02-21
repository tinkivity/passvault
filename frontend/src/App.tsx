import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.js';
import { EncryptionProvider } from './context/EncryptionContext.js';
import { router } from './router.js';

export default function App() {
  return (
    <EncryptionProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </EncryptionProvider>
  );
}
