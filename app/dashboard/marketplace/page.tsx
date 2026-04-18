'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gamepad2, Sparkles, BarChart3, TrendingUp } from 'lucide-react';

export default function MarketplaceHubPage() {
  const router = useRouter();

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  return (
    <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-white mb-2">Game Services Marketplace</h1>
        <p className="text-slate-400">
          Browse games, discover services, and connect with verified sellers
        </p>
      </div>

      {/* Main Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {/* Browse Games Card */}
        <Card className="bg-gradient-to-br from-blue-900/20 to-blue-900/10 border-blue-900/30 hover:border-blue-600/50 hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300 cursor-pointer group"
          onClick={() => handleNavigate('/dashboard/marketplace/games')}
        >
          <CardHeader>
            <div className="flex items-start justify-between mb-4">
              <div className="bg-blue-600/20 rounded-lg p-3 group-hover:bg-blue-600/30 transition-colors">
                <Gamepad2 className="h-8 w-8 text-blue-400" />
              </div>
              <TrendingUp className="h-5 w-5 text-slate-600 group-hover:text-blue-400 transition-colors" />
            </div>
            <CardTitle className="text-white text-2xl">Browse Games</CardTitle>
            <CardDescription className="text-slate-400">
              Explore all available games and their services
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-slate-400 text-sm mb-4">
              Start your journey by selecting a game and discovering available service offers from verified sellers.
            </p>
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={(e) => {
                e.stopPropagation();
                handleNavigate('/dashboard/marketplace/games');
              }}
            >
              View Games
            </Button>
          </CardContent>
        </Card>

        {/* Exclusive Offers Card */}
        <Card className="bg-gradient-to-br from-purple-900/20 to-purple-900/10 border-purple-900/30 hover:border-purple-600/50 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300 cursor-pointer group"
          onClick={() => handleNavigate('/dashboard/marketplace/exclusive-offers')}
        >
          <CardHeader>
            <div className="flex items-start justify-between mb-4">
              <div className="bg-purple-600/20 rounded-lg p-3 group-hover:bg-purple-600/30 transition-colors">
                <Sparkles className="h-8 w-8 text-purple-400" />
              </div>
              <TrendingUp className="h-5 w-5 text-slate-600 group-hover:text-purple-400 transition-colors" />
            </div>
            <CardTitle className="text-white text-2xl">Exclusive Packs</CardTitle>
            <CardDescription className="text-slate-400">
              Premium bundles created exclusively by sellers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-slate-400 text-sm mb-4">
              Discover curated packs with special pricing and value bundles from trusted sellers on our platform.
            </p>
            <Button 
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              onClick={(e) => {
                e.stopPropagation();
                handleNavigate('/dashboard/marketplace/exclusive-offers');
              }}
            >
              View Exclusive Packs
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Features Section */}
      <Card className="mb-12 bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-400" />
            Marketplace Features
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-3">
              <div className="bg-blue-600/20 rounded-lg p-3 w-fit">
                <span className="text-2xl">⭐</span>
              </div>
              <h3 className="text-white font-semibold">Verified Sellers</h3>
              <p className="text-slate-400 text-sm">
                All sellers are verified and rated by the community
              </p>
            </div>
            <div className="space-y-3">
              <div className="bg-green-600/20 rounded-lg p-3 w-fit">
                <span className="text-2xl">💰</span>
              </div>
              <h3 className="text-white font-semibold">Points Payment</h3>
              <p className="text-slate-400 text-sm">
                Pay securely with your platform points
              </p>
            </div>
            <div className="space-y-3">
              <div className="bg-purple-600/20 rounded-lg p-3 w-fit">
                <span className="text-2xl">📊</span>
              </div>
              <h3 className="text-white font-semibold">Real-time Tracking</h3>
              <p className="text-slate-400 text-sm">
                Monitor your orders from start to finish
              </p>
            </div>
            <div className="space-y-3">
              <div className="bg-amber-600/20 rounded-lg p-3 w-fit">
                <span className="text-2xl">🎁</span>
              </div>
              <h3 className="text-white font-semibold">Exclusive Bundles</h3>
              <p className="text-slate-400 text-sm">
                Enjoy special pricing on curated packs
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How It Works Section */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-600 text-white font-bold flex-shrink-0">
                1
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Browse & Select</h3>
                <p className="text-slate-400 text-sm">
                  Choose a game and view all available service offers and exclusive packs
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-600 text-white font-bold flex-shrink-0">
                2
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Select an Offer</h3>
                <p className="text-slate-400 text-sm">
                  Pick the service or pack that meets your needs and review the details
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-600 text-white font-bold flex-shrink-0">
                3
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Create Order</h3>
                <p className="text-slate-400 text-sm">
                  Assign to your game account and confirm payment with your points
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-600 text-white font-bold flex-shrink-0">
                4
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Track Progress</h3>
                <p className="text-slate-400 text-sm">
                  A seller picks up your order and you can monitor the progress in real-time
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}