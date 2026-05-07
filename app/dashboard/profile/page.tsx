'use client'

import { useEffect, useState } from 'react'

import { useAuth } from '@/lib/auth-context'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { Badge } from '@/components/ui/badge'

import { Skeleton } from '@/components/ui/skeleton'

type ProfileUser = {
  id: string

  username: string

  email: string

  role: string

  points: number

  balance: number

  status?: string

  business_name?: string | null

  business_description?: string | null

  assigned_categories?: string[]

  assigned_category_ids?: string[]

  average_rating?: number

  total_reviews?: number
}

function getStatusColor(
  status?: string
) {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-700'

    case 'rejected':
      return 'bg-red-100 text-red-700'

    case 'pending':
    default:
      return 'bg-yellow-100 text-yellow-700'
  }
}

export default function ProfilePage() {
  const { user } =
    useAuth()

  const [profile, setProfile] =
    useState<ProfileUser | null>(
      null
    )

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  useEffect(() => {
    async function loadProfile() {
      try {
        const token =
          localStorage.getItem(
            'auth_token'
          )

        if (!token) {
          setError(
            'Authentication required'
          )

          return
        }

        const response =
          await fetch(
            '/api/users/profile',
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )

        const data =
          await response.json()

        if (!response.ok) {
          throw new Error(
            data.error ||
              'Failed to load profile'
          )
        }

        setProfile(data.user)
      } catch (err) {
        console.error(err)

        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load profile'
        )
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-40 w-full" />

        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error ||
            'Profile not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* USER INFO */}

      <Card>
        <CardHeader>
          <CardTitle>
            Profile
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-slate-500">
              Username
            </p>

            <p className="font-semibold">
              {profile.username}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">
              Email
            </p>

            <p className="font-semibold">
              {profile.email}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">
              Role
            </p>

            <Badge>
              {profile.role}
            </Badge>
          </div>

          <div>
            <p className="text-sm text-slate-500">
              Points
            </p>

            <p className="font-bold text-green-600">
              {profile.points ??
                0}{' '}
              pts
            </p>
          </div>
        </CardContent>
      </Card>

      {/* SELLER INFO */}

      {profile.role ===
        'seller' && (
        <Card>
          <CardHeader>
            <CardTitle>
              Seller Information
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-slate-500">
                Status
              </p>

              <Badge
                className={getStatusColor(
                  profile.status
                )}
              >
                {profile.status ??
                  'pending'}
              </Badge>
            </div>

            {profile.business_name && (
              <div>
                <p className="text-sm text-slate-500">
                  Business Name
                </p>

                <p className="font-semibold">
                  {
                    profile.business_name
                  }
                </p>
              </div>
            )}

            {profile.business_description && (
              <div>
                <p className="text-sm text-slate-500">
                  Description
                </p>

                <p>
                  {
                    profile.business_description
                  }
                </p>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm text-slate-500">
                Assigned Categories
              </p>

              <div className="flex flex-wrap gap-2">
                {(
                  profile.assigned_categories ??
                  []
                ).length > 0 ? (
                  profile.assigned_categories?.map(
                    (
                      category
                    ) => (
                      <Badge
                        key={
                          category
                        }
                        variant="secondary"
                      >
                        {
                          category
                        }
                      </Badge>
                    )
                  )
                ) : (
                  <p className="text-sm text-slate-400">
                    No assigned categories
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-slate-500">
                  Rating
                </p>

                <p className="font-bold">
                  {Number(
                    profile.average_rating ??
                      0
                  ).toFixed(1)}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Reviews
                </p>

                <p className="font-bold">
                  {profile.total_reviews ??
                    0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
