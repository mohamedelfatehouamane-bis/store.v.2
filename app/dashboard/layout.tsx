'use client';

import { useAuth } from '@/lib/auth-context';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Sidebar, { DashboardNavContent } from '@/components/dashboard/sidebar';
import TopNavbar from '@/components/dashboard/top-navbar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { supabase } from '@/lib/db';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const refreshTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user?.id) return;

    const notifyOrderChanged = () => {
      if (typeof window === 'undefined') return;
      if (document.visibilityState !== 'visible') return;

      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }

      // Debounce burst updates and emit one event for interested widgets.
      refreshTimeoutRef.current = window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('mohstore:orders-changed', {
            detail: { userId: user.id, pathname },
          })
        );
      }, 700);
    };

    const channel = supabase
      .channel(`dashboard-refresh-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${user.id}`,
        },
        notifyOrderChanged
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `assigned_seller_id=eq.${user.id}`,
        },
        notifyOrderChanged
      )
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [pathname, user?.id]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-black dark:bg-gray-900 dark:text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-gray-400 dark:border-gray-500"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen bg-white text-black dark:bg-gray-900 dark:text-white">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNavbar onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          {children}
        </main>
      </div>
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetContent
          side="left"
          className="w-[85vw] max-w-72 border-r border-gray-200 bg-white p-0 text-black dark:border-gray-800 dark:bg-gray-900 dark:text-white lg:hidden"
        >
          <DashboardNavContent onNavigate={() => setIsSidebarOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
