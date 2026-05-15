# LifeLine Backend

## Start backend locally

1. Copy `.env.example` to `.env`
2. Set `MONGO_URI`, `ADMIN_ID`, `ADMIN_PASSWORD`, and `ADMIN_SECRET`
3. Install packages with `npm install`
4. Start dev server with `npm run dev`
5. Start production server with `npm start`

## Deploy on Vercel

1. Import the `LifeLine Pharmacy/backend` folder as a Vercel project
2. Keep the project root on the backend folder
3. Add these environment variables in Vercel:
   - `MONGO_URI`
   - `ADMIN_ID`
   - `ADMIN_PASSWORD`
   - `ADMIN_SECRET`
4. Deploy
5. After deploy, use your backend URL plus `/api` in the frontend `VITE_API_URL`

## Main routes

- `GET /api/health`
- `GET /api/products`
- `GET /api/products/:slug`
- `POST /api/admin/login`
- `POST /api/products` with `Authorization: Bearer <token>`
- `DELETE /api/products/:id` with `Authorization: Bearer <token>`
