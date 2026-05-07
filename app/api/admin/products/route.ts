import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer as supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import {
  ensureBucket,
  sanitizeStorageFileName,
} from '@/lib/storage'
import { z } from 'zod'

const createProductSchema = z.object({
  game_id: z.string().uuid(),
  category_id: z.string().uuid(),
  name: z.string().trim().min(1),
  points_price: z.coerce.number().int().positive(),
  description: z.string().optional(),
})

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const MAX_IMAGE_SIZE_BYTES =
  25 * 1024 * 1024

function getAuth(request: NextRequest) {
  const authHeader =
    request.headers.get('authorization')

  if (
    !authHeader ||
    !authHeader.startsWith('Bearer ')
  ) {
    return {
      status: 401 as const,
      error: 'Unauthorized',
    }
  }

  const token = authHeader.substring(7)

  const auth = verifyToken(token)

  if (!auth) {
    return {
      status: 401 as const,
      error: 'Invalid token',
    }
  }

  if (auth.role !== 'admin') {
    return {
      status: 403 as const,
      error: 'Admin access required',
    }
  }

  return {
    status: 200 as const,
    auth,
  }
}

export async function GET(
  request: NextRequest
) {
  try {
    const authResult = getAuth(request)

    if (authResult.status !== 200) {
      return NextResponse.json(
        {
          error: authResult.error,
        },
        {
          status: authResult.status,
        }
      )
    }

    const { data: products, error } =
      await supabase
        .from('products')
        .select(`
          id,
          name,
          description,
          image_url,
          points_price,
          is_active,
          status,
          created_at,
          category:category_id(
            id,
            name,
            game:game_id(
              id,
              name
            )
          )
        `)
        .order('created_at', {
          ascending: false,
        })

    if (error) {
      console.error(
        'Get products error:',
        error
      )

      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 500 }
      )
    }

    const normalizedProducts = (
      products ?? []
    ).map((product: any) => ({
      id: String(product.id),

      name: product.name,

      description:
        product.description,

      image_url:
        product.image_url,

      points_price:
        product.points_price,

      is_active:
        product.is_active,

      status:
        product.status ??
        'approved',

      created_at:
        product.created_at,

      game_id:
        product.category?.game?.id ??
        null,

      game_name:
        product.category?.game?.name ??
        '',

      category_id:
        product.category?.id ??
        null,

      category_name:
        product.category?.name ??
        '',
    }))

    return NextResponse.json({
      success: true,
      products: normalizedProducts,
    })
  } catch (error) {
    console.error(
      'Get products error:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Internal server error',
      },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest
) {
  try {
    const authResult = getAuth(request)

    if (authResult.status !== 200) {
      return NextResponse.json(
        {
          error: authResult.error,
        },
        {
          status: authResult.status,
        }
      )
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          error:
            'Storage not configured',
        },
        { status: 500 }
      )
    }

    await ensureBucket(
      supabaseAdmin,
      'products',
      '25MB'
    )

    const formData =
      await request.formData()

    const imageFile =
      formData.get('image_file')

    const parsed =
      createProductSchema.parse({
        game_id: String(
          formData.get('game_id') ||
            ''
        ),

        category_id: String(
          formData.get(
            'category_id'
          ) || ''
        ),

        name: String(
          formData.get('name') || ''
        ),

        points_price:
          formData.get(
            'points_price'
          ),

        description: String(
          formData.get(
            'description'
          ) || ''
        ),
      })

    const {
      game_id,
      category_id,
      name,
      points_price,
      description,
    } = parsed

    /*
      Validate game exists
    */

    const {
      data: gameExists,
      error: gameError,
    } = await supabase
      .from('games')
      .select('id')
      .eq('id', game_id)
      .single()

    if (
      gameError ||
      !gameExists
    ) {
      return NextResponse.json(
        {
          error: 'Game not found',
        },
        { status: 404 }
      )
    }

    /*
      Validate category exists
    */

    const {
      data: categoryExists,
      error: categoryError,
    } = await supabase
      .from('categories')
      .select(`
        id,
        game_id
      `)
      .eq('id', category_id)
      .single()

    if (
      categoryError ||
      !categoryExists
    ) {
      return NextResponse.json(
        {
          error:
            'Category not found',
        },
        { status: 404 }
      )
    }

    /*
      Validate category belongs to game
    */

    if (
      categoryExists.game_id !==
      game_id
    ) {
      return NextResponse.json(
        {
          error:
            'Category does not belong to selected game',
        },
        { status: 400 }
      )
    }

    /*
      Validate image
    */

    if (
      !(imageFile instanceof File)
    ) {
      return NextResponse.json(
        {
          error:
            'Image is required',
        },
        { status: 400 }
      )
    }

    if (
      !ALLOWED_IMAGE_TYPES.has(
        imageFile.type
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Only JPG, PNG, WEBP and GIF allowed',
        },
        { status: 400 }
      )
    }

    if (
      imageFile.size >
      MAX_IMAGE_SIZE_BYTES
    ) {
      return NextResponse.json(
        {
          error:
            'Image must be smaller than 25MB',
        },
        { status: 400 }
      )
    }

    /*
      Upload image
    */

    const fileName =
      sanitizeStorageFileName(
        imageFile.name
      )

    const storagePath = `products/${Date.now()}-${fileName}`

    const bytes =
      await imageFile.arrayBuffer()

    const uploadResult =
      await supabaseAdmin.storage
        .from('products')
        .upload(
          storagePath,
          Buffer.from(bytes),
          {
            contentType:
              imageFile.type,
          }
        )

    if (uploadResult.error) {
      console.error(
        'Upload error:',
        uploadResult.error
      )

      return NextResponse.json(
        {
          error:
            uploadResult.error
              .message,
        },
        { status: 500 }
      )
    }

    const {
      data: publicUrlData,
    } =
      supabaseAdmin.storage
        .from('products')
        .getPublicUrl(
          storagePath
        )

    const image_url =
      publicUrlData.publicUrl

    /*
      Create product
    */

    const {
      data: product,
      error: createError,
    } = await supabase
      .from('products')
      .insert({
        category_id,
        name,
        points_price,

        description:
          description || null,

        image_url,

        type: 'admin',

        status: 'approved',

        is_active: true,
      })
      .select()
      .single()

    if (createError) {
      console.error(
        'Create product error:',
        createError
      )

      return NextResponse.json(
        {
          error:
            createError.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        product,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error:
            'Validation error',

          details:
            error.errors,
        },
        { status: 400 }
      )
    }

    console.error(
      'Create product error:',
      error
    )

    return NextResponse.json(
      {
        error:
          'Internal server error',
      },
      { status: 500 }
    )
  }
}
