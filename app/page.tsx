import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap, Users, Award, ShieldCheck, TrendingUp, Clock } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      {/* Navigation */}
      <nav className="border-b border-slate-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="font-bold text-sm">M</span>
            </div>
            <span className="font-bold text-lg">MOHSTORE</span>
          </div>
          <div className="flex gap-4">
            <Link href="/auth/login">
              <Button variant="outline" className="bg-transparent border-slate-600 hover:border-slate-400">
                Sign In
              </Button>
            </Link>
            <Link href="/auth/register">
              <Button className="bg-blue-600 hover:bg-blue-700">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Connect with Professional<br />Game Service Providers
          </h1>
          <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            MOHSTORE is the trusted marketplace where gamers find expert help for their game challenges, and skilled professionals earn by providing game services.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/auth/register?role=customer">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                Find Services
              </Button>
            </Link>
            <Link href="/auth/register?role=seller">
              <Button size="lg" variant="outline" className="bg-transparent border-slate-400 text-white hover:bg-slate-700">
                Become a Seller
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-center">
            <p className="text-4xl font-bold text-blue-400 mb-2">10K+</p>
            <p className="text-slate-300">Active Users</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-center">
            <p className="text-4xl font-bold text-green-400 mb-2">50K+</p>
            <p className="text-slate-300">Tasks Completed</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-center">
            <p className="text-4xl font-bold text-purple-400 mb-2">$2M+</p>
            <p className="text-slate-300">Total Transactions</p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-slate-800 py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">Why Choose MOHSTORE?</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: ShieldCheck,
                title: 'Secure Escrow System',
                description: 'Payment protection for both customers and sellers with automatic release on completion',
              },
              {
                icon: Users,
                title: 'Verified Professionals',
                description: 'All sellers are verified and rated by the community to ensure quality service',
              },
              {
                icon: Zap,
                title: 'Fast Turnaround',
                description: 'Quick order matching and completion with real-time updates',
              },
              {
                icon: Award,
                title: 'Rewards Program',
                description: 'Earn points on every transaction and redeem for discounts or premiums',
              },
              {
                icon: TrendingUp,
                title: 'Transparent Pricing',
                description: 'No hidden fees. See exactly what you\'re paying for upfront',
              },
              {
                icon: Clock,
                title: '24/7 Support',
                description: 'Dedicated support team available round the clock to help resolve disputes',
              },
            ].map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div key={i} className="bg-slate-700 rounded-lg p-8 border border-slate-600 hover:border-blue-500 transition-colors">
                  <Icon className="h-10 w-10 text-blue-400 mb-4" />
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-slate-300">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-center mb-16">How It Works</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* For Customers */}
          <div>
            <h3 className="text-2xl font-bold mb-8 flex items-center gap-2">
              <span className="bg-blue-600 rounded-full w-8 h-8 flex items-center justify-center">👤</span>
              For Customers
            </h3>
            <div className="space-y-6">
              {[
                { step: '1', title: 'Post Your Task', desc: 'Describe what you need help with' },
                { step: '2', title: 'Receive Bids', desc: 'Professional sellers submit their offers' },
                { step: '3', title: 'Choose Seller', desc: 'Select the best match for your needs' },
                { step: '4', title: 'Pay & Relax', desc: 'Funds held in escrow, seller gets to work' },
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="bg-blue-600 rounded-full w-10 h-10 flex items-center justify-center font-bold flex-shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <p className="font-bold text-lg">{item.title}</p>
                    <p className="text-slate-300">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* For Sellers */}
          <div>
            <h3 className="text-2xl font-bold mb-8 flex items-center gap-2">
              <span className="bg-green-600 rounded-full w-8 h-8 flex items-center justify-center">👨‍💼</span>
              For Sellers
            </h3>
            <div className="space-y-6">
              {[
                { step: '1', title: 'Create Profile', desc: 'Show your expertise and build reputation' },
                { step: '2', title: 'Find Tasks', desc: 'Browse available tasks matching your skills' },
                { step: '3', title: 'Submit Offer', desc: 'Bid on tasks you can complete' },
                { step: '4', title: 'Earn Points', desc: 'Get paid and build your rating' },
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="bg-green-600 rounded-full w-10 h-10 flex items-center justify-center font-bold flex-shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <p className="font-bold text-lg">{item.title}</p>
                    <p className="text-slate-300">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="text-xl text-blue-100 mb-8">Join thousands of gamers and professionals on MOHSTORE today</p>
          <div className="flex gap-4 justify-center">
            <Link href="/auth/register?role=customer">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-slate-100">
                Sign Up as Customer
              </Button>
            </Link>
            <Link href="/auth/register?role=seller">
              <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-blue-700">
                Sign Up as Seller
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-700 py-12 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="font-bold text-sm">M</span>
              </div>
              <span className="font-bold">MOHSTORE</span>
            </div>
            <p className="text-slate-400 text-sm">The trusted marketplace for game services</p>
          </div>
          <div>
            <p className="font-bold mb-4">Company</p>
            <ul className="space-y-2 text-slate-400 text-sm">
              <li><Link href="#" className="hover:text-white transition">About</Link></li>
              <li><Link href="#" className="hover:text-white transition">Blog</Link></li>
              <li><Link href="#" className="hover:text-white transition">Careers</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-bold mb-4">Support</p>
            <ul className="space-y-2 text-slate-400 text-sm">
              <li><Link href="#" className="hover:text-white transition">Help Center</Link></li>
              <li><Link href="#" className="hover:text-white transition">Contact</Link></li>
              <li><Link href="#" className="hover:text-white transition">Status</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-bold mb-4">Legal</p>
            <ul className="space-y-2 text-slate-400 text-sm">
              <li><Link href="#" className="hover:text-white transition">Privacy</Link></li>
              <li><Link href="#" className="hover:text-white transition">Terms</Link></li>
              <li><Link href="#" className="hover:text-white transition">Cookies</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-700 pt-8 text-center text-slate-400 text-sm">
          <p>&copy; 2024 MOHSTORE. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
