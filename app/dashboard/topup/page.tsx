'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { supabase } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PRICE_PER_POINT_DZD = 1;
const MAX_IMAGE_SIZE_MB = 5;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

type PaymentMethod = {
  id: string;
  name: string;
  display_name: string;
  instructions: string;
  payment_account_id: string | null;
  account_number: string | null;
  account_name: string | null;
};

type TopupRow = {
  id: string;
  user_id: string;
  amount_points: number;
  proof_image: string;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | string;
  created_at: string;
  payment_method?: string | null;
  payment_account_name?: string | null;
  payment_account_number?: string | null;
  rejection_reason?: string | null;
  transaction_reference?: string | null;
  users?: {
    username?: string | null;
    email?: string | null;
  } | null;
};

type SubmissionSummary = {
  method: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  status: string;
};

function statusClassName(status: string): string {
  if (status === 'approved') return 'bg-green-100 text-green-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  if (status === 'processing') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export default function TopupPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [copyingInstructions, setCopyingInstructions] = useState(false);
  const [copyingAccount, setCopyingAccount] = useState(false);
  const [instructionsCopied, setInstructionsCopied] = useState(false);
  const [accountCopied, setAccountCopied] = useState(false);
  const [proofZoomUrl, setProofZoomUrl] = useState<string | null>(null);
  const [amountPoints, setAmountPoints] = useState('1000');
  const [transactionReference, setTransactionReference] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingTopups, setLoadingTopups] = useState(false);
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [newTopupIds, setNewTopupIds] = useState<string[]>([]);
  const [lastSubmission, setLastSubmission] = useState<SubmissionSummary | null>(null);
  const [topups, setTopups] = useState<TopupRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const seenAdminTopupIds = useRef<Set<string>>(new Set());

  const selectedMethod = useMemo(
    () => paymentMethods.find((method) => method.id === paymentMethodId) ?? null,
    [paymentMethodId, paymentMethods]
  );

  const pointsValue = Number(amountPoints) || 0;
  const totalDzd = pointsValue * PRICE_PER_POINT_DZD;
  const isCustomer = user?.role === 'customer';
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isCustomer) {
      return;
    }

    async function loadPaymentMethods() {
      setLoadingMethods(true);
      try {
        const response = await fetch('/api/payment-methods');
        const data = await response.json();
        const methods = data?.paymentMethods ?? [];
        setPaymentMethods(methods);
        setPaymentMethodId((current) => current || methods[0]?.id || '');
      } catch (error) {
        console.error(error);
        setPaymentMethods([]);
        setPaymentMethodId('');
        toast.error(t('failedToLoadPaymentMethods'));
      } finally {
        setLoadingMethods(false);
      }
    }

    loadPaymentMethods();
  }, [isCustomer]);

  const fetchTopups = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    const token = localStorage.getItem('auth_token');
    if (!token || !user) return;

    if (!silent) setLoadingTopups(true);

    try {
      const endpoint = isAdmin
        ? `/api/admin/topups${statusFilter === 'all' ? '' : `?status=${statusFilter}`}`
        : `/api/topups${statusFilter === 'all' ? '' : `?status=${statusFilter}`}`;

      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to load top-up requests');
      }

      const nextTopups = (data.topups ?? []) as TopupRow[];
      setTopups(nextTopups);

      if (isAdmin) {
        const currentIds = new Set(nextTopups.map((item) => item.id));

        if (seenAdminTopupIds.current.size === 0) {
          seenAdminTopupIds.current = currentIds;
          setNewTopupIds([]);
        } else {
          const freshIds = nextTopups
            .filter((item) => !seenAdminTopupIds.current.has(item.id) && item.status === 'pending')
            .map((item) => item.id);

          if (freshIds.length > 0 && silent) {
            toast.success(freshIds.length > 1 ? t('newTopupRequestsReceived') : t('newTopupRequestReceived'));
          }

          setNewTopupIds(freshIds);
          seenAdminTopupIds.current = currentIds;
        }
      }
    } catch (error) {
      console.error(error);
      if (!silent) {
        toast.error(error instanceof Error ? error.message : t('failedToLoadTopupRequests'));
      }
    } finally {
      if (!silent) setLoadingTopups(false);
    }
  };

  useEffect(() => {
    fetchTopups();
  }, [isAdmin, statusFilter, user]);

  useEffect(() => {
    if (!isAdmin || !user) return;

    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      fetchTopups({ silent: true });
    };

    const timer = setInterval(poll, 30000);
    const onFocus = () => fetchTopups({ silent: true });

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', poll);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [isAdmin, user, statusFilter]);

  useEffect(() => {
    if (!user) return;

    const channelName = isAdmin
      ? `admin-topups-realtime-${user.id}`
      : `user-topups-realtime-${user.id}`;

    let channel = supabase.channel(channelName);

    if (isAdmin) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'point_topups' },
        () => {
          fetchTopups({ silent: true });
        }
      );
    } else if (isCustomer) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'point_topups',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchTopups({ silent: true });
        }
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, isCustomer, user, statusFilter]);

  useEffect(() => {
    if (!proofFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(proofFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [proofFile]);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return t('onlyImagesAllowed');
    }

    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      return t('imageSizeMaxMb');
    }

    return null;
  };

  const copyInstructions = async () => {
    if (copyingInstructions) return;
    if (!selectedMethod?.instructions) {
      toast.error(t('noInstructionsAvailable'));
      return;
    }

    try {
      setCopyingInstructions(true);
      await navigator.clipboard.writeText(selectedMethod.instructions);
      setInstructionsCopied(true);
      setTimeout(() => setInstructionsCopied(false), 2000);
    } catch {
      toast.error(t('unableToCopyInstructions'));
    } finally {
      setCopyingInstructions(false);
    }
  };

  const copyAccountNumber = async () => {
    if (copyingAccount) return;
    if (!selectedMethod?.account_number) {
      toast.error(t('noAccountNumberAvailable'));
      return;
    }

    try {
      setCopyingAccount(true);
      await navigator.clipboard.writeText(selectedMethod.account_number);
      setAccountCopied(true);
      setTimeout(() => setAccountCopied(false), 2000);
    } catch {
      toast.error(t('unableToCopyAccountNumber'));
    } finally {
      setCopyingAccount(false);
    }
  };

  const refreshTopups = async () => {
    await fetchTopups({ silent: true });
  };

  const submitTopup = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!isCustomer) {
      toast.error(t('onlyCustomersCanSubmitTopups'));
      return;
    }

    if (!Number.isInteger(pointsValue) || pointsValue <= 0) {
      toast.error(t('enterValidPointsAmount'));
      return;
    }

    if (!selectedMethod) {
      toast.error(t('noPaymentMethodAvailable'));
      return;
    }

    if (!proofFile) {
      toast.error(t('uploadPaymentProofImage'));
      return;
    }

    const fileError = validateFile(proofFile);
    if (fileError) {
      toast.error(fileError);
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast.error(t('authenticationRequired'));
      return;
    }

    try {
      setSubmitting(true);

      const formData = new FormData();
      formData.append('payment_method_id', selectedMethod.id);
      if (selectedMethod.payment_account_id) {
        formData.append('payment_account_id', selectedMethod.payment_account_id);
      }
      formData.append('amount_points', String(pointsValue));
      formData.append('proof_image', proofFile);
      if (transactionReference.trim()) {
        formData.append('transaction_reference', transactionReference.trim());
      }

      const response = await fetch('/api/topups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to submit top-up request');
      }

      toast.success(data?.message || t('topupRequestSubmittedSuccessfully'));
      setProofFile(null);
      setTransactionReference('');
      setLastSubmission({
        method: selectedMethod.display_name,
        accountName: data?.selected_account?.account_name || selectedMethod.account_name || 'N/A',
        accountNumber: data?.selected_account?.account_number || selectedMethod.account_number || 'N/A',
        amount: pointsValue,
        status: 'pending',
      });
      await refreshTopups();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : t('failedToSubmitTopupRequest'));
    } finally {
      setSubmitting(false);
    }
  };

  const moderateTopup = async (id: string, action: 'approve' | 'reject') => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast.error(t('authenticationRequired'));
      return;
    }

    try {
      setModeratingId(id);

      const adminNotes = (rejectReasons[id] || '').trim();
      if (action === 'reject' && adminNotes.length < 3) {
        toast.error(t('provideRejectReasonMin3'));
        return;
      }

      const transactionId = action === 'approve'
        ? window.prompt('Optional transaction reference:') || ''
        : '';

      const response = await fetch(`/api/admin/topups/${id}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          admin_notes: adminNotes.trim() || undefined,
          transaction_id: transactionId.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || `Unable to ${action} top-up`);
      }

      toast.success(
        data?.message || (action === 'approve' ? t('topupApprovedSuccessfully') : t('topupRejectedSuccessfully'))
      );
      if (action === 'reject') {
        setRejectReasons((current) => ({ ...current, [id]: '' }));
      }
      await refreshTopups();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : (action === 'approve' ? t('failedToApproveTopup') : t('failedToRejectTopup'))
      );
    } finally {
      setModeratingId(null);
    }
  };

  if (!user) {
    return null;
  }

  if (!isCustomer && !isAdmin) {
    return (
      <div className="flex-1 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Top-up Center</CardTitle>
            <CardDescription>This section is available for customers and admins only.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Top-up Center</h1>
        <p className="mt-2 text-slate-600">
          {isAdmin
            ? 'Review customer payment proofs and approve or reject requests.'
            : 'Submit a payment proof to add points to your account.'}
        </p>
      </div>

      {isCustomer && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Manual Top-up Request</CardTitle>
                <CardDescription>Complete all steps and submit for admin review.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitTopup} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Step 1 - Payment Method</label>
                    <select
                      value={paymentMethodId}
                      onChange={(event) => setPaymentMethodId(event.target.value)}
                      disabled={loadingMethods || submitting || paymentMethods.length === 0}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      {loadingMethods && <option value="">Loading methods...</option>}
                      {!loadingMethods && paymentMethods.length === 0 && <option value="">No methods available</option>}
                      {!loadingMethods && paymentMethods.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.display_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedMethod && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 transition-all duration-300">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Selected method</p>
                      <p className="mt-1 text-lg font-semibold text-blue-900">{selectedMethod.display_name}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Step 2 - Points Amount</label>
                    <Input
                      type="number"
                      min={1}
                      value={amountPoints}
                      onChange={(event) => setAmountPoints(event.target.value)}
                      placeholder="1000"
                    />
                  </div>

                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-800">Step 3 - Payment Instructions</p>
                      <Button type="button" variant="outline" size="sm" onClick={copyInstructions} disabled={copyingInstructions || instructionsCopied}>
                        <Copy className="mr-2 h-4 w-4" />
                        {instructionsCopied ? 'Copied!' : 'Copy Full'}
                      </Button>
                    </div>
                    <pre className="whitespace-pre-wrap text-sm text-slate-700">
                      {selectedMethod?.instructions || 'No instructions available'}
                    </pre>
                    <div className="rounded-md border border-slate-200 bg-white p-3">
                      <p className="text-xs uppercase text-slate-500">Selected payment account</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {selectedMethod?.account_name || 'Not available'}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-sm text-slate-700">{selectedMethod?.account_number || 'No active account configured'}</p>
                        <Button type="button" variant="outline" size="sm" onClick={copyAccountNumber} disabled={copyingAccount || accountCopied}>
                          <Copy className="mr-2 h-4 w-4" />
                          {accountCopied ? 'Copied!' : 'Copy Account'}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Transaction Reference (optional)</label>
                    <Input
                      value={transactionReference}
                      onChange={(event) => setTransactionReference(event.target.value)}
                      placeholder="Payment reference code"
                      maxLength={120}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Step 4 - Upload Proof Image</label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          setProofFile(null);
                          return;
                        }

                        const validationError = validateFile(file);
                        if (validationError) {
                          toast.error(validationError);
                          event.target.value = '';
                          return;
                        }

                        setProofFile(file);
                      }}
                    />
                    <p className="text-xs text-slate-500">Accepted: JPG, PNG, WEBP (max {MAX_IMAGE_SIZE_MB}MB)</p>
                    {previewUrl && (
                      <img
                        src={previewUrl}
                        alt="Proof preview"
                        className="mt-2 h-40 w-full rounded-md border border-slate-200 object-cover sm:w-72"
                      />
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting || loadingMethods || paymentMethods.length === 0 || !selectedMethod}
                    className="w-full sm:w-auto"
                  >
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {submitting ? 'Submitting...' : 'Step 5 - Submit Request'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {lastSubmission && (
              <Card className="border-green-200 bg-green-50/60">
                <CardHeader>
                  <CardTitle className="text-green-900">Top-up Request Submitted</CardTitle>
                  <CardDescription className="text-green-800">Your request is now waiting for admin review.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm text-green-900 sm:grid-cols-2">
                  <p><span className="font-medium">Method:</span> {lastSubmission.method}</p>
                  <p><span className="font-medium">Account:</span> {lastSubmission.accountName}</p>
                  <p><span className="font-medium">Account Number:</span> {lastSubmission.accountNumber}</p>
                  <p><span className="font-medium">Points:</span> {lastSubmission.amount.toLocaleString()}</p>
                  <p className="sm:col-span-2"><span className="font-medium">Status:</span> {lastSubmission.status}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Step 6 - Summary</CardTitle>
              <CardDescription>Review your top-up details before submitting.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Method</span>
                <span className="font-semibold text-slate-900">{selectedMethod?.display_name || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Points</span>
                <span className="font-semibold text-slate-900">{pointsValue.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Price</span>
                <span className="font-semibold text-slate-900">1 point = {PRICE_PER_POINT_DZD} DZD</span>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700">Total</span>
                  <span className="text-lg font-bold text-slate-900">{totalDzd.toLocaleString()} DZD</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isAdmin && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Admin Top-up Queue</CardTitle>
            <CardDescription>Approve or reject pending customer top-up requests.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Status Filter</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | 'pending' | 'approved' | 'rejected')}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 sm:w-52"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {loadingTopups ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading top-up requests...
              </div>
            ) : topups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-16 text-center text-slate-600">
                No top-up requests found.
              </div>
            ) : (
              <div className="space-y-4">
                {topups.map((topup) => (
                  <div
                    key={topup.id}
                    className={`rounded-xl border bg-white p-4 shadow-sm transition-all duration-300 ${
                      newTopupIds.includes(topup.id)
                        ? 'border-blue-300 ring-2 ring-blue-200'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="grid gap-4 lg:grid-cols-4">
                      <div className="space-y-1">
                        <p className="text-xs uppercase text-slate-500">User</p>
                        <p className="font-semibold text-slate-900">{topup.users?.username || 'Unknown user'}</p>
                        <p className="text-xs text-slate-600">{topup.users?.email || topup.user_id}</p>
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClassName(topup.status)}`}>
                          {topup.status}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs uppercase text-slate-500">Amount</p>
                        <p className="text-lg font-bold text-slate-900">{Number(topup.amount_points ?? 0).toLocaleString()} pts</p>
                        <p className="text-sm text-slate-600">{new Date(topup.created_at).toLocaleString()}</p>
                        <p className="text-xs text-slate-600">Method: {topup.payment_method || 'N/A'}</p>
                        <p className="text-xs text-slate-600">Account: {topup.payment_account_name || 'N/A'} {topup.payment_account_number ? `(${topup.payment_account_number})` : ''}</p>
                        {topup.transaction_reference && (
                          <p className="text-xs text-slate-500">Ref: {topup.transaction_reference}</p>
                        )}
                        {topup.status === 'rejected' && topup.rejection_reason && (
                          <p className="text-xs text-red-600">Reason: {topup.rejection_reason}</p>
                        )}
                      </div>

                      <div className="lg:col-span-2">
                        {topup.proof_image ? (
                          <button type="button" onClick={() => setProofZoomUrl(topup.proof_image)} className="block w-full text-left">
                            <img
                              src={topup.proof_image}
                              alt="Payment proof"
                              className="h-44 w-full rounded-md border border-slate-200 object-cover"
                            />
                          </button>
                        ) : (
                          <div className="flex h-44 items-center justify-center rounded-md border border-dashed border-slate-200 text-sm text-slate-500">
                            No proof image
                          </div>
                        )}
                      </div>
                    </div>

                    {topup.status === 'pending' && (
                      <div className="mt-4 space-y-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium uppercase text-slate-500">Reject reason</label>
                          <Input
                            value={rejectReasons[topup.id] || ''}
                            onChange={(event) =>
                              setRejectReasons((current) => ({
                                ...current,
                                [topup.id]: event.target.value,
                              }))
                            }
                            placeholder="Reason shown to customer"
                            maxLength={500}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => moderateTopup(topup.id, 'approve')}
                          disabled={moderatingId === topup.id}
                          className="bg-green-600 text-white hover:bg-green-700"
                        >
                          {moderatingId === topup.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                          )}
                          Approve
                        </Button>
                        <Button
                          onClick={() => moderateTopup(topup.id, 'reject')}
                          disabled={moderatingId === topup.id || !(rejectReasons[topup.id] || '').trim()}
                          variant="destructive"
                        >
                          {moderatingId === topup.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="mr-2 h-4 w-4" />
                          )}
                          Reject
                        </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isAdmin && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>My Top-up Requests</CardTitle>
            <CardDescription>Track the status of your submitted top-up requests.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Status Filter</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | 'pending' | 'approved' | 'rejected')}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 sm:w-52"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {loadingTopups ? (
              <div className="flex items-center justify-center py-14 text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading your requests...
              </div>
            ) : topups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-14 text-center text-slate-600">
                No top-up requests yet.
              </div>
            ) : (
              <div className="space-y-3">
                {topups.map((topup) => (
                  <div key={topup.id} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center">
                    <div>
                      <p className="font-semibold text-slate-900">{Number(topup.amount_points ?? 0).toLocaleString()} points</p>
                      <p className="text-xs text-slate-600">{new Date(topup.created_at).toLocaleString()}</p>
                      {topup.payment_method && (
                        <p className="text-xs text-slate-500">Method: {topup.payment_method}</p>
                      )}
                      {(topup.payment_account_name || topup.payment_account_number) && (
                        <p className="text-xs text-slate-500">
                          Account: {topup.payment_account_name || 'N/A'} {topup.payment_account_number ? `(${topup.payment_account_number})` : ''}
                        </p>
                      )}
                      {topup.status === 'rejected' && topup.rejection_reason && (
                        <p className="text-xs text-red-600">Reason: {topup.rejection_reason}</p>
                      )}
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-sm text-slate-700">Total: {(Number(topup.amount_points ?? 0) * PRICE_PER_POINT_DZD).toLocaleString()} DZD</p>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClassName(topup.status)}`}>
                        {topup.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {proofZoomUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setProofZoomUrl(null)}
        >
          <img
            src={proofZoomUrl}
            alt="Proof zoom"
            className="max-h-[90vh] max-w-[90vw] rounded-lg border border-white/20 object-contain"
          />
        </div>
      )}
    </div>
  );
}
