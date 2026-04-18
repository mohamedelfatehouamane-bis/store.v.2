'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, ArrowRight } from 'lucide-react'

type Game = {
  id: string
  name: string
  description?: string
  image_url?: string
  slug?: string
}

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([])
  const [filteredGames, setFilteredGames] = useState<Game[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function loadGames() {
      try {
        setLoading(true)
        setError('')
        const response = await fetch('/api/games')
        if (!response.ok) {
          throw new Error('Failed to fetch games')
        }
        const data = await response.json()
        setGames(data.games ?? [])
        setFilteredGames(data.games ?? [])
      } catch (err) {
        console.error('Error loading games:', err)
        setError(err instanceof Error ? err.message : 'Failed to load games')
      } finally {
        setLoading(false)
      }
    }

    loadGames()
  }, [])

  useEffect(() => {
    const filtered = games.filter(
      (game) =>
        game.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (game.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    )
    setFilteredGames(filtered)
  }, [searchQuery, games])

  const handleViewOffers = (gameId: string) => {
    router.push(`/dashboard/marketplace/offers/game/${gameId}`)
  }

  return (
    <div className="flex-1 p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Game Services</h1>
        <p className="text-slate-400">Browse available games and discover exclusive services</p>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-red-400">
          {error}
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 h-5 w-5" />
          <Input
            placeholder="Search games by name or description..."
            className="pl-10 bg-slate-800 border-slate-700 text-white placeholder-slate-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="py-12 text-center text-slate-400">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          Loading games...
        </div>
      ) : filteredGames.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGames.map((game) => (
            <Card
              key={game.id}
              className="bg-slate-800/50 border-slate-700 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300 flex flex-col group"
            >
              {/* Game Image */}
              {game.image_url && (
                <div className="relative h-48 w-full overflow-hidden bg-slate-900 rounded-t-lg">
                  <img
                    src={game.image_url}
                    alt={game.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-800/80 to-transparent"></div>
                </div>
              )}

              <CardHeader>
                <CardTitle className="text-white text-xl">{game.name}</CardTitle>
                {game.description && (
                  <CardDescription className="text-slate-400 line-clamp-2">
                    {game.description}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="flex-1 flex flex-col">
                <div className="mb-6 flex-1">
                  <p className="text-sm text-slate-400 mb-4">
                    {game.description?.substring(0, 100)}
                    {game.description && game.description.length > 100 ? '...' : ''}
                  </p>
                </div>

                <Button
                  onClick={() => handleViewOffers(game.id)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                >
                  View Offers
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-12">
              <p className="text-slate-400 mb-4">No games found matching your search</p>
              {searchQuery && (
                <Button
                  variant="outline"
                  onClick={() => setSearchQuery('')}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Clear Search
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Info Section */}
      <Card className="mt-12 bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 list-decimal list-inside text-slate-400">
            <li>Select a game to view available services</li>
            <li>Browse different offers and pricing options</li>
            <li>Choose an offer that meets your needs</li>
            <li>Create and fund your order with points</li>
            <li>A seller will pick up your order shortly</li>
            <li>Monitor progress in real-time till completion</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
