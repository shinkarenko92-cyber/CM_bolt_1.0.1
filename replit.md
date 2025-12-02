# Roomi - Property Booking Management System

## Overview

Roomi is a modern web application for managing short-term rental property bookings. It provides an interactive visual calendar, revenue analytics, property management, and booking coordination. The system is built as a single-page React application with real-time data synchronization through Supabase.

The application serves property managers who need to visualize bookings across multiple properties, manage guest information, track revenue, and coordinate between different booking platforms (Avito, CIAN, Booking.com, Airbnb).

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (December 2025)

**Calendar Layout Refactoring:**
- Separated date header row from property rows for cleaner interface
- Sticky date header with horizontal scroll synchronization
- Property names displayed as sticky-left column (256px width) within each row
- Expand/collapse functionality with chevron icons for each property
- Collapsed rows use compact 48px height, expanded rows dynamically size based on booking layers
- Booking blocks only render when property is expanded (prevents overlap issues)
- Left-truncated booking width calculation fixed to account for hidden days at start of visible range

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18 with TypeScript for type safety and component composition
- Vite as the build tool for fast development and optimized production builds
- TailwindCSS for utility-first styling with custom theme extensions
- No client-side routing - single-page application with view state management

**State Management Pattern**
- React Context API for global state (Auth, Theme)
- Local component state with hooks for feature-specific data
- No external state management library (Redux, Zustand, etc.)
- Data fetching handled directly in components with useEffect

**Component Structure**
- Modular component design with clear separation of concerns
- Modal-based workflows for CRUD operations (Add/Edit/Delete)
- Reusable UI components (BookingBlock, RateCell, PropertySidebarRow)
- Context providers wrap the entire application tree

**Key Design Decisions**
- Visual calendar is the primary interface, optimized for showing booking overlaps
- Multi-layer booking display to handle overlapping reservations
- Custom diagonal visual effects for checkout days using CSS transforms
- Hover tooltips for booking details without cluttering the UI
- Real-time search with dropdown results

### Backend Architecture

**Database Platform**
- Supabase (PostgreSQL) for data persistence and authentication
- Row-Level Security (RLS) policies for multi-tenant data isolation
- Real-time subscriptions capability (not currently implemented)

**Data Model**
- `profiles` - User accounts with subscription tiers and theme preferences
- `properties` - Rental units with pricing, location, and configuration
- `bookings` - Reservations with guest info, dates, pricing, and status
- `property_rates` - Date-specific pricing overrides and minimum stay requirements

**Authentication & Authorization**
- Supabase Auth for email/password authentication
- Profile creation triggered on signup
- Admin role check via `is_admin` boolean flag
- User-scoped data access enforced at database level

**Business Logic Patterns**
- Automatic price calculation based on nightly rates and booking duration
- Overlap detection for double-booking warnings
- Multi-property booking support (create same reservation across multiple properties)
- Currency support (RUB, EUR, USD) with conversion for analytics

### External Dependencies

**Third-Party Services**
- **Supabase** - Backend-as-a-Service
  - PostgreSQL database hosting
  - Authentication and user management
  - Edge Functions for server-side operations (seed-test-data)
  - Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**Integration Stubs**
- **Avito** - Russian classifieds platform (stub only)
- **CIAN** - Russian real estate platform (stub only)  
- **Booking.com** - Global booking platform (stub only)
- **Airbnb** - Global booking platform (stub only)
- Integration sync function exists but only logs to console (no actual API calls)

**NPM Dependencies**
- `@supabase/supabase-js` - Supabase client library
- `lucide-react` - Icon components
- `react` & `react-dom` - Core framework
- `tailwindcss` - Styling framework
- `typescript` - Type system
- `vite` - Build tool and dev server

**Deployment Configuration**
- Vercel hosting with custom routing rules
- Routes `/app/*` serve the React application
- Root path redirects to separate landing page
- Clean URLs without trailing slashes

**Development Environment**
- Vite dev server on port 5000
- Hot module replacement enabled
- TypeScript strict mode with comprehensive linting
- ESLint with React-specific rules