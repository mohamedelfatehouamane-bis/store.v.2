'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CategoriesPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/admin/manage?tab=categories');
  }, [router]);

  return null;
}
