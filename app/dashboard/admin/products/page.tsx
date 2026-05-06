'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminProductsPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/admin/manage?tab=products');
  }, [router]);

  return null;
}
