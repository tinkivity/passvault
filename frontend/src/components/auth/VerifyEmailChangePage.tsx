import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Layout } from '../layout/Layout.js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '../../services/api.js';
import { ROUTES } from '../../routes.js';

export function VerifyEmailChangePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Missing verification token.');
      return;
    }

    api
      .verifyEmailChange(token)
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Verification failed. The link may have expired.',
        );
      });
  }, [token]);

  return (
    <Layout>
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Email Verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            {status === 'loading' && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Verifying your email address...</p>
              </div>
            )}
            {status === 'success' && (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
                <p className="font-medium">Your email address has been updated successfully.</p>
                <p className="text-sm text-muted-foreground">
                  Please log in again with your new email address.
                </p>
                <Link
                  to={ROUTES.LOGIN}
                  className="mt-2 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Go to Login
                </Link>
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
