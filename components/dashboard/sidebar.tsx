'use client';

import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Home,
  ShoppingCart,
  Briefcase,
  Users,
  Settings,
  LogOut,
  BarChart3,
  Award,
  DollarSign,
  Tag,
  Gamepad2,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Package,
  ClipboardCheck,
  CreditCard,
  Layers,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type SidebarContentProps = {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  showCollapseButton?: boolean;
};

type NavLink = {
  href: string;
  label: string;
  icon: React.ElementType;
};

type NavGroup = {
  heading: string;
  links: NavLink[];
};

function DashboardNavContent({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  showCollapseButton = false,
}: SidebarContentProps) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  const isActive = (href: string) => pathname === href;

  const customerGroups: NavGroup[] = [
    {
      heading: 'Overview',
      links: [{ href: '/dashboard', label: t('home'), icon: Home }],
    },
    {
      heading: 'Shopping',
      links: [
        { href: '/dashboard/marketplace', label: t('browseServices'), icon: ShoppingCart },
        { href: '/dashboard/orders', label: t('myOrders'), icon: Briefcase },
        { href: '/dashboard/accounts', label: t('gameAccounts'), icon: Gamepad2 },
        { href: '/dashboard/topup', label: t('topupCenter'), icon: DollarSign },
      ],
    },
    {
      heading: 'Account',
      links: [
        { href: '/dashboard/profile', label: t('myAccount'), icon: Users },
        { href: '/dashboard/settings', label: t('settings'), icon: Settings },
      ],
    },
  ];

  const sellerGroups: NavGroup[] = [
    {
      heading: 'Overview',
      links: [{ href: '/dashboard', label: t('home'), icon: Home }],
    },
    {
      heading: 'Work',
      links: [
        { href: '/dashboard/tasks', label: t('availableOrders'), icon: Award },
        { href: '/dashboard/seller/products', label: t('myProducts'), icon: Tag },
      ],
    },
    {
      heading: 'Account',
      links: [
        { href: '/dashboard/earnings', label: t('earningsStats'), icon: BarChart3 },
        { href: '/dashboard/profile', label: t('sellerProfile'), icon: Users },
        { href: '/dashboard/settings', label: t('settings'), icon: Settings },
      ],
    },
  ];

  const adminGroups: NavGroup[] = [
    {
      heading: 'Overview',
      links: [{ href: '/dashboard', label: t('home'), icon: Home }],
    },
    {
      heading: 'Management',
      links: [
        { href: '/dashboard/admin/manage', label: 'Manage Content', icon: Layers },
        { href: '/dashboard/admin/products/review', label: t('reviewProductSubmissions'), icon: ClipboardCheck },
        { href: '/dashboard/admin/payment-methods', label: t('paymentMethods'), icon: CreditCard },
      ],
    },
    {
      heading: 'People',
      links: [{ href: '/dashboard/users', label: t('manageUsers'), icon: Users }],
    },
    {
      heading: 'Orders & Finance',
      links: [
        { href: '/dashboard/orders', label: t('allOrders'), icon: ShoppingCart },
        { href: '/dashboard/topup', label: t('topupRequests'), icon: DollarSign },
        { href: '/dashboard/finance', label: t('finance'), icon: BarChart3 },
        { href: '/dashboard/admin/disputes', label: t('disputes'), icon: ShieldAlert },
      ],
    },
    {
      heading: 'System',
      links: [
        { href: '/dashboard/analytics', label: t('analytics'), icon: Package },
        { href: '/dashboard/settings', label: t('adminSettings'), icon: Settings },
      ],
    },
  ];

  const groups =
    user?.role === 'admin'
      ? adminGroups
      : user?.role === 'seller'
      ? sellerGroups
      : customerGroups;

  return (
    <div className="flex h-full flex-col">
      {/* Logo row */}
      <div className="relative shrink-0 border-b border-gray-200 p-4 dark:border-gray-800">
        <Link
          href="/dashboard"
          className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}
          onClick={onNavigate}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-800">
            <span className="text-sm font-bold text-black dark:text-white">M</span>
          </div>
          {!collapsed && (
            <span className="text-base font-bold text-black dark:text-white">MOHSTORE</span>
          )}
        </Link>

        {showCollapseButton && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:bg-gray-50 hover:text-black dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto scroll-smooth p-3 sm:p-4" aria-label="Dashboard navigation links">
        {groups.map((group) => (
          <div key={group.heading} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                {group.heading}
              </p>
            )}
            {group.links.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link key={link.href} href={link.href} onClick={onNavigate} title={collapsed ? link.label : undefined}>
                  <div
                    className={`flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors ${collapsed ? 'justify-center' : 'gap-3'} ${
                      active
                        ? 'bg-gray-200 text-black dark:bg-gray-800 dark:text-white'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-black dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon size={18} className="shrink-0" />
                    {!collapsed && <span>{link.label}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-gray-200 p-3 dark:border-gray-800 sm:p-4">
        {!collapsed && (
          <div className="mb-3 rounded-lg bg-gray-100 px-3 py-2.5 dark:bg-[#020617]">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('loggedInAs')}</p>
            <p className="font-medium text-black dark:text-white">{user?.username}</p>
            <p className="text-xs capitalize text-gray-500 dark:text-gray-400">{user?.role}</p>
          </div>
        )}

        {!collapsed && (
          <Link href="/dashboard/settings" className="mb-2 block" onClick={onNavigate}>
            <Button variant="outline" className="w-full justify-start gap-2 text-sm">
              <Settings size={16} />
              {t('settings')}
            </Button>
          </Link>
        )}

        <Button
          variant="outline"
          className={`w-full gap-2 text-sm text-red-500 hover:bg-gray-100 hover:text-red-600 dark:border-gray-800 dark:text-red-400 dark:hover:bg-gray-900 dark:hover:text-red-300 ${collapsed ? 'justify-center px-2' : 'justify-start'}`}
          title={collapsed ? t('logout') : undefined}
          onClick={() => {
            onNavigate?.();
            handleLogout();
          }}
        >
          <LogOut size={16} />
          {!collapsed && t('logout')}
        </Button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  // Persist collapsed state
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed');
    if (stored === 'true') setCollapsed(true);
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }, []);

  return (
    <aside
      className={`relative sticky top-0 hidden h-screen shrink-0 overflow-y-auto scroll-smooth border-r border-gray-200 bg-white transition-all duration-300 dark:border-gray-800 dark:bg-gray-900 lg:flex lg:flex-col ${
        collapsed ? 'w-[72px]' : 'w-[260px]'
      }`}
      aria-label="Dashboard sidebar"
    >
      <DashboardNavContent
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        showCollapseButton
      />
    </aside>
  );
}

export { DashboardNavContent };
