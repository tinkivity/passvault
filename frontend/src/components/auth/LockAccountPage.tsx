import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { Layout } from '../layout/Layout.js';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '../../services/api.js';
import { ROUTES } from '../../routes.js';

export function LockAccountPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'confirm' | 'loading' | 'success' | 'error'>('confirm');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleLock = () => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Missing lock token.');
      return;
    }

    setStatus('loading');
    api
      .lockSelf(token)
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to lock account. The link may have expired.',
        );
      });
  };

  return (
    <Layout>
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Lock Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            {status === 'confirm' && (
              <div className="flex flex-col items-center gap-3">
                <ShieldAlert className="h-10 w-10 text-amber-500" />
                <p className="font-medium">
                  Are you sure you want to lock your account?
                </p>
                <p className="text-sm text-muted-foreground">
                  This will cancel the pending email change and lock your account.
                  You will need to contact your administrator to unlock it.
                </p>
                <div className="mt-2 flex gap-3">
                  <Link
                    to={ROUTES.LOGIN}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                  >
                    Cancel
                  </Link>
                  <Button variant="destructive" onClick={handleLock}>
                    Lock my account
                  </Button>
                </div>
              </div>
            )}
            {status === 'loading' && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Locking your account...</p>
              </div>
            )}
            {status === 'success' && (
              <div className="flex flex-col items-center gap-3">
                <ShieldAlert className="h-10 w-10 text-green-600" />
                <p className="font-medium">Your account has been locked.</p>
                <p className="text-sm text-muted-foreground">
                  The pending email change has been cancelled. Contact your administrator to unlock your account.
                </p>
              </div>
            )}
            {status === 'error' && (
              <div className="flex flex-col items-center gap-3">
                <XCircle className="h-10 w-10 text-destructive" />
                <p className="font-medium text-destructive">{errorMessage}</p>
                <Link
                  to={ROUTES.LOGIN}
                  className="mt-2 inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Go to Login
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
