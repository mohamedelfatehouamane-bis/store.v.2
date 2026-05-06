'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GamesPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/admin/manage?tab=games');
  }, [router]);

  return null;
}
