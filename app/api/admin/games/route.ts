export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const [
      { data: games, error: gamesError },
      { data: categories, error: categoriesError },
      { data: assignments, error: assignmentsError },
      { data: sellers, error: sellersError },
    ] = await Promise.all([
      supabase
        .from('games')
        .select('id, name, slug')
        .order('created_at', { ascending: false }),

      supabase
        .from('categories')
        .select('id, name, game_id'),

      supabase
        .from('seller_categories')
        .select('category_id, seller_id'),

      supabase
        .from('users')
        .select('id, username, email')
        .eq('role', 'seller'),
    ])

    if (
      gamesError ||
      categoriesError ||
      assignmentsError ||
      sellersError
    ) {
      const error =
        gamesError ||
        categoriesError ||
        assignmentsError ||
        sellersError

      console.error('Get admin games error:', error)

      return NextResponse.json(
        {
          error:
            error?.message ??
            'Unable to load games',
        },
        { status: 500 }
      )
    }

    const sellersById = new Map(
      (sellers ?? []).map((seller: any) => [
        String(seller.id),
        seller,
      ])
    )

    const categoriesByGame = new Map<
      string,
      any[]
    >()

    for (const category of categories ?? []) {
      const gameId = String(category.game_id)

      const current =
        categoriesByGame.get(gameId) ?? []

      current.push(category)

      categoriesByGame.set(gameId, current)
    }

    const assignmentsByCategory = new Map<
      string,
      any[]
    >()

    for (const assignment of assignments ?? []) {
      const categoryId = String(
        (assignment as any).category_id
      )

      const seller = sellersById.get(
        String((assignment as any).seller_id)
      )

      if (!seller) continue

      const current =
        assignmentsByCategory.get(categoryId) ?? []

      current.push({
        id: String(seller.id),
        username: seller.username,
        email: seller.email,
      })

      assignmentsByCategory.set(
        categoryId,
        current
      )
    }

    const normalizedGames = (games ?? []).map(
      (game: any) => {
        const gameCategories =
          categoriesByGame.get(
            String(game.id)
          ) ?? []

        let assignedSellers: any[] = []

        for (const category of gameCategories) {
          const categoryAssignments =
            assignmentsByCategory.get(
              String(category.id)
            ) ?? []

          assignedSellers.push(
            ...categoryAssignments
          )
        }

        // Remove duplicates
        assignedSellers = Array.from(
          new Map(
            assignedSellers.map((seller) => [
              seller.id,
              seller,
            ])
          ).values()
        )

        return {
          id: String(game.id),
          name: game.name,
          slug:
            game.slug ??
            slugify(game.name),

          categories_count:
            gameCategories.length,

          assigned_sellers_count:
            assignedSellers.length,

          assigned_sellers:
            assignedSellers,
        }
      }
    )

    return NextResponse.json({
      success: true,
      games: normalizedGames,
    })
  } catch (error) {
    console.error(
      'Get admin games error:',
      error
    )

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
