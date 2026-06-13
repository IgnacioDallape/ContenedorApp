# ContenedorApp

Plataforma web de **importación y logística** para PyMEs que importan desde China
a Argentina. Tres herramientas detrás de auth con planes:

- **ImportaPro** — calculadora de costos de importación (FOB → costo final ARS), NCM, simulador de precios por canal y comparador de productos.
- **Container Loader** — empaqueta cajas y pallets en contenedores (20ft / 40ft / 40HC / Semi) con vista 3D y motor de optimización propio.
- **Pallet Builder** — arma pallets individuales (Euro / EUA) con motor de packing propio, link público para compartir y PDF con guía de armado paso a paso.

> Producto comercial (no open source). Ver [Licencia](#licencia).

---

## Stack

React 18 · Vite 6 · Zustand 5 · Three.js · Supabase (auth + Postgres + Edge Functions) ·
jsPDF · Vitest. JavaScript (sin TypeScript). UI en **español argentino**.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Requisitos: Node ≥ 18.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Dev server (Vite) |
| `npm run build` | Build de producción → `dist/` |
| `npm run preview` | Sirve el build |
| `npm test` | Suite Vitest (mota pura: motores, formatters, pricing, componentes) |
| `npm run test:watch` | Vitest en watch |
| `npm run test:coverage` | Coverage de `src/lib` + `src/stores` |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint con autofix |
| `npm run format` | Prettier (escribe) |
| `npm run format:check` | Prettier (sólo chequea) |

## Variables de entorno

Copiá [`.env.example`](.env.example) a `.env.local`. **Todas las claves del frontend
son públicas** (publishable/anon, protegidas por RLS) y tienen fallback hardcodeado, así
que la app corre sin configurar nada. Para apuntar a otro proyecto Supabase, definí
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Los secretos reales (service role, webhook
secret) viven **sólo** en Supabase Edge Functions, nunca en el cliente.

## Estructura

```
src/
  components/   UI por feature (ImportaPro, ContainerLoader, PalletBuilder, Auth, Billing, Share, Layout)
  stores/       Zustand (app, auth, container, importapro, pallet)
  lib/          Motores de packing, formatters, pricing, export PDF, supabase
  __tests__/    Vitest
api/            Serverless (cron keepalive)
supabase/       Migraciones + Edge Function del webhook de pagos (Lemon Squeezy)
css/            Estilos globales (tema cream/beige, accent azul, fuente Inter)
docs/           📚 Referencia técnica auditada — empezá por docs/README.md
```

📚 **La documentación técnica completa y verificada está en [`docs/`](docs/)** —
arquitectura, motores, modelo de datos, auth/pagos y hallazgos de auditoría.

## Testing

Vitest + jsdom. Cubre la lógica pura (motores de packing, `calcCostos`, pricing,
formatters) y un patrón de tests de componente con React Testing Library. Antes de
pushear: `npm run lint && npm test && npm run build`.

## Deploy

Push a `main` → Vercel auto-deploya. `vercel.json` reescribe las rutas de share
(`/share/:id`, `/share/pallet/:id`) a la SPA y define un cron que pega a `/api/ping`
cada 5 días para mantener el proyecto Supabase activo.

Variables en Vercel: `SUPABASE_ANON_KEY` (para el cron). Para el webhook de pagos,
configurar en Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LEMON_WEBHOOK_SECRET`.

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md). CI (GitHub Actions) corre lint + test + build
en cada push y PR a `main`.

## Licencia

`UNLICENSED` — software propietario. Todos los derechos reservados. No redistribuir
sin autorización del autor.
