import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { telegramService } from '@/lib/telegram-service';
import { addOrderEvent } from '@/lib/order-events';
import { z } from 'zod';

const FIXED_PLATFORM_FEE = 1;

function toWholePoints(value: unknown, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.round(numeric));
}

const createOrderSchema = z.object({
  game_id: z.string().min(1).optional(),
  seller_id: z.string().min(1).optional(),
  offer_id: z.string().min(1).optional(),
  exclusive_offer_id: z.string().min(1).optional(),
  account_id: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(99).optional().default(1),
}).refine(
  (data) => (data.offer_id && data.game_id) || data.exclusive_offer_id,
  'Either offer_id+game_id or exclusive_offer_id must be provided'
);

const db: any = supabaseAdmin ?? supabase;

function getAuthFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  return verifyToken(token);
}

const dbStatusByClientStatus: Record<string, string> = {
  pending: 'open',
  accepted: 'in_progress',
};

const clientStatusByDbStatus: Record<string, string> = {
  open: 'pending',
  accepted: 'in_progress',
};

function normalizeOrderStatusForDb(status: string) {
  return dbStatusByClientStatus[status] ?? status;
}

function normalizeOrderStatusForClient(status: string) {
  return clientStatusByDbStatus[status] ?? status;
}

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const rawStatus = searchParams.get('status');
    const status = rawStatus ? normalizeOrderStatusForDb(rawStatus) : null;

    // Use admin client so custom-JWT auth is not blocked by Supabase RLS.
    const adminDb = supabaseAdmin ?? supabase;

    const baseQuery = adminDb
      .from('orders')
      .select(
        `id, customer_id, assigned_seller_id, status, points_amount, created_at, offer_id`
      )
      .order('created_at', { ascending: false });

    let queryBuilder = baseQuery;

    if (filter === 'my-orders') {
      queryBuilder = queryBuilder.eq('customer_id', auth.id);
    } else if (filter === 'my-tasks') {
      queryBuilder = queryBuilder.eq('assigned_seller_id', auth.id);
    } else if (filter === 'available') {
      // Only show open orders that haven't been assigned to a seller yet.
      queryBuilder = queryBuilder.eq('status', 'open').is('assigned_seller_id', null);
    }

    if (status) {
      queryBuilder = queryBuilder.eq('status', status);
    }

    const { data, error } = await queryBuilder;
    if (error) {
      console.error('Get orders error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let orders = (data ?? []) as any[];

    if (filter === 'available' && auth.role !== 'seller' && auth.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch offer details for all orders
    const offerIds = [...new Set(orders.map((o: any) => o.offer_id).filter(Boolean))];
    const offersMap: Record<string, any> = {};
    
    if (offerIds.length > 0) {
      const { data: offersData } = await adminDb
        .from('offers')
        .select('id, points_price, product_id')
        .in('id', offerIds);
      
      if (offersData) {
        // Now fetch product details for all products
        const productIds = [...new Set((offersData as any[]).map((o: any) => o.product_id).filter(Boolean))];
        const productsMap: Record<string, any> = {};
        
        if (productIds.length > 0) {
          const { data: productsData } = await adminDb
            .from('products')
            .select('id, name, game_id, category_id');
          
          if (productsData) {
            // Fetch game details
            const gameIds = [...new Set((productsData as any[]).map((p: any) => p.game_id).filter(Boolean))];
            const gamesMap: Record<string, any> = {};
            
            if (gameIds.length > 0) {
              const { data: gamesData } = await adminDb
                .from('games')
                .select('id, name')
                .in('id', gameIds);
              
              if (gamesData) {
                (gamesData as any[]).forEach((g: any) => {
                  gamesMap[g.id] = g.name;
                });
              }
            }
            
            (productsData as any[]).forEach((p: any) => {
              productsMap[p.id] = {
                name: p.name,
                game_name: gamesMap[p.game_id] ?? '',
                category_id: p.category_id ?? null,
              };
            });
          }
        }
        
        (offersData as any[]).forEach((o: any) => {
          const product = productsMap[o.product_id] ?? { name: '', game_name: '', category_id: null };
          offersMap[o.id] = { points_price: o.points_price, ...product };
        });
      }
    }

    if (filter === 'available' && auth.role === 'seller') {
      const { data: sellerAssignments, error: assignmentsError } = await adminDb
        .from('seller_categories')
        .select('category_id')
        .eq('seller_id', auth.id);

      if (assignmentsError) {
        return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
      }

      const allowedCategoryIds = new Set(
        (sellerAssignments ?? []).map((row: any) => String(row.category_id)).filter(Boolean)
      );

      orders = orders.filter((order: any) => {
        const categoryId = offersMap[order.offer_id]?.category_id;
        if (!categoryId) return false;
        return allowedCategoryIds.has(String(categoryId));
      });
    }

    const normalizedOrders = orders.map((order) => {
      const offer = offersMap[order.offer_id] ?? { points_price: 0, name: '', game_name: '' };
      return {
        id: order.id,
        product_name: offer.name ?? '',
        game_name: offer.game_name ?? '',
        status: normalizeOrderStatusForClient(order.status),
        points_price: offer.points_price ?? order.points_amount ?? 0,
        assigned_seller_id: order.assigned_seller_id,
        created_at: order.created_at,
      };
    });

    return NextResponse.json({
      success: true,
      orders: normalizedOrders,
    });
  } catch (error) {
    console.error('Get orders error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth || auth.role !== 'customer') {
      return NextResponse.json({ error: 'Only customers can create orders' }, { status: 403 });
    }

    const body = await request.json();
    const { game_id, offer_id, exclusive_offer_id, account_id, quantity } = createOrderSchema.parse(body);

    // Determine order type and get pricing
    let pointsPrice: number;
    let assignedSellerUserId: string | null = null;
    let orderInsertData: any;
    let gameName = 'Unknown Game';
    let offerName = 'Unknown Offer';
    let notificationProductType: 'admin' | 'exclusive' = 'admin';
    let notificationProductSellerId: string | null = null;
    let notificationProductName = 'Order';
    const orderQuantity = Number(quantity ?? 1);

    if (exclusive_offer_id) {
      // Handle exclusive offer order
      const { data: exclusiveOffer, error: exclusiveOfferError } = await db
        .from('products')
        .select('id, name, points_price, seller_id, status, game:game_id(name)')
        .eq('id', exclusive_offer_id)
        .eq('is_active', true)
        .eq('type', 'exclusive')
        .single();

      if (exclusiveOfferError || !exclusiveOffer) {
        console.error('Exclusive offer query error:', exclusiveOfferError);
        return NextResponse.json({ error: 'Exclusive offer not found' }, { status: 404 });
      }

      if (exclusiveOffer.status && exclusiveOffer.status !== 'approved') {
        return NextResponse.json({ error: 'This pack is not available' }, { status: 400 });
      }

      const basePrice = toWholePoints(exclusiveOffer.points_price, 0);
      pointsPrice = basePrice * orderQuantity;
      assignedSellerUserId = String(exclusiveOffer.seller_id);
      gameName = exclusiveOffer.game?.name ?? 'Exclusive Offer';
      offerName = `${exclusiveOffer.name ?? 'Exclusive Pack'} x${orderQuantity}`;
      notificationProductType = 'exclusive';
      notificationProductSellerId = assignedSellerUserId;
      notificationProductName = exclusiveOffer.name ?? 'Exclusive Pack';

      // Verify game account exists and belongs to user
      const { data: gameAccount, error: gameAccountError } = await db
        .from('game_accounts')
        .select('id')
        .eq('id', account_id)
        .eq('user_id', auth.id)
        .single();

      if (gameAccountError || !gameAccount) {
        return NextResponse.json({ error: 'Game account not found' }, { status: 404 });
      }

      orderInsertData = {
        customer_id: auth.id,
        offer_id: null,
        assigned_seller_id: assignedSellerUserId,
        game_account_id: account_id,
        points_amount: pointsPrice,
        status: 'open',
      };
    } else if (offer_id && game_id) {
      // Handle standard offer order
      const { data: offer, error: offerError } = await db
        .from('offers')
        .select('id, name, points_price, product:product_id(id, name, type, seller_id, game:game_id(name))')
        .eq('id', offer_id)
        .eq('is_active', true)
        .single();

      let resolvedProductType: 'admin' | 'exclusive' = 'admin';
      let resolvedProductSellerId: string | null = null;
      let resolvedOfferDisplayName = 'Offer';
      let basePrice = 0;
      let usedProductFallback = false;

      if (offerError?.code === 'PGRST205' || !offer) {
        // Some deployments no longer have an offers table. In that case,
        // the client sends a product id as offer_id and we price directly from products.
        usedProductFallback = true;
        const { data: product, error: productError } = await db
          .from('products')
          .select('id, name, points_price, type, seller_id, game_id, game:game_id(name)')
          .eq('id', offer_id)
          .eq('is_active', true)
          .single();

        if (productError || !product) {
          console.error('Offer fallback product query error:', productError);
          return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
        }

        if (String(product.game_id) !== String(game_id)) {
          return NextResponse.json(
            { error: 'Selected offer does not belong to the selected game' },
            { status: 400 }
          );
        }

        gameName = product.game?.name ?? 'Game Service';
        resolvedOfferDisplayName = product.name ?? 'Offer';
        resolvedProductType = product.type === 'exclusive' ? 'exclusive' : 'admin';
        resolvedProductSellerId = product.seller_id ? String(product.seller_id) : null;
        basePrice = toWholePoints(product.points_price, 0);
      } else {
        const productGameId = offer.product?.game_id;
        if (!productGameId) {
          return NextResponse.json({ error: 'Offer product is invalid' }, { status: 404 });
        }

        if (String(productGameId) !== String(game_id)) {
          return NextResponse.json(
            { error: 'Selected offer does not belong to the selected game' },
            { status: 400 }
          );
        }

        gameName = offer.product?.game?.name ?? 'Game Service';
        resolvedOfferDisplayName = offer.name ?? offer.product?.name ?? 'Offer';
        resolvedProductType = offer.product?.type === 'exclusive' ? 'exclusive' : 'admin';
        resolvedProductSellerId = offer.product?.seller_id ? String(offer.product?.seller_id) : null;
        basePrice = toWholePoints(offer.points_price, 0);
      }

      // Validate at least one verified seller is available for this game.
      const { data: candidates, error: candidatesError } = await db
        .from('seller_games')
        .select('seller:seller_id(id, user_id, verification_status)')
        .eq('game_id', game_id)

      if (candidatesError) {
        console.error('Seller candidate query error:', candidatesError)
        return NextResponse.json({ error: 'Unable to route order' }, { status: 500 })
      }

      const verifiedCandidate = (candidates ?? []).find(
        (row: any) => row.seller?.user_id && row.seller?.verification_status === 'verified'
      )

      if (!verifiedCandidate?.seller?.user_id) {
        return NextResponse.json({ error: 'No verified sellers available for this game' }, { status: 400 })
      }

      notificationProductType = resolvedProductType;
      notificationProductSellerId = resolvedProductSellerId;
      notificationProductName = resolvedOfferDisplayName;

      pointsPrice = basePrice * orderQuantity;

      const { data: gameAccount, error: gameAccountError } = await db
        .from('game_accounts')
        .select('id, game_id')
        .eq('id', account_id)
        .eq('user_id', auth.id)
        .single();

      if (gameAccountError || !gameAccount) {
        return NextResponse.json({ error: 'Game account not found' }, { status: 404 });
      }

      if (String(gameAccount.game_id) !== String(game_id)) {
        return NextResponse.json(
          { error: 'Selected game account does not match the selected game' },
          { status: 400 }
        );
      }

      orderInsertData = {
        customer_id: auth.id,
        // If offers table is missing, avoid FK failures by storing null.
        offer_id: usedProductFallback ? null : offer_id,
        assigned_seller_id: null,
        game_account_id: account_id,
        points_amount: pointsPrice,
        status: 'open',
      };

      offerName = `${resolvedOfferDisplayName} x${orderQuantity}`;
    } else {
      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 }
      );
    }

    const normalizedPointsPrice = toWholePoints(pointsPrice, 0);
    orderInsertData.points_amount = normalizedPointsPrice;

    // Customer pays a fixed platform fee per order.
    const platformFee = FIXED_PLATFORM_FEE;
    const totalCharge = normalizedPointsPrice + platformFee;

    // Verify user has enough points
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, points, telegram_id')
      .eq('id', auth.id)
      .single();

    if (userError || !user) {
      console.error('User query error:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentUser = user as any;
    const customerPoints = toWholePoints(currentUser.points, 0);

    if (customerPoints < totalCharge) {
      return NextResponse.json({ error: 'Insufficient points' }, { status: 400 });
    }

    // Deduct points from user
    const pointsRemaining = customerPoints - totalCharge;
    const updateData: any = { points: pointsRemaining };

    const { error: updateError } = await db
      .from('users')
      .update(updateData)
      .eq('id', auth.id);

    if (updateError) {
      console.error('Update user points error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Create order. Try full payload first (includes platform_fee/seller_earnings),
    // then fallback for older schemas without those columns.
    const orderPayloadWithLabels = {
      ...orderInsertData,
      product_name: notificationProductName,
      game_name: gameName,
      offer_name: offerName,
      platform_fee: platformFee,
      seller_earnings: normalizedPointsPrice,
    };

    const orderPayloadFull = {
      ...orderInsertData,
      platform_fee: platformFee,
      seller_earnings: normalizedPointsPrice,
    };

    let orderData: any = null;
    let orderError: any = null;
    const insertWithLabels = await db
      .from('orders')
      .insert(orderPayloadWithLabels)
      .select('id')
      .single();
    orderData = insertWithLabels.data;
    orderError = insertWithLabels.error;

    if (orderError && (orderError.code === '42703' || orderError.code === 'PGRST204')) {
      const insertFull = await db
        .from('orders')
        .insert(orderPayloadFull)
        .select('id')
        .single();
      orderData = insertFull.data;
      orderError = insertFull.error;
    }

    if (orderError && (orderError.code === '42703' || orderError.code === 'PGRST204')) {
      const insertFallback = await db
        .from('orders')
        .insert(orderInsertData)
        .select('id')
        .single();
      orderData = insertFallback.data;
      orderError = insertFallback.error;
    }

    if (orderError || !orderData) {
      console.error('Create order error:', orderError);
      return NextResponse.json({ error: orderError?.message || 'Unable to create order' }, { status: 500 });
    }

    await addOrderEvent(db, {
      orderId: orderData.id,
      type: 'created',
      message: 'Order created',
      userId: auth.id,
    })

    // Record points transaction
    await db.from('point_transactions').insert({
      user_id: auth.id,
      amount: -totalCharge,
      transaction_type: 'spend',
      related_order_id: orderData.id,
      description: exclusive_offer_id
        ? `Exclusive offer order x${orderQuantity} (fee: ${platformFee})`
        : `Order creation x${orderQuantity} (fee: ${platformFee})`,
    });

    const customerTelegramId = (currentUser as any)?.telegram_id ?? null
    const orderIdText = String(orderData.id)

    if (customerTelegramId) {
      void telegramService
        .sendMessage(customerTelegramId, telegramService.orderCreatedMessage(orderIdText))
        .catch((telegramError) => {
          console.error('Order created notify failed:', telegramError)
        })

      void telegramService
        .sendMessage(
          customerTelegramId,
          telegramService.pointsTransactionMessage(-totalCharge, pointsRemaining)
        )
        .catch((telegramError) => {
          console.error('Order points notify failed:', telegramError)
        })
    }

    const clientUrl = process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const orderUrl = `${clientUrl}/dashboard/orders/${orderData.id}`;
    const orderLinkMarkup = {
      inline_keyboard: [[{ text: 'View Order', url: orderUrl }]],
    };

    if (notificationProductType === 'exclusive' && notificationProductSellerId) {
      const { data: seller, error: sellerError } = await db
        .from('users')
        .select('telegram_id')
        .eq('id', notificationProductSellerId)
        .maybeSingle();

      const sellerChatId = seller?.telegram_id ?? null;
      if (sellerChatId) {
        void telegramService
          .sendMessage(
            sellerChatId,
            `📦 <b>New Order on Your Product</b>\n\n📦 ${notificationProductName}\n🆔 Order: ${orderIdText}`,
            { replyMarkup: orderLinkMarkup }
          )
          .catch((telegramError) => {
            console.error('Seller notify failed:', telegramError);
          });
      }
    } else if (notificationProductType === 'admin') {
      const sellersGroupId = process.env.TELEGRAM_GROUP_CHAT_ID;
      if (sellersGroupId) {
        void telegramService
          .sendMessage(
            sellersGroupId,
            `🔥 <b>New Order Available</b>\n\n📦 ${notificationProductName}\n🆔 Order: ${orderIdText}\n⚡ First seller can accept`,
            { replyMarkup: orderLinkMarkup }
          )
          .catch((telegramError) => {
            console.error('Sellers group notify failed:', telegramError);
          });
      }
    }

    return NextResponse.json(
      {
        success: true,
        id: orderData.id,
        order_id: orderData.id,
        points_amount: normalizedPointsPrice,
        platform_fee: platformFee,
        total_charge: totalCharge,
        message: 'Order created successfully. Waiting for seller to pick.',
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Create order error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
