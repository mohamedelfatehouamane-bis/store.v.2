# MOHSTORE - Task-Based Order Picking Marketplace

A gaming services marketplace built with **order picking model** where admins define products/offers, customers create orders by selecting offers, and sellers pick available orders atomically. Built with Next.js 16, React 19, and MySQL.

## Overview - Order Picking Model (NOT Freelance Bidding)

MOHSTORE uses a unique **order picking system**:
- **Admins** create products and define offers (quantity, unit, points price)
- **Customers** select an offer + game account → deduct points → create order (status: "open")
- **Sellers** see available orders filtered by their assigned games → pick the order atomically
- **Only one seller can pick** each order (atomic UPDATE prevents race conditions)
- **Sellers see limited info before picking** (no account details), full details after picking
- **Points economy**: Customer spends points, seller earns after fee deduction

## Features

### Core Functionality (Order Picking Model)
- ✅ **Admin-defined Products & Offers**: Admins create products and specify offers (quantity, unit, points price)
- ✅ **Atomic Order Picking**: Sellers pick orders atomically - only one seller can pick each order
- ✅ **Game-based Filtering**: Sellers only see orders for games they're assigned to
- ✅ **Hidden Account Details**: Sellers see limited order info before picking, full details after
- ✅ **Points Economy**: Customers spend points, sellers earn points minus platform fee
- ✅ **Seller Game Assignments**: Admin assigns sellers to specific games
- ✅ **Fee System**: Each seller has configurable fee percentage (default 10%)
- ✅ **User authentication with JWT and bcrypt password hashing
- ✅ **Role-based access control** (Customer, Seller, Admin)
- ✅ **Order lifecycle tracking** (open → in_progress → completed → auto_released)
- ✅ **Point transaction logging** with full audit trail
- ✅ **Top-up requests** (customer) and **Withdrawal requests** (seller) with admin approval

### Dashboards
- **Customer Dashboard**: Post tasks, browse sellers, track orders, manage points
- **Seller Dashboard**: Browse available tasks, submit offers, track earnings, manage profile
- **Admin Dashboard**: User management, analytics, platform monitoring, seller verification

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **UI Components**: shadcn/ui with Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: MySQL with connection pooling
- **Authentication**: JWT tokens with bcryptjs
- **Charts**: Recharts for data visualization

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   └── register/route.ts
│   │   ├── orders/
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── sellers/
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   └── users/
│   │       └── profile/route.ts
│   ├── auth/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   ├── dashboard/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── orders/
│   │   │   └── page.tsx
│   │   ├── tasks/
│   │   │   └── page.tsx
│   │   ├── marketplace/
│   │   │   └── page.tsx
│   │   ├── earnings/
│   │   │   └── page.tsx
│   │   ├── users/
│   │   │   └── page.tsx
│   │   ├── analytics/
│   │   │   └── page.tsx
│   │   ├── profile/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   └── post-task/
│   │       └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/
│   │   └── [shadcn components]
│   └── dashboard/
│       └── sidebar.tsx
├── lib/
│   ├── auth.ts
│   ├── auth-context.tsx
│   ├── db.ts
│   ├── jwt.ts
│   └── middleware.ts
└── scripts/
    └── 01-init-schema.sql
```

## Database Schema (Order Picking Model)

### Core Tables
- **users**: User accounts with roles, total_points balance, and verification status
- **games**: Game definitions (Valorant, CS2, Elden Ring, etc.)
- **sellers**: Seller profiles with fee_percentage, business info, and verification status
- **seller_games**: Junction table mapping sellers to assigned games (game-based filtering)
- **products**: Admin-created game service products (e.g., "Radiant Boost", "Boss Clear")
- **offers**: Admin-created offers linked to products (quantity, unit, points_price)
- **orders**: Customer orders created from offers (status: open → in_progress → completed)
- **game_accounts**: User's gaming account credentials (encrypted with AES-256-CBC)

### Financial Tables
- **point_transactions**: Audit log of all point transactions (earn/spend with reference_id)
- **topup_requests**: Customer requests to buy points (admin approval required)
- **withdrawal_requests**: Seller requests to cash out earnings (admin approval required)

### Key Relationships
- Orders: customer_id + offer_id + game_account_id → creates "open" order, deducts points
- Order Picking: Atomic UPDATE assigns seller, status changes to "in_progress"
- Seller Access: seller_games controls which game orders a seller can see/pick

## Getting Started

### Prerequisites
- Node.js 18+
- MySQL 8.0+
- pnpm or npm

### Installation

1. **Clone & Install Dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```

2. **Set Up Database**
   ```bash
   # Create database
   mysql -u root -p < scripts/01-init-schema.sql
   ```

3. **Configure Environment Variables**
   Create `.env.local`:
   ```
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=mohstore
   JWT_SECRET=your-secret-key-change-this
   ENCRYPTION_KEY=your-encryption-key-change-this
   ```

4. **Run Development Server**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

5. **Access the App**
   - Landing Page: http://localhost:3000
   - Auth: http://localhost:3000/auth/login
   - Dashboard: http://localhost:3000/dashboard

## API Endpoints (Order Picking Model)

### Authentication
- `POST /api/auth/login` - User login (returns JWT token)
- `POST /api/auth/register` - User registration with role selection

### Orders (Customer + Seller)
- `GET /api/orders?filter=my-orders` - Customer's created orders
- `GET /api/orders?filter=available` - Open orders for seller's assigned games
- `GET /api/orders?filter=my-tasks` - Seller's picked/in-progress orders
- `POST /api/orders` - Create new order (customer selects offer + game_account)
  - Validates points balance, deducts points, creates order with status="open"
- `GET /api/orders/[id]` - Get order details (hides account details from unpicked sellers)
- `POST /api/orders/pick` - **ATOMIC** seller picks order (only one seller can pick)

### Admin APIs
- `GET/POST /api/admin/products` - Manage game service products
- `GET/POST /api/admin/offers` - Manage product offers (quantity, unit, points)
- `POST/DELETE /api/admin/sellers/games` - Assign/unassign games to sellers

### Sellers
- `GET /api/sellers` - Get leaderboard of verified sellers (with assigned_games)

### Users
- `GET /api/users/profile` - Get user profile with points balance

## Authentication Flow

1. User registers with email, username, password, and role
2. Backend hashes password with bcryptjs and stores in database
3. On login, credentials are verified and JWT token is generated
4. JWT token is stored in localStorage and sent with each API request
5. Token includes user ID, email, username, and role for authorization

## Key Features Implementation

### Points System
- Users earn points by completing tasks (as sellers)
- Points can be redeemed for discounts or premium features
- Point transactions are tracked with ledger entries

### Escrow System
- Customer payments are held in app balance (escrow)
- After 7 days or on completion, funds are released to seller
- Disputes can hold funds while being resolved

### Seller Verification
- New sellers must complete verification process
- Admin reviews seller profiles and documents
- Verified sellers appear in marketplace with badge

### Auto-Release
- Tasks automatically mark as complete after set timeline
- Funds are released automatically unless disputed
- Reduces manual intervention and streamlines process

## Security Considerations

- Passwords hashed with bcryptjs (salt rounds: 10)
- Game credentials encrypted with AES-256-CBC
- JWT tokens with 7-day expiration
- Input validation with Zod schema validation
- Protected API routes with authentication middleware

## Future Enhancements

- [ ] Real-time notifications with WebSockets
- [ ] In-app messaging system
- [ ] Video call integration for consultations
- [ ] Mobile app (React Native)
- [ ] Advanced fraud detection
- [ ] Automated payout system
- [ ] Blockchain-based escrow for higher value orders
- [ ] Integration with payment gateways (Stripe, PayPal)

## Testing

```bash
# Run tests
npm run test

# Run with coverage
npm run test:coverage
```

## Deployment

### Vercel Deployment
```bash
# Push to GitHub
git push origin main

# Vercel auto-deploys on push
# Set environment variables in Vercel dashboard
```

### Manual Deployment
1. Build the project: `npm run build`
2. Start production server: `npm start`
3. Use PM2 or similar for process management

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Support

For issues and questions, please open an issue on GitHub or contact support@mohstore.com

## Roadmap

- **Phase 1** (Current): Core marketplace functionality
- **Phase 2**: Payment gateway integration
- **Phase 3**: Mobile applications
- **Phase 4**: Advanced features (streaming, automation, etc.)

---

**MOHSTORE** - Connecting Gamers with Professional Services
